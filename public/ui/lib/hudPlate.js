/**
 * Alinea la placa 1 del HUD movil (el saldo) con la franja del marco.
 *
 * El saldo no vive en el marcado del HUD: se pinta desde la consola
 * (`.machine__side .controls .balance`), que es su bloque contenedor, y en CSS
 * se coloca subiendolo desde la tapa de la consola (seccion 5 de `style.css`).
 * Esa cuenta supone que la fila del marco mide `--frame-h`. Cuando el viewport
 * es mas bajo que el contenido esa fila se comprime -es la unica elastica,
 * porque el arte va absoluto- y la consola sube con ella, mientras las placas 2
 * y 3, colgadas de la franja del marco, se quedan en su aro. El saldo se iba con
 * la tapa: 18 px a 498x855 y 38 px a 480x800, con el rotulo fuera de la capsula.
 *
 * Aqui se mide el desfase REAL entre las dos cajas y se publica en
 * `--hud-plate-drift`, que el `top` del saldo suma. El modulo es defensivo (todo
 * acceso a `window`/`document`/`ResizeObserver` se comprueba) porque la suite lo
 * carga en Node sin DOM, y acepta las referencias por parametro para poder
 * probarlo con dobles.
 */

/** Solo la maqueta movil monta el saldo sobre la placa 1 del marco. */
export const MOBILE_QUERY = '(max-width: 899px)';

/** Token que consume `.machine__side .controls .balance` en `style.css`. */
export const DRIFT_PROPERTY = '--hud-plate-drift';

const round2 = (value) => Math.round(value * 100) / 100;

/** `true` si la maqueta movil esta activa (sin `window`, se asume que si). */
export function isMobileLayout(win = globalThis.window) {
  if (!win || typeof win.matchMedia !== 'function') return true;
  try {
    return win.matchMedia(MOBILE_QUERY).matches;
  } catch {
    return true;
  }
}

/**
 * Mide cuanto hay que bajar el saldo para que su caja caiga donde la franja del
 * HUD, acumulando lo que ya este aplicado (la medida incluye el token vigente,
 * asi que sumar el delta converge en un solo paso y es idempotente).
 *
 * @param {Element|null} side nodo `.machine__side`
 * @returns {number|null} desfase en px, o `null` si falta alguna de las cajas
 */
export function syncHudPlateDrift(side) {
  if (!side || typeof side.querySelector !== 'function') return null;
  const hud = side.querySelector('.hud');
  const plate = side.querySelector('.controls .balance');
  if (!hud || !plate || !hud.getBoundingClientRect || !plate.getBoundingClientRect) return null;
  if (!side.style || typeof side.style.setProperty !== 'function') return null;

  const applied = Number.parseFloat(side.style.getPropertyValue(DRIFT_PROPERTY)) || 0;
  const delta = hud.getBoundingClientRect().top - plate.getBoundingClientRect().top;
  const next = round2(applied + delta);
  side.style.setProperty(DRIFT_PROPERTY, `${next}px`);
  return next;
}

/**
 * Mantiene el token al dia: una pasada al montar y otra por cada cambio de
 * tamano o de maqueta. El `ResizeObserver` sobre `.machine__side` cubre los
 * cambios que no pasan por `resize`: el WebP del logo termina de cargar y
 * empuja la fila del marco, la barra del navegador movil se recoge, etc.
 *
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {() => void} limpieza de oyentes y observador
 */
export function watchHudPlateDrift(doc = globalThis.document, win = globalThis.window) {
  const noop = () => {};
  if (!doc || typeof doc.querySelector !== 'function') return noop;
  const side = doc.querySelector('.machine__side');
  if (!side) return noop;

  let frame = 0;
  let observer = null;

  const run = () => {
    frame = 0;
    if (!isMobileLayout(win)) {
      /* Escritorio: el saldo se lee en la consola y el token no aplica. */
      if (side.style && typeof side.style.removeProperty === 'function') {
        side.style.removeProperty(DRIFT_PROPERTY);
      }
      return;
    }
    syncHudPlateDrift(side);
  };

  const schedule = () => {
    if (frame) return;
    if (win && typeof win.requestAnimationFrame === 'function') {
      frame = win.requestAnimationFrame(run);
      return;
    }
    frame = setTimeout(run, 16);
  };

  /* Primer ajuste en el montaje: el marco ya esta maquetado, asi que el saldo
     nace en su placa y no se ve el salto de un frame. */
  run();

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('resize', schedule);
    win.addEventListener('orientationchange', schedule);
    win.addEventListener('load', schedule);
  }

  const Observer = win && win.ResizeObserver ? win.ResizeObserver : globalThis.ResizeObserver;
  if (typeof Observer === 'function') {
    observer = new Observer(schedule);
    observer.observe(side);
  }

  return () => {
    if (frame) {
      if (win && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frame);
      else clearTimeout(frame);
      frame = 0;
    }
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('resize', schedule);
      win.removeEventListener('orientationchange', schedule);
      win.removeEventListener('load', schedule);
    }
    if (observer) observer.disconnect();
    observer = null;
  };
}
