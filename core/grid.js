'use strict';

const {
  GRID_COLS,
  GRID_ROWS,
  MULTIPLIER,
  MIN_GRID_PAY_SIZE,
  REGULAR_SYMBOLS
} = require('./constants');
const { gridPayTier } = require('./money');

/**
 * Detecta los pagos por dispersion de una cuadricula.
 *
 * Cuenta TODAS las apariciones de cada simbolo regular (S1..S9) en las 30
 * celdas, sin importar adyacencia ni conectividad. Si el conteo alcanza
 * MIN_GRID_PAY_SIZE se paga el tramo correspondiente (8-9 / 10-11 / 12+) y se
 * devuelven todas las celdas del simbolo para que la cascada las elimine.
 *
 * @param {Array<Array<{s:string,v:number}>>} grid
 * @param {Record<string, Record<number, number>>} paytable micro-unidades
 * @returns {Array<{symbol:string,size:number,cells:Array<[number,number]>,
 *                  tier:number,payMicro:number}>}
 */
function findGridPays(grid, paytable) {
  const bySymbol = new Map();

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = grid[row][col];
      if (!cell || !REGULAR_SYMBOLS.includes(cell.s)) continue;
      let entry = bySymbol.get(cell.s);
      if (!entry) {
        entry = [];
        bySymbol.set(cell.s, entry);
      }
      entry.push([row, col]);
    }
  }

  const pays = [];
  /* Orden normativo S1..S9 para que la auditoria sea determinista. */
  for (const symbol of REGULAR_SYMBOLS) {
    const cells = bySymbol.get(symbol);
    if (!cells || cells.length < MIN_GRID_PAY_SIZE) continue;

    const size = cells.length;
    const tier = gridPayTier(size);
    const payMicro = paytable[symbol] && paytable[symbol][tier] ? paytable[symbol][tier] : 0;
    pays.push({ symbol, size, cells, tier, payMicro });
  }

  return pays;
}

/** Lista de bombas visibles con su valor. */
function collectBombs(grid) {
  const bombs = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const cell = grid[row][col];
      if (cell && cell.s === MULTIPLIER) bombs.push({ r: row, c: col, value: cell.v });
    }
  }
  return bombs;
}

/** Matriz serializable (solo simbolos) para el cliente. */
function toMatrix(grid) {
  return grid.map((row) => row.map((cell) => (cell ? cell.s : null)));
}

module.exports = {
  findGridPays,
  collectBombs,
  toMatrix
};
