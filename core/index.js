'use strict';

/**
 * ============================================================================
 *  TROPICAL_GRID_6X5_95_10K  -  CORE MATEMATICO PURO
 * ============================================================================
 *  Este paquete contiene TODA la logica autoritativa del juego:
 *    - Paytables y constantes certificadas.
 *    - Generador aleatorio (CSPRNG HMAC-DRBG y PRNG offline determinista).
 *    - Construccion de tiras, gravedad y recargas.
 *    - Evaluacion 6x5, pagos por dispersion, cascadas y bombas.
 *    - Modelo matematico y resolucion de rondas.
 *
 *  Reglas de aislamiento:
 *    - Solo depende de `node:crypto` y de modulos relativos de `core/`.
 *    - No importa Express, base de datos, filesystem, DOM, canvas ni UI.
 *    - Las funciones reciben el estado/modelo por parametro y devuelven el
 *      resultado serializable de la tirada o de la ronda.
 * ============================================================================
 */

const constants = require('./constants');
const paytables = require('./paytables');
const {
  deepFreeze,
  gridPayTier,
  clusterTier
} = require('./money');
const {
  createRng,
  createSeeds
} = require('./rng');
const {
  buildStrip,
  buildStrips,
  createReelState,
  applyGravityAndRefill
} = require('./reels');
const {
  findGridPays,
  collectBombs,
  toMatrix
} = require('./grid');
const { playSpin } = require('./spin');
const { playRound } = require('./round');
const { buildModel, buildGameInfo } = require('./model');

/**
 * Crea una instancia del motor. En produccion usar la exportacion por defecto.
 * @param {object} [overrides] solo para calibracion/tests
 */
function createEngine(overrides = {}) {
  const model = buildModel(overrides);
  return {
    model,
    gameInfo: buildGameInfo(model),
    version: constants.ENGINE_VERSION,
    playRound: (options) => playRound(model, options),
    internals: {
      createRng,
      createSeeds,
      buildStrips,
      buildStrip,
      createReelState,
      applyGravityAndRefill,
      findGridPays,
      /* Alias heredado para consumidores internos existentes. */
      findClusters: findGridPays,
      collectBombs,
      toMatrix,
      playSpin: (params) =>
        playSpin({
          ...params,
          pickers: params.pickers || model.base.pickers,
          strips: params.strips || model.base.strips,
          paytable: params.paytable || model.gridPaytableMicro,
          scatterPays: params.scatterPays || model.scatterPaysMicro
        })
    }
  };
}

/** Valida que un importe en creditos pertenezca a la escalera oficial. */
function isValidBetCredits(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-6) return false;
  return constants.BET_LADDER_CREDITS.some((bet) => Math.round(bet * 100) === cents);
}

function creditsToCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (cents <= 0 || Math.abs(value * 100 - cents) > 1e-6) return null;
  return cents;
}

const defaultEngine = createEngine();

module.exports = {
  /* Instancia de produccion */
  playRound: defaultEngine.playRound,
  gameInfo: defaultEngine.gameInfo,
  model: defaultEngine.model,
  createEngine,
  /* Constantes y metadatos */
  ...constants,
  ...paytables,
  /* Helpers de validacion y utilidades */
  isValidBetCredits,
  creditsToCents,
  gridPayTier,
  clusterTier,
  deepFreeze
};
