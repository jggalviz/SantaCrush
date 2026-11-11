/**
 * Metadatos de simbolos y formateo. Nada de logica de juego: el cliente solo
 * pinta lo que recibe del servidor.
 */

import { GRID } from '../config/gameConfig.js';

/*
 * Mapa visual de los 11 simbolos del motor sobre los assets de SANTA CRUSH. El
 * tablero usa dos familias de piezas:
 *
 *   - Los nueve motivos navideños (`s1.webp` .. `s9.webp`), del que menos paga
 *     al que mas: el numero del archivo coincide con el tramo de la tabla de
 *     pagos.
 *   - Las dos piezas de marca, que son los dos simbolos especiales del motor y
 *     caen con dibujos **distintos** para que se distingan de un vistazo: el
 *     emblema BONO (`s10.webp`) es el scatter (SC), el simbolo que mejor paga y
 *     el que abre la partida de bonificacion; el sello del regalo (`s11.webp`)
 *     es el multiplicador (MX), que se pinta con su valor encima (2x .. 250x) y
 *     sobrevive a las cascadas.
 *
 * `image` es la fuente principal de la casilla; `glyph` queda como fallback
 * accesible si la imagen no llega a cargar.
 *
 * Los once WebP se generan en dos pasos: `npm run build:slot-art` normaliza el
 * arte del disenador a los maestros de `design/symbols/*.png` (recorte al bbox
 * y encaje en el lienzo comun de 335 x 341 px) y `npm run build:symbols` los
 * convierte a WebP con alfa sin perdida (~40 KB cada uno frente a los ~170 KB
 * del PNG de origen).
 */
const SYMBOL_IMAGE_PATH = '/src/assets/slot/';
/* Los WebP se sirven `immutable` durante un ano (`vercel.json`), asi que la URL
   tiene que cambiar cuando cambia el arte. Este sufijo es el cache buster del
   set: sube a `?v=3` la proxima vez que se repinte el tablero (tambien esquiva
   cualquier 404 que se haya quedado cacheado en el borde). */
const SYMBOL_IMAGE_VERSION = '?v=2';
const slotImage = (file) => `${SYMBOL_IMAGE_PATH}${file}${SYMBOL_IMAGE_VERSION}`;

const BRAND_LOGO_IMAGE = slotImage('s10.webp');
/* El multiplicador cae con el sello del regalo (`s11.webp`), que es un dibujo
   propio: lo que separa a `MX` del scatter no es la etiqueta, es el arte (y la
   etiqueta del valor encima). */
const MULTIPLIER_IMAGE = slotImage('s11.webp');

export const SYMBOLS = Object.freeze({
  S1: { glyph: '🎅', name: 'Santa Claus', image: slotImage('s1.webp') },
  S2: { glyph: '🦌', name: 'Reno', image: slotImage('s2.webp') },
  S3: { glyph: '🔵', name: 'Bola de adorno', image: slotImage('s3.webp') },
  S4: { glyph: '🍬', name: 'Bastón de caramelo', image: slotImage('s4.webp') },
  S5: { glyph: '💂', name: 'Cascanueces', image: slotImage('s5.webp') },
  S6: { glyph: '🧦', name: 'Calcetín de regalo', image: slotImage('s6.webp') },
  S7: { glyph: '⛄', name: 'Bola de nieve', image: slotImage('s7.webp') },
  S8: { glyph: '🚂', name: 'Tren de juguete', image: slotImage('s8.webp') },
  S9: { glyph: '🍪', name: 'Casa de jengibre', image: slotImage('s9.webp') },
  SC: { glyph: '✨', name: 'Bono navideño (scatter)', image: BRAND_LOGO_IMAGE },
  MX: { glyph: '💠', name: 'Sello del regalo (multiplicador)', image: MULTIPLIER_IMAGE }
});

export const SYMBOL_KEYS = Object.freeze(['S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1']);

const CREDIT_FORMAT = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const PLAIN_FORMAT = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

/* Pagos de la tabla por dispersion: los tramos bajos valen centesimas
   (S1 rinde 0,0927x), asi que necesitan cuatro decimales. Sin ceros de
   relleno para que el tramo alto se lea entero ("12+" -> "2,9806x"). */
const PAY_FORMAT = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
});

/** Centimos enteros -> "1.234,56" */
export function formatCents(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '0,00';
  return CREDIT_FORMAT.format(value / 100);
}

/** Creditos (numero con decimales) -> "1.234,56" */
export function formatCredits(credits) {
  const value = Number(credits);
  if (!Number.isFinite(value)) return '0,00';
  return CREDIT_FORMAT.format(value);
}

/** Numero generico sin ceros forzados. */
export function formatPlain(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return PLAIN_FORMAT.format(n);
}

/**
 * Pago de la tabla en multiplos de la apuesta -> "0,0927×".
 *
 * `formatMultiplier` redondea a dos decimales porque pinta pastillas cortas
 * (2x, 250x); la tabla de pagos necesita conservar las centesimas del motor.
 */
export function formatPay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${PAY_FORMAT.format(n)}×`;
}

export function formatMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `${PLAIN_FORMAT.format(n)}×`;
}

export function formatPercent(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)} %`;
}

export function symbolMeta(symbol) {
  return SYMBOLS[symbol] || { glyph: '❔', name: symbol || '—' };
}

/** Celda -> clave de celda usada por las animaciones. */
export function cellKey(r, c, cols = GRID.cols) {
  return r * cols + c;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

/** Identificador de ronda para la clave de idempotencia (32 hex). */
export function makeRoundRef() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Semilla informativa del cliente (ASCII imprimible, max 64). */
export function makeClientSeed() {
  return makeRoundRef().slice(0, 24);
}
