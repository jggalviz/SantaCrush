/**
 * Pruebas del anclaje de la placa 1 del HUD (`ui/lib/hudPlate.js`).
 *
 * El modulo es ESM (lo importa el navegador) y el proyecto se ejecuta como
 * CommonJS, asi que se carga desde una URL `data:`: se prueba el fichero REAL
 * que sirve el servidor. Todas las medidas entran por parametro (nodos y
 * `window` falsos), asi que no hace falta navegador ni DOM.
 *
 * Contexto del defecto que cubre: el saldo se pinta desde la consola y en CSS se
 * sube con una cuenta que supone la fila del marco a su alto natural. Cuando el
 * viewport es mas bajo que el contenido la rejilla comprime esa fila, la consola
 * sube con ella y el rotulo del saldo se sale por arriba de su capsula (18 px a
 * 498x855). El modulo mide el desfase real y lo publica en un token que el CSS
 * suma al `top`.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HUD_PLATE_PATH = path.join(__dirname, '..', 'ui', 'lib', 'hudPlate.js');
const STYLE_PATH = path.join(__dirname, '..', 'public', 'src', 'css', 'style.css');

const toDataUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;

let cached = null;

function loadHudPlate() {
  if (!cached) cached = import(toDataUrl(fs.readFileSync(HUD_PLATE_PATH, 'utf8')));
  return cached;
}

/** `style` falso con la misma superficie que usa el modulo. */
function fakeStyle(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getPropertyValue: (name) => (values.has(name) ? values.get(name) : ''),
    setProperty: (name, value) => { values.set(name, String(value)); },
    removeProperty: (name) => { values.delete(name); }
  };
}

/**
 * `.machine__side` falso: `.hud` (la franja del marco) y `.controls .balance`
 * (el saldo) con `getBoundingClientRect().top` inyectable. La caja del saldo
 * responde al token aplicado, que es como se comporta el navegador: mover el
 * `top` mueve el rect.
 */
function fakeSide(metrics = {}) {
  const state = { hudTop: 219.06, plateTop: 180.67, ...metrics };
  const style = fakeStyle();
  const applied = () => Number.parseFloat(style.getPropertyValue('--hud-plate-drift')) || 0;

  return {
    state,
    style,
    querySelector: (selector) => {
      if (selector === '.hud') return { getBoundingClientRect: () => ({ top: state.hudTop }) };
      if (selector === '.controls .balance') {
        return { getBoundingClientRect: () => ({ top: state.plateTop + applied() }) };
      }
      return null;
    }
  };
}

function fakeDocument(side) {
  return { querySelector: (selector) => (selector === '.machine__side' ? side : null) };
}

/** `window` falso: `matchMedia`, rAF acumulable y oyentes contables. */
function fakeWindow({ mobile = true } = {}) {
  const listeners = new Map();
  const frames = [];

  return {
    matchMedia: () => ({ matches: mobile }),
    requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
    cancelAnimationFrame: () => {},
    addEventListener: (type, callback) => {
      const list = listeners.get(type) || [];
      list.push(callback);
      listeners.set(type, list);
    },
    removeEventListener: (type, callback) => {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter((entry) => entry !== callback));
    },
    flushFrames: () => { frames.splice(0).forEach((callback) => callback()); },
    dispatch: (type) => { (listeners.get(type) || []).forEach((callback) => callback()); },
    listenerCount: () => [...listeners.values()].reduce((total, list) => total + list.length, 0)
  };
}

function fakeResizeObserver() {
  const instances = [];

  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      this.disconnected = false;
      instances.push(this);
    }

    observe(target) { this.targets.push(target); }

    disconnect() { this.disconnected = true; }
  }

  Observer.instances = instances;
  return Observer;
}


test('el token del CSS y el que escribe el modulo son el mismo', async () => {
  const { DRIFT_PROPERTY } = await loadHudPlate();
  const css = fs.readFileSync(STYLE_PATH, 'utf8');

  assert.equal(DRIFT_PROPERTY, '--hud-plate-drift');
  assert.match(
    css,
    new RegExp(`var\\(${DRIFT_PROPERTY}, 0px\\)`),
    'El `top` del saldo tiene que sumar el token, con 0 como respaldo'
  );
});

test('el saldo baja exactamente el desfase medido contra la franja del HUD', async () => {
  const { syncHudPlateDrift, DRIFT_PROPERTY } = await loadHudPlate();
  const side = fakeSide();

  const applied = syncHudPlateDrift(side);

  /* 219,06 − 180,67 = 38,39: el saldo nace 38,39 px por encima de su placa. */
  assert.equal(applied, 38.39);
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '38.39px');
});

test('la medida es idempotente: con el token aplicado no acumula desfase', async () => {
  const { syncHudPlateDrift, DRIFT_PROPERTY } = await loadHudPlate();
  const side = fakeSide();

  syncHudPlateDrift(side);
  const second = syncHudPlateDrift(side);
  const third = syncHudPlateDrift(side);

  assert.equal(second, 38.39);
  assert.equal(third, 38.39);
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '38.39px');
});

test('si el saldo queda bajo su placa el token es negativo y se redondea a dos cifras', async () => {
  const { syncHudPlateDrift, DRIFT_PROPERTY } = await loadHudPlate();
  const side = fakeSide({ hudTop: 200.004, plateTop: 203.333 });

  const applied = syncHudPlateDrift(side);

  assert.equal(applied, -3.33);
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '-3.33px');
});

test('sin las cajas del HUD el modulo no rompe: devuelve null y no escribe', async () => {
  const { syncHudPlateDrift, DRIFT_PROPERTY } = await loadHudPlate();

  assert.equal(syncHudPlateDrift(null), null);
  assert.equal(syncHudPlateDrift({}), null);

  const style = fakeStyle();
  const vacio = { style, querySelector: () => null };
  assert.equal(syncHudPlateDrift(vacio), null);
  assert.equal(style.getPropertyValue(DRIFT_PROPERTY), '');
});

test('el observador aplica el ajuste al montar y reacciona a los cambios de maqueta', async () => {
  const { watchHudPlateDrift, DRIFT_PROPERTY } = await loadHudPlate();
  const side = fakeSide();
  const win = fakeWindow();
  const Observer = fakeResizeObserver();
  win.ResizeObserver = Observer;

  const stop = watchHudPlateDrift(fakeDocument(side), win);

  /* Pasada de montaje: el saldo ya nace en su placa. */
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '38.39px');
  assert.equal(Observer.instances.length, 1);
  assert.deepEqual(Observer.instances[0].targets, [side], 'Se observa la caja que manda el layout');

  /* El viewport cambia: la franja se mueve y el saldo tiene que seguirla. */
  side.state.hudTop = 250.5;
  win.dispatch('resize');
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '38.39px', 'El recalculo espera al frame');
  win.flushFrames();
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '69.83px');

  /* Y el mismo camino sirve para la rotacion. */
  side.state.hudTop = 250.5 - 69.83;
  win.dispatch('orientationchange');
  win.flushFrames();
  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '0px');

  assert.equal(win.listenerCount(), 3, 'resize, orientationchange y load');

  stop();
  assert.equal(win.listenerCount(), 0, 'La limpieza retira los oyentes');
  assert.equal(Observer.instances[0].disconnected, true, 'Y desconecta el observador');
});

test('en escritorio el token se retira: alli el saldo se lee en la consola', async () => {
  const { watchHudPlateDrift, DRIFT_PROPERTY } = await loadHudPlate();
  const side = fakeSide();
  side.style.setProperty(DRIFT_PROPERTY, '38.39px');

  const stop = watchHudPlateDrift(fakeDocument(side), fakeWindow({ mobile: false }));

  assert.equal(side.style.getPropertyValue(DRIFT_PROPERTY), '');
  stop();
});

test('isMobileLayout tolera ventanas sin matchMedia o que fallan', async () => {
  const { isMobileLayout } = await loadHudPlate();

  assert.equal(isMobileLayout(null), true, 'Sin window se asume movil');
  assert.equal(isMobileLayout({}), true, 'Sin matchMedia se asume movil');
  assert.equal(isMobileLayout({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(isMobileLayout({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(
    isMobileLayout({ matchMedia: () => { throw new Error('no soportado'); } }),
    true,
    'Una consulta que falla no puede romper el arranque'
  );
});
