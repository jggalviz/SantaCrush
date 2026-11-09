'use strict';

const { MIN_GRID_PAY_SIZE, MICRO_PER_UNIT } = require('./constants');

/* ==========================================================================
 *  2. UTILIDADES
 * ========================================================================== */

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
}

function unitsToMicro(units) {
  return Math.round(units * MICRO_PER_UNIT);
}

function microToCents(micro, betCents) {
  if (!Number.isFinite(micro) || micro <= 0) return 0;
  return Math.floor((micro * betCents) / MICRO_PER_UNIT);
}

function mapGridPays(paysUnits) {
  const table = {};
  for (const symbol of Object.keys(paysUnits)) {
    table[symbol] = {};
    for (const size of Object.keys(paysUnits[symbol])) {
      table[symbol][Number(size)] = unitsToMicro(paysUnits[symbol][size]);
    }
    Object.freeze(table[symbol]);
  }
  return Object.freeze(table);
}

function mapPays(paysUnits) {
  const table = {};
  for (const key of Object.keys(paysUnits)) {
    table[Number(key)] = unitsToMicro(paysUnits[key]);
  }
  return Object.freeze(table);
}

/** Devuelve el tramo de pago (8 / 10 / 12) segun el conteo disperso. */
function gridPayTier(size) {
  if (size >= 12) return 12;
  if (size >= 10) return 10;
  if (size >= MIN_GRID_PAY_SIZE) return 8;
  return 0;
}

/** Alias heredado del calculo de tramos. */
const clusterTier = gridPayTier;

/**
 * Tramo de pago de scatter aplicable a `count` flores.
 * El ultimo tramo de la tabla es abierto ("6+"), asi que se acota a su clave.
 * Se memoiza por tabla para no recorrer claves en cada tirada.
 */
const scatterTopTierCache = new WeakMap();

function scatterTopTier(scatterPays) {
  let top = scatterTopTierCache.get(scatterPays);
  if (top === undefined) {
    top = Object.keys(scatterPays).reduce((max, key) => Math.max(max, Number(key) || 0), 0);
    scatterTopTierCache.set(scatterPays, top);
  }
  return top;
}

function assertInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    const err = new Error(`${name} invalido: ${value}. Debe ser entero entre ${min} y ${max}.`);
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }
  return value;
}

module.exports = {
  deepFreeze,
  unitsToMicro,
  microToCents,
  mapGridPays,
  mapPays,
  gridPayTier,
  clusterTier,
  scatterTopTier,
  assertInteger
};
