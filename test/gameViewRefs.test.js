'use strict';

/**
 * Refs defensivos de `GameView`.
 *
 * La consola cambio dos veces de forma (compra del bonus -> autogiro con chips).
 * Al retirar nodos del marcado quedo la posibilidad de que algun metodo siguiera
 * escribiendo en ellos: leer `this.refs.featureCost.textContent` sobre `null` es
 * el `TypeError: null is not an object` historico. La regla ahora es estructural:
 *
 *   - todas las escrituras pasan por `ref_()` / `setRefText_()` / `setRefAttr_()`
 *     / `toggleRefClass_()` / `addRefListener_()`, que devuelven `false` si el
 *     nodo no esta montado;
 *   - ningun metodo encadena propiedades sobre `this.refs.<nodo>`;
 *   - el mapa `refs` no incluye la capsula eliminada del coste del bonus.
 *
 * Los modulos de `ui/` son ESM sin build: se cargan con el mismo cargador de
 * data-URLs que usa `feverSheet.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT_DIR, 'ui');
const VIEW_FILE = path.join(UI_DIR, 'renderers', 'GameView.js');

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

/** Nodo minimo con lo que escriben los helpers de la vista. */
function fakeNode(attrs = {}) {
  const map = new Map(Object.entries(attrs));
  return {
    textContent: '',
    title: '',
    hidden: false,
    disabled: false,
    classList: {
      toggle() {},
      add() {},
      remove() {}
    },
    setAttribute(name, value) { map.set(name, String(value)); },
    getAttribute(name) { return map.has(name) ? map.get(name) : null; },
    addEventListener() {},
    focus() {}
  };
}

/* ------------------------------------------------- escritura sin marcado */

test('la vista sin marcado pinta consola, HUD y hoja sin lanzar', async () => {
  const { Ui } = await loadUiModule('renderers/GameView.js');
  const ui = new Ui();
  /* Ninguna version del marcado: es el caso de una pagina a medio montar o de un
     HTML antiguo donde ya no estan los nodos del autogiro. */
  ui.refs = {};

  assert.doesNotThrow(() => {
    ui.paintQuickSpinsOptions_();
    ui.renderFeverSheet_();
    ui.setBet(2);
    ui.setAuto(true, 5);
    ui.setBusy(true);
    ui.updateAffordability(1000, 100);
    ui.setBalance(12.5);
    ui.setCurrency('VES');
    ui.setSpinTag('Giro 3');
    ui.setSpinTag(null);
    ui.setMultiplier(3);
    ui.showBanner('big', '1,00');
    ui.hideBanner();
    ui.setRoundInfo({ state: 'idle', roundId: 'r-1' });
    ui.setStatus('Listo');
    ui.setEngineText('MBC · v1');
  });

  /* Los metodos que devuelven algo lo hacen sin inventar datos. */
  assert.equal(ui.setBalance(5), false, 'sin placa de saldo no se escribe nada');
  assert.equal(ui.toast('hola'), null, 'sin contenedor de avisos no hay toast');
  assert.equal(ui.renderHistoryEmpty(), false, 'sin historial no se pinta el vacio');
  assert.equal(ui.addHistory({ winCents: 100, betCents: 100 }), null);
  assert.equal(ui.openModal('Tabla', '<p>x</p>'), false, 'sin modal no se abre nada');
  assert.equal(ui.closeModal(), false);

  /* La ganancia se recuerda aunque no haya nodo donde pintarla. */
  ui.setWin(2500);
  assert.equal(ui.winShownCents, 2500);

  assert.doesNotThrow(() => {
    ui.showInfo();
    ui.showAuthGate({ onSubmit: () => {} });
    ui.hideWinOverlay({ immediate: true });
    ui.closeModal();
  });
});

/* ------------------------------------------------- refs retirados del bonus */

test('un `refs` con la capsula eliminada del bonus (`featureCost`) no se toca', async () => {
  const { Ui } = await loadUiModule('renderers/GameView.js');
  const ui = new Ui();
  /* El nodo existe como clave pero ya no en el DOM: es lo que deja una copia
     antigua del HTML o un `getElementById` que devolvio `null`. */
  ui.refs = { featureCost: null, featureBtn: null, featureOptions: null };

  assert.doesNotThrow(() => {
    ui.paintQuickSpinsOptions_();
    ui.renderFeverSheet_();
    ui.setBet(5);
    ui.setQuickSpins(25);
  });

  assert.equal(ui.setRefText_('featureCost', '5,00'), false, 'no escribe en un nodo ausente');
  assert.equal(ui.setRefAttr_('featureCost', 'data-cost', '5,00'), false);
  assert.equal(ui.toggleRefClass_('featureCost', 'is-visible', true), false);
  assert.equal(ui.addRefListener_('featureCost', 'click', () => {}), false);
  assert.equal(ui.setRefText_('noExiste', 'x'), false, 'cualquier ref desconocido degrada igual');
});

/* ------------------------------------------------------- refs con nodos vivos */

test('con los nodos montados los helpers si escriben', async () => {
  const { Ui } = await loadUiModule('renderers/GameView.js');
  const { formatCents } = await loadUiModule('lib/format.js');

  const ui = new Ui();
  ui.refs = {
    status: fakeNode(),
    engine: fakeNode(),
    infoRound: fakeNode(),
    winValue: fakeNode(),
    autoBtn: fakeNode(),
    autoCount: fakeNode(),
    autoPack: fakeNode(),
    featureBtn: fakeNode(),
    featureCost: fakeNode()
  };

  ui.setStatus('En espera');
  assert.equal(ui.refs.status.textContent, 'En espera');

  ui.setEngineText('MBC · v1 · pay-1');
  assert.equal(ui.refs.engine.textContent, 'MBC · v1 · pay-1');

  ui.setRoundInfo({ roundId: '0123456789abcdefXYZ', serverSeedHash: 'hash', clientSeed: 'seed' });
  assert.equal(ui.refs.infoRound.textContent, '0123456789abcdefXY', 'se recorta a 18 caracteres');
  assert.equal(ui.refs.infoRound.getAttribute('title'), '0123456789abcdefXYZ');

  ui.setWin(2500);
  assert.equal(ui.refs.winValue.textContent, formatCents(2500));

  /* La insignia anuncia el catalogo y el azul el paquete vigente. */
  ui.paintQuickSpinsOptions_();
  assert.match(
    ui.refs.autoPack.getAttribute('aria-label'),
    /Pulsa para elegir entre 5, 10 o 25/,
    'la insignia anuncia el catalogo que abre'
  );
  assert.match(ui.refs.autoBtn.getAttribute('aria-label'), /10 tiradas automáticas/);
  assert.equal(ui.refs.autoCount.textContent, 'x10');

  /* El FEVER publica lo que cuesta comprar el bonus con la apuesta viva. */
  ui.paintFeatureCost_();
  assert.equal(ui.refs.featureCost.textContent, '100x · 100,00');
  assert.match(
    ui.refs.featureBtn.getAttribute('aria-label'),
    /compra el bonus de 10 giros por 100 veces la apuesta/,
    'el FEVER anuncia la compra, no el paquete de tiradas'
  );
});

/* ------------------------------------------------------------- regla estatica */

test('el renderer no encadena propiedades sobre `this.refs.<nodo>`', () => {
  const source = fs.readFileSync(VIEW_FILE, 'utf8');

  assert.doesNotMatch(
    source,
    /this\.refs\.[A-Za-z_$][\w$]*\s*\./,
    'ningun metodo debe leer/escribir `this.refs.<nodo>.<prop>`: usa ref_() y los helpers'
  );
  assert.doesNotMatch(source, /refs\.featureCost/, 'la capsula del coste del bonus ya no existe');
  assert.match(
    source,
    /setRefText_\(name, text\)\s*\{[\s\S]*?const node = this\.ref_\(name\);[\s\S]*?if \(!node\) return false;/,
    'setRefText_ comprueba el nodo antes de escribir'
  );
});
