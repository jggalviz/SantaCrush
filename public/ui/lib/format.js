/**
 * Metadatos de simbolos y formateo. Nada de logica de juego: el cliente solo
 * pinta lo que recibe del servidor.
 */

import { GRID } from '../config/gameConfig.js';

/*
 * Mapa visual de los 11 simbolos del motor sobre los assets de SANTA CRUSH. El
 * tablero usa tres motivos de la marca:
 *
 *   - Los nueve simbolos navideños (`s1.webp` .. `s9.webp`), del que menos paga
 *     al que mas: el numero del archivo coincide con el tramo de la tabla de
 *     pagos (`s1` es la cara de Santa, el mas comun, y `s9` la casa de
 *     jengibre, el mas raro).
 *   - El regalo navideño (`s10.webp`), que cae como scatter (SC), el simbolo que
 *     mejor paga: el emblema circular con el aro dorado, el acebo, las campanas
 *     y el regalo rojo con el lazo de oro en el centro.
 *   - El bono navideño (`s11.webp`) como multiplicador (`MX`), el regalo con el
 *     lazo que se pinta con su valor encima (2x .. 250x) y sobrevive a las
 *     cascadas.
 *
 * `image` es la fuente principal de la casilla; `glyph` queda como fallback
 * accesible si la imagen no llega a cargar.
 *
 * Los once WebP se generan desde `design/symbols/*.png` con
 * `npm run build:symbols` (alfa sin perdida y 335 x 341 px de lienzo): pesan
 * ~45 KB cada uno frente a los ~190 KB del PNG de origen. Los once maestros se
 * publican tal cual, sin derivar ninguno: la unica regla es el encuadre comun
 * —escala uniforme 335 / ancho de la fuente y centrado vertical en el lienzo de
 * 335 x 341—, asi que ninguna pieza se recorta ni cambia de proporcion.
 */
const SYMBOL_IMAGE_PATH = '/src/assets/slot/';
/* El scatter cae con el arte del regalo navideño (`s10.webp`): emblema circular
   de aro dorado con el regalo rojo del lazo de oro dentro. */
const SCATTER_IMAGE = `${SYMBOL_IMAGE_PATH}s10.webp`;
/* El multiplicador cae con el arte del bono navideño (`s11.webp`): el regalo
   dibujado, sin sello de marca, y la etiqueta del valor encima es lo que anuncia
   cuanto multiplica. */
const MULTIPLIER_IMAGE = `${SYMBOL_IMAGE_PATH}s11.webp`;

export const SYMBOLS = Object.freeze({
  S1: { glyph: '🎅', name: 'Papá Noel', image: `${SYMBOL_IMAGE_PATH}s1.webp` },
  S2: { glyph: '🦌', name: 'Reno', image: `${SYMBOL_IMAGE_PATH}s2.webp` },
  S3: { glyph: '❄️', name: 'Adorno de Navidad', image: `${SYMBOL_IMAGE_PATH}s3.webp` },
  S4: { glyph: '🍭', name: 'Piruleta', image: `${SYMBOL_IMAGE_PATH}s4.webp` },
  S5: { glyph: '💂', name: 'Cascanueces', image: `${SYMBOL_IMAGE_PATH}s5.webp` },
  S6: { glyph: '🧦', name: 'Calcetín', image: `${SYMBOL_IMAGE_PATH}s6.webp` },
  S7: { glyph: '⛄', name: 'Bola de nieve', image: `${SYMBOL_IMAGE_PATH}s7.webp` },
  S8: { glyph: '🚂', name: 'Tren de juguete', image: `${SYMBOL_IMAGE_PATH}s8.webp` },
  S9: { glyph: '🏠', name: 'Casa de jengibre', image: `${SYMBOL_IMAGE_PATH}s9.webp` },
  SC: { glyph: '🎀', name: 'Regalo navideño (scatter)', image: SCATTER_IMAGE },
  MX: { glyph: '🎁', name: 'Bono navideño (multiplicador)', image: MULTIPLIER_IMAGE }
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
