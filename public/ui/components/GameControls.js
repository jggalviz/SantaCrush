/**
 * Componente de controles.
 *
 * Conecta los botones y el teclado con acciones del `GameController`. No hace
 * peticiones, no conoce apuestas ni importes: solo traduce eventos de usuario
 * a intenciones (`onSpin`, `onBuyFeature`, `onChangeBet`...).
 */

export class GameControls {
  /**
   * @param {object} options
   * @param {object} options.ui       renderer con `refs` del DOM
   * @param {object} options.controller `GameController`
   * @param {object} [options.documentRef]
   */
  constructor({ ui, controller, documentRef = document }) {
    this.ui = ui;
    this.controller = controller;
    this.document = documentRef;
    this.bound = false;
    this.listeners = [];
  }

  mount() {
    if (this.bound) return this;

    const refs = this.ui.refs;
    this.bind(refs.spinBtn, 'click', () => {
      /* Con el bucle en marcha el GIRAR es la parada rapida: el mismo gesto que el
         azul, sin tener que buscar el otro pulsador. Con el motor quieto gira. */
      if (this.controller.autoRunning) {
        this.controller.stopAuto('Automático detenido');
        return;
      }
      void this.controller.spin();
    });

    this.bind(refs.featureBtn, 'click', () => {
      /* El pulsador amarillo abre la hoja de giros rapidos: no gira ni cobra
         hasta que el jugador elige un paquete, y elegirlo tampoco gasta. */
      this.controller.openFeverSheet();
    });

    /* Selector rapido: los chips x5 x10 x25 eligen paquete sin abrir la hoja. */
    this.bind(refs.featureOptions, 'click', (event) => this.onQuickSpinsClick(event));

    /* El pulsador azul juega el paquete configurado o detiene el bucle. */
    this.bind(refs.autoBtn, 'click', () => this.controller.toggleAuto());
    this.bind(refs.betUp, 'click', () => this.controller.changeBet(1));
    this.bind(refs.betDown, 'click', () => this.controller.changeBet(-1));
    this.bind(refs.betMax, 'click', () => this.controller.setMaxBet());

    /* "Fichas de Prueba": sesion de invitado con saldo virtual. */
    this.bind(refs.demoBtn, 'click', () => {
      if (this.controller.autoRunning) this.controller.stopAuto('Automático detenido');
      void this.controller.startDemoMode();
    });

    this.bind(this.document, 'keydown', (event) => this.onKeyDown(event));
    this.bound = true;
    return this;
  }

  destroy() {
    for (const { target, type, handler } of this.listeners) {
      if (target && typeof target.removeEventListener === 'function') {
        target.removeEventListener(type, handler);
      }
    }
    this.listeners = [];
    this.bound = false;
  }

  bind(target, type, handler) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler);
    this.listeners.push({ target, type, handler });
  }

  /**
   * Un chip del selector rapido. El paquete viaja en `data-spins`; el
   * `GameController` valida la cantidad contra el catalogo publicado, cierra la
   * hoja si estaba abierta y no gasta saldo.
   *
   * @param {Event} event clic dentro del grupo `#feature-options`
   */
  onQuickSpinsClick(event) {
    const target = event && event.target;
    /* El clic puede caer en el texto del chip: se sube al pulsador. */
    const node = target && typeof target.closest === 'function'
      ? target.closest('[data-spins]')
      : null;
    if (!node || node.disabled) return;

    const spins = Number(node.getAttribute('data-spins'));
    if (!Number.isFinite(spins)) return;
    this.controller.pickQuickSpins(spins);
  }

  onKeyDown(event) {
    const target = event.target;
    const isFormField = typeof HTMLElement !== 'undefined'
      && target instanceof HTMLElement
      && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (isFormField) return;

    /* Los chips del selector ya son botones: su Space/Enter elige paquete y no
       debe ademas lanzar una tirada. Se mira el ancestro porque el foco puede
       estar en el propio chip. */
    const isQuickChip = Boolean(target)
      && typeof target.closest === 'function'
      && target.closest('#feature-options') !== null;
    if (isQuickChip) return;

    const modal = this.document.getElementById('modal');
    if (modal && !modal.hidden) return;

    /* Hoja de giros rapidos: con ella abierta el teclado es suyo. Se comprueba
       aqui para no girar ni mover la apuesta por detras del dialogo; Escape y
       Tab los resuelve `GameView`. */
    const fever = this.document.getElementById('fever-sheet');
    if (fever && !fever.hidden) return;

    if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault();
      /* Con la pantalla de victoria abierta, la accion es cerrarla: evita que
         un toque de mas lance una tirada antes de ver el premio. */
      if (this.ui.refs.winOverlay && !this.ui.refs.winOverlay.hidden) {
        this.ui.hideWinOverlay();
        return;
      }
      if (!this.ui.busy && !this.controller.autoRunning) void this.controller.spin();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.controller.changeBet(1);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.controller.changeBet(-1);
    }
  }
}
