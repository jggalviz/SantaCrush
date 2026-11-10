'use strict';

const {
  GRID_COLS,
  GRID_ROWS,
  MULTIPLIER,
  STRIP_LENGTH,
  STRIP_RUN_LENGTHS,
  SINGLE_RUN_SYMBOLS
} = require('./constants');
const { createStripRng } = require('./rng');
const { pickMultiplier } = require('./pickers');

/* ==========================================================================
 *  5. TIRAS FISICAS, GRAVEDAD Y DETECCION DE PAGOS DISPERSOS
 * ========================================================================== */

/** Celda: { s: simbolo, v: valor de bomba (0 si no es bomba) }. */
function createCell(symbol, value) {
  return { s: symbol, v: symbol === MULTIPLIER ? value : 0 };
}

function createEmptyGrid() {
  return Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(null));
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((cell) => (cell ? { s: cell.s, v: cell.v } : null)));
}

function buildStrip(weights, length, seed) {
  const symbols = Object.keys(weights);
  const total = symbols.reduce((sum, symbol) => sum + weights[symbol], 0);
  const rng = createStripRng(seed);
  const strip = [];
  let guard = 0;

  while (strip.length < length) {
    guard += 1;
    if (guard > length * 100) throw new Error('No se pudo construir la tira virtual.');
    let ticket = rng.int(total);
    let symbol = symbols[symbols.length - 1];
    for (const candidate of symbols) {
      if (ticket < weights[candidate]) {
        symbol = candidate;
        break;
      }
      ticket -= weights[candidate];
    }
    const runLength = SINGLE_RUN_SYMBOLS.includes(symbol)
      ? 1
      : STRIP_RUN_LENGTHS[rng.int(STRIP_RUN_LENGTHS.length)];
    for (let i = 0; i < runLength && strip.length < length; i += 1) {
      strip.push(symbol);
    }
  }

  return Object.freeze(strip);
}

function buildStrips(weights, seed) {
  return Object.freeze(
    Array.from({ length: GRID_COLS }, (_, col) =>
      buildStrip(weights, STRIP_LENGTH, (seed ^ Math.imul(col + 1, 0x9e3779b9)) >>> 0)
    )
  );
}

function stripAt(strip, position) {
  const len = strip.length;
  return strip[((position % len) + len) % len];
}

/**
 * Extrae un simbolo de la tira. Si la posicion es MULTIPLICADOR se sortea
 * su valor (2x..250x) con el CSPRNG de la ronda.
 */
function drawFromStrip(strip, position, rng, multiplierPicker) {
  const symbol = stripAt(strip, position);
  if (symbol === MULTIPLIER) {
    return createCell(MULTIPLIER, pickMultiplier(multiplierPicker, rng));
  }
  return createCell(symbol, 0);
}

/**
 * Tirada inicial: cada columna elige una parada aleatoria (CSPRNG) y se
 * toman 5 posiciones consecutivas. La fila inferior (4) corresponde a la
 * parada; las superiores avanzan en la tira.
 */
function createReelState(rng, strips, multiplierPicker) {
  const grid = createEmptyGrid();
  const cursors = new Array(GRID_COLS).fill(0);

  for (let col = 0; col < GRID_COLS; col += 1) {
    const strip = strips[col];
    const stop = rng.int(strip.length);
    for (let i = 0; i < GRID_ROWS; i += 1) {
      const row = GRID_ROWS - 1 - i;
      grid[row][col] = drawFromStrip(strip, stop + i, rng, multiplierPicker);
    }
    cursors[col] = (stop + GRID_ROWS) % strip.length;
  }

  return { grid, cursors, strips };
}

/**
 * Aplica gravedad a cada columna y rellena los huecos desde arriba
 * continuando la tira fisica (el cursor avanza). Las bombas caen como
 * cualquier otro simbolo y NUNCA se eliminan.
 * @param {Set<number>} removedSet indices lineales (row * GRID_COLS + col)
 */
function applyGravityAndRefill(grid, removedSet, reelState, rng, multiplierPicker) {
  for (let col = 0; col < GRID_COLS; col += 1) {
    const survivors = [];
    for (let row = GRID_ROWS - 1; row >= 0; row -= 1) {
      const cell = grid[row][col];
      if (cell !== null && !removedSet.has(row * GRID_COLS + col)) {
        survivors.push(cell);
      }
    }

    let write = GRID_ROWS - 1;
    for (const cell of survivors) {
      grid[write][col] = cell;
      write -= 1;
    }

    const strip = reelState.strips[col];
    while (write >= 0) {
      grid[write][col] = drawFromStrip(strip, reelState.cursors[col], rng, multiplierPicker);
      reelState.cursors[col] = (reelState.cursors[col] + 1) % strip.length;
      write -= 1;
    }
  }
  return grid;
}

module.exports = {
  createCell,
  createEmptyGrid,
  cloneGrid,
  buildStrip,
  buildStrips,
  stripAt,
  drawFromStrip,
  createReelState,
  applyGravityAndRefill
};
