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
    featureOptions: fakeChipsNode(),
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

test('el pulsador amarillo abre los giros rapidos con el catalogo y el coste vivos', async () => {
  const { formatCents, formatCredits } = await getFormatters();
  const ui = await createView({ betCredits: 1, balanceCents: 100000 });

  const opened = withDocument(null, (classes) => {
    const result = ui.openFeverSheet();
    assert.equal(classes.has('is-fever-open'), true, 'bloquea el scroll del documento');
    return result;
  });

  assert.equal(opened, true);
  assert.equal(ui.refs.feverSheet.hidden, false);
  assert.equal(ui.refs.featureBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(
    ui.refs.autoBtn.getAttribute('aria-expanded'),
    null,
    'el azul no es un disparador de dialogo: no lleva aria-expanded'
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
  assert.equal(ui.refs.autoCount.textContent, 'x25', 'la pildora anuncia el paquete configurado');
  assert.equal(
    ui.refs.autoBtn.getAttribute('aria-label'),
    'Auto · 25 tiradas automáticas. Pulsa para jugarlas seguidas.'
  );
  assert.deepEqual(
    ui.refs.featureOptions.children.map((chip) => chip.classList.toggled.at(-1)),
    [
      ['is-active', false],
      ['is-active', false],
      ['is-active', true]
    ],
    'el chip del paquete vigente queda resaltado en el boton amarillo'
  );

  ui.openFeverSheet();
  assert.equal(ui.refs.featureBtn.getAttribute('aria-expanded'), 'true');
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

test('cerrar la hoja devuelve el foco al pulsador amarillo', async () => {
  const ui = await createView();
  ui.openFeverSheet();
  assert.equal(withDocument(null, () => ui.closeFeverSheet()), true);

  assert.equal(ui.refs.feverSheet.hidden, true);
  assert.equal(ui.refs.featureBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(ui.refs.featureBtn.focusCount, 1, 'el foco vuelve al pulsador amarillo');
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

test('el bonus del motor no toca el rotulo del pulsador amarillo', async () => {
  const ui = await createView({ betCredits: 2, balanceCents: 1000000 });
  ui.refs.infoRtpBase = fakeNode();
  ui.refs.infoRtpFeature = fakeNode();
  ui.refs.infoCap = fakeNode();
  ui.refs.engine = fakeNode();

  withDocument(null, () => {
    ui.setGameInfo({
      code: 'MERIDIANO_GRID_6X5_95_10K',
      engineVersion: '1.1.0',
      paytableVersion: 'MB65-95-10K-v2',
      feature: { costMultiplier: 50, spins: 8, label: 'Crush Pro' }
    });
  });

  assert.equal(ui.featureLabel, 'Crush Pro', 'el bonus sigue disponible en la tabla de pagos');
  assert.equal(
    ui.refs.featureBtn.title,
    'Autogiro · paquete de 10 tiradas automáticas',
    'el amarillo anuncia paquetes, no la compra del bonus'
  );
  assert.doesNotMatch(
    ui.refs.featureBtn.getAttribute('aria-label'),
    /Crush Pro|comprar/i,
    'el nombre accesible del amarillo no promete una compra'
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

test('GameControls: el amarillo abre la hoja, el azul ejecuta y el teclado no gira con la hoja abierta', async () => {
  const { GameControls } = await loadUiModule('components/GameControls.js');

  const calls = [];
  const controller = {
    autoRunning: false,
    openFeverSheet: () => calls.push('feature'),
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

  refs.featureBtn.click();
  refs.autoBtn.click();
  assert.deepEqual(calls, ['feature', 'auto'], 'ninguno de los dos gira por su cuenta');

  sheet.hidden = false;
  keydown({ code: 'Space', key: ' ', target: {}, preventDefault() {} });
  assert.deepEqual(calls, ['feature', 'auto'], 'con la hoja abierta no se gira');

  sheet.hidden = true;
  keydown({ code: 'Space', key: ' ', target: {}, preventDefault() {} });
  assert.deepEqual(
    calls,
    ['feature', 'auto', 'spin'],
    'al cerrar, la barra espaciadora vuelve a girar'
  );
});

/* ------------------------------------------------------- marcado y estilos */

test('el marcado trae el boton AUTOGIRO con los tres chips y la hoja GIROS RAPIDOS', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf8');

  assert.match(
    html,
    /id="btn-feature"[^>]*aria-haspopup="dialog"[^>]*aria-controls="fever-sheet"/,
    'el amarillo es el disparador de la hoja'
  );
  assert.match(html, /<span class="btn__title">AUTOGIRO<\/span>/, 'rotulo principal del pulsador');
  assert.match(
    html,
    /<span class="btn__opts" id="feature-options" aria-hidden="true">/,
    'los paquetes viven dentro del cuerpo del boton'
  );
  for (const spins of [5, 10, 25]) {
    assert.match(
      html,
      new RegExp(`<span class="btn__opt" data-spins="${spins}">x${spins}</span>`),
      `el chip x${spins} esta en el marcado`
    );
  }
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
  assert.doesNotMatch(html, /id="feature-cost"/, 'la capsula del coste del bonus ya no existe');
});

test('los estilos de la hoja y de los chips estan en la fuente y en el minificado', () => {
  const css = fs.readFileSync(path.join(ROOT_DIR, 'public', 'src', 'css', 'style.css'), 'utf8');

  assert.match(
    css,
    /\.fever__options\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
    'las tres tarjetas se reparten en una fila'
  );
  assert.match(css, /\.fever__flame\s*\{/, 'la estrella de la cabecera tiene estilo propio');
  assert.match(css, /\.btn__opts\s*\{[^}]*display:\s*flex;/, 'los chips van en fila dentro del boton');
  assert.match(css, /\.btn__opt\.is-active\s*\{/, 'el paquete vigente se resalta');
  assert.match(
    css,
    /#btn-feature \.btn__opts\s*\{[^}]*position:\s*absolute;/,
    'en movil el catalogo rota sobre la placa del pie'
  );
  assert.match(css, /@keyframes featurePlateRoll/, 'el turno de chips es animado');

  const min = fs.readFileSync(path.join(ROOT_DIR, 'public', 'src', 'css', 'style.min.css'), 'utf8');
  assert.ok(min.includes('.fever__flame'), 'el minificado conserva la estrella de la hoja');
  assert.ok(min.includes('.btn__opt.is-active'), 'el minificado conserva el chip vigente');
  assert.ok(min.includes('featurePlateRoll'), 'el minificado conserva la rotacion de la placa');
});


