'use strict';

const crypto = require('node:crypto');

const {
  GAME_CODE,
  GAME_NAME,
  ENGINE_VERSION,
  PAYTABLE_VERSION,
  GRID_COLS,
  GRID_ROWS,
  MIN_CLUSTER_SIZE,
  MAX_EXPOSURE_MULTIPLIER,
  STRIP_LENGTH,
  STRIP_SEED,
  BET_LADDER_CREDITS,
  FEATURE_CONFIG,
  CERTIFIED_RTP
} = require('./constants');
const {
  GRID_PAYS_UNITS,
  SCATTER_PAYS_UNITS,
  BASE_WEIGHTS,
  FEATURE_WEIGHTS,
  BASE_MULTIPLIER_TABLE,
  FEATURE_MULTIPLIER_TABLE
} = require('./paytables');
const { deepFreeze, mapGridPays, mapPays } = require('./money');
const { buildStrips } = require('./reels');
const { compilePicker, compileMultiplierPicker } = require('./pickers');

/* ==========================================================================
 *  8. CONSTRUCCION DEL MODELO Y API PUBLICA DEL MOTOR
 * ========================================================================== */

/**
 * Compila un modelo matematico completo. Los `overrides` existen para la
 * calibracion offline (scripts/simulate.js) y los tests; el endpoint de
 * produccion usa SIEMPRE el modelo por defecto (createEngine() sin args).
 */
function buildModel(overrides = {}) {
  const gridPaysUnits = overrides.gridPaysUnits
    || overrides.clusterPaysUnits
    || GRID_PAYS_UNITS;
  const scatterPaysUnits = overrides.scatterPaysUnits || SCATTER_PAYS_UNITS;
  const baseWeights = overrides.baseWeights || BASE_WEIGHTS;
  const featureWeights = overrides.featureWeights || FEATURE_WEIGHTS;
  const baseMultiplierTable = overrides.baseMultiplierTable || BASE_MULTIPLIER_TABLE;
  const featureMultiplierTable = overrides.featureMultiplierTable || FEATURE_MULTIPLIER_TABLE;
  const featureConfig = Object.assign({}, FEATURE_CONFIG, overrides.featureConfig || {});

  const gridPaytableMicro = mapGridPays(gridPaysUnits);
  const model = {
    paytableVersion: overrides.paytableVersion || PAYTABLE_VERSION,
    gridPaysUnits,
    /* Alias heredado del contrato anterior. */
    clusterPaysUnits: gridPaysUnits,
    scatterPaysUnits,
    gridPaytableMicro,
    clusterPaytableMicro: gridPaytableMicro,
    scatterPaysMicro: mapPays(scatterPaysUnits),
    maxExposureMultiplier: overrides.maxExposureMultiplier || MAX_EXPOSURE_MULTIPLIER,
    base: {
      weights: baseWeights,
      multiplierTable: baseMultiplierTable,
      strips: buildStrips(baseWeights, STRIP_SEED),
      pickers: {
        symbols: compilePicker(baseWeights),
        multipliers: compileMultiplierPicker(baseMultiplierTable)
      }
    },
    feature: {
      id: featureConfig.id,
      label: featureConfig.label,
      costMultiplier: featureConfig.costMultiplier,
      spins: featureConfig.spins,
      weights: featureWeights,
      multiplierTable: featureMultiplierTable,
      strips: buildStrips(featureWeights, (STRIP_SEED ^ 0x5bd1e995) >>> 0),
      pickers: {
        symbols: compilePicker(featureWeights),
        multipliers: compileMultiplierPicker(featureMultiplierTable)
      }
    }
  };

  return deepFreeze(model);
}

/** Descripcion publica (sin logica) para /api/game y para la UI. */
function buildGameInfo(model) {
  const multiplierDistribution = {};
  for (const key of Object.keys(model.base.multiplierTable)) {
    multiplierDistribution[key] = Number(
      (model.base.multiplierTable[key] / model.base.pickers.multipliers.total).toFixed(6)
    );
  }

  /* Rango efectivo de bombas derivado del modelo (admite overrides). */
  const multiplierValues = Object.keys(model.base.multiplierTable)
    .concat(Object.keys(model.feature.multiplierTable))
    .map(Number);
  const multiplierMin = Math.min(...multiplierValues);
  const multiplierMax = Math.max(...multiplierValues);

  /* Comprobante de las tiras fisicas: permite al auditor verificar que el
     despliegue sirve exactamente las tiras certificadas. */
  const stripChecksum = crypto
    .createHash('sha256')
    .update(model.base.strips.map((strip) => strip.join('')).join('|'))
    .digest('hex');
  const composition = {};
  for (const strip of model.base.strips) {
    for (const symbol of strip) composition[symbol] = (composition[symbol] || 0) + 1;
  }
  const positions = model.base.strips.length * STRIP_LENGTH;
  const symbolDistribution = {};
  for (const symbol of Object.keys(composition)) {
    symbolDistribution[symbol] = Number((composition[symbol] / positions).toFixed(6));
  }

  return Object.freeze({
    code: GAME_CODE,
    name: GAME_NAME,
    engineVersion: ENGINE_VERSION,
    paytableVersion: model.paytableVersion,
    grid: { cols: GRID_COLS, rows: GRID_ROWS },
    payMode: 'GRID_PAYS',
    minGridPaySize: MIN_CLUSTER_SIZE,
    /* Alias heredado: mismo valor que minGridPaySize. */
    minClusterSize: MIN_CLUSTER_SIZE,
    maxExposureMultiplier: model.maxExposureMultiplier,
    betLadder: BET_LADDER_CREDITS,
    certifiedRtp: CERTIFIED_RTP,
    clusterPays: model.clusterPaysUnits,
    gridPays: model.clusterPaysUnits,
    scatterPays: model.scatterPaysUnits,
    strips: {
      length: STRIP_LENGTH,
      columns: GRID_COLS,
      checksum: stripChecksum,
      symbolDistribution
    },
    multiplier: {
      min: multiplierMin,
      max: multiplierMax,
      distribution: multiplierDistribution,
      rule: 'La suma de los logos multiplicadores de la cuadricula final multiplica el total ganado.'
    },
    feature: {
      id: model.feature.id,
      label: model.feature.label,
      costMultiplier: model.feature.costMultiplier,
      spins: model.feature.spins
    },
    rules: [
      `Cuadricula fija de ${GRID_COLS}x${GRID_ROWS} con pagos por dispersion de ${MIN_CLUSTER_SIZE} o mas simbolos iguales.`,
      'Los simbolos se cuentan en cualquier posicion de la cuadricula; no hace falta que esten conectados ni adyacentes.',
      'Todas las celdas de cada simbolo ganador se eliminan y provocan cascadas hasta que no queden premios.',
      'El SCATTER y el logo multiplicador (MX) no se eliminan durante las cascadas; el logo aplica su suma al final.',
      `El SCATTER paga solo en la tirada inicial: 3/4/5/6+ = ${model.scatterPaysUnits[3]}x/${model.scatterPaysUnits[4]}x/${model.scatterPaysUnits[5]}x/${model.scatterPaysUnits[6]}x.`,
      `Cada logo multiplicador vale entre ${multiplierMin}x y ${multiplierMax}x; al final de la ronda se suman y multiplican el premio.`,
      `La ganancia maxima por ronda esta limitada a ${model.maxExposureMultiplier.toLocaleString('es-ES')}x la apuesta base.`
    ]
  });
}

module.exports = { buildModel, buildGameInfo };
