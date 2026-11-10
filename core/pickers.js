'use strict';

/* ==========================================================================
 *  4. TIRAS VIRTUALES PONDERADAS
 * ========================================================================== */

/**
 * Compila una tabla de pesos en una estructura de busqueda binaria acumulada.
 * @param {Record<string, number>} weights
 */
function compilePicker(weights) {
  const keys = Object.keys(weights);
  const symbols = [];
  const cumulative = [];
  let total = 0;
  for (const key of keys) {
    const weight = weights[key];
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new Error(`Peso invalido para ${key}: ${weight}`);
    }
    if (weight === 0) continue;
    total += weight;
    symbols.push(key);
    cumulative.push(total);
  }
  if (total <= 0) throw new Error('La tabla de pesos no puede estar vacia.');
  return Object.freeze({
    symbols: Object.freeze(symbols),
    cumulative: Object.freeze(cumulative),
    total
  });
}

/** Selecciona una clave con probabilidad proporcional a su peso. */
function pickWeighted(picker, rng) {
  const ticket = rng.int(picker.total);
  let low = 0;
  let high = picker.cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (ticket < picker.cumulative[mid]) high = mid;
    else low = mid + 1;
  }
  return picker.symbols[low];
}

/** Compila la tabla de valores de bomba (2x..250x) con pesos acumulados. */
function compileMultiplierPicker(table) {
  const values = [];
  const cumulative = [];
  let total = 0;
  for (const key of Object.keys(table)) {
    const value = Number(key);
    const weight = table[key];
    if (!Number.isSafeInteger(value) || value < 2 || value > 250) {
      throw new Error(`Valor de multiplicador fuera de [2,250]: ${key}`);
    }
    total += weight;
    values.push(value);
    cumulative.push(total);
  }
  return Object.freeze({ values: Object.freeze(values), cumulative: Object.freeze(cumulative), total });
}

function pickMultiplier(picker, rng) {
  const ticket = rng.int(picker.total);
  let low = 0;
  let high = picker.cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (ticket < picker.cumulative[mid]) high = mid;
    else low = mid + 1;
  }
  return picker.values[low];
}

module.exports = {
  compilePicker,
  pickWeighted,
  compileMultiplierPicker,
  pickMultiplier
};
