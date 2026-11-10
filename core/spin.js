'use strict';

const {
  GRID_COLS,
  GRID_ROWS,
  SCATTER,
  MAX_CASCADE_STEPS,
  MAX_EXPOSURE_MICRO,
  MICRO_PER_UNIT
} = require('./constants');
const { microToCents, scatterTopTier } = require('./money');
const { createReelState, applyGravityAndRefill } = require('./reels');
const { findGridPays, collectBombs, toMatrix } = require('./grid');

/* ==========================================================================
 *  6. RESOLUCION DE UNA TIRADA (con cascadas)
 * ========================================================================== */

/**
 * Ejecuta una tirada completa: drop inicial, evaluacion, cascadas y
 * recoleccion del multiplicador final.
 *
 * @param {object} params
 * @param {object} params.rng               generador (CSPRNG o inyectado en tests)
 * @param {object} params.pickers           pickers compilados del modo
 * @param {Array<Array<string>>} params.strips tiras fisicas del modo
 * @param {object} params.paytable          tabla de pagos en micro-unidades
 * @param {object} params.scatterPays       pagos de scatter en micro-unidades
 * @param {number} params.betCents          apuesta base en centimos
 * @param {number} params.winBudgetCents    maximo pagable en esta tirada
 * @param {number} params.spinIndex         indice (modo base => 0)
 * @returns {object} resultado serializable de la tirada
 */
function playSpin({
  rng, pickers, strips, paytable, scatterPays, betCents, winBudgetCents, spinIndex = 0
}) {
  const reelState = createReelState(rng, strips, pickers.multipliers);
  let grid = reelState.grid;
  const initialGrid = toMatrix(grid);

  /* --- Scatter: solo se evalua en la cuadricula inicial --- */
  const scatterCells = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      if (grid[row][col].s === SCATTER) scatterCells.push([row, col]);
    }
  }
  const scatterPayMicro = scatterPays[Math.min(scatterCells.length, scatterTopTier(scatterPays))] || 0;
  let gridWinMicro = 0;
  const cascades = [];
  let capped = false;

  /* --- Bucle de cascadas --- */
  for (let stepIndex = 0; stepIndex < MAX_CASCADE_STEPS; stepIndex += 1) {
    const gridPays = findGridPays(grid, paytable);
    if (gridPays.length === 0) break;

    const stepWinMicro = gridPays.reduce((sum, pay) => sum + pay.payMicro, 0);
    gridWinMicro += stepWinMicro;

    const removedCells = [];
    const removedSet = new Set();
    for (const pay of gridPays) {
      for (const [r, c] of pay.cells) {
        removedCells.push([r, c]);
        removedSet.add(r * GRID_COLS + c);
      }
    }

    const step = {
      index: stepIndex,
      grid: toMatrix(grid),
      bombs: collectBombs(grid),
      payType: 'GRID_PAYS',
      clusters: gridPays.map((pay) => ({
        symbol: pay.symbol,
        size: pay.size,
        tier: pay.tier,
        payMicro: pay.payMicro,
        payUnits: Number((pay.payMicro / MICRO_PER_UNIT).toFixed(4)),
        payCredits: Number(((pay.payMicro * betCents) / (MICRO_PER_UNIT * 100)).toFixed(2)),
        cells: pay.cells
      })),
      removedCells,
      winMicro: stepWinMicro,
      winCents: microToCents(stepWinMicro, betCents),
      gridAfter: null
    };

    grid = applyGravityAndRefill(grid, removedSet, reelState, rng, pickers.multipliers);
    step.gridAfter = toMatrix(grid);
    step.bombsAfter = collectBombs(grid);
    cascades.push(step);

    /* Corte por exposicion: el ganador base ya supera el tope de la ronda */
    if (gridWinMicro >= MAX_EXPOSURE_MICRO) {
      capped = true;
      break;
    }
  }

  /* --- Multiplicador: suma de bombas en la cuadricula final --- */
  const finalGrid = toMatrix(grid);
  const bombs = collectBombs(grid);
  const multiplier = bombs.length > 0
    ? bombs.reduce((sum, bomb) => sum + bomb.value, 0)
    : 1;

  const baseWinMicro = gridWinMicro + scatterPayMicro;

  /* --- Conversion monetaria unica (redondeo hacia abajo al centimo) --- */
  let winCents;
  if (baseWinMicro <= 0) {
    winCents = 0;
  } else if (baseWinMicro * multiplier >= MAX_EXPOSURE_MICRO) {
    winCents = Math.min(betCents * MAX_EXPOSURE_MULTIPLIER, winBudgetCents);
    capped = true;
  } else {
    winCents = microToCents(baseWinMicro * multiplier, betCents);
  }

  if (winCents > winBudgetCents) {
    winCents = winBudgetCents;
    capped = true;
  }

  return {
    index: spinIndex,
    initialGrid,
    finalGrid,
    cascades,
    scatter: {
      count: scatterCells.length,
      cells: scatterCells,
      payMicro: scatterPayMicro,
      payUnits: Number((scatterPayMicro / MICRO_PER_UNIT).toFixed(4)),
      payCents: microToCents(scatterPayMicro, betCents)
    },
    /* Alias heredado del contrato anterior. */
    clusterWinMicro: gridWinMicro,
    gridWinMicro,
    baseWinMicro,
    baseWinUnits: Number((baseWinMicro / MICRO_PER_UNIT).toFixed(4)),
    multiplier,
    multiplierApplied: baseWinMicro > 0 ? multiplier : 0,
    bombs,
    winCents,
    winCredits: Number((winCents / 100).toFixed(2)),
    cascadeCount: cascades.length,
    capped
  };
}

module.exports = { playSpin };
