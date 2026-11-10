/**
 * Componente de controles.
 *
 * Conecta los botones y el teclado con acciones del `GameController`. No hace
 * peticiones, no conoce apuestas ni importes: solo traduce eventos de usuario
 * a intenciones (`onSpin`, `onBuyFeature`, `onChangeBet`...).
 */

/** Umbral de la pulsacion larga de la insignia del paquete (ms). */
const PACK_LONG_PRESS_MS = 550;

export class GameControls {
  /**
   * @param {object} options
   * @param {object} options.ui       renderer con `refs` del DOM
   * @param {object} options.controller `GameController`
   * @param {object} [options.documentRef]
   * @param {number} [options.longPressMs] umbral de la pulsacion larga (ms)
   */
  constructor({ ui, controller, documentRef = document, longPressMs = PACK_LONG_PRESS_MS }) {
    this.ui = ui;
    this.controller = controller;
    this.document = documentRef;
    /* La pulsacion larga de la insignia del paquete abre la hoja GIROS RAPIDOS;
       la corta rueda el catalogo. El umbral se puede acortar en las pruebas. */
    this.longPressMs = Number.isFinite(Number(longPressMs)) && Number(longPressMs) >= 0
      ? Number(longPressMs)
      : PACK_LONG_PRESS_MS;
    this.packPressTimer = null;
    this.packLongPressFired = false;
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

    /* Insignia del paquete (x5 · x10 · x25), debajo del disco "..." en movil.
       Pulsacion corta: rueda al siguiente paquete publicado —la cifra entra
       desde abajo—, sin girar ni gastar saldo. Pulsacion larga: abre la hoja
       GIROS RAPIDOS, que es donde se ve el coste de cada paquete. */
    this.bind(refs.autoPack, 'click', () => {
      /* El `click` llega tambien despues de una pulsacion larga: ya la resolvio
         la hoja, asi que no se rueda el paquete por detras. */
      if (this.packLongPressFired) {
        this.packLongPressFired = false;
        return;
      }
      this.controller.cycleQuickSpins();
    });
    this.bindPackPress_(refs.autoPack);

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
    this.resetPackPress_();
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
   * Pulsacion larga en la insignia del paquete: abre la hoja GIROS RAPIDOS.
   *
   * La corta rueda el paquete, asi que la hoja se pide manteniendo el dedo (o
   * con Shift+Enter). Se arma con `pointerdown` y se cancela al soltar, al
   * salir del pulsador o si el navegador corta el gesto. El `contextmenu` se
   * bloquea para que en movil no aparezca el menu del sistema encima de la
   * capsula mientras se mantiene pulsada.
   *
   * @param {object} node `#btn-auto-pack`
   */
  bindPackPress_(node) {
    if (!node || typeof node.addEventListener !== 'function') return;
    this.bind(node, 'pointerdown', () => this.armPackPress_());
    this.bind(node, 'pointerup', () => this.clearPackPressTimer_());
    this.bind(node, 'pointerleave', () => this.clearPackPressTimer_());
    this.bind(node, 'pointercancel', () => this.clearPackPressTimer_());
    this.bind(node, 'contextmenu', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
    });
  }

  /** Arranca el temporizador de la pulsacion larga (idempotente). */
  armPackPress_() {
    this.resetPackPress_();
    this.packPressTimer = setTimeout(() => {
      this.packPressTimer = null;
      /* La marca sobrevive al `pointerup` a proposito: el `click` que llega
         despues debe saber que el gesto ya lo resolvio la hoja y no rodar el
         paquete por detras. */
      this.packLongPressFired = true;
      /* Con una ronda en curso o el bucle en marcha el controlador contesta con
         su aviso: aqui no se filtra nada para no duplicar el mensaje. */
      this.controller.openFeverSheet();
    }, this.longPressMs);
  }

  /** Cancela el temporizador pendiente sin olvidar que ya se disparo. */
  clearPackPressTimer_() {
    if (this.packPressTimer !== null) {
      clearTimeout(this.packPressTimer);
      this.packPressTimer = null;
    }
  }

  /** Cancela el temporizador y olvida la marca del gesto anterior. */
  resetPackPress_() {
    this.clearPackPressTimer_();
    this.packLongPressFired = false;
  }

  onKeyDown(event) {
    const target = event.target;
    const isFormField = typeof HTMLElement !== 'undefined'
      && target instanceof HTMLElement
      && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
    if (isFormField) return;

    /* La insignia del paquete ya es un boton: su Space/Enter no debe ademas
       lanzar una tirada. Se mira el ancestro porque el foco puede estar en el
       texto de la insignia. `Shift` es el atajo de la hoja: sin el, el boton
       rueda el paquete con su propio `click`. */
    const isPackBadge = Boolean(target)
      && typeof target.closest === 'function'
      && target.closest('#btn-auto-pack') !== null;
    if (isPackBadge) {
      if (event.shiftKey && (event.code === 'Space' || event.key === 'Enter')) {
        event.preventDefault();
        this.controller.openFeverSheet();
      }
      return;
    }

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
