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
      if (this.controller.autoRunning) return;
      void this.controller.spin();
    });

    this.bind(refs.featureBtn, 'click', () => {
      /* El pulsador amarillo abre la hoja de giros rapidos: no gira ni cobra
         hasta que el jugador elige un paquete, y elegirlo tampoco gasta. */
      this.controller.openFeverSheet();
    });

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

  onKeyDown(event) {
    const target = event.target;
    const isFormField = typeof HTMLElement !== 'undefined'
      && target instanceof HTMLElement
      && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (isFormField) return;

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
