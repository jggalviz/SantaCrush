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
      /* FEVER compra el bonus completo (100x la apuesta, 10 giros). El precio y
         la disponibilidad los valida el controlador contra el saldo autoritativo;
         aqui solo se pide la compra. Corta el automatico si estaba en marcha. */
      void this.controller.buyFeature();
    });

    /* Insignia del paquete (x5 · x10 · x25) pegada al azul: abre la hoja de
       giros rapidos, que es donde se elige. Elegir no gira ni gasta saldo. */
    this.bind(refs.autoPack, 'click', () => this.controller.openFeverSheet());

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

    /* La insignia del paquete ya es un boton: su Space/Enter abre la hoja y no
       debe ademas lanzar una tirada. Se mira el ancestro porque el foco puede
       estar en el texto de la insignia. */
    const isPackBadge = Boolean(target)
      && typeof target.closest === 'function'
      && target.closest('#btn-auto-pack') !== null;
    if (isPackBadge) return;

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
