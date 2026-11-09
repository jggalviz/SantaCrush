/**
 * Metadatos de simbolos y formateo. Nada de logica de juego: el cliente solo
 * pinta lo que recibe del servidor.
 */

import { GRID } from '../config/gameConfig.js';

/*
 * Mapa visual de los 11 simbolos del motor sobre los assets de SANTA CRUSH. El
 * tablero usa tres motivos de la marca:
 *
 *   - Las nueve pelotas deportivas (`s1.webp` .. `s9.webp`), de la que menos
 *     paga a la que mas: el numero del archivo coincide con el tramo de la
 *     tabla de pagos.
 *   - El sello circular de la marca (`s10.webp`), que cae como scatter (SC), el
 *     simbolo que mejor paga: moneda, `m`, `Bet` y el texto interior dentro del
 *     aro rojo, sin el planeta del logo anterior.
 *   - El mismo sello (`s11.webp`) como multiplicador (`MX`), que se pinta con su
 *     valor encima (2x .. 250x) y sobrevive a las cascadas. Los dos sellos
 *     comparten dibujo: lo que distingue a `MX` es la etiqueta, no el arte.
 *
 * `image` es la fuente principal de la casilla; `glyph` queda como fallback
 * accesible si la imagen no llega a cargar.
 *
 * Los once WebP se generan desde `design/symbols/*.png` con
 * `npm run build:symbols` (alfa sin perdida y 335 x 341 px de lienzo): pesan
 * ~25 KB cada uno frente a los ~170 KB del PNG de origen. Los dos sellos de
 * marca no se editan a mano: `npm run build:seals` los deriva del unico maestro
 * `design/MBETN-LOGO@3x.png` quitandole el fondo blanco y reponiendo el disco
 * interior al 90 % de opacidad (`rgba(255, 255, 255, 0.9)`).
 */
const SYMBOL_IMAGE_PATH = '/src/assets/slot/';
const BRAND_LOGO_IMAGE = `${SYMBOL_IMAGE_PATH}s10.webp`;
/* El multiplicador cae con el mismo sello circular que el scatter (`s11.webp` es
   copia del `s10.webp`): el tablero tiene un unico sello de marca y la etiqueta
   del valor es lo que separa a `MX` del scatter. */
const MULTIPLIER_IMAGE = `${SYMBOL_IMAGE_PATH}s11.webp`;

export const SYMBOLS = Object.freeze({
  S1: { glyph: '⚾', name: 'Béisbol', image: `${SYMBOL_IMAGE_PATH}s1.webp` },
  S2: { glyph: '⚽', name: 'Balón de fútbol', image: `${SYMBOL_IMAGE_PATH}s2.webp` },
  S3: { glyph: '🎾', name: 'Pelota de tenis', image: `${SYMBOL_IMAGE_PATH}s3.webp` },
  S4: { glyph: '🏈', name: 'Balón de fútbol americano', image: `${SYMBOL_IMAGE_PATH}s4.webp` },
  S5: { glyph: '🏀', name: 'Balón de básquet', image: `${SYMBOL_IMAGE_PATH}s5.webp` },
  S6: { glyph: '⛳', name: 'Pelota de golf', image: `${SYMBOL_IMAGE_PATH}s6.webp` },
  S7: { glyph: '🏐', name: 'Balón de vóley', image: `${SYMBOL_IMAGE_PATH}s7.webp` },
  S8: { glyph: '🎱', name: 'Bola 8', image: `${SYMBOL_IMAGE_PATH}s8.webp` },
  S9: { glyph: '🎳', name: 'Bola de bolos', image: `${SYMBOL_IMAGE_PATH}s9.webp` },
  SC: { glyph: '✨', name: 'Logo Santa Crush (scatter)', image: BRAND_LOGO_IMAGE },
  MX: { glyph: '💠', name: 'Moneda Santa Crush (multiplicador)', image: MULTIPLIER_IMAGE }
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
