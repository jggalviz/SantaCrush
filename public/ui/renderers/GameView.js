/**
 * Capa de presentacion.
 *
 * Este modulo NO decide nada del juego: recibe la respuesta ya resuelta por el
 * servidor y la reproduce. Cualquier importe mostrado proviene del payload
 * (`balance.credits`, `totalWinCredits`, ...), nunca de un calculo local.
 */

import {
  SYMBOL_KEYS,
  escapeHtml,
  formatCents,
  formatCredits,
  formatMultiplier,
  formatPay,
  formatPercent,
  formatPlain,
  symbolMeta
} from '../lib/format.js';
import { createFx } from './fx.js';
import { BETS, DEMO, FEATURE, GRID, LIMITS } from '../config/gameConfig.js';
import { columnsFromMatrix } from '../lib/reelMath.js';
import { documentHidden } from '../lib/perf.js';
import { createReels } from './reels.js';
import { TIMING, sleep } from '../lib/timing.js';
import { LEVEL_LABEL } from '../lib/winLevel.js';

const REDUCED_MOTION = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cascada de caida: cada columna arranca `DROP_STAGGER` ms despues de la
 * anterior y dentro de la columna la fila suma un escalon corto para que el
 * bloque no caiga como una losa rigida.
 *
 * `tile-drop` dura 300 ms y aterriza al 70 % (210 ms). Con la ultima columna
 * (delay 300 + 4 x 6 = 324 ms) el aterrizaje cae en 534 ms, antes de la espera
 * `TIMING.drop` (580 ms): cuando empieza el resaltado de premios todos los
 * simbolos ya estan en su celda.
 */
const DROP_STAGGER = 60;
const DROP_ROW_STAGGER = 6;
const DROP_MS = 300;
const DROP_LAND_RATIO = 0.7;

/* Dimensiones del tablero: cada columna es un rodillo. */
const ROWS = GRID.rows;
const COLS = GRID.cols;

/* Overlay de victoria: animacion WIN con rayos, importe en conteo rapido y
   lluvia de pelotas por los laterales. Cualquier victoria abre la capa; la
   intensidad (destello, lluvia, entrada y permanencia) escala con `win / bet`.
   El arte es el WebP animado de `build:win` (724 x 724, 3 fotogramas de 350 ms
   en bucle) y el fotograma fijo del mismo dibujo para `prefers-reduced-motion`. */
const WIN_ART_SRC = '/src/assets/win_celebracion.webp';
const WIN_ART_STILL_SRC = '/src/assets/win_celebracion_still.webp';
const WIN_CLOSE_MS = 240;

/* Perfiles de intensidad. `low` cubre los premios que no devuelven la apuesta
   (< 1x), `mid` la banda 1-10x y `high` los niveles big/mega/epic (> 10x).
   `power` alimenta el destello de `fx.flash`, `balls` la lluvia lateral,
   `rollMs` el conteo del importe y `durationMs` el autocierre (el toque o
   Escape siguen cerrando antes, en cualquier perfil). */
const WIN_PROFILES = Object.freeze({
  low: Object.freeze({
    name: 'low',
    balls: 8,
    durationMs: 1700,
    rollMs: 450,
    power: 0.18,
    rays: 'soft'
  }),
  mid: Object.freeze({
    name: 'mid',
    balls: 22,
    durationMs: 3000,
    rollMs: 900,
    power: 0.5,
    rays: 'full'
  }),
  high: Object.freeze({
    name: 'high',
    balls: 42,
    durationMs: 4200,
    rollMs: 900,
    power: 0.8,
    rays: 'full'
  })
});

/* Permanencia de los niveles altos: cuanto mayor el multiplicador, mas aguanta
   el cartel. big/mega/epic comparten perfil `high` y solo cambian el tiempo. */
const WIN_HIGH_MS = Object.freeze({ big: 3800, mega: 4200, epic: 4600 });

/* Por debajo de este ratio el perfil `low` no lanza pelotas: el cartel y el
   importe ya cuentan la victoria sin poblar la capa de particulas. */
const WIN_LOW_MIN_RATIO_BALLS = 0.2;

/**
 * Rotulos hablados de los dos pulsadores de giros.
 *
 * El amarillo ya no compra el bonus: configura el paquete de tiradas y lo
 * anuncia con rotulo propio (`AUTOGIRO x5 x10 x25`), mientras el azul ejecuta
 * ese paquete. `FEATURE.label` (hoy "Santa Crush") sigue nombrando al bonus
 * en el motor y en `/info`, pero no se pinta en la consola. El texto visible va
 * en mayusculas en el marcado, como `MAX`; aqui se guardan las formas habladas,
 * que son las que leen los lectores de pantalla.
 */
const FEATURE_BUTTON_LABEL = 'Autogiro';
const AUTO_BUTTON_LABEL = 'Auto';

export class Ui {
  constructor() {
    this.tiles = [];
    this.refs = {};
    this.gameInfo = null;
    this.currency = 'EUR';
    this.featureCostMultiplier = FEATURE.costMultiplier;
    /* Nombre y tiradas del bonus: `/api/game` los confirma en `setGameInfo`. */
    this.featureLabel = FEATURE.label;
    this.featureSpins = FEATURE.spins;
    this.busy = false;
    this.isDemo = false;
    this.demoCurrency = DEMO.currency;
    this.demoStartCredits = DEMO.startBalanceCents / 100;
    /* Hoja de giros rapidos: apuesta viva y saldo con el que se calcula el coste
       de cada paquete. Se rellenan en `setBet` y `updateAffordability`. */
    this.currentBetCredits = BETS.defaultCredits;
    /* Saldo SIN CONFIRMAR (`null`), no saldo cero: hasta que el motor responde no
       se apaga ningun paquete por dinero, porque el cliente no inventa una cuenta
       vacia. El primer `/balance` o `/spin` lo fija. */
    this.balanceCents = null;
    /* Tiradas automaticas: catalogo cerrado y paquete configurado. */
    this.quickSpins = Array.isArray(BETS.quickSpins) && BETS.quickSpins.length > 0
      ? BETS.quickSpins.slice()
      : [BETS.autoSpins];
    this.quickSpinsPick = this.quickSpins.includes(BETS.autoSpins)
      ? BETS.autoSpins
      : this.quickSpins[0];
    /* Tiradas que le quedan al bucle en curso: la pildora azul las muestra. */
    this.autoRemaining = 0;
    /* El autogiro manda: con el bucle en marcha el boton amarillo no configura
       paquetes, igual que el resto de controles de apuesta. */
    this.autoActive = false;
    /* `onAutoSpins` lo dispara la opcion elegida en la hoja. La vista no compra
       ni gira: solo avisa al controlador. */
    this.handlers = {
      onSound: null,
      onReelLand: null,
      onAutoSpins: null
    };

    /* Capa de particulas y celebraciones (se monta en `mount`). */
    this.fx = null;
    /* Rodillos: cada columna del tablero es un carril animado. */
    this.reels = null;
    /* Imagenes de simbolos precargadas para que el reciclado no parpadee. */
    this.preloaded = null;
    /* Conteo ascendente de la ganancia: valor mostrado y frame pendiente. */
    this.winShownCents = 0;
    this.winRaf = 0;
    /* Temporizadores de los efectos del marco y del HUD. */
    this.landTimer = 0;
    this.landOffTimer = 0;
    this.frameShakeTimer = 0;
    this.hudTimer = 0;
    this.mxTimer = 0;
    /* Overlay de victoria: cierre automatico, salida y conteo del importe. */
    this.winTimer = 0;
    this.winCloseTimer = 0;
    this.winRollRaf = 0;
    this.winArtPreload = null;
  }

  mount() {
    const byId = (id) => document.getElementById(id);

    /* Mapa de nodos vivos. No incluye `featureCost`: la capsula del coste del
       bonus (`#feature-cost`) se retiro del marcado cuando el amarillo dejo de
       comprar y paso a configurar el autogiro. Si una copia antigua del HTML la
       reinserta, o si el marcado cambia y un nodo falta, `ref_` devuelve `null` y
       los helpers `setRefText_`/`setRefAttr_`/`toggleRefClass_`/`addRefListener_`
       no hacen nada: nunca se lee `null.textContent`. */
    this.refs = {
      grid: byId('grid'),
      banner: byId('banner'),
      bannerLevel: byId('banner-level'),
      bannerAmount: byId('banner-amount'),
      spinTag: byId('spin-tag'),
      betValue: byId('bet-value'),
      betReadout: byId('bet-readout'),
      winValue: byId('win-value'),
      mxValue: byId('mx-value'),
      balanceValue: byId('balance-value'),
      balanceCurrency: byId('balance-currency'),
      demoBtn: byId('btn-demo'),
      demoSub: byId('demo-sub'),
      spinBtn: byId('btn-spin'),
      spinLabel: byId('spin-label'),
      featureBtn: byId('btn-feature'),
      featureOptions: byId('feature-options'),
      autoBtn: byId('btn-auto'),
      autoCount: byId('auto-count'),
      betUp: byId('btn-bet-up'),
      betDown: byId('btn-bet-down'),
      betMax: byId('btn-bet-max'),
      status: byId('status-text'),
      engine: byId('engine-text'),
      soundBtn: byId('btn-sound'),
      helpBtn: byId('btn-help'),
      history: byId('history'),
      toasts: byId('toasts'),
      modal: byId('modal'),
      modalTitle: byId('modal-title'),
      modalBody: byId('modal-body'),
      modalClose: byId('btn-modal-close'),
      feverSheet: byId('fever-sheet'),
      feverBackdrop: byId('fever-backdrop'),
      feverTitle: byId('fever-title'),
      feverLead: byId('fever-lead'),
      feverOptions: byId('fever-options'),
      feverSummary: byId('fever-summary'),
      feverClose: byId('btn-fever-close'),
      infoState: byId('info-state'),
      infoRound: byId('info-round'),
      infoSeedHash: byId('info-seedhash'),
      infoClientSeed: byId('info-clientseed'),
      infoDraws: byId('info-draws'),
      infoRtpBase: byId('info-rtp-base'),
      infoRtpFeature: byId('info-rtp-feature'),
      infoCap: byId('info-cap'),
      winOverlay: byId('win-overlay'),
      winRain: byId('win-rain'),
      winAmount: byId('win-amount'),
      winCurrency: byId('win-currency'),
      winArt: byId('win-art')
    };

    /* Contenedores que reciben los efectos de impacto y de camara. */
    this.refs.board = document.querySelector('.board');
    this.refs.frame = document.querySelector('.machine__table');
    this.fx = createFx();

    this.buildGrid();

    this.addRefListener_('modalClose', 'click', () => this.closeModal());
    this.addRefListener_('modal', 'click', (event) => {
      if (event.target instanceof HTMLElement && event.target.dataset.close === '1') this.closeModal();
    });
    document.addEventListener('keydown', (event) => {
      /* La hoja FEVER atrapa Escape y Tab mientras esta abierta. */
      if (this.handleFeverKey_(event)) return;
      if (event.key !== 'Escape') return;
      this.closeModal();
      this.hideWinOverlay();
    });
    this.addRefListener_('helpBtn', 'click', () => this.showInfo());
    this.addRefListener_('soundBtn', 'click', () => {
      if (typeof this.handlers.onSound === 'function') this.handlers.onSound();
    });

    /* Hoja FEVER: backdrop, aspa y delegacion de las opciones. Las opciones se
       repintan (saldo, apuesta, paquete), asi que el listener vive en el
       contenedor y no en cada boton. */
    this.addRefListener_('feverClose', 'click', () => this.closeFeverSheet());
    this.addRefListener_('feverBackdrop', 'click', () => this.closeFeverSheet());
    this.addRefListener_('feverOptions', 'click', (event) =>
      this.handleFeverOptionClick_(event)
    );

    /* La pantalla de victoria se cierra con un toque en cualquier punto. Se usa
       `pointerdown` (responde antes que `click` y no se pierde si el dedo se
       desplaza) y la capa nunca deja pasar el gesto al tablero. */
    this.addRefListener_('winOverlay', 'pointerdown', () => this.hideWinOverlay());

    this.renderPlaceholderGrid();
    this.renderHistoryEmpty();
    this.preloadWinArt_();
    /* El catalogo del amarillo se marca con el paquete vigente desde el primer
       fotograma (`x10`, el de `bets.autoSpins`). */
    this.paintQuickSpinsOptions_();
  }

  /* --------------------------------------------------------- refs defensivos */

  /**
   * Nodo del DOM por nombre de `refs`, o `null` si no esta montado.
   * La vista puede construirse sin marcado (tests del selector FEVER): cada
   * escritura comprueba el nodo en vez de asumir que existe.
   *
   * @param {string} name
   * @returns {HTMLElement|null}
   */
  ref_(name) {
    return (this.refs && this.refs[name]) || null;
  }

  /**
   * Escribe texto solo si el nodo existe.
   *
   * Es la unica via para tocar `textContent` de la vista: ningun metodo hace
   * `this.refs.<nombre>.textContent = ...` por su cuenta. Asi un nodo retirado
   * del marcado (la vieja capsula del coste del bonus, `#feature-cost`, es el
   * caso historico) no puede lanzar `TypeError: null is not an object`.
   *
   * @param {string} name
   * @param {string} text
   * @returns {boolean} true si escribio
   */
  setRefText_(name, text) {
    const node = this.ref_(name);
    if (!node) return false;
    node.textContent = text;
    return true;
  }

  /**
   * Escribe un atributo solo si el nodo existe.
   *
   * @param {string} name
   * @param {string} attr
   * @param {string|number|boolean} value
   * @returns {boolean} true si escribio
   */
  setRefAttr_(name, attr, value) {
    const node = this.ref_(name);
    if (!node || typeof node.setAttribute !== 'function') return false;
    node.setAttribute(attr, String(value));
    return true;
  }

  /**
   * Activa o quita una clase solo si el nodo existe.
   *
   * @param {string} name
   * @param {string} className
   * @param {boolean} on
   * @returns {boolean} true si aplico el cambio
   */
  toggleRefClass_(name, className, on) {
    const node = this.ref_(name);
    if (!node || !node.classList) return false;
    node.classList.toggle(className, Boolean(on));
    return true;
  }

  /**
   * Suscribe un listener solo si el nodo existe (y sabe escuchar).
   *
   * @param {string} name
   * @param {string} type
   * @param {(event: Event) => void} handler
   * @returns {boolean} true si engancho el listener
   */
  addRefListener_(name, type, handler) {
    const node = this.ref_(name);
    if (!node || typeof node.addEventListener !== 'function') return false;
    node.addEventListener(type, handler);
    return true;
  }

  /* -------------------------------------------------------------- hoja FEVER */

  /** @returns {boolean} true si la hoja FEVER esta abierta */
  isFeverSheetOpen() {
    const sheet = this.ref_('feverSheet');
    return Boolean(sheet && !sheet.hidden);
  }

  /**
   * Abre la hoja de giros rapidos. Solo hay un modo: el amarillo pide cuantas
   * tiradas se quieren y el azul las juega. No gasta nada al abrirse.
   *
   * @returns {boolean} true si la hoja existe y quedo abierta
   */
  openFeverSheet() {
    const sheet = this.ref_('feverSheet');
    if (!sheet) return false;

    this.renderFeverSheet_();
    sheet.hidden = false;
    this.setFeverExpanded_(true);

    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.body && doc.body.classList) doc.body.classList.add('is-fever-open');

    this.focusFeverAction_();
    return true;
  }

  /**
   * Cierra la hoja (si estaba abierta) y devuelve el foco a su pulsador.
   *
   * @returns {boolean} true si estaba abierta
   */
  closeFeverSheet() {
    const sheet = this.ref_('feverSheet');
    const wasOpen = this.isFeverSheetOpen();
    const trigger = this.ref_('featureBtn');

    if (sheet) sheet.hidden = true;
    this.setFeverExpanded_(false);

    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.body && doc.body.classList) doc.body.classList.remove('is-fever-open');

    if (wasOpen && trigger && typeof trigger.focus === 'function') trigger.focus();
    return wasOpen;
  }

  /**
   * Marca `aria-expanded` en el pulsador amarillo: es el unico que abre la hoja
   * (el azul la ejecuta y no tiene `aria-haspopup`).
   *
   * @param {boolean} open
   */
  setFeverExpanded_(open) {
    const node = this.ref_('featureBtn');
    if (node) node.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /**
   * Delegacion de las opciones de la hoja. No gira: avisa al controlador
   * (`handlers.onAutoSpins`) con el paquete elegido, que queda configurado.
   *
   * @param {Event} event
   */
  handleFeverOptionClick_(event) {
    const raw = event ? event.target : null;
    const node = raw && typeof raw.closest === 'function'
      ? raw.closest('[data-fever-spins]')
      : (raw && typeof raw.getAttribute === 'function'
        && raw.getAttribute('data-fever-spins') !== null
        ? raw
        : null);
    if (!node || node.disabled) return;

    const spins = Number(node.getAttribute('data-fever-spins'));
    if (!Number.isInteger(spins) || spins < 1) return;
    if (typeof this.handlers.onAutoSpins === 'function') this.handlers.onAutoSpins(spins);
  }

  /**
   * Repinta la hoja si esta abierta: saldo, apuesta, moneda o paquete cambiaron.
   * Se rehace la entradilla y la rejilla (los costes derivan de la apuesta viva).
   */
  syncFeverSheet_() {
    if (this.isFeverSheetOpen()) this.renderFeverSheet_();
  }

  /**
   * Cabecera, paquetes y resumen del selector (se repinta en cada apertura).
   *
   * El titulo (`Giros Rápidos`) y su estrella viven en el marcado: aqui solo se
   * escribe la entradilla con la apuesta viva y la rejilla de paquetes.
   */
  renderFeverSheet_() {
    this.paintQuickSpinsOptions_();

    this.setRefText_(
      'feverLead',
      'Elige cuántas tiradas quieres y el pulsador azul las juega seguidas. ' +
        `Cada tirada cuesta ${formatCredits(this.currentBetCredits)} ${this.currency}; ` +
        'el automático se detiene al volver a pulsarlo o si el saldo no cubre otra.'
    );

    this.renderFeverOptions_();
  }

  /**
   * Paquetes de tiradas que ofrece el boton amarillo.
   *
   * La lista es configuracion (`bets.quickSpins`): la vista no inventa presets
   * ni deja pedir al jugador un numero libre de tiradas.
   *
   * @returns {number[]} tiradas por paquete
   */
  quickSpinsList_() {
    return this.quickSpins.length > 0 ? this.quickSpins : BETS.quickSpins;
  }

  /** Coste total del paquete (en creditos) con la apuesta viva. */
  quickSpinsCost_(spins) {
    const count = Number(spins);
    const bet = Number.isFinite(this.currentBetCredits)
      ? this.currentBetCredits
      : BETS.defaultCredits;
    return Number.isFinite(count) ? bet * count : 0;
  }

  /** true si el motor esta ocupado o el saldo confirmado no cubre el paquete. */
  isQuickSpinsLocked_(spins) {
    if (this.busy) return true;
    /* Sin saldo confirmado (`null`) no se apaga ningun paquete: el cliente no
       inventa una cuenta vacia y deja que el motor conteste al lanzar la tanda.
       Con saldo confirmado, el paquete que no cabe se marca y no se puede pulsar. */
    if (this.balanceCents === null || this.balanceCents === undefined) return false;
    return Math.round(this.quickSpinsCost_(spins) * 100) > this.balanceCents;
  }

  /** Pinta un boton por paquete con su coste y apaga los que no caben. */
  renderFeverOptions_() {
    const options = this.ref_('feverOptions');
    if (!options) return;

    const pick = this.quickSpinsPick;
    const currency = escapeHtml(this.currency);

    options.innerHTML = this.quickSpinsList_()
      .map((spins) => {
        const cost = this.quickSpinsCost_(spins);
        const locked = this.isQuickSpinsLocked_(spins);
        const current = spins === pick;
        const className =
          `fever__option${locked ? ' is-locked' : ''}${current ? ' is-current' : ''}`;

        return (
          `<button class="${className}" type="button"` +
          ` data-fever-spins="${spins}"${locked ? ' disabled' : ''}` +
          ` aria-pressed="${current ? 'true' : 'false'}"` +
          ` aria-label="${formatPlain(spins)} tiradas automáticas por ` +
          `${formatCredits(cost)} ${currency}">` +
          `<span class="fever__option-bet">×${formatPlain(spins)}</span>` +
          `<span class="fever__option-tag">${formatPlain(spins)} tiradas</span>` +
          `<span class="fever__option-cost">${formatCredits(cost)}</span>` +
          '</button>'
        );
      })
      .join('');

    /* Sin saldo confirmado se dice tal cual: pintar `0,00` seria inventar una
       cuenta vacia mientras el motor no ha contestado. */
    const saldo = this.balanceCents === null || this.balanceCents === undefined
      ? 'sin confirmar'
      : `${formatCents(this.balanceCents)} ${this.currency}`;

    this.setRefText_(
      'feverSummary',
      `Apuesta ${formatCredits(this.quickSpinsCost_(1))} ${this.currency} · saldo ${saldo}`
    );
  }

  /**
   * Paquetes del boton amarillo (`AUTOGIRO x5 x10 x25`) y pildora del azul
   * (`x5`, `x10`, `x25`).
   *
   * El amarillo configura y el azul ejecuta, pero el numero es uno solo: aqui se
   * resalta el paquete vigente en los tres chips, se escribe la cifra en la
   * pildora del azul y se refresca el nombre accesible de los dos, para que la
   * hoja, los chips y la pildora nunca se contradigan.
   */
  paintQuickSpinsOptions_() {
    const pick = this.quickSpinsPick;
    const box = this.ref_('featureOptions');

    /* El marcado ya trae los tres paquetes: aqui solo se marca el vigente, sin
       reescribir texto ni crear nodos. */
    if (box) {
      for (const chip of box.children) {
        chip.classList.toggle('is-active', Number(chip.dataset.spins) === pick);
      }
    }

    /* El azul si repite el numero en su pildora, pero con el bucle en marcha
       manda el progreso que pinta `setAuto`: no se pisa. */
    const autoBtn = this.ref_('autoBtn');
    if (autoBtn && autoBtn.getAttribute('aria-pressed') !== 'true') {
      this.paintAutoCount_();
      this.paintAutoLabel_(false);
    }

    const featureBtn = this.ref_('featureBtn');
    if (!featureBtn) return;

    /* El rotulo visible del amarillo es decorativo (los chips del marcado, que en
       movil rotan en la placa del pie); lo que se mueve con el paquete es el chip
       resaltado, el nombre accesible y el tooltip. */
    featureBtn.setAttribute(
      'aria-label',
      `${FEATURE_BUTTON_LABEL} · paquetes de ${this.quickSpinsPhrase_()} tiradas ` +
        'automáticas. Pulsa para elegir paquete.'
    );
    featureBtn.title =
      `${FEATURE_BUTTON_LABEL} · paquete de ${formatPlain(pick)} tiradas automáticas`;
  }

  /**
   * Catalogo de paquetes en prosa, como se lee: `5, 10 o 25`.
   *
   * @returns {string} los valores publicados, unidos con comas y `o`
   */
  quickSpinsPhrase_() {
    const values = this.quickSpinsList_().map((spins) => formatPlain(spins));
    if (values.length <= 1) return values[0] || '';
    return `${values.slice(0, -1).join(', ')} o ${values[values.length - 1]}`;
  }

  /** Opciones enfocables de la hoja, en orden de lectura. */
  feverFocusables_() {
    const options = this.ref_('feverOptions');
    const nodes = options && options.children ? Array.from(options.children) : [];
    const close = this.ref_('feverClose');
    if (close) nodes.push(close);
    return nodes.filter((node) => node && !node.disabled);
  }

  /** Lleva el foco a la primera opcion de la hoja. */
  focusFeverAction_() {
    const first = this.feverFocusables_()[0];
    if (first && typeof first.focus === 'function') first.focus();
  }

  /**
   * Teclado de la hoja: Escape la cierra y Tab no sale de ella.
   *
   * @param {KeyboardEvent} event
   * @returns {boolean} true si el evento lo consumio la hoja
   */
  handleFeverKey_(event) {
    if (!event || !this.isFeverSheetOpen()) return false;

    if (event.key === 'Escape') {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      this.closeFeverSheet();
      return true;
    }
    if (event.key !== 'Tab') return false;

    const focusables = this.feverFocusables_();
    if (focusables.length === 0) return false;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const inside = focusables.includes(active);
    const wrapBack = event.shiftKey && (!inside || active === first);
    const wrapForward = !event.shiftKey && (!inside || active === last);

    if (wrapBack || wrapForward) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      const target = wrapBack ? last : first;
      if (target && typeof target.focus === 'function') target.focus();
    }
    return true;
  }

  /* ---------------------------------------------------------------- tablero */

  buildGrid() {
    const grid = this.ref_('grid');
    if (!grid) return;
    grid.textContent = '';
    this.tiles = [];

    this.reels = createReels({
      grid,
      cfg: { rows: ROWS, columns: COLS },
      symbols: SYMBOL_KEYS,
      createCell: (row, col) => this.createTile_(row, col),
      paint: (cell, symbol, bombValue) => this.paintCell_(cell, symbol, bombValue),
      /* Al aterrizar cada carril sus casillas visibles cambian de nodo: la
         lista `tiles` se reengancha para que premios, bombas y cascadas sigan
         apuntando a lo que el jugador ve. */
      onLand: (col, cells) => {
        this.syncColumn_(col, cells);
        if (typeof this.handlers.onReelLand === 'function') this.handlers.onReelLand(col);
      },
      onAllLanded: () => this.dropImpact()
    });

    this.reels.mount();

    for (const { row, col, el } of this.reels.visibleCells()) {
      this.tiles[row * COLS + col] = el;
    }
  }

  /** Casilla: imagen del simbolo con glifo accesible de reserva. */
  createTile_(row, col) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.sym = 'S1';
    tile.dataset.row = String(row);
    tile.dataset.col = String(col);

    const image = document.createElement('img');
    image.className = 'tile__img';
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('error', () => {
      image.hidden = true;
      const fallback = tile.querySelector('.tile__glyph');
      if (fallback) fallback.hidden = false;
    });

    const glyph = document.createElement('span');
    glyph.className = 'tile__glyph';
    glyph.setAttribute('aria-hidden', 'true');

    tile.append(image, glyph);
    return tile;
  }

  /** Fija la columna del carril tras su aterrizaje. */
  syncColumn_(col, cells) {
    for (let row = 0; row < ROWS; row += 1) {
      const tile = cells[row];
      if (!tile) continue;
      /* El nodo puede venir de la cascada anterior: se limpia antes de que
         `highlightCells` lo marque como premio. */
      tile.classList.remove('tile--drop', 'tile--win', 'tile--scatter', 'tile--pop');
      this.tiles[row * COLS + col] = tile;
    }
  }

  paintCell_(tile, symbol, bombValue = 0) {
    if (!tile) return;
    const meta = symbol ? symbolMeta(symbol) : null;
    const image = tile.querySelector('.tile__img');
    const glyph = tile.querySelector('.tile__glyph');

    tile.dataset.sym = symbol || '';
    tile.classList.toggle('tile--empty', !symbol);
    tile.setAttribute('aria-label', meta ? meta.name : 'Casilla vacía');

    if (glyph) {
      glyph.textContent = meta ? meta.glyph : '';
      glyph.hidden = Boolean(meta && meta.image);
    }

    if (image) {
      if (meta && meta.image) {
        if (image.getAttribute('src') !== meta.image) image.src = meta.image;
        image.hidden = false;
      } else {
        image.removeAttribute('src');
        image.hidden = true;
      }
    }

    let badge = tile.querySelector('.tile__bomb-value');
    if (bombValue > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tile__bomb-value';
        tile.appendChild(badge);
      }
      badge.textContent = `${formatPlain(bombValue)}×`;
    } else if (badge) {
      badge.remove();
    }
  }

  setTile(index, symbol, bombValue = 0) {
    this.paintCell_(this.tiles[index], symbol, bombValue);
  }

  /** Matriz del servidor -> columnas del rodillo con su bomba. */
  columns_(matrix, bombs = []) {
    const bombMap = new Map();
    for (const bomb of bombs || []) bombMap.set(bomb.r * COLS + bomb.c, bomb.value);

    return columnsFromMatrix(matrix, { rows: ROWS, columns: COLS }).map((column, col) =>
      column.map((symbol, row) => ({ sym: symbol, bomb: bombMap.get(row * COLS + col) || 0 })));
  }

  /**
   * Pinta una matriz del servidor (`grid[row][col]`).
   *
   * Con los rodillos girando no se pinta a mano: se ordena la parada de cada
   * carril, que inyecta el resultado mientras frena y lo fija al aterrizar.
   *
   * @param {Array<Array<string>>} matrix
   * @param {Array<{r:number,c:number,value:number}>} [bombs]
   * @param {{drop?: boolean}} [options]
   * @returns {number} ms que dura la entrada del tablero (0 sin animacion)
   */
  renderGrid(matrix, bombs = [], { drop = true } = {}) {
    if (drop && this.reels && this.reels.isSpinning()) {
      return this.reels.stop(this.columns_(matrix, bombs));
    }

    const bombMap = new Map();
    for (const bomb of bombs || []) bombMap.set(bomb.r * COLS + bomb.c, bomb.value);

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const index = row * COLS + col;
        const symbol = matrix && matrix[row] ? matrix[row][col] : null;
        this.paintCell_(this.tiles[index], symbol, bombMap.get(index) || 0);
      }
    }

    return drop ? this.playDrop() : 0;
  }

  renderPlaceholderGrid() {
    const pool = SYMBOL_KEYS.concat(['SC', 'MX', 'S1', 'S4', 'S6', 'S8']);
    const matrix = Array.from({ length: 5 }, (_, row) =>
      Array.from({ length: 6 }, (_, col) => pool[(row * 6 + col) % pool.length]));
    this.renderGrid(matrix, [], { drop: false });
  }

  /**
   * Caida en cascada: las seis columnas aterrizan escalonadas de izquierda a
   * derecha (`DROP_STAGGER` ms) con un micro escalon por fila dentro de cada
   * columna.
   *
   * El retardo viaja en la custom property `--drop-delay`: asi no queda un
   * `animation-delay` inline que retrasaria despues `tile--win` o `tile--pop`.
   *
   * @returns {number} ms que tarda en caer la ultima columna
   */
  playDrop() {
    let lastDelay = 0;

    this.tiles.forEach((tile, index) => {
      tile.classList.remove('tile--drop', 'tile--win', 'tile--pop');
      if (REDUCED_MOTION) return;

      const row = Math.floor(index / COLS);
      const col = index % COLS;
      const delay = col * DROP_STAGGER + row * DROP_ROW_STAGGER;
      if (delay > lastDelay) lastDelay = delay;

      void tile.offsetWidth; // reinicia la animacion
      tile.style.setProperty('--drop-delay', `${delay}ms`);
      tile.classList.add('tile--drop');
    });

    if (REDUCED_MOTION) return 0;

    this.scheduleLanding_(lastDelay + DROP_MS * DROP_LAND_RATIO);
    return lastDelay + DROP_MS;
  }

  /**
   * Micro-impacto del marco justo cuando la ultima columna toca su celda: hace
   * de contrapeso sonoro/visual y da peso al aterrizaje.
   */
  scheduleLanding_(atMs) {
    clearTimeout(this.landTimer);
    this.landTimer = setTimeout(() => this.dropImpact(), Math.max(0, atMs));
  }

  dropImpact() {
    const board = this.ref_('board');
    if (!board || REDUCED_MOTION) return;

    board.classList.remove('is-landing');
    void board.offsetWidth;
    board.classList.add('is-landing');

    clearTimeout(this.landOffTimer);
    this.landOffTimer = setTimeout(() => board.classList.remove('is-landing'), 430);
  }

  startSpinning() {
    /* Un giro nuevo no hereda el velo del premio anterior: si el jugador
       relanza antes del cierre automatico, la capa desaparece de inmediato. */
    this.hideWinOverlay({ immediate: true });
    if (this.fx) this.fx.clear();
    this.clearHighlights();
    this.preloadSymbols_();

    if (!this.reels || !this.reels.start()) {
      /* Movimiento reducido (o tablero sin montar): sin giro, pero con
         feedback inmediato para que la tirada no parezca congelada. */
      this.tiles.forEach((tile, index) => {
        this.paintCell_(tile, SYMBOL_KEYS[(index + 3) % SYMBOL_KEYS.length], 0);
      });
    }
  }

  /**
   * Giro completo de los rodillos con el resultado ya resuelto por el servidor.
   *
   * Es la API comoda para probar el efecto o para integrarlo desde otra capa:
   * arranca (anticipacion + motion blur), para de izquierda a derecha con
   * rebote y resuelve cuando el ultimo carril ha aterrizado.
   *
   * @param {Array<Array<string>>} targetSymbols matriz `matrix[row][col]`
   * @param {{bombs?: Array<{r:number,c:number,value:number}>}} [options]
   * @returns {Promise<number>} ms de la secuencia
   */
  async spin(targetSymbols, { bombs = [] } = {}) {
    if (!this.reels) return 0;
    this.clearHighlights();
    const ms = await this.reels.spin(this.columns_(targetSymbols, bombs));
    return ms;
  }

  /** Precarga las imagenes de los simbolos: el reciclado no debe parpadear. */
  preloadSymbols_() {
    if (this.preloaded || typeof Image !== 'function') return;
    this.preloaded = [];
    for (const key of SYMBOL_KEYS) {
      const meta = symbolMeta(key);
      if (!meta || !meta.image) continue;
      const image = new Image();
      image.decoding = 'async';
      image.src = meta.image;
      this.preloaded.push(image);
    }
  }

  clearHighlights() {
    this.tiles.forEach((tile) => {
      tile.classList.remove('tile--win', 'tile--scatter', 'tile--pop');
    });
  }

  /** Chispas sobre una muestra de las celdas premiadas. */
  burst_(indexes, power = 1, maxCells = 18) {
    if (!this.fx || !indexes || indexes.length === 0) return;
    const step = Math.max(1, Math.ceil(indexes.length / maxCells));
    const sample = [];
    for (let i = 0; i < indexes.length; i += step) {
      const tile = this.tiles[indexes[i]];
      if (tile) sample.push(tile);
    }
    this.fx.sparkBurst(sample, { power });
  }

  /** Marca celdas [[r,c], ...] y devuelve los indices afectados. */
  highlightCells(cells, className = 'tile--win') {
    const indexes = [];
    for (const cell of cells || []) {
      const [r, c] = Array.isArray(cell) ? cell : [cell.r, cell.c];
      const index = r * 6 + c;
      const tile = this.tiles[index];
      if (!tile) continue;
      tile.classList.add(className);
      indexes.push(index);
    }
    /* Chispas doradas al encenderse el premio (solo en celdas ganadoras). */
    if (className === 'tile--win') this.burst_(indexes, 1, 18);
    return indexes;
  }

  async popCells(cells) {
    const indexes = [];
    for (const cell of cells || []) {
      const [r, c] = Array.isArray(cell) ? cell : [cell.r, cell.c];
      const tile = this.tiles[r * 6 + c];
      if (!tile) continue;
      tile.classList.remove('tile--win', 'tile--scatter');
      tile.classList.add('tile--pop');
      indexes.push(r * 6 + c);
    }

    /* Segunda tanda, mas abierta: acompana la explosion de las celdas. */
    this.burst_(indexes, 2, 12);

    await sleep(TIMING.pop);
    for (const index of indexes) {
      const tile = this.tiles[index];
      if (tile) tile.classList.remove('tile--pop');
    }
  }

  shakeGrid() {
    const grid = this.ref_('grid');
    if (!grid) return;
    grid.classList.remove('is-shaking');
    void grid.offsetWidth;
    grid.classList.add('is-shaking');
    setTimeout(() => grid.classList.remove('is-shaking'), 360);
  }

  /**
   * Temblor del marco completo (MEGA WIN). Se aplica a `.machine__table`, que
   * pinta el dibujo del marco y contiene el tablero, para que tiemble la
   * ventana de juego y no el HUD ni la consola.
   */
  shakeFrame() {
    const frame = this.ref_('frame');
    if (!frame || REDUCED_MOTION) return;

    frame.classList.remove('is-quaking');
    void frame.offsetWidth;
    frame.classList.add('is-quaking');

    clearTimeout(this.frameShakeTimer);
    this.frameShakeTimer = setTimeout(() => frame.classList.remove('is-quaking'), 660);
  }

  /**
   * Escala de celebracion segun el nivel de premio que ya calculo el servidor y
   * el ratio `win / bet`:
   *
   *   < 1x  -> pantalla de victoria sutil: sin giro de rayos, lluvia corta (o
   *           ninguna por debajo de 0,2x), entrada breve y 1,7 s de velo.
   *   1-10x -> pantalla estandar: 22 pelotas, rayos girando y 3 s.
   *   big   -> perfil alto: 42 pelotas, rebote marcado y 3,8 s.
   *   mega  -> lo mismo con destello casi pleno y 4,2 s.
   *   epic  -> perfil alto completo, 4,6 s y temblor del marco.
   *
   * La pantalla de victoria sustituye al cartel 3D y al banner del tablero, que
   * quedarian detras con el mismo importe. Con movimiento reducido se abre una
   * version estatica (sin lluvia ni conteo): el CSS apaga rayos y animaciones,
   * asi que sigue siendo el mensaje visual del premio.
   *
   * @param {string} level clave de `winLevel`
   * @param {string} amountText importe ya formateado
   * @param {{cents?: number|null, betCents?: number|null}} [options]
   *   importe autoritativo para el conteo y apuesta de la ronda, que elige el
   *   perfil de intensidad (`resolveWinProfile_`)
   */
  celebrate(level, amountText, { cents = null, betCents = null } = {}) {
    const key = LEVEL_LABEL[level] ? level : 'win';
    this.bumpHud_(key);
    if (!this.fx) return; // sin capa de efectos no hay celebracion
    if (!this.isWinWorthOverlay_(key, cents)) return;

    const profile = this.resolveWinProfile_(key, cents, betCents);
    this.fx.flash({ power: profile.power });

    if (this.showWinOverlay(key, amountText, { cents, profile })) {
      this.toggleRefClass_('banner', 'is-visible', false);
    } else if (key === 'mega' || key === 'epic') {
      /* Respaldo sin capa montada: se mantiene el cartel 3D historico. */
      this.fx.ballRain({ count: profile.balls });
      const card = this.fx.mega(key === 'epic' ? '¡ÉPICA GANANCIA!' : '¡MEGA GANANCIA!', amountText);
      if (card) this.toggleRefClass_('banner', 'is-visible', false);
    }

    if (key === 'mega' || key === 'epic') this.shakeFrame();
  }

  /**
   * ¿Hay una victoria que merezca la pantalla completa?
   *
   * Cualquier importe > 0 cuenta, tambien los premios que no devuelven la
   * apuesta: entran con el perfil `low`, que es sutil y rapido. Solo se
   * descarta una ronda sin premio o un payload sin importe, para no anunciar
   * un 0,00. Los niveles altos abren siempre, aunque falte el importe.
   *
   * @param {string} key nivel normalizado
   * @param {number|null} cents importe ganado
   * @returns {boolean}
   */
  isWinWorthOverlay_(key, cents) {
    if (key !== 'win') return true;
    const won = Number(cents);
    return Number.isFinite(won) && won > 0;
  }

  /**
   * Elige el perfil de intensidad a partir del ratio `win / bet`:
   *
   *   < 1x   -> `low` : lluvia corta (ninguna por debajo de 0,2x), rayos
   *                    quietos y autocierre en 1,7 s.
   *   1-10x  -> `mid` : 22 pelotas, rayos girando, entrada estandar y 3 s.
   *   >= 10x -> `high`: 42 pelotas, rebote marcado y 3,8-4,6 s segun el nivel.
   *
   * Sin `betCents` no se puede medir el ratio; el importe sigue siendo
   * autoritativo, asi que se usa `low` en lugar de prometer una intensidad que
   * no consta. Los niveles big/mega/epic siempre reciben `high`.
   *
   * @param {string} key nivel normalizado
   * @param {number|null} cents importe ganado
   * @param {number|null} betCents apuesta de la ronda
   * @returns {{name: string, balls: number, durationMs: number, rollMs: number, power: number, rays: string}}
   */
  resolveWinProfile_(key, cents, betCents) {
    if (key !== 'win') {
      const durationMs = WIN_HIGH_MS[key] || WIN_PROFILES.high.durationMs;
      const power = key === 'epic' ? 1 : key === 'mega' ? 0.95 : WIN_PROFILES.high.power;
      return { ...WIN_PROFILES.high, durationMs, power };
    }

    const won = Number(cents);
    const bet = Number(betCents);
    const hasWon = Number.isFinite(won) && won > 0;
    const hasBet = Number.isFinite(bet) && bet > 0;
    const ratio = hasWon && hasBet ? won / bet : 0;

    if (ratio >= 10) return { ...WIN_PROFILES.high, durationMs: WIN_HIGH_MS.big };
    if (ratio >= 1) return { ...WIN_PROFILES.mid };

    /* Sin importe no hay nada que llueva; con importe pero por debajo de 0,2x
       se mantiene la lluvia corta del perfil bajo. */
    const sparse = !hasWon || (hasBet && ratio < WIN_LOW_MIN_RATIO_BALLS);
    return {
      ...WIN_PROFILES.low,
      balls: sparse ? 0 : WIN_PROFILES.low.balls
    };
  }

  /**
   * Abre la pantalla de victoria con el importe del payload.
   *
   * Se abre tambien con `prefers-reduced-motion`: en ese caso no hay lluvia de
   * pelotas y la cifra aparece ya resuelta, porque el CSS apaga rayos, entrada
   * y latido. Devuelve `false` solo si la capa no esta montada, para que
   * `celebrate` pueda usar el respaldo del cartel 3D.
   *
   * El perfil se recibe ya resuelto (`resolveWinProfile_`) y decide la clase
   * `is-low`/`is-mid`/`is-high`, las pelotas, el conteo y el autocierre.
   *
   * @param {string} level clave de `winLevel`
   * @param {string} amountText importe ya formateado (respaldo sin centimos)
   * @param {{cents?: number|null, profile?: object|null}} [options]
   *   importe autoritativo para el conteo y perfil resuelto; si falta el
   *   perfil se calcula con el importe y sin apuesta
   * @returns {boolean} true si la capa se ha abierto
   */
  showWinOverlay(level, amountText, { cents = null, profile = null } = {}) {
    const node = this.ref_('winOverlay');
    if (!node) return false;

    const key = LEVEL_LABEL[level] ? level : 'win';
    const tier = profile || this.resolveWinProfile_(key, cents, null);

    clearTimeout(this.winTimer);
    clearTimeout(this.winCloseTimer);
    this.winTimer = 0;
    this.winCloseTimer = 0;
    this.cancelWinAmountRoll_();

    this.setRefText_('winCurrency', this.currency || '');
    this.setRefText_('winAmount', formatCents(0));

    node.classList.remove('is-closing', 'is-low', 'is-mid', 'is-high');
    node.classList.add(`is-${tier.name}`);
    node.hidden = false;
    void node.offsetWidth; // reinicia la entrada elastica en cada victoria

    this.rollWinAmount_(cents, amountText, tier.rollMs);
    if (this.fx && !REDUCED_MOTION && tier.balls > 0) {
      this.fx.ballRain({
        count: tier.balls,
        host: this.ref_('winRain'),
        zone: 'sides'
      });
    }

    this.winTimer = setTimeout(() => this.hideWinOverlay(), tier.durationMs);
    return true;
  }

  /**
   * Cierra la capa de victoria. Con `immediate` (o con movimiento reducido) no
   * se espera a la animacion de salida: lo usa `startSpinning` para que un giro
   * nuevo no herede el velo del premio anterior.
   *
   * @param {{immediate?: boolean}} [options]
   */
  hideWinOverlay({ immediate = false } = {}) {
    const node = this.ref_('winOverlay');
    if (!node || node.hidden) return;

    clearTimeout(this.winTimer);
    clearTimeout(this.winCloseTimer);
    this.winTimer = 0;
    this.cancelWinAmountRoll_();

    const finish = () => {
      node.hidden = true;
      node.classList.remove('is-closing', 'is-low', 'is-mid', 'is-high');
      this.setRefText_('winRain', '');
      this.winCloseTimer = 0;
    };

    if (immediate || REDUCED_MOTION) {
      finish();
      return;
    }

    node.classList.add('is-closing');
    this.winCloseTimer = setTimeout(finish, WIN_CLOSE_MS);
  }

  /**
   * Conteo ascendente del importe: puramente visual, la cifra final es la del
   * payload. `tabular-nums` mantiene el ancho del numero y el latido ya promueve
   * la capa, asi que escribir texto no provoca layout ni repinta el velo.
   *
   * `rollMs` lo fija el perfil (450 ms en premios bajos, 900 ms en el resto),
   * de modo que un 0,30 no se queda contando mas tiempo del que dura el velo.
   */
  rollWinAmount_(cents, fallbackText, rollMs = 900) {
    const node = this.ref_('winAmount');
    if (!node) return;

    const target = Number(cents);
    if (
      !Number.isFinite(target)
      || target <= 0
      || REDUCED_MOTION
      || documentHidden()
      || typeof requestAnimationFrame !== 'function'
    ) {
      node.textContent = fallbackText;
      return;
    }

    const duration = Number.isFinite(rollMs) && rollMs > 0 ? rollMs : 900;
    const started = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = formatCents(Math.round(target * eased));

      if (progress < 1) {
        this.winRollRaf = requestAnimationFrame(step);
        return;
      }

      this.winRollRaf = 0;
      node.textContent = fallbackText; // cifra exacta del payload
    };

    this.winRollRaf = requestAnimationFrame(step);
  }

  cancelWinAmountRoll_() {
    if (this.winRollRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.winRollRaf);
    }
    this.winRollRaf = 0;
  }

  /**
   * Precarga la animacion del overlay en tiempo ocioso.
   *
   * Los `<img>` van con `loading="lazy"` dentro de una capa oculta: el navegador
   * no los descarga hasta la primera victoria y 282 KB en ese momento se
   * notarian como un hueco en mitad de la entrada elastica. Se pide una vez, sin
   * bloquear el arranque y sin prioridad alta. Con movimiento reducido se
   * precarga el fotograma fijo, que es el que pinta el CSS.
   */
  preloadWinArt_() {
    if (this.winArtPreload || typeof Image !== 'function') return;

    const start = () => {
      if (this.winArtPreload) return;
      const image = new Image();
      image.decoding = 'async';
      image.src = REDUCED_MOTION ? WIN_ART_STILL_SRC : WIN_ART_SRC;
      this.winArtPreload = image;
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(start, { timeout: 4000 });
      return;
    }
    setTimeout(start, 2200);
  }

  /** Enfasis de la placa de ganancia y del multiplicador (solo transform). */
  bumpHud_(key) {
    if (REDUCED_MOTION || key === 'win') return;

    const winNode = this.ref_('winValue');
    const mxNode = this.ref_('mxValue');
    const winCell = winNode && typeof winNode.closest === 'function'
      ? winNode.closest('.hud__cell')
      : null;
    const mxCell = mxNode && typeof mxNode.closest === 'function'
      ? mxNode.closest('.hud__cell')
      : null;
    const huge = key === 'mega' || key === 'epic';

    if (winCell) {
      winCell.classList.remove('is-win-big', 'is-win-huge');
      void winCell.offsetWidth;
      winCell.classList.add(huge ? 'is-win-huge' : 'is-win-big');
    }
    if (mxCell) {
      mxCell.classList.remove('is-hot', 'is-hot-max');
      void mxCell.offsetWidth;
      mxCell.classList.add(huge ? 'is-hot-max' : 'is-hot');
    }

    clearTimeout(this.hudTimer);
    this.hudTimer = setTimeout(() => {
      if (winCell) winCell.classList.remove('is-win-big', 'is-win-huge');
      if (mxCell) mxCell.classList.remove('is-hot', 'is-hot-max');
    }, huge ? 1000 : 700);
  }

  /* -------------------------------------------------------------------- HUD */

  setBalance(credits, { deltaCents = 0 } = {}) {
    const node = this.ref_('balanceValue');
    if (!node) return false;

    node.textContent = formatCredits(credits);
    node.classList.remove('is-up', 'is-down');
    if (deltaCents > 0) node.classList.add('is-up');
    if (deltaCents < 0) node.classList.add('is-down');
    setTimeout(() => node.classList.remove('is-up', 'is-down'), 520);
    return true;
  }

  setCurrency(currency) {
    this.currency = currency || 'EUR';
    this.setRefText_('balanceCurrency', this.currency);
    this.setRefText_('winCurrency', this.currency);
    /* La hoja de giros rapidos escribe el coste de cada paquete con la moneda de
       la sesion: se repinta si esta abierta. */
    this.syncFeverSheet_();
  }

  /**
   * Refleja en la interfaz si el jugador esta en modo "Fichas de Prueba".
   * El saldo mostrado sigue viniendo del servidor (cartera virtual), nunca de
   * un calculo local.
   *
   * @param {boolean} active
   * @param {{ label?: string|null }} [options] texto del subtitulo del boton
   */
  setDemoMode(active, { label = null } = {}) {
    this.isDemo = Boolean(active);
    if (typeof document !== 'undefined' && document.body && document.body.classList) {
      document.body.classList.toggle('is-demo', this.isDemo);
    }

    const button = this.ref_('demoBtn');
    if (!button) return;
    button.setAttribute('aria-pressed', this.isDemo ? 'true' : 'false');
    if (button.classList) button.classList.toggle('is-active', this.isDemo);
    button.title = this.isDemo
      ? `Modo Fichas de Prueba activo · pulsa para empezar de nuevo con ${formatCredits(this.demoStartCredits)} ${this.demoCurrency} virtuales`
      : `Jugar gratis con ${formatCredits(this.demoStartCredits)} ${this.demoCurrency} virtuales`;

    this.setRefText_(
      'demoSub',
      this.isDemo
        ? (label || 'Modo activo')
        : `${formatCredits(this.demoStartCredits)} ${this.demoCurrency}`
    );
  }

  /* ------------------------------------------------- pulsadores de la consola */

  /**
   * Etiqueta corta de un paquete de tiradas: `x5`, `x10`, `x25`.
   *
   * Es la misma notacion en los chips del boton amarillo y en la pildora del
   * azul: el jugador reconoce el paquete en los dos sitios.
   *
   * @param {number} spins
   * @returns {string}
   */
  quickSpinsLabel_(spins) {
    return `x${formatPlain(spins)}`;
  }

  /**
   * Numero de la pildora del pulsador azul.
   *
   * En reposo es el paquete configurado en el boton amarillo; en marcha, las
   * tiradas que quedan de ese paquete. Al parar vuelve al paquete, no al valor
   * por defecto: la configuracion no se pierde al terminar una tanda.
   *
   * @param {boolean} active el bucle esta en marcha
   * @param {number} [remaining] tiradas que faltan
   */
  paintAutoCount_(active, remaining = 0) {
    const node = this.ref_('autoCount');
    if (!node) return;
    node.textContent = this.quickSpinsLabel_(active ? remaining : this.quickSpinsPick);
  }

  /**
   * Escribe el nombre accesible del pulsador azul.
   *
   * En reposo anuncia el paquete que jugaria (el configurado en el boton
   * amarillo); en marcha, cuantas tiradas quedan de ese paquete. El numero vive
   * en un solo sitio —la seleccion del boton amarillo— y aqui solo se refleja.
   *
   * @param {boolean} active el bucle esta en marcha
   * @param {number} [remaining] tiradas que faltan
   */
  paintAutoLabel_(active, remaining = 0) {
    const btn = this.ref_('autoBtn');
    if (!btn) return;

    const pack = formatPlain(this.quickSpinsPick);
    btn.setAttribute(
      'aria-label',
      active
        ? `Detener autogiro · quedan ${formatPlain(remaining)} de ${pack} tiradas`
        : `${AUTO_BUTTON_LABEL} · ${pack} tiradas automáticas. Pulsa para jugarlas seguidas.`
    );
    btn.title = active
      ? `Detener autogiro · quedan ${formatPlain(remaining)} de ${pack} tiradas`
      : `${AUTO_BUTTON_LABEL} · ${pack} tiradas automáticas`;
  }

  /**
   * El amarillo configura paquetes, no gasta saldo: solo se apaga mientras el
   * motor resuelve una ronda o el autogiro esta en marcha (no se reconfigura a
   * mitad de una tanda).
   */
  refreshFeatureAvailability_() {
    const button = this.ref_('featureBtn');
    if (!button) return;
    button.disabled = Boolean(this.busy || this.autoActive);
  }

  setBet(credits) {
    const value = Number(credits);
    this.currentBetCredits = Number.isFinite(value) ? value : BETS.defaultCredits;
    this.setRefText_('betValue', formatCredits(this.currentBetCredits));
    this.setRefText_('betReadout', formatCredits(this.currentBetCredits));
    /* Los chips y la pildora no llevan importe, pero la hoja si: sus tarjetas
       recalculan el coste total con la apuesta nueva. */
    this.paintQuickSpinsOptions_();
    this.syncFeverSheet_();
  }

  /**
   * Pinta la ganancia acumulada.
   *
   * Con `roll` el numero asciende desde el valor mostrado hasta el objetivo con
   * `requestAnimationFrame` (solo escribe texto, no mueve layout). El importe
   * final es siempre el del servidor: el conteo es puramente visual.
   *
   * @param {number} cents importe autoritativo del payload
   * @param {{roll?: boolean, level?: string}} [options]
   */
  setWin(cents, { roll = false, level = 'win' } = {}) {
    const target = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
    const node = this.ref_('winValue');

    this.cancelWinRoll_();

    if (!node) {
      /* Sin placa de ganancia el estado sigue siendo el del payload: el conteo
         solo es presentacion. */
      this.winShownCents = target;
      return;
    }

    if (
      !roll
      || REDUCED_MOTION
      || documentHidden()
      || typeof requestAnimationFrame !== 'function'
      || target <= this.winShownCents
    ) {
      this.winShownCents = target;
      node.textContent = formatCents(target);
      return;
    }

    const from = this.winShownCents;
    const duration = level === 'win' ? 420 : 520;
    const started = performance.now();

    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const value = Math.round(from + (target - from) * eased);

      this.winShownCents = value;
      node.textContent = formatCents(value);

      if (progress < 1) {
        this.winRaf = requestAnimationFrame(step);
        return;
      }

      this.winRaf = 0;
      this.winShownCents = target;
      node.textContent = formatCents(target);
    };

    this.winRaf = requestAnimationFrame(step);
  }

  cancelWinRoll_() {
    if (this.winRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.winRaf);
    this.winRaf = 0;
  }

  setMultiplier(value) {
    const node = this.ref_('mxValue');
    if (!node) return;

    const active = Boolean(value && value > 1);
    node.textContent = active ? formatMultiplier(value) : '—';

    const cell = typeof node.closest === 'function' ? node.closest('.hud__cell') : null;
    if (!cell || !active || REDUCED_MOTION) return;

    /* Pulso corto en cada subida del multiplicador (bonus de 10 giros). */
    cell.classList.remove('is-tick');
    void cell.offsetWidth;
    cell.classList.add('is-tick');

    clearTimeout(this.mxTimer);
    this.mxTimer = setTimeout(() => cell.classList.remove('is-tick'), 640);
  }

  setStatus(text) {
    this.setRefText_('status', text);
  }

  setEngineText(text) {
    this.setRefText_('engine', text);
  }

  setBusy(busy) {
    this.busy = Boolean(busy);
    const busyNode = this.ref_('spinBtn');
    if (busyNode) {
      busyNode.classList.toggle('is-busy', this.busy);
      busyNode.disabled = this.busy;
      busyNode.setAttribute('aria-busy', this.busy ? 'true' : 'false');
    }
    this.setRefText_('spinLabel', this.busy ? 'GIRANDO…' : 'GIRAR');
    for (const name of ['betUp', 'betDown', 'betMax']) {
      const node = this.ref_(name);
      if (node) node.disabled = this.busy;
    }
    /* El amarillo solo se apaga si el motor esta ocupado o el bucle corre. */
    this.refreshFeatureAvailability_();
    /* Mientras gira, las opciones de la hoja quedan bloqueadas. */
    this.syncFeverSheet_();
  }

  /** Habilita/deshabilita acciones segun el saldo autoritativo. */
  updateAffordability(balanceCents, betCents) {
    this.balanceCents = Number(balanceCents) || 0;
    this.syncFeverSheet_();
    if (this.busy) return;

    const balance = Number(balanceCents) || 0;
    const bet = Number(betCents) || 0;
    const spinBtn = this.ref_('spinBtn');
    if (spinBtn) spinBtn.disabled = balance < bet;
    /* El amarillo no gasta: su disponibilidad depende del motor, no del saldo. */
    this.refreshFeatureAvailability_();
  }

  /**
   * Pinta el pulsador AUTO. En marcha muestra las tiradas que quedan; en reposo,
   * el paquete configurado (el que se jugara al pulsar).
   *
   * @param {boolean} active
   * @param {number} [remaining]
   */
  setAuto(active, remaining = 0) {
    const running = Boolean(active);
    this.autoActive = running;
    /* `paintAutoCount_` lee el estado del pulsador y las tiradas que quedan: se
       guardan aqui para que un cambio de apuesta o de moneda no las pierda. */
    this.autoRemaining = running ? Math.max(0, Number(remaining) || 0) : 0;
    const button = this.ref_('autoBtn');
    if (button) button.setAttribute('aria-pressed', running ? 'true' : 'false');
    this.paintAutoCount_(running, this.autoRemaining);
    this.paintAutoLabel_(running, this.autoRemaining);
    /* Mientras el bucle corre, el amarillo no configura paquetes; al parar
       vuelve a estar disponible si el motor no esta ocupado. */
    this.refreshFeatureAvailability_();
    this.syncFeverSheet_();
  }

  /**
   * Fija el paquete de tiradas automaticas elegido en la hoja. No gira ni
   * gasta: mueve el chip resaltado del amarillo y la pildora del azul.
   *
   * @param {number} spins debe pertenecer a `bets.quickSpins`
   * @returns {boolean} true si el paquete es valido
   */
  setQuickSpins(spins) {
    const value = Number(spins);
    if (!Number.isInteger(value) || !this.quickSpins.includes(value)) return false;

    this.quickSpinsPick = value;
    /* El chip resaltado, la pildora y el nombre accesible siguen al paquete
       elegido; con el bucle en marcha siguen mostrando las que quedan. */
    this.paintQuickSpinsOptions_();
    this.syncFeverSheet_();
    return true;
  }

  setSpinTag(text) {
    const node = this.ref_('spinTag');
    if (!node) return;

    if (!text) {
      node.classList.remove('is-visible');
      node.textContent = '';
      return;
    }
    node.textContent = text;
    node.classList.add('is-visible');
  }

  showBanner(level, amountText) {
    const banner = this.ref_('banner');
    if (!banner) return;

    const key = LEVEL_LABEL[level] ? level : 'win';
    banner.classList.remove('banner--big', 'banner--mega', 'banner--epic');
    if (key !== 'win') banner.classList.add(`banner--${key}`);
    this.setRefText_('bannerLevel', LEVEL_LABEL[key]);
    this.setRefText_('bannerAmount', amountText);
    banner.classList.add('is-visible');
  }

  hideBanner() {
    this.toggleRefClass_('banner', 'is-visible', false);
  }

  /* ----------------------------------------------------------------- toasts */

  toast(message, { type = 'info', timeout = 4200 } = {}) {
    const host = this.ref_('toasts');
    if (!host || typeof host.appendChild !== 'function') return null;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;

    const node = document.createElement('div');
    node.className = `toast toast--${type}`;
    node.textContent = message;
    host.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      setTimeout(() => node.remove(), 240);
    }, timeout);
    return node;
  }

  /* --------------------------------------------------------------- historial */

  renderHistoryEmpty() {
    const list = this.ref_('history');
    if (!list) return false;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return false;

    list.textContent = '';
    const item = document.createElement('li');
    item.className = 'is-empty';
    item.textContent = 'Todavía no hay tiradas';
    list.appendChild(item);
    return true;
  }

  addHistory({ winCents, betCents, mode, spins }) {
    const list = this.ref_('history');
    if (!list) return null;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;

    const empty = typeof list.querySelector === 'function' ? list.querySelector('.is-empty') : null;
    if (empty) empty.remove();

    const item = document.createElement('li');
    if (winCents > 0) item.classList.add('is-win');

    const left = document.createElement('span');
    left.textContent = mode === 'BUY_FEATURE'
      ? `Bonus · ${spins} giros`
      : `Base · ${formatCents(betCents)}`;

    const right = document.createElement('span');
    right.textContent = formatCents(winCents);

    item.append(left, right);
    list.prepend(item);

    while (list.children.length > 8) {
      list.lastElementChild.remove();
    }
    return item;
  }

  /* ------------------------------------------------------- panel de auditoria */

  setRoundInfo({ state, roundId = null, serverSeedHash = null, clientSeed = null, rngDraws = null } = {}) {
    if (state) this.setRefText_('infoState', state);
    this.setRefText_('infoRound', roundId ? String(roundId).slice(0, 18) : '—');
    this.setRefAttr_('infoRound', 'title', roundId || '');
    this.setRefText_('infoSeedHash', serverSeedHash || '—');
    this.setRefText_('infoClientSeed', clientSeed || '—');
    this.setRefText_('infoDraws', Number.isFinite(rngDraws) ? formatPlain(rngDraws) : '—');
  }

  /* ---------------------------------------------------------- info del juego */

  setGameInfo(info) {
    this.gameInfo = info;
    const feature = (info && info.feature) || {};
    this.featureCostMultiplier = Number.isFinite(feature.costMultiplier)
      ? feature.costMultiplier
      : FEATURE.costMultiplier;
    this.featureSpins = Number.isFinite(feature.spins) ? feature.spins : FEATURE.spins;
    this.featureLabel = feature.label || FEATURE.label;

    const rtp = (info && info.certifiedRtp) || {};
    this.setRefText_('infoRtpBase', formatPercent(rtp.base));
    this.setRefText_('infoRtpFeature', formatPercent(rtp.feature));
    this.setRefText_(
      'infoCap',
      `${formatPlain((info && info.maxExposureMultiplier) || LIMITS.maxExposureMultiplier)}×`
    );
    /* El rotulo visible del amarillo es de la vista (`AUTOGIRO`), no del bonus:
       `featureLabel` solo alimenta la tabla de pagos y el aviso de la ronda. */
    this.setEngineText(
      info ? `${info.code} · v${info.engineVersion} · ${info.paytableVersion}` : ''
    );

    /* Modo "Fichas de Prueba": el backend publica saldo/moneda en /api/game. */
    const demo = (info && info.demo) || {};
    this.demoCurrency = demo.currency || DEMO.currency;
    this.demoStartCredits = Number.isFinite(demo.startBalanceCredits)
      ? demo.startBalanceCredits
      : DEMO.startBalanceCents / 100;
    const demoButton = this.ref_('demoBtn');
    if (demoButton) {
      demoButton.hidden = demo.enabled === false;
      demoButton.title = demo.enabled === false
        ? 'Modo Fichas de Prueba desactivado en este servidor'
        : `Jugar gratis con ${formatCredits(this.demoStartCredits)} ${this.demoCurrency} virtuales`;
    }
    this.setDemoMode(this.isDemo);
    this.syncFeverSheet_();
  }

  /* ------------------------------------------------------------------- modal */

  openModal(title, html) {
    const modal = this.ref_('modal');
    if (!modal) return false;

    this.setRefText_('modalTitle', title);
    this.setRefText_('modalBody', '');
    const body = this.ref_('modalBody');
    if (body) body.innerHTML = html;
    modal.hidden = false;
    const close = this.ref_('modalClose');
    if (close && typeof close.focus === 'function') close.focus();
    return true;
  }

  closeModal() {
    const modal = this.ref_('modal');
    if (!modal || modal.hidden) return false;

    modal.hidden = true;
    this.setRefText_('modalBody', '');
    return true;
  }

  showInfo() {
    if (!this.gameInfo) {
      this.openModal('Tabla de pagos', '<p>Cargando información del juego…</p>');
      return;
    }
    this.openModal('Tabla de pagos', this.buildInfoHtml_());
  }

  /**
   * Puerta de autenticacion manual: se usa cuando el backend no emite tokens
   * (ALLOW_DEV_SESSION=false) y no hay token en la URL ni en la sesion.
   *
   * Incluye la alternativa "Fichas de Prueba", que no necesita token real.
   *
   * @param {object} options
   * @param {(token: string) => void} options.onSubmit token pegado por el usuario
   * @param {(() => void)|null} [options.onDemo]    entrar en modo invitado
   */
  showAuthGate({ onSubmit, onDemo = null } = {}) {
    const demoBlock = onDemo
      ? `<button class="btn btn--demo auth-form__demo" id="auth-demo" type="button">
           <span class="btn__title">Fichas de Prueba</span>
           <span class="btn__sub">Jugar gratis · saldo virtual</span>
         </button>`
      : '';

    const html = `
      <h3>Sesión requerida</h3>
      <p>Este servidor no emite sesiones de prueba. Pega el token emitido por el
      operador (por ejemplo el que genera <code>npm run token</code>) o abre la
      página con <code>?token=…</code>.</p>
      <form class="auth-form">
        <label class="auth-form__label" for="token-input">Token de sesión</label>
        <input class="auth-form__input" id="token-input" type="password"
               autocomplete="off" spellcheck="false" placeholder="t1.…" />
        <button class="btn btn--spin auth-form__submit" type="submit">ENTRAR</button>
      </form>
      ${demoBlock}`;

    this.openModal('Sesión requerida', html);

    const body = this.ref_('modalBody');
    if (!body || typeof body.querySelector !== 'function') return;

    const form = body.querySelector('.auth-form');
    const input = body.querySelector('#token-input');
    if (!form || !input || typeof form.addEventListener !== 'function') return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      this.closeModal();
      onSubmit(value);
    });

    if (onDemo) {
      const demoButton = body.querySelector('#auth-demo');
      if (demoButton && typeof demoButton.addEventListener === 'function') {
        demoButton.addEventListener('click', () => {
          this.closeModal();
          onDemo();
        });
      }
    }

    if (typeof input.focus === 'function') input.focus();
  }

  /**
   * Contenido del modal «Tabla de pagos», generado desde `/api/game`.
   *
   * Solo habla del juego: que se paga, cuanto y con que simbolos. Los datos de
   * ingenieria (RTP certificado, versiones, comprobantes del generador) siguen
   * en el panel lateral, que ya los publica con sus propios ids.
   */
  buildInfoHtml_() {
    const info = this.gameInfo || {};
    const grid = info.grid || GRID;
    const minPay = info.minGridPaySize || info.minClusterSize || GRID.minPaySize;

    /* Los tramos se derivan de la paytable publicada (8-9 / 10-11 / 12+): no se
       escriben a mano, asi que un cambio de tabla mueve la cabecera solo. */
    const clusterPays = info.clusterPays || {};
    const samplePays = clusterPays[SYMBOL_KEYS[0]] || {};
    const tiers = Object.keys(samplePays).map(Number).sort((a, b) => a - b);
    const payTiers = tiers.length > 0 ? tiers : GRID.payTiers;
    const tierHeader = payTiers
      .map((tier, index) => (
        index === payTiers.length - 1
          ? `${tier}+`
          : `${tier}–${payTiers[index + 1] - 1}`
      ))
      .map((label) => `<th scope="col">${label}</th>`)
      .join('');

    const clusterRows = SYMBOL_KEYS.map((symbol) => {
      const meta = symbolMeta(symbol);
      const pays = clusterPays[symbol] || {};
      const cells = payTiers
        .map((tier) => `<td>${formatPay(pays[tier] || 0)}</td>`)
        .join('');
      /* La primera celda es cabecera de fila: el lector de pantalla anuncia el
         simbolo antes de cada cifra y la tabla se lee como una matriz. */
      return `<tr><th scope="row"><span class="paytable__symbol"><img class="paytable__icon" src="${escapeHtml(meta.image)}" alt="" />${escapeHtml(meta.name)}</span></th>${cells}</tr>`;
    }).join('');

    const scatterPays = info.scatterPays || {};
    const scatterKeys = Object.keys(scatterPays).map(Number).sort((a, b) => a - b);
    const scatterHeader = scatterKeys
      .map((key, index) => (
        index === scatterKeys.length - 1 ? `${key}+` : String(key)
      ))
      .map((label) => `<th scope="col">${label}</th>`)
      .join('');
    const scatterCells = scatterKeys
      .map((key) => `<td>${formatPay(scatterPays[key] || 0)}</td>`)
      .join('');

    /* Cada tabla va envuelta: en movil se desplaza en horizontal en vez de
       ensanchar el modal o arrastrar la cabecera al hacer scroll. */
    const payTable = (head, body) => `<div class="paytable__scroll"><table class="paytable">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>`;

    /* Bombas: los valores posibles se listan como fichas. El reparto porcentual
       es calibracion del motor y no se publica en pantalla. */
    const multiplier = info.multiplier || {};
    const distribution = multiplier.distribution || {};
    const bombValues = Object.keys(distribution).map(Number).sort((a, b) => a - b);
    const bombChips = bombValues.length > 0
      ? `<p class="paytable__chips">${bombValues
        .map((value) => `<span class="paytable__chip">${formatMultiplier(value)}</span>`)
        .join('')}</p>`
      : '';

    const bombRange = Number.isFinite(multiplier.min) && Number.isFinite(multiplier.max)
      ? `entre <strong>${formatMultiplier(multiplier.min)}</strong> y <strong>${formatMultiplier(multiplier.max)}</strong>`
      : 'con un valor que se suma al del resto de sellos';
    const bombRule = escapeHtml(
      multiplier.rule
        || 'La suma de los sellos multiplicadores de la cuadricula final multiplica el total ganado.'
    );
    const maxWin = formatPlain(info.maxExposureMultiplier || LIMITS.maxExposureMultiplier);

    return `
      <h3>Cómo se paga</h3>
      <p>Reúne <strong>${formatPlain(minPay)} o más</strong> símbolos iguales en cualquier
      posición del tablero de <strong>${grid.cols} × ${grid.rows}</strong>. No hace falta
      que estén conectados ni pegados: cuentan todos los que aparezcan en pantalla.</p>
      <p>Los símbolos premiados se eliminan y dejan caer símbolos nuevos, así que una misma
      tirada puede encadenar varias cascadas y volver a pagar en cada una.</p>

      <h3>Tabla de pagos (× apuesta)</h3>
      ${payTable(`<th scope="col">Símbolo</th>${tierHeader}`, clusterRows)}

      <h3>Comodines y símbolos especiales</h3>
      <p>Santa Crush no tiene comodín (wild) que sustituya a otros símbolos: cada
      símbolo paga por sí mismo. Los especiales son estos dos:</p>

      <p><strong>Sello Santa Crush · scatter (SC)</strong>: paga solo en la tirada inicial,
      esté donde esté, y no se elimina con las cascadas.</p>
      ${payTable(`<th scope="col">Sellos (scatter)</th>${scatterHeader}`, `<tr><th scope="row">Pago × apuesta</th>${scatterCells}</tr>`)}

      <p><strong>Sello multiplicador (MX · estrella dorada)</strong>: se queda en el tablero
      hasta el final de la ronda y cada sello vale ${bombRange}. Al terminar la ronda se
      suman todos y multiplican el premio ganado.</p>
      ${bombChips}
      <p>${bombRule}</p>

      <p class="paytable__foot">Ganancia máxima por ronda: <strong>${maxWin}×</strong> la
      apuesta base.</p>`;
  }
}
/* Nombre explicito para la nueva capa; `Ui` se conserva por compatibilidad. */
export { Ui as GameView };

