'use strict';

/**
 * Modal «Tabla de pagos» (`#btn-help`).
 *
 * Cubre el contrato del documento de premios:
 *   - el boton de la barra lleva rotulo visible y el icono de tabla (no un
 *     interrogante) y apunta al modal con `aria-haspopup`/`aria-controls`;
 *   - `showInfo` abre la placa con las tres secciones pedidas: como se paga,
 *     tabla por dispersion y comodines/especiales;
 *   - las cifras y los tramos se derivan de `/api/game` (8-9 / 10-11 / 12+),
 *     sin copiar la paytable a mano en la vista;
 *   - el documento no filtra datos de ingenieria (RTP, versiones, hashes).
 *
 * Los modulos de `ui/` son ESM sin build: se cargan con el mismo cargador de
 * data-URLs que `uiArchitecture.test.js` y `feverSheet.test.js`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT_DIR, 'ui');
const INDEX_PATH = path.join(ROOT_DIR, 'public', 'index.html');

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

/** Nodo minimo: `openModal` escribe texto/HTML y enfoca el cierre. */
function fakeNode() {
  return {
    hidden: true,
    textContent: '',
    innerHTML: '',
    focusCount: 0,
    focus() { this.focusCount += 1; }
  };
}

/* La tabla que se pinta es la que publica el motor: se usa la instancia real
   de produccion en vez de una copia, para que el test detecte un cambio de
   paytable ademas de un cambio de maqueta. */
const engine = require('../core');
const GAME_INFO = engine.gameInfo;

const SYMBOL_KEYS = ['S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1'];

async function openInfoModal() {
  const { Ui } = await loadUiModule('renderers/GameView.js');
  const ui = new Ui();
  ui.refs = {
    modal: fakeNode(),
    modalTitle: fakeNode(),
    modalBody: fakeNode(),
    modalClose: fakeNode()
  };
  ui.gameInfo = GAME_INFO;
  ui.showInfo();
  return ui;
}

test('el boton de la barra se llama "Tabla de pagos" y apunta al modal', () => {
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.match(
    html,
    /class="icon-btn icon-btn--help icon-btn--paytable" id="btn-help" type="button"/,
    'el contrato con `GameView` (`btn-help`) no cambia'
  );
  assert.match(
    html,
    /aria-haspopup="dialog" aria-controls="modal"/,
    'el boton anuncia que abre un dialogo'
  );
  assert.match(
    html,
    /<span class="icon-btn__label" aria-hidden="true">Tabla de pagos<\/span>/,
    'el rotulo visible sustituye al interrogante'
  );
  assert.match(
    html,
    /<rect x="3\.6" y="4\.6" width="16\.8" height="14\.8" rx="3" \/>/,
    'el glifo es una rejilla de tabla, no un signo de pregunta'
  );
  assert.doesNotMatch(html, />\?<\/button>/, 'no queda ningun boton con `?`');
  assert.match(html, /<h2 id="modal-title">Tabla de pagos<\/h2>/);
});

test('el modal abre con las tres secciones del documento de premios', async () => {
  const ui = await openInfoModal();

  assert.equal(ui.refs.modal.hidden, false, 'la placa se muestra');
  assert.equal(ui.refs.modalTitle.textContent, 'Tabla de pagos');
  assert.ok(ui.refs.modalClose.focusCount > 0, 'el foco entra en el cierre');

  const html = ui.refs.modalBody.innerHTML;
  assert.match(html, /<h3>Cómo se paga<\/h3>/);
  assert.match(html, /<h3>Tabla de pagos \(× apuesta\)<\/h3>/);
  assert.match(html, /<h3>Comodines y símbolos especiales<\/h3>/);
  assert.match(html, /6 × 5/, 'el tablero se describe con sus dimensiones reales');
  assert.match(html, /<strong>8 o más<\/strong>/, 'el minimo de pago sale del motor');
  assert.match(html, /cascadas/, 'se explica la mecanica de cascada');
  assert.match(html, /no tiene comodín \(wild\)/, 'se aclara que no hay wild');
});

test('la tabla de pagos cubre los nueve simbolos y los tres tramos', async () => {
  const { formatPay } = await loadUiModule('lib/format.js');
  const ui = await openInfoModal();
  const html = ui.refs.modalBody.innerHTML;

  assert.match(
    html,
    /<th scope="col">8–9<\/th><th scope="col">10–11<\/th><th scope="col">12\+<\/th>/,
    'los tramos se derivan de la paytable publicada'
  );

  for (const symbol of SYMBOL_KEYS) {
    const pays = GAME_INFO.clusterPays[symbol];
    for (const tier of [8, 10, 12]) {
      assert.ok(
        html.includes(`<td>${formatPay(pays[tier])}</td>`),
        `${symbol} debe publicar su pago del tramo ${tier}`
      );
    }
  }

  assert.equal(
    (html.match(/class="paytable__icon"/g) || []).length,
    SYMBOL_KEYS.length,
    'una fila por simbolo, con su icono'
  );

  const order = SYMBOL_KEYS.map((symbol) => html.indexOf(`/src/assets/slot/${symbol.toLowerCase()}.webp`));
  assert.deepEqual(
    order.slice().sort((a, b) => a - b),
    order,
    'del que mejor paga (S9) al que menos (S1)'
  );
  assert.match(html, /Casa de jengibre/, 'los nombres salen de `SYMBOLS`, no de una lista paralela');
});

test('los especiales publican scatter, rango de bombas y ganancia maxima', async () => {
  const { formatMultiplier, formatPay, formatPlain } = await loadUiModule('lib/format.js');
  const ui = await openInfoModal();
  const html = ui.refs.modalBody.innerHTML;

  assert.match(html, /Logo Santa Crush · scatter \(SC\)/);
  for (const [count, pay] of Object.entries(GAME_INFO.scatterPays)) {
    assert.ok(
      html.includes(`<td>${formatPay(pay)}</td>`),
      `el scatter debe pagar ${count} logos`
    );
  }

  assert.match(html, /Bono navideño \(MX\)/);
  assert.ok(
    html.includes(
      `cada uno vale entre <strong>${formatMultiplier(GAME_INFO.multiplier.min)}</strong> y <strong>${formatMultiplier(GAME_INFO.multiplier.max)}</strong>`
    ),
    'el rango sale de /api/game (2x .. 250x)'
  );

  const chips = html.match(/<span class="paytable__chip">[^<]+<\/span>/g) || [];
  assert.ok(chips.length > 0, 'los valores posibles de la bomba se listan como fichas');
  assert.ok(
    chips.includes(`<span class="paytable__chip">${formatMultiplier(GAME_INFO.multiplier.min)}</span>`),
    'la ficha del valor minimo esta presente'
  );
  assert.ok(
    chips.includes(`<span class="paytable__chip">${formatMultiplier(GAME_INFO.multiplier.max)}</span>`),
    'la ficha del valor maximo esta presente'
  );

  assert.ok(
    html.includes(
      `Ganancia máxima por ronda: <strong>${formatPlain(GAME_INFO.maxExposureMultiplier)}×</strong>`
    ),
    'el tope por ronda cierra el documento'
  );
});

test('el documento no publica datos de ingenieria', async () => {
  const ui = await openInfoModal();
  const html = ui.refs.modalBody.innerHTML;

  assert.doesNotMatch(html, /RTP/);
  assert.doesNotMatch(html, /paytableVersion|TG65-95-10K-v2/);
  assert.doesNotMatch(html, /CSPRNG|HMAC|SHA-256/);
  assert.doesNotMatch(html, /Escalera de apuestas/);
});
