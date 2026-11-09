'use strict';

const {
  GAME_CODE,
  GAME_NAME,
  ENGINE_VERSION,
  MICRO_PER_UNIT,
  MAX_ENGINE_AMOUNT_CENTS,
  CERTIFIED_RTP
} = require('./constants');
const { assertInteger } = require('./money');
const { createRng, createSeeds } = require('./rng');
const { playSpin } = require('./spin');

/* ==========================================================================
 *  7. RONDA COMPLETA (modo base y compra de bonus)
 * ========================================================================== */

/**
 * Ejecuta una ronda autoritativa completa.
 *
 * @param {object} model     modelo matematico compilado
 * @param {object} options
 * @param {number} options.betCents        apuesta base en centimos
 * @param {boolean} [options.buyFeature]   true = TROPICAL FEVER (100x bet)
 * @param {string} [options.clientSeed]    semilla informativa del cliente
 * @param {string} [options.roundId]       id de ronda (para el hash de auditoria)
 * @param {object} [options.rng]           solo tests/simulacion
 * @returns {object} resultado de la ronda
 */
function playRound(model, options = {}) {
  const {
    betCents,
    buyFeature = false,
    clientSeed,
    roundId = null,
    rng: injectedRng = null
  } = options;

  assertInteger(betCents, 'betCents', { min: 1, max: MAX_ENGINE_AMOUNT_CENTS });
  if (typeof buyFeature !== 'boolean') {
    const err = new Error('buyFeature debe ser booleano.');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }

  const seeds = injectedRng ? null : createSeeds(clientSeed);
  const rng = injectedRng || createRng(seeds);

  const creditCost = buyFeature ? model.feature.costMultiplier : 1;
  const wagerCents = betCents * creditCost;
  assertInteger(wagerCents, 'wagerCents', { min: 1, max: MAX_ENGINE_AMOUNT_CENTS });
  const maxWinCents = betCents * model.maxExposureMultiplier;

  const plannedSpins = buyFeature ? model.feature.spins : 1;
  const pickers = buyFeature ? model.feature.pickers : model.base.pickers;
  const spins = [];
  let totalWinCents = 0;
  let totalBaseWinMicro = 0;
  let capped = false;

  for (let spinIndex = 0; spinIndex < plannedSpins; spinIndex += 1) {
    const remaining = maxWinCents - totalWinCents;
    if (remaining <= 0) {
      capped = true;
      break;
    }
    const spin = playSpin({
      rng,
      pickers,
      strips: buyFeature ? model.feature.strips : model.base.strips,
      paytable: model.gridPaytableMicro,
      scatterPays: model.scatterPaysMicro,
      betCents,
      winBudgetCents: remaining,
      spinIndex
    });
    spins.push(spin);
    totalWinCents += spin.winCents;
    totalBaseWinMicro += spin.baseWinMicro;
    if (spin.capped) {
      capped = true;
      break;
    }
  }

  if (totalWinCents > maxWinCents) {
    totalWinCents = maxWinCents;
    capped = true;
  }

  const primary = spins[0];
  const isFeature = buyFeature;

  const result = {
    gameCode: GAME_CODE,
    gameName: GAME_NAME,
    engineVersion: ENGINE_VERSION,
    paytableVersion: model.paytableVersion,
    mode: isFeature ? 'BUY_FEATURE' : 'BASE',
    betCents,
    wagerCents,
    maxWinCents,
    totalWinCents,
    totalWinCredits: Number((totalWinCents / 100).toFixed(2)),
    totalBaseWinMicro,
    totalBaseWinUnits: Number((totalBaseWinMicro / MICRO_PER_UNIT).toFixed(4)),
    capped,
    maxWinReached: totalWinCents >= maxWinCents,
    spinsPlayed: spins.length,
    spinsPlanned: plannedSpins,
    spins,
    /* Acceso directo para el modo base (el cliente tambien puede usar spins[]) */
    initialGrid: isFeature ? null : primary.initialGrid,
    finalGrid: isFeature ? null : primary.finalGrid,
    cascades: isFeature ? [] : primary.cascades,
    scatter: isFeature ? null : primary.scatter,
    bombs: isFeature ? null : primary.bombs,
    multiplier: isFeature ? null : primary.multiplier,
    multiplierApplied: isFeature ? null : primary.multiplierApplied,
    audit: {
      roundId,
      serverSeed: seeds ? seeds.serverSeed : null,
      serverSeedHash: seeds ? seeds.serverSeedHash : null,
      clientSeed: seeds ? seeds.clientSeed : null,
      rngHash: seeds ? seeds.rngHash : null,
      rngDraws: typeof rng.draws === 'function' ? rng.draws() : null,
      generatedAt: new Date().toISOString(),
      certifiedRtp: CERTIFIED_RTP,
      paytableVersion: model.paytableVersion,
      engineVersion: ENGINE_VERSION
    }
  };

  if (isFeature) {
    result.feature = {
      id: model.feature.id,
      label: model.feature.label,
      costMultiplier: model.feature.costMultiplier,
      spins: model.feature.spins
    };
  }

  return result;
}

module.exports = { playRound };
