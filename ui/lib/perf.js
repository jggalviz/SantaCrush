/**
 * Presupuesto de rendimiento del cliente.
 *
 * Concentra las tres decisiones que mantienen el juego fluido en un telefono de
 * gama media-baja y que, si cada modulo las tomara por su cuenta, acabarian
 * desincronizadas:
 *
 *   1. Movimiento reducido (`prefers-reduced-motion`): se consulta UNA vez, con
 *      el mismo patron que `timing.js`, y quien dibuja decide que apagar.
 *   2. Documento oculto (`document.hidden`): con la app en segundo plano no hay
 *      nada que mirar. Los bucles `requestAnimationFrame` se congelan (no basta
 *      con que el navegador los frene: el reloj de la coreografia saltaria al
 *      volver) y el CSS detiene las animaciones con `html.is-hidden`.
 *   3. Modo grafico ligero (`html.is-low-graphics`): en equipos con pocos
 *      nucleos, poca memoria o ahorro de datos se retiran los costes de
 *      rasterizado mas caros del tablero (los 42 `backdrop-filter` de casilla,
 *      un `drop-shadow` por simbolo y la onda infinita de reposo). El contrato
 *      visual se mantiene: rejilla, simbolos, HUD y pulsadores conservan color,
 *      geometria y estados; solo desaparece el acabado.
 *
 * El modulo es defensivo: todo acceso a `window`, `document` y `navigator`
 * comprueba que existan, porque la suite carga estos modulos en Node sin DOM.
 */

export const REDUCED_MOTION = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Umbrales del modo ligero. `deviceMemory` viene redondeado a potencias de dos
   y topado en 8 por el navegador, asi que 4 GB cubre la gama media-baja real.
   `hardwareConcurrency` describe nucleos logicos: 4 o menos no sostienen los
   filtros por casilla a 60 fps. */
const LOW_END_CORES = 4;
const LOW_END_MEMORY_GB = 4;

/** ¿La app esta en segundo plano? Falso sin DOM (tests en Node). */
export function documentHidden() {
  return typeof document !== 'undefined' && document.hidden === true;
}

/** Valor ya resuelto de `prefers-reduced-motion: reduce`. */
export function prefersReducedMotion() {
  return REDUCED_MOTION;
}

/**
 * Heuristica de gama baja, sin sondeo ni benchmarks.
 *
 * No pretende clasificar el equipo con precision: solo detectar los casos donde
 * los efectos caros no llegan a 60 fps. Cualquier senal basta y, si el
 * navegador no expone ninguna, se asume equipo capaz (el modo ligero tambien se
 * puede forzar desde `applyGraphicsProfile({ device: true })`).
 *
 * @param {Navigator|null} [nav] inyectable para pruebas
 * @returns {boolean}
 */
export function isLowEndDevice(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false;

  const connection = nav.connection || nav.mozConnection || nav.webkitConnection || null;
  if (connection && connection.saveData === true) return true;

  const cores = Number(nav.hardwareConcurrency);
  if (Number.isFinite(cores) && cores > 0 && cores <= LOW_END_CORES) return true;

  const memory = Number(nav.deviceMemory);
  if (Number.isFinite(memory) && memory > 0 && memory <= LOW_END_MEMORY_GB) return true;

  return false;
}

/**
 * Deja el perfil grafico en `html` antes de montar la vista.
 *
 * La clase `is-low-graphics` la consumen las reglas del final de `style.css`;
 * sin DOM o sin `classList` no hace nada (y devuelve `false`).
 *
 * @param {{device?: boolean, root?: Element|null}} [options]
 * @returns {boolean} true si quedo activo el modo ligero
 */
export function applyGraphicsProfile({ device = undefined, root = undefined } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  const target = root || (doc ? doc.documentElement : null);
  if (!target || !target.classList) return false;

  const low = device === undefined ? isLowEndDevice() : Boolean(device);
  target.classList.toggle('is-low-graphics', low);
  return low;
}

/**
 * Marca el documento como oculto para que el CSS congele las animaciones.
 *
 * @param {boolean} hidden
 */
export function setDocumentHidden(hidden) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root || !root.classList) return;
  root.classList.toggle('is-hidden', hidden === true);
}

/**
 * Escucha los cambios de visibilidad del documento.
 *
 * Devuelve la desuscripcion (segura de llamar dos veces) para que cada modulo
 * que lo use pueda limpiar en su `destroy()`. Sin DOM devuelve una funcion
 * vacia: el llamador no necesita ramas.
 *
 * @param {(hidden: boolean) => void} handler
 * @returns {() => void}
 */
export function watchVisibility(handler) {
  const noop = () => {};
  if (typeof handler !== 'function') return noop;
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return noop;

  const listener = () => handler(documentHidden());
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
