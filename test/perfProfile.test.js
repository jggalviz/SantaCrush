/**
 * Pruebas del presupuesto de rendimiento (`ui/lib/perf.js`).
 *
 * El modulo es ESM (lo importa el navegador) y el proyecto se ejecuta como
 * CommonJS, asi que se carga desde una URL `data:`: se prueba el fichero REAL
 * que sirve el servidor, sin duplicar heuristicas en el test.
 *
 * Las funciones que miran `document` lo hacen en tiempo de llamada, asi que
 * estas pruebas pueden inyectar un documento falso: el modulo se comporta igual
 * con pestana visible y oculta sin necesitar un navegador.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PERF_PATH = path.join(__dirname, '..', 'ui', 'lib', 'perf.js');

const toDataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;

let cached = null;

function loadPerf() {
  if (!cached) {
    cached = import(toDataUrl(fs.readFileSync(PERF_PATH, 'utf8')));
  }
  return cached;
}

/** Documento falso minimo: `documentElement.classList` + eventos. */
function fakeDocument({ hidden = false } = {}) {
  const classes = new Set();
  const listeners = new Map();

  return {
    hidden,
    documentElement: {
      classList: {
        toggle: (name, force) => {
          const on = force === undefined ? !classes.has(name) : Boolean(force);
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name)
      }
    },
    addEventListener: (type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
      const set = listeners.get(type);
      if (set) set.delete(handler);
    },
    /* Utilidades de la prueba, no forman parte de la API del DOM. */
    __classes: classes,
    __listeners: listeners,
    __emit: (type) => {
      for (const handler of listeners.get(type) || []) handler();
    },
    __count: (type) => (listeners.get(type) || new Set()).size
  };
}

/** Ejecuta `run` con un `document` falso instalado como global. */
async function withDocument(options, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = fakeDocument(options);
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true });
  try {
    await run(doc);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
}

test('perf: sin senales del navegador el equipo se considera capaz', async () => {
  const { isLowEndDevice } = await loadPerf();

  assert.equal(isLowEndDevice(null), false);
  assert.equal(isLowEndDevice({}), false);
  assert.equal(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 8 }), false);
});

test('perf: pocos nucleos, poca memoria o ahorro de datos activan el modo ligero', async () => {
  const { isLowEndDevice } = await loadPerf();

  assert.equal(isLowEndDevice({ hardwareConcurrency: 4 }), true, 'cuatro nucleos es gama baja');
  assert.equal(isLowEndDevice({ hardwareConcurrency: 2 }), true);
  assert.equal(isLowEndDevice({ hardwareConcurrency: 12, deviceMemory: 4 }), true);
  assert.equal(isLowEndDevice({ hardwareConcurrency: 12, deviceMemory: 2 }), true);
  assert.equal(isLowEndDevice({ hardwareConcurrency: 12, deviceMemory: 8 }), false);

  /* `saveData` solo existe en `connection` (Chrome y derivados). */
  const capable = { hardwareConcurrency: 8, deviceMemory: 8 };
  assert.equal(isLowEndDevice({ ...capable, connection: { saveData: true } }), true);
  assert.equal(isLowEndDevice({ ...capable, connection: { saveData: false } }), false);
  /* Safari publica la misma senal con otro nombre. */
  assert.equal(isLowEndDevice({ ...capable, mozConnection: { saveData: true } }), true);
  assert.equal(isLowEndDevice({ ...capable, webkitConnection: { saveData: true } }), true);
});

test('perf: el perfil grafico deja la clase en <html> y se puede forzar', async () => {
  const { applyGraphicsProfile } = await loadPerf();

  /* Sin DOM no hay donde escribir: ni excepcion ni resultado positivo. */
  assert.equal(applyGraphicsProfile({ device: true }), false);

  await withDocument({}, (doc) => {
    assert.equal(applyGraphicsProfile({ device: true }), true);
    assert.equal(doc.__classes.has('is-low-graphics'), true);

    assert.equal(applyGraphicsProfile({ device: false }), false);
    assert.equal(doc.__classes.has('is-low-graphics'), false);
  });
});

test('perf: el perfil grafico acepta un nodo raiz propio', async () => {
  const { applyGraphicsProfile } = await loadPerf();

  await withDocument({}, (doc) => {
    const classes = new Set();
    const root = {
      classList: {
        toggle: (name, force) => {
          if (force) classes.add(name);
          else classes.delete(name);
        }
      }
    };

    assert.equal(applyGraphicsProfile({ device: true, root }), true);
    assert.equal(classes.has('is-low-graphics'), true);
    /* La raiz inyectada manda: `document.documentElement` no se toca. */
    assert.equal(doc.__classes.has('is-low-graphics'), false);
  });
});

test('perf: `documentHidden` refleja la pestana en segundo plano', async () => {
  const { documentHidden } = await loadPerf();

  assert.equal(documentHidden(), false, 'sin DOM la pestana se da por visible');

  await withDocument({ hidden: true }, (doc) => {
    assert.equal(documentHidden(), true);
    doc.hidden = false;
    assert.equal(documentHidden(), false);
  });
});


test('perf: la clase `is-hidden` del CSS sigue la visibilidad real', async () => {
  const { setDocumentHidden } = await loadPerf();

  /* Sin DOM no explota: el arranque en Node no necesita ramas. */
  setDocumentHidden(true);

  await withDocument({}, (doc) => {
    setDocumentHidden(true);
    assert.equal(doc.__classes.has('is-hidden'), true);

    setDocumentHidden(false);
    assert.equal(doc.__classes.has('is-hidden'), false);

    /* `undefined`/`null` cuentan como visible: solo `true` congela. */
    setDocumentHidden(undefined);
    assert.equal(doc.__classes.has('is-hidden'), false);
  });
});

test('perf: `watchVisibility` avisa del cambio y se puede desuscribir', async () => {
  const { watchVisibility } = await loadPerf();

  const calls = [];
  const inert = watchVisibility((hidden) => calls.push(hidden));

  assert.equal(typeof inert, 'function');
  assert.equal(calls.length, 0, 'sin DOM la suscripcion es inerte');
  inert();

  await withDocument({ hidden: false }, (doc) => {
    const seen = [];
    const off = watchVisibility((hidden) => seen.push(hidden));

    assert.equal(doc.__count('visibilitychange'), 1);
    doc.__emit('visibilitychange');
    assert.deepEqual(seen, [false], 'avisa con el estado visible');

    doc.hidden = true;
    doc.__emit('visibilitychange');
    assert.deepEqual(seen, [false, true], 'avisa al pasar a segundo plano');

    off();
    assert.equal(doc.__count('visibilitychange'), 0, 'la desuscripcion quita el listener');

    off();
    assert.equal(doc.__count('visibilitychange'), 0, 'desuscribir dos veces no rompe');
  });
});

test('perf: `watchVisibility` es defensivo con entradas invalidas', async () => {
  const { watchVisibility } = await loadPerf();

  for (const invalid of [null, undefined, 0, 'visibilitychange']) {
    const off = watchVisibility(invalid);
    assert.equal(typeof off, 'function');
    off();
  }
});
