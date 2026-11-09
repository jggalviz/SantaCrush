/**
 * Tiempos compartidos por el controlador y el renderizador.
 *
 * Vive en `lib/` (no en la vista) para que `GameController` pueda esperar las
 * animaciones sin importar el modulo que dibuja. Con `prefers-reduced-motion`
 * las esperas se reducen sin eliminar el flujo.
 */

const REDUCED_MOTION = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const base = (ms) => (REDUCED_MOTION ? Math.min(ms, 20) : ms);

export const TIMING = Object.freeze({
  reel: base(300),
  drop: base(580),
  hold: base(640),
  pop: base(300),
  settle: base(240)
});

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
