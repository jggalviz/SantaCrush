'use strict';

/**
 * Hoja de giros rapidos: paquetes del pulsador amarillo y ejecucion en el azul.
 *
 * Cubre el contrato pedido a los dos botones de la barra inferior:
 *   - el amarillo NO gira ni compra: abre la hoja, anuncia el catalogo
 *     (`x5 x10 x25`) y deja configurado el paquete elegido;
 *   - el azul juega ese paquete seguido (o detiene el bucle), nunca configura;
 *   - con una ronda en curso (`busy`) ninguna de las dos acciones se abre paso.
 *
 * Los modulos de `ui/` son ESM sin build: se cargan con el mismo cargador de
 * data-URLs que usa `uiArchitecture.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT_DIR, 'ui');

const urlCache = new Map();
const moduleCache = new Map();

function buildModuleUrl(modulePath) {
  const file = path.resolve(UI_DIR, modulePath);
  if (urlCache.has(file)) return urlCache.get(file);

  const source = fs.readFileSync(file, 'utf8').replace(
    /(\bfrom\s+['"])(\.[^'"]+)(['"])/g,
    (_match, head, specifier, tail) => {
      const resolved = path.resolve(path.dirname(file), specifier);
      return `${head}${buildModuleUrl(resolved)}${tail}`;
    }
  );

  const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  urlCache.set(file, url);
  return url;
}

function loadUiModule(modulePath) {
  const file = path.resolve(UI_DIR, modulePath);
  if (!moduleCache.has(file)) moduleCache.set(file, import(buildModuleUrl(modulePath)));
  return moduleCache.get(file);
}

/** Los importes se comparan con el mismo formateador que usa la vista. */
let formatters = null;
async function getFormatters() {
  if (!formatters) formatters = await loadUiModule('lib/format.js');
  return formatters;
}

/* --------------------------------------------------------------- nodos falsos */

/**
 * Nodo minimo: solo lo que tocan `GameView`, `GameController` y `GameControls`.
 * Guarda atributos para comprobar `aria-expanded` / `aria-pressed` y cuenta los
 * `focus()` para verificar el trap de teclado.
 */
function fakeNode(overrides = {}) {
  const attrs = overrides.attrs instanceof Map
    ? new Map(overrides.attrs)
    : new Map(Object.entries(overrides.attrs || {}));

  const node = {
    hidden: overrides.hidden === undefined ? true : overrides.hidden,
    disabled: Boolean(overrides.disabled),
    focusCount: 0,
    children: [],
    textContent: '',
    innerHTML: '',
    title: '',
    classList: {
      toggled: [],
      toggle(name, on) { this.toggled.push([name, Boolean(on)]); },
      add() {},
      remove() {}
    },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    addEventListener(type, handler) { node.listeners.push({ type, handler }); },
    listeners: [],
    /** Dispara los listeners de `click` (botones de `GameControls`). */
    click() {
      for (const listener of node.listeners) {
        if (listener.type === 'click') listener.handler({ target: node });
      }
    },
    /** Dispara los listeners de un tipo (punteros del rodillo, `animationend`...). */
    emit(type, event = { target: node }) {
      for (const listener of node.listeners) {
        if (listener.type === type) listener.handler(event);
      }
    },
    removeEventListener(type, handler) {
      node.listeners = node.listeners.filter(
        (listener) => listener.type !== type || listener.handler !== handler
      );
    },
    focus() { node.focusCount += 1; },
    querySelector() { return null; }
  };

  return node;
}

/** Contenedor de opciones: al escribir `innerHTML` reconstruye `children`. */
function fakeOptionsNode() {
  const node = fakeNode();
  let html = '';

  Object.defineProperty(node, 'innerHTML', {
    get: () => html,
    set: (value) => {
      html = String(value);
      node.children = parseOptions(html);
    }
  });

  return node;
}

/** Contenedor de chips del boton amarillo (`x5`, `x10`, `x25`). */
function fakeChipsNode() {
  const node = fakeNode();
  node.children = [5, 10, 25].map((spins) => {
    const chip = fakeNode();
    chip.dataset = { spins: String(spins) };
    return chip;
  });
  return node;
}

/** Botones `<button ...>...</button>` del markup que pinta `renderFeverOptions_`. */
function parseOptions(html) {
  const options = [];
  const buttons = html.matchAll(/<button ([^>]*)>/g);
  for (const match of buttons) {
    const attrText = match[1];
    const attrs = new Map();
    for (const attr of attrText.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      attrs.set(attr[1], attr[2]);
    }
    const option = fakeNode({ attrs });
    option.disabled = /\bdisabled\b/.test(attrText);
    option.closest = () => option;
    options.push(option);
  }
  return options;
}

/** `document` minimo para las clases de `body` y el foco del trap de Tab. */
function withDocument(activeElement, fn) {
  const previous = globalThis.document;
  const classes = new Set();
  const stub = {
    activeElement,
    body: {
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        /* `setDemoMode` alterna la clase del `body`; el stub la imita. */
        toggle: (name, on) => {
          const next = on === undefined ? !classes.has(name) : Boolean(on);
          if (next) classes.add(name);
          else classes.delete(name);
          return next;
        }
      }
    }
  };
  globalThis.document = stub;
  try {
    return fn(classes, stub);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

/** Vista con los nodos de la hoja y los del HUD que tocan los setters. */
async function createView({ balanceCents = 100000, betCredits = 1 } = {}) {
  const { Ui } = await loadUiModule('renderers/GameView.js');
  const ui = new Ui();

  ui.refs = {
    feverSheet: fakeNode({ hidden: true }),
    feverBackdrop: fakeNode(),
    feverTitle: fakeNode(),
    feverLead: fakeNode(),
    feverOptions: fakeOptionsNode(),
    feverSummary: fakeNode(),
    feverClose: fakeNode(),
    featureBtn: fakeNode(),
    featureCost: fakeNode(),
    autoPack: fakeNode(),
    autoBtn: fakeNode(),
    autoCount: fakeNode(),
    spinBtn: fakeNode(),
    spinLabel: fakeNode(),
    betUp: fakeNode(),
    betDown: fakeNode(),
    betMax: fakeNode(),
    betValue: fakeNode(),
    betReadout: fakeNode()
  };
  ui.currency = 'EUR';
  ui.setBet(betCredits);
  ui.updateAffordability(balanceCents, Math.round(betCredits * 100));
  ui.busy = false;
  return ui;
}

const callNames = (calls) => calls.map((call) => call.name);

/* ------------------------------------------------------------------- vista */

test('la insignia del paquete abre los giros rapidos con el catalogo y el coste vivos', async () => {
  const { formatCents, formatCredits } = await getFormatters();
  const ui = await createView({ betCredits: 1, balanceCents: 100000 });

  const opened = withDocument(null, (classes) => {
    const result = ui.openFeverSheet();
    assert.equal(classes.has('is-fever-open'), true, 'bloquea el scroll del documento');
    return result;
  });

  assert.equal(opened, true);
  assert.equal(ui.refs.feverSheet.hidden, false);
  assert.equal(ui.refs.autoPack.getAttribute('aria-expanded'), 'true');
  assert.equal(
    ui.refs.featureBtn.getAttribute('aria-expanded'),
    null,
    'el FEVER compra el bonus: no es un disparador de dialogo'
  );
  assert.match(
    ui.refs.feverLead.textContent,
    /^Elige cuántas tiradas quieres y el pulsador azul las juega seguidas\./,
    'la entradilla explica quien configura y quien ejecuta'
  );
  assert.ok(
    ui.refs.feverLead.textContent.includes(`Cada tirada cuesta ${formatCredits(1)} EUR;`),
    'la entradilla publica el coste de una tirada con la apuesta viva'
  );
  assert.match(ui.refs.feverLead.textContent, /se detiene al volver a pulsarlo/);
  assert.ok(
    ui.refs.feverSummary.textContent.includes(`saldo ${formatCents(100000)} EUR`),
    'el resumen cierra con apuesta y saldo'
  );
  assert.ok(
    ui.refs.feverSummary.textContent.startsWith(`Apuesta ${formatCredits(1)} EUR`),
    'el resumen abre con la apuesta viva'
  );

  const html = ui.refs.feverOptions.innerHTML;
  for (const spins of [5, 10, 25]) {
    assert.ok(
      html.includes(`<span class="fever__option-bet">×${spins}</span>`),
      `la tarjeta de ${spins} tiradas usa la notacion del boton`
    );
    assert.ok(
      html.includes(`<span class="fever__option-tag">${spins} tiradas</span>`),
      `la tarjeta de ${spins} tiradas lleva su subtitulo`
    );
    assert.ok(
      html.includes(`<span class="fever__option-cost">${formatCredits(spins)}</span>`),
      `la tarjeta de ${spins} tiradas calcula el coste total`
    );
  }

  const options = ui.refs.feverOptions.children;
  assert.equal(options.length, 3);
  assert.equal(options[0].focusCount, 1, 'el foco entra en la primera tarjeta');
});

test('un paquete sin saldo se apaga y se rehabilita al confirmar saldo', async () => {
  const ui = await createView({ betCredits: 1, balanceCents: 800 });
  ui.openFeverSheet();

  const options = ui.refs.feverOptions.children;
  assert.equal(options[0].disabled, false, '5 tiradas (5,00 EUR) caben en 8,00 EUR');
  assert.equal(options[1].disabled, true, '10 tiradas (10,00 EUR) no caben');
  assert.equal(options[2].disabled, true, '25 tiradas (25,00 EUR) no caben');
  assert.match(ui.refs.feverOptions.innerHTML, /is-locked/);

  ui.updateAffordability(100000, 100);
  const [unlocked] = ui.refs.feverOptions.children;
  assert.equal(unlocked.disabled, false, 'con saldo la tarjeta vuelve a estar activa');
  assert.doesNotMatch(ui.refs.feverOptions.innerHTML, /is-locked/);
});

test('la hoja lista los paquetes, marca el elegido y calcula su coste', async () => {
  const { formatCents, formatCredits } = await getFormatters();
  const ui = await createView({ betCredits: 1, balanceCents: 100000 });
  assert.equal(ui.setQuickSpins(25), true);
  assert.equal(ui.refs.autoCount.textContent, 'x25', 'la insignia anuncia el paquete configurado');
  assert.equal(
    ui.refs.autoBtn.getAttribute('aria-label'),
    'Auto · 25 tiradas automáticas. Pulsa para jugarlas seguidas.'
  );
  assert.match(
    ui.refs.autoPack.getAttribute('aria-label'),
    /Paquete de tiradas automáticas · 25\./,
    'la insignia del azul anuncia el paquete vigente'
  );
  assert.equal(
    ui.refs.autoPack.title,
    'Paquete de 25 tiradas automáticas · pulsa para cambiar',
    'el tooltip invita a rodar el paquete'
  );

  ui.openFeverSheet();
  assert.equal(ui.refs.autoPack.getAttribute('aria-expanded'), 'true');
  assert.equal(ui.refs.autoBtn.getAttribute('aria-expanded'), null);

  const options = ui.refs.feverOptions.children;
  assert.deepEqual(
    options.map((option) => option.getAttribute('data-fever-spins')),
    ['5', '10', '25']
  );
  assert.deepEqual(
    options.map((option) => option.getAttribute('aria-pressed')),
    ['false', 'false', 'true']
  );
  assert.match(
    options[2].getAttribute('aria-label'),
    new RegExp(`^25 tiradas automáticas por ${formatCredits(25)} EUR$`)
  );

  const html = ui.refs.feverOptions.innerHTML;
  assert.ok(html.includes(`<span class="fever__option-cost">${formatCredits(5)}</span>`));
  assert.ok(html.includes(`<span class="fever__option-cost">${formatCredits(10)}</span>`));
  assert.ok(html.includes(`<span class="fever__option-cost">${formatCredits(25)}</span>`));
  assert.ok(
    ui.refs.feverSummary.textContent.includes(`saldo ${formatCents(100000)} EUR`),
    'el resumen cierra con apuesta y saldo'
  );
  const picked = [];
  ui.handlers.onAutoSpins = (spins) => picked.push(spins);
  ui.handleFeverOptionClick_({ target: options[1] });
  assert.deepEqual(picked, [10], 'la opcion elegida delega en el controlador');
});


test('un paquete sin saldo se pinta apagado y no dispara el autogiro', async () => {
  const ui = await createView({ betCredits: 1, balanceCents: 800 });
  ui.openFeverSheet('auto');

  const options = ui.refs.feverOptions.children;
  assert.equal(options[0].disabled, false, '5 tiradas (5,00 EUR) caben en 8,00 EUR');
  assert.equal(options[1].disabled, true, '10 tiradas (10,00 EUR) no caben');
  assert.equal(options[2].disabled, true, '25 tiradas (25,00 EUR) no caben');

  const picked = [];
  ui.handlers.onAutoSpins = (spins) => picked.push(spins);
  ui.handleFeverOptionClick_({ target: options[2] });
  assert.deepEqual(picked, [], 'una opcion deshabilitada no arranca nada');
});

test('cerrar la hoja devuelve el foco a la insignia del paquete', async () => {
  const ui = await createView();
  ui.openFeverSheet();
  assert.equal(withDocument(null, () => ui.closeFeverSheet()), true);

  assert.equal(ui.refs.feverSheet.hidden, true);
  assert.equal(ui.refs.autoPack.getAttribute('aria-expanded'), 'false');
  assert.equal(ui.refs.autoPack.focusCount, 1, 'el foco vuelve a la insignia del paquete');
  assert.equal(ui.isFeverSheetOpen(), false);
});

test('con la hoja abierta Escape la cierra y Tab no se escapa del dialogo', async () => {
  const ui = await createView();
  ui.openFeverSheet();

  const options = ui.refs.feverOptions.children;
  let prevented = 0;

  withDocument(options[2], (classes, stub) => {
    stub.activeElement = ui.refs.feverClose;
    const handled = ui.handleFeverKey_({
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => { prevented += 1; }
    });
    assert.equal(handled, true);
    assert.equal(options[0].focusCount, 2, 'Tab desde el cierre vuelve a la primera opcion');

    stub.activeElement = options[0];
    ui.handleFeverKey_({ key: 'Tab', shiftKey: true, preventDefault: () => { prevented += 1; } });
    assert.equal(ui.refs.feverClose.focusCount, 1, 'Shift+Tab desde la primera salta al cierre');

    stub.activeElement = options[1];
    ui.handleFeverKey_({ key: 'Tab', shiftKey: false, preventDefault: () => { prevented += 1; } });
    assert.equal(
      options[0].focusCount,
      2,
      'en medio del dialogo el navegador mueve el foco: la hoja no lo secuestra'
    );

    assert.equal(
      ui.handleFeverKey_({ key: 'Escape', preventDefault: () => { prevented += 1; } }),
      true
    );
    assert.equal(classes.has('is-fever-open'), false, 'al cerrar se libera el scroll');
  });

  assert.equal(prevented, 3);
  assert.equal(ui.refs.feverSheet.hidden, true);
  assert.equal(ui.isFeverSheetOpen(), false);
});


test('la consola y la hoja recalculan el coste al cambiar apuesta y moneda', async () => {
  const { formatCredits } = await getFormatters();
  const ui = await createView({ betCredits: 1, balanceCents: 1000000 });
  ui.openFeverSheet();
  assert.ok(
    ui.refs.feverOptions.innerHTML.includes(
      `<span class="fever__option-cost">${formatCredits(5)}</span>`
    ),
    'con 1,00 EUR de apuesta, 5 tiradas cuestan 5,00'
  );

  ui.setBet(2);
  assert.equal(ui.refs.autoCount.textContent, 'x10', 'la pildora azul mantiene el paquete');
  assert.ok(
    ui.refs.feverOptions.innerHTML.includes(
      `<span class="fever__option-cost">${formatCredits(50)}</span>`
    ),
    'el coste de la tarjeta sigue a la apuesta viva'
  );
  assert.ok(
    ui.refs.feverSummary.textContent.startsWith(`Apuesta ${formatCredits(2)} EUR`),
    'el resumen sigue a la apuesta viva'
  );

  ui.setCurrency('USD');
  assert.ok(
    ui.refs.feverLead.textContent.includes(`Cada tirada cuesta ${formatCredits(2)} USD;`),
    'la entradilla se escribe con la moneda de la sesion'
  );
  assert.ok(
    ui.refs.feverSummary.textContent.includes('saldo') &&
      ui.refs.feverSummary.textContent.includes('USD'),
    'el resumen se escribe con la moneda de la sesion'
  );
});

test('con el bucle en marcha la pildora azul cuenta las tiradas que quedan', async () => {
  const ui = await createView({ betCredits: 1, balanceCents: 100000 });
  ui.setQuickSpins(10);
  ui.setAuto(true, 7);

  assert.equal(ui.refs.autoCount.textContent, 'x7');
  assert.equal(ui.refs.autoBtn.getAttribute('aria-label'), 'Detener autogiro · quedan 7 de 10 tiradas');
  assert.equal(
    ui.refs.featureBtn.disabled,
    true,
    'con el bucle en marcha el amarillo no reconfigura el paquete'
  );

  /* Un cambio de apuesta no puede perder el progreso del bucle. */
  ui.setBet(2);
  assert.equal(ui.refs.autoCount.textContent, 'x7');

  ui.setAuto(false, 0);
  assert.equal(ui.refs.autoCount.textContent, 'x10');
  assert.equal(
    ui.refs.autoBtn.getAttribute('aria-label'),
    'Auto · 10 tiradas automáticas. Pulsa para jugarlas seguidas.'
  );
  assert.equal(ui.refs.featureBtn.disabled, false, 'al parar, el amarillo vuelve a estar activo');
});

test('el precio del FEVER sale de /api/game y no del paquete de autogiro', async () => {
  const ui = await createView({ betCredits: 2, balanceCents: 1000000 });
  ui.refs.infoRtpBase = fakeNode();
  ui.refs.infoRtpFeature = fakeNode();
  ui.refs.infoCap = fakeNode();
  ui.refs.engine = fakeNode();

  withDocument(null, () => {
    ui.setGameInfo({
      code: 'SANTA_CRUSH_GRID_6X5_95_10K',
      engineVersion: '1.1.0',
      paytableVersion: 'MB65-95-10K-v2',
      feature: { costMultiplier: 50, spins: 8, label: 'Crush Pro' }
    });
  });

  assert.equal(ui.featureLabel, 'Crush Pro', 'el bonus sigue disponible en la tabla de pagos');
  assert.equal(
    ui.refs.featureCost.textContent,
    '50x · 100,00',
    'el subtitulo publica multiplicador publicado por la apuesta viva (2,00 x 50)'
  );
  assert.match(
    ui.refs.featureBtn.getAttribute('aria-label'),
    /compra el bonus de 8 giros por 50 veces la apuesta \(100,00 EUR\)/,
    'el nombre accesible del FEVER anuncia la compra con su precio'
  );
  assert.equal(ui.refs.featureBtn.title, 'Fever · 50x = 100,00 EUR');
  assert.doesNotMatch(
    ui.refs.featureCost.textContent,
    /x5|x10|x25/,
    'el paquete de tiradas rapidas no se cuela en el precio del bonus'
  );
});

/* --------------------------------------------------------------- controlador */
/** Renderer espia: registra llamadas sin tocar el DOM. */
function createUiSpy() {
  const calls = [];
  const record = (name) => (...args) => { calls.push({ name, args }); };

  return {
    handlers: {},
    refs: {},
    calls,
    setStatus: record('setStatus'),
    toast: record('toast'),
    setAuto: record('setAuto'),
    setQuickSpins: record('setQuickSpins'),
    openFeverSheet: record('openFeverSheet'),
    closeFeverSheet: record('closeFeverSheet'),
    setBusy: record('setBusy'),
    hideBanner: record('hideBanner'),
    setMultiplier: record('setMultiplier'),
    setWin: record('setWin'),
    setCurrency: record('setCurrency'),
    setBalance: record('setBalance'),
    setDemoMode: record('setDemoMode'),
    addHistory: record('addHistory'),
    setRoundInfo: record('setRoundInfo'),
    updateAffordability: record('updateAffordability'),
    setBet: record('setBet')
  };
}

function createSfxSpy() {
  const calls = [];
  const record = (name) => (...args) => { calls.push({ name, args }); };
  return {
    calls,
    unlock: record('unlock'),
    click: record('click'),
    error: record('error'),
    drop: record('drop'),
    win: record('win'),
    isMuted: () => false,
    setMuted: record('setMuted')
  };
}

/** Controlador con `runAuto` acotado: los tests miran el arranque, no el bucle. */
async function createController({ balanceCents = 100000 } = {}) {
  const { GameController } = await loadUiModule('controllers/GameController.js');
  const ui = createUiSpy();
  const sfx = createSfxSpy();

  const api = {
    spin: async () => ({ ok: true }),
    gameInfo: async () => ({})
  };
  const session = {
    isDemo: false,
    invalidate() {},
    resolve: async () => ({ source: 'dev' }),
    startDemoSession: async () => {}
  };

  const game = new GameController({ api, ui, sfx, session });
  game.balanceCents = balanceCents;
  /* El bucle real encadena tiradas animadas; aqui solo interesa que arranque. */
  game.runAuto = () => {
    ui.calls.push({ name: 'runAuto', args: [] });
    return Promise.resolve();
  };

  return { game, ui, sfx };
}

const callsNamed = (ui, name) => ui.calls.filter((call) => call.name === name);
const lastCall = (ui, name) => callsNamed(ui, name).at(-1);

test('el amarillo abre los giros rapidos y respeta busy y el automatico', async () => {
  const { game, ui } = await createController();

  assert.equal(game.openFeverSheet(), true);
  assert.deepEqual(lastCall(ui, 'openFeverSheet').args, []);

  game.busy = true;
  assert.equal(game.openFeverSheet(), false);
  assert.equal(lastCall(ui, 'toast').args[0], 'Espera a que termine la tirada.');
  assert.equal(callsNamed(ui, 'openFeverSheet').length, 1, 'con busy no se abre la hoja');

  game.busy = false;
  game.autoRunning = true;
  assert.equal(game.openFeverSheet(), false);
  assert.match(lastCall(ui, 'toast').args[0], /Detén el automático/);
  assert.equal(callsNamed(ui, 'openFeverSheet').length, 1);
});

test('el azul juega el paquete configurado y detiene el bucle en marcha', async () => {
  const { game, ui } = await createController();

  assert.equal(game.toggleAuto(), true);
  assert.deepEqual(lastCall(ui, 'setAuto').args, [true, 10], 'arranca con el paquete vigente');
  assert.equal(callsNamed(ui, 'runAuto').length, 1);
  assert.equal(callsNamed(ui, 'openFeverSheet').length, 0, 'el azul no abre la hoja');

  game.autoRemaining = 4;
  assert.equal(game.toggleAuto(), true);
  assert.deepEqual(lastCall(ui, 'setAuto').args, [false, 0], 'suelta la pildora');
  assert.equal(lastCall(ui, 'setStatus').args[0], 'Automático detenido');

  game.busy = true;
  assert.equal(game.toggleAuto(), false, 'con una ronda en curso no arranca');
});

test('pickQuickSpins configura el paquete y cierra la hoja sin gastar', async () => {
  const { game, ui } = await createController();

  assert.equal(game.pickQuickSpins(25), true);
  assert.equal(game.quickSpinsPick, 25);
  assert.deepEqual(lastCall(ui, 'setQuickSpins').args, [25]);
  assert.equal(callsNamed(ui, 'closeFeverSheet').length, 1);
  assert.equal(lastCall(ui, 'setStatus').args[0], 'Automático · paquete de 25 tiradas');
  assert.equal(game.autoRunning, false, 'configurar no arranca el bucle');

  assert.equal(game.pickQuickSpins(7), false, '7 no esta en bets.quickSpins');
  assert.equal(game.quickSpinsPick, 25, 'el paquete vigente no cambia');
});

test('cycleQuickSpins rueda el catalogo y vuelve al primer paquete', async () => {
  const { game, ui } = await createController();
  assert.equal(game.quickSpinsPick, 10, 'arranca en el paquete por defecto');

  assert.equal(game.cycleQuickSpins(), 25);
  assert.equal(game.quickSpinsPick, 25);
  assert.deepEqual(lastCall(ui, 'setQuickSpins').args, [25]);
  assert.equal(lastCall(ui, 'setStatus').args[0], 'Automático · paquete de 25 tiradas');
  assert.equal(game.autoRunning, false, 'rodar el paquete no arranca el bucle');
  assert.equal(callsNamed(ui, 'closeFeverSheet').length, 0, 'rodar no toca la hoja');

  assert.equal(game.cycleQuickSpins(), 5, 'despues del ultimo vuelve al primero');
  assert.equal(game.cycleQuickSpins(), 10, 'y sigue dando la vuelta');

  game.busy = true;
  assert.equal(game.cycleQuickSpins(), null);
  assert.equal(lastCall(ui, 'toast').args[0], 'Espera a que termine la tirada.');
  assert.equal(game.quickSpinsPick, 10, 'con el motor ocupado la cifra no se mueve');

  game.busy = false;
  game.autoRunning = true;
  assert.equal(game.cycleQuickSpins(), null);
  assert.match(lastCall(ui, 'toast').args[0], /Detén el automático/);
  assert.equal(game.quickSpinsPick, 10, 'con la tanda en marcha tampoco');
});

test('startAuto juega el paquete elegido y descarta cantidades fuera del catalogo', async () => {
  const { game, ui } = await createController();

  assert.equal(game.startAuto(25), true);
  assert.equal(game.autoRemaining, 25);
  assert.equal(game.quickSpinsPick, 25, 'el paquete jugado pasa a ser el vigente');
  assert.deepEqual(lastCall(ui, 'setQuickSpins').args, [25]);
  assert.deepEqual(lastCall(ui, 'setAuto').args, [true, 25]);
  assert.equal(callsNamed(ui, 'closeFeverSheet').length, 1, 'arrancar cierra la hoja');
  assert.equal(callsNamed(ui, 'runAuto').length, 1);
  assert.equal(lastCall(ui, 'setStatus').args[0], 'Automático · 25 tiradas');

  game.autoRunning = false;
  assert.equal(game.startAuto(7), true, '7 no esta en bets.quickSpins: cae al paquete por defecto');
  assert.equal(game.autoRemaining, 10);

  game.autoRunning = false;
  game.balanceCents = 50;
  assert.equal(game.startAuto(5), false, 'sin saldo ni siquiera arranca');
  assert.equal(lastCall(ui, 'toast').args[1].type, 'error');
});

test('buyFeature sigue disponible para el operador y pide una unica ronda de bonus', async () => {
  const { game, ui } = await createController();
  const spinRequests = [];
  game.spin = async (options) => {
    spinRequests.push(options);
    return { ok: true };
  };
  game.autoRunning = true;

  const round = await game.buyFeature();
  assert.deepEqual(round, { ok: true });
  assert.deepEqual(spinRequests, [{ buyFeature: true }], 'una sola tirada, la del bonus');
  assert.equal(game.autoRunning, false, 'la compra corta el automatico');
  assert.equal(lastCall(ui, 'setStatus').args[0], 'Automático detenido');
  assert.equal(callsNamed(ui, 'closeFeverSheet').length, 1);

  game.busy = true;
  assert.equal(await game.buyFeature(), null, 'con una ronda en curso no se compra');
});

test('el handler de la hoja configura el paquete sin arrancar el bucle', async () => {
  const { game, ui } = await createController();
  assert.equal(typeof ui.handlers.onAutoSpins, 'function');

  ui.handlers.onAutoSpins(5);
  assert.equal(game.quickSpinsPick, 5);
  assert.equal(game.autoRunning, false, 'elegir paquete nunca gasta saldo por sorpresa');
  assert.deepEqual(lastCall(ui, 'setQuickSpins').args, [5]);

  assert.equal(ui.handlers.onAutoSpins(7), false);
  assert.equal(game.quickSpinsPick, 5, 'un paquete fuera del catalogo se descarta');
});

/* ---------------------------------------------------------------- controles */

test('GameControls: FEVER compra, la insignia rueda el paquete y el azul ejecuta', async () => {
  const { GameControls } = await loadUiModule('components/GameControls.js');

  const calls = [];
  const controller = {
    autoRunning: false,
    cycleQuickSpins: () => calls.push('cycle'),
    openFeverSheet: () => calls.push('feature'),
    buyFeature: () => calls.push('buy'),
    toggleAuto: () => calls.push('auto'),
    spin: () => calls.push('spin'),
    stopAuto: () => calls.push('stopAuto'),
    changeBet: (direction) => calls.push(`bet${direction}`),
    setMaxBet: () => calls.push('max'),
    startDemoMode: () => calls.push('demo')
  };

  const refs = {
    spinBtn: fakeNode(),
    featureBtn: fakeNode(),
    autoPack: fakeNode(),
    autoBtn: fakeNode(),
    betUp: fakeNode(),
    betDown: fakeNode(),
    betMax: fakeNode(),
    demoBtn: fakeNode()
  };

  const sheet = fakeNode({ hidden: true });
  let keydown = null;
  const documentRef = {
    addEventListener: (type, handler) => {
      if (type === 'keydown') keydown = handler;
    },
    getElementById: (id) => (id === 'fever-sheet' ? sheet : null)
  };

  new GameControls({ ui: { refs, busy: false, handlers: {} }, controller, documentRef }).mount();

  refs.autoPack.click();
  refs.featureBtn.click();
  refs.autoBtn.click();
  assert.deepEqual(
    calls,
    ['cycle', 'buy', 'auto'],
    'la insignia rueda el paquete, el FEVER compra el bonus y el azul juega el paquete'
  );

  sheet.hidden = false;
  keydown({ code: 'Space', key: ' ', target: {}, preventDefault() {} });
  assert.deepEqual(calls, ['cycle', 'buy', 'auto'], 'con la hoja abierta no se gira');

  sheet.hidden = true;
  keydown({ code: 'Space', key: ' ', target: {}, preventDefault() {} });
  assert.deepEqual(
    calls,
    ['cycle', 'buy', 'auto', 'spin'],
    'al cerrar, la barra espaciadora vuelve a girar'
  );
});

test('GameControls: la insignia rueda el paquete y el GIRAR detiene el autogiro en marcha', async () => {
  const { GameControls } = await loadUiModule('components/GameControls.js');

  const calls = [];
  const controller = {
    autoRunning: false,
    cycleQuickSpins: () => calls.push('cycle'),
    openFeverSheet: () => calls.push('sheet'),
    buyFeature: () => calls.push('buy'),
    toggleAuto: () => calls.push('auto'),
    spin: () => calls.push('spin'),
    stopAuto: (message) => calls.push(`stop:${message}`),
    changeBet: () => calls.push('bet'),
    setMaxBet: () => calls.push('max'),
    startDemoMode: () => calls.push('demo')
  };

  const refs = {
    spinBtn: fakeNode(),
    featureBtn: fakeNode(),
    autoPack: fakeNode(),
    autoBtn: fakeNode(),
    betUp: fakeNode(),
    betDown: fakeNode(),
    betMax: fakeNode(),
    demoBtn: fakeNode()
  };

  const sheet = fakeNode({ hidden: true });
  let keydown = null;
  const documentRef = {
    addEventListener: (type, handler) => {
      if (type === 'keydown') keydown = handler;
    },
    getElementById: () => sheet
  };

  new GameControls({ ui: { refs, busy: false, handlers: {} }, controller, documentRef }).mount();

  refs.autoPack.click();
  assert.deepEqual(calls, ['cycle'], 'la insignia rueda el paquete sin girar ni gastar saldo');

  /* Con el bucle en marcha el pulsador rojo es la parada rapida. */
  controller.autoRunning = true;
  refs.spinBtn.click();
  assert.deepEqual(
    calls,
    ['cycle', 'stop:Automático detenido'],
    'el GIRAR detiene la tanda automatica en curso'
  );

  controller.autoRunning = false;
  refs.spinBtn.click();
  assert.deepEqual(
    calls,
    ['cycle', 'stop:Automático detenido', 'spin'],
    'con el bucle parado el GIRAR vuelve a girar'
  );

  /* Space sobre la insignia no lanza tirada: el boton ya hace su trabajo. */
  const badge = { closest: (selector) => (selector === '#btn-auto-pack' ? badge : null) };
  keydown({ code: 'Space', key: ' ', target: badge, shiftKey: false, preventDefault() {} });
  assert.deepEqual(calls.at(-1), 'spin', 'la barra espaciadora no gira desde la insignia');
  assert.ok(!calls.includes('sheet'), 'Space sin Shift no abre la hoja');

  /* Shift+Enter es el atajo de la hoja, sin rueda de por medio. */
  keydown({ code: 'Enter', key: 'Enter', target: badge, shiftKey: true, preventDefault() {} });
  assert.equal(calls.at(-1), 'sheet', 'Shift+Enter abre la hoja desde la insignia');
});

test('GameControls: la pulsacion larga de la insignia abre la hoja y no rueda el paquete', async () => {
  const { GameControls } = await loadUiModule('components/GameControls.js');

  const calls = [];
  const controller = {
    autoRunning: false,
    cycleQuickSpins: () => calls.push('cycle'),
    openFeverSheet: () => calls.push('sheet'),
    buyFeature: () => {},
    toggleAuto: () => {},
    spin: () => {},
    stopAuto: () => {},
    changeBet: () => {},
    setMaxBet: () => {},
    startDemoMode: () => {}
  };

  const refs = {
    spinBtn: fakeNode(),
    featureBtn: fakeNode(),
    autoPack: fakeNode(),
    autoBtn: fakeNode(),
    betUp: fakeNode(),
    betDown: fakeNode(),
    betMax: fakeNode(),
    demoBtn: fakeNode()
  };

  const documentRef = {
    addEventListener() {},
    getElementById: () => null
  };

  new GameControls({
    ui: { refs, busy: false, handlers: {} },
    controller,
    documentRef,
    longPressMs: 10
  }).mount();

  /* Mantener el dedo: la hoja, y el `click` que llega al soltar no rueda. */
  refs.autoPack.emit('pointerdown');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(calls, ['sheet'], 'mantener pulsada la insignia abre la hoja');

  refs.autoPack.emit('pointerup');
  refs.autoPack.click();
  assert.deepEqual(calls, ['sheet'], 'el click posterior no rueda el paquete');

  /* Toque corto: solo rueda. */
  refs.autoPack.emit('pointerdown');
  refs.autoPack.emit('pointerup');
  refs.autoPack.click();
  assert.deepEqual(calls, ['sheet', 'cycle'], 'un toque corto solo rueda el paquete');

  /* Salir del pulsador antes del umbral cancela la pulsacion larga. */
  refs.autoPack.emit('pointerdown');
  refs.autoPack.emit('pointerleave');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(calls, ['sheet', 'cycle'], 'salir del pulsador cancela la hoja');

  /* El menu contextual del sistema no debe tapar la capsula. */
  let prevented = 0;
  refs.autoPack.emit('contextmenu', { preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 1, 'el contextmenu se bloquea sobre la insignia');
});

test('la insignia del paquete refleja el paquete y se apaga con el motor ocupado', async () => {
  const ui = await createView();
  const pack = ui.refs.autoPack;

  assert.equal(ui.setQuickSpins(10), true);
  assert.match(
    pack.getAttribute('aria-label'),
    /Paquete de tiradas automáticas · 10\./,
    'el paquete vigente viaja en el nombre accesible, no solo en la cifra'
  );
  assert.equal(ui.refs.autoCount.textContent, 'x10');
  assert.equal(pack.disabled, false, 'en reposo se cambia de paquete');

  ui.setBusy(true);
  assert.equal(pack.disabled, true, 'con una ronda en curso el paquete esta comprometido');

  ui.setBusy(false);
  ui.setAuto(true, 10);
  assert.equal(pack.disabled, true, 'con el bucle en marcha tampoco se reconfigura');
  assert.equal(ui.refs.autoCount.textContent, 'x10', 'la insignia sigue contando la tanda');

  ui.setAuto(false, 0);
  assert.equal(pack.disabled, false, 'al parar la insignia vuelve a estar viva');
});

test('paintAutoCount_ rueda la cifra: la saliente sale y la nueva entra desde abajo', async () => {
  const ui = await createView();
  const classes = [];
  const ghosts = [];
  const attached = [];
  const host = {
    offsetWidth: 48,
    querySelectorAll: () => attached.filter((node) => node.attached),
    appendChild(node) { node.parentNode = host; node.attached = true; attached.push(node); },
    removeChild(node) { node.attached = false; }
  };

  const count = ui.refs.autoCount;
  count.parentNode = host;
  count.classList = {
    add: (name) => classes.push(['add', name]),
    remove: (name) => classes.push(['remove', name]),
    toggle() {}
  };
  count.addEventListener = () => {};
  count.textContent = '';

  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tag) => {
      const node = fakeNode();
      node.tagName = tag;
      node.attached = false;
      node.parentNode = null;
      node.remove = () => { node.attached = false; };
      ghosts.push(node);
      return node;
    }
  };

  try {
    /* Primer pintado: no hay cifra anterior, asi que no hay tambor. */
    ui.setQuickSpins(10);
    assert.equal(count.textContent, 'x10');
    assert.equal(ghosts.length, 0, 'sin cifra previa el tambor no se pinta');

    /* Segundo paquete: se clona la cifra saliente y la nueva entra desde abajo. */
    ui.setQuickSpins(25);
    assert.equal(count.textContent, 'x25');
    assert.equal(ghosts.length, 1, 'la cifra saliente se clona');
    assert.equal(ghosts[0].className, 'pill__roll-ghost');
    assert.equal(ghosts[0].textContent, 'x10', 'el clon lleva la cifra que sale');
    assert.equal(ghosts[0].getAttribute('aria-hidden'), 'true', 'el clon es solo pintura');
    assert.deepEqual(
      classes.slice(-2),
      [['remove', 'is-roll-in'], ['add', 'is-roll-in']],
      'la cifra viva reinicia la animacion de entrada'
    );
    assert.equal(attached.filter((node) => node.attached).length, 1, 'el tambor vive en el pulsador');

    /* `animationend` retira el clon y la clase de entrada. */
    ghosts[0].emit('animationend');
    assert.equal(attached.filter((node) => node.attached).length, 0, 'el clon se retira');
    assert.deepEqual(classes.at(-1), ['remove', 'is-roll-in'], 'la clase de entrada se limpia');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('el FEVER se apaga cuando el saldo no cubre las 100 apuestas', async () => {
  const rich = await createView({ betCredits: 1, balanceCents: 100000 });
  assert.equal(rich.refs.featureBtn.disabled, false, '100,00 de bonus caben en 1.000,00');

  rich.setBet(100);
  rich.updateAffordability(100000, 10000);
  assert.equal(
    rich.refs.featureBtn.disabled,
    true,
    'con 100,00 de apuesta el bonus cuesta 10.000,00 y el saldo no llega'
  );
  assert.equal(rich.refs.featureCost.textContent, '100x · 10.000,00', 'el subtitulo publica el precio real');
});

/* ------------------------------------------------------- marcado y estilos */

test('el marcado trae FEVER, la insignia del paquete y la hoja GIROS RAPIDOS', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');

  assert.match(
    html,
    /id="btn-auto-pack"[^>]*aria-haspopup="dialog"[^>]*aria-controls="fever-sheet"/,
    'la insignia del paquete es el disparador de la hoja'
  );
  assert.match(html, /<span id="auto-count">x10<\/span>/, 'la insignia arranca con el paquete por defecto');
  assert.match(html, /<span class="btn__title">FEVER<\/span>/, 'rotulo del pulsador que compra el bonus');
  assert.match(
    html,
    /<span class="pill" id="feature-cost">100x · 1,00<\/span>/,
    'el FEVER publica su coste en la capsula de valor del caramelo'
  );
  assert.doesNotMatch(html, /id="feature-options"/, 'los chips salieron del panel');
  assert.doesNotMatch(html, /class="btn__opt"/, 'no quedan chips: el paquete se elige en la hoja');
  assert.doesNotMatch(
    html,
    /id="btn-feature"[^>]*aria-haspopup/,
    'el FEVER compra: no abre dialogos'
  );
  assert.doesNotMatch(html, /class="statusbar"/, 'el pie del panel ya no publica estado ni version');
  assert.doesNotMatch(html, /id="status-text"/, 'sin barra de estado no queda texto de sesion');
  assert.doesNotMatch(html, /id="engine-text"/, 'ni la version del motor');
  assert.match(
    html,
    /<h2 class="fever__title" id="fever-title">Giros Rápidos<\/h2>/,
    'la hoja se titula Giros Rápidos (el CSS lo sube a mayusculas)'
  );
  assert.match(html, /class="fever__flame"/, 'la cabecera lleva su estrella');
  assert.match(
    html,
    /aria-describedby="fever-lead"/,
    'la descripcion de la hoja queda enlazada al dialogo'
  );
});

test('el panel, los mandos del arte y la hoja estan en la fuente y en el minificado', () => {
  const css = fs.readFileSync(path.join(ROOT_DIR, 'public', 'src', 'css', 'style.css'), 'utf8');

  assert.match(
    css,
    /\.fever__options\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
    'las tres tarjetas se reparten en una fila'
  );
  assert.match(css, /\.fever__flame\s*\{/, 'la estrella de la cabecera tiene estilo propio');

  /* El panel es el arte: los cinco pulsadores dibujados son ventanas al lienzo. */
  assert.match(
    css,
    /\.machine__side \{\s*background: url\('\.\.\/\.\.\/assets\/santa-crush\/console\/console-desktop\.webp'\) no-repeat center \/ 100% 100%;/,
    'la consola de escritorio pinta el arte como carcasa'
  );
  assert.match(
    css,
    /\.machine__side \.controls #btn-feature,\s*\n\s*\.machine__side \.controls #btn-auto \{/,
    'FEVER y AUTO recortan su caramelo del lienzo (no se pinta capsula encima)'
  );
  assert.match(
    css,
    /\.machine__side \.controls #btn-auto \{[^}]*--art-x: 51\.96;/,
    'el AUTO es el caramelo azul del pie'
  );
  assert.match(
    css,
    /\.machine__side \.controls #btn-feature \{[^}]*--art-x: 10\.8;/,
    'el FEVER es el caramelo amarillo del pie'
  );

  /* El unico pulsador que se pinta es el GIRAR grande de la banda libre. */
  const spin = [...css.matchAll(
    /\.machine__side \.controls \.btn--spin,\s*\n\s*\.machine__side \.controls #btn-spin \{([^}]*)\}/g
  )]
    .map((match) => match[1])
    .find((body) => body.includes('left: 12%;'));
  assert.ok(spin, 'El GIRAR declara su capsula propia');
  assert.match(spin, /top: 67\.4%;/, 'arranca bajo la lectura del saldo');
  assert.match(spin, /width: 76%;/, 'y ocupa el ancho de la banda libre');
  assert.match(spin, /linear-gradient\(180deg, #ff6a5c/, 'capsula roja candy');
  /* El marco del GIRAR se mide con la misma vara que el resto de mandos: borde
     de 3 px —el grosor con el que el arte dibuja el aro de FEVER y AUTO— y el
     radio de capsula (999 px) que comparten las pastillas del pie. Antes era un
     anillo de `box-shadow`, y los modos de bajo consumo reescriben esa
     propiedad con `!important`: la capsula grande se quedaba sin marco. */
  assert.match(spin, /border: 3px solid transparent;/, 'marco de 3 px, el de los caramelos del pie');
  assert.match(spin, /border-radius: 999px;/, 'capsula: el mismo radio que las pastillas');
  assert.match(spin, /background-origin: padding-box, border-box;/, 'el oro vive en la capa del borde');
  assert.match(spin, /background-clip: padding-box, border-box;/, 'y no invade la cara carmesi');
  assert.match(
    spin,
    /linear-gradient\(180deg, #fff8cf 0%, #ffd54a 46%, #c9861a 100%\)/,
    'el aro usa el dorado del sistema'
  );
  assert.doesNotMatch(spin, /0 0 0 0\.07em #ffd54a,/, 'el aro ya no es un anillo de sombra');
  /* La caja global es `border-box`: los 3 px del marco crecen hacia dentro, asi
     que la capsula conserva su tamano y su contenido no se mueve (medido en
     Edge a 1440, 1000 y 900 px de ancho: cero desbordamiento en los tres). */
  assert.match(css, /\*\s*\{\s*box-sizing:\s*border-box;\s*\}/, 'el marco no altera la caja');

  /* Insignia del paquete: hermana del AUTO, en escritorio y en movil. */
  assert.match(
    css,
    /\.machine__side \.controls #btn-auto-pack \{[^}]*position: absolute;[^}]*left: 64\.48%;/,
    'en escritorio la insignia se apoya en la mitad baja del caramelo azul'
  );
  assert.match(
    css,
    /\.machine__side \.controls #btn-auto-pack \{[^}]*left: 6\.33%;/,
    'en movil ocupa la capsula 1 del pie, debajo del disco "..."'
  );
  assert.match(
    css,
    /#btn-auto-pack \.pill__roll-ghost/,
    'la cifra saliente del rodillo tiene su capa'
  );
  assert.match(
    css,
    /#btn-auto-pack #auto-count\.is-roll-in/,
    'la cifra entrante se anima al cambiar de paquete'
  );
  assert.match(css, /#btn-auto-pack:focus-visible\s*\{/, 'la insignia tiene anillo de foco propio');
  assert.match(css, /#btn-auto-pack:disabled\s*\{/, 'la insignia se apaga con el motor ocupado');
  assert.match(
    css,
    /#btn-feature \.pill \{ display: none; \}/,
    'en movil el precio del FEVER no se pinta sobre el arte'
  );
  assert.doesNotMatch(css, /\.btn__opts\s*\{/, 'los chips salieron de la hoja de estilos');
  assert.doesNotMatch(css, /\.btn__opt\s*\{/, 'no queda estilo de chip que mantener');

  const min = fs.readFileSync(path.join(ROOT_DIR, 'public', 'src', 'css', 'style.min.css'), 'utf8');
  assert.ok(min.includes('.fever__flame'), 'el minificado conserva la estrella de la hoja');
  assert.ok(min.includes('#btn-auto-pack:disabled'), 'el minificado conserva el candado de la insignia');
  assert.ok(min.includes('.machine__side .controls .btn--spin'), 'el minificado conserva el GIRAR grande');
  assert.ok(!min.includes('.btn__opts'), 'el minificado no arrastra los chips');
});



/* ------------------------------------------- sincronia de la insignia movil */

test('elegir paquete repinta la insignia aunque el azul tenga aria-pressed pegado', async () => {
  const ui = await createView();

  /* Atributo pegado: la insignia no puede depender de el para decidir si pinta
     —un bucle cortado a mitad puede dejarlo en `true`—, el estado manda. */
  ui.refs.autoBtn.setAttribute('aria-pressed', 'true');

  assert.equal(ui.setQuickSpins(25), true);
  assert.equal(ui.refs.autoCount.textContent, 'x25', 'la cifra cambia en la misma llamada');
  assert.match(
    ui.refs.autoPack.getAttribute('aria-label'),
    /Paquete de tiradas automáticas · 25\./,
    'el nombre accesible viaja con la cifra'
  );

  assert.equal(ui.setQuickSpins(5), true);
  assert.equal(ui.refs.autoCount.textContent, 'x5', 'y sigue cambiando en cada paquete');
});

test('el clon del rodillo se retira solo aunque no llegue animationend', async () => {
  const ui = await createView();
  ui.rollCleanupMs = 5;

  const attached = [];
  const host = {
    offsetWidth: 48,
    querySelectorAll: () => attached.filter((node) => node.attached),
    appendChild(node) { node.parentNode = host; node.attached = true; attached.push(node); },
    removeChild(node) { node.attached = false; }
  };

  const count = ui.refs.autoCount;
  count.parentNode = host;
  count.classList = { add() {}, remove() {}, toggle() {} };
  count.textContent = '';

  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => {
      const node = fakeNode();
      node.attached = false;
      node.parentNode = null;
      return node;
    }
  };

  try {
    ui.setQuickSpins(10);
    ui.setQuickSpins(25);
    assert.equal(attached.length, 1, 'la cifra saliente se clona');
    assert.equal(count.textContent, 'x25', 'la cifra viva es la nueva');

    /* Sin `animationend` (pestaña en segundo plano, animaciones apagadas con la
       pagina abierta) el respaldo retira el clon: si se quedara, taparia la
       cifra nueva con la vieja. */
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(attached.filter((node) => node.attached).length, 0, 'el clon se retira igual');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('con movimiento reducido activado en vivo la cifra cambia sin rodillo', async () => {
  const ui = await createView();
  const classes = [];
  let created = 0;

  const count = ui.refs.autoCount;
  count.parentNode = { offsetWidth: 48, appendChild() {}, removeChild() {}, querySelectorAll: () => [] };
  count.classList = {
    add: (name) => classes.push(name),
    remove() {},
    toggle() {}
  };
  count.textContent = '';

  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = {
    createElement: () => {
      created += 1;
      return fakeNode();
    }
  };
  /* El sistema activa "reducir movimiento" con la pagina ya cargada: el CSS
     deja de animar en vivo y la vista tiene que enterarse en el momento. */
  globalThis.window = { matchMedia: () => ({ matches: true }) };

  try {
    ui.setQuickSpins(10);
    ui.setQuickSpins(25);
    assert.equal(count.textContent, 'x25', 'el texto se actualiza igual de rapido');
    assert.equal(created, 0, 'sin animacion no se clona la cifra saliente');
    assert.deepEqual(classes, [], 'tampoco se marca la entrada');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('ciclar el paquete desde el controlador repinta la insignia de la vista', async () => {
  const { GameController } = await loadUiModule('controllers/GameController.js');
  const ui = await createView();
  const sfx = createSfxSpy();

  const api = { spin: async () => ({ ok: true }), gameInfo: async () => ({}) };
  const session = { isDemo: false, invalidate() {}, resolve: async () => ({ source: 'dev' }) };
  const game = new GameController({ api, ui, sfx, session });

  assert.equal(ui.refs.autoCount.textContent, 'x10', 'arranca con el paquete por defecto');

  assert.equal(game.cycleQuickSpins(), 25);
  assert.equal(game.quickSpinsPick, 25);
  assert.equal(ui.refs.autoCount.textContent, 'x25', 'el toque corto deja la cifra nueva');

  assert.equal(game.cycleQuickSpins(), 5);
  assert.equal(ui.refs.autoCount.textContent, 'x5', 'y la siguiente, tambien');

  assert.equal(game.pickQuickSpins(10), true);
  assert.equal(game.quickSpinsPick, 10);
  assert.equal(ui.refs.autoCount.textContent, 'x10', 'elegir en la hoja repinta la pastilla');
  assert.match(ui.refs.autoPack.getAttribute('aria-label'), /· 10\./);
});

