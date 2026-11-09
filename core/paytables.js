'use strict';

/* --------------------------------------------------------------------------
 *  TABLA DE PAGOS POR DISPERSION  (en multiplos de la apuesta total)
 *  Clave = cantidad minima del tramo. Los tramos son EXACTAMENTE:
 *  8-9 / 10-11 / 12+
 *  El nombre CLUSTER_PAYS_UNITS se conserva por compatibilidad de API.
 * -------------------------------------------------------------------------- */
const GRID_PAYS_UNITS = Object.freeze({
  S1: Object.freeze({ 8: 0.0927, 10: 0.2313, 12: 0.5146 }),
  S2: Object.freeze({ 8: 0.1131, 10: 0.2833, 12: 0.6685 }),
  S3: Object.freeze({ 8: 0.1386, 10: 0.3342, 12: 0.8234 }),
  S4: Object.freeze({ 8: 0.1651, 10: 0.4117, 12: 0.9762 }),
  S5: Object.freeze({ 8: 0.2109, 10: 0.5146, 12: 1.1831 }),
  S6: Object.freeze({ 8: 0.267, 10: 0.6685, 12: 1.4908 }),
  S7: Object.freeze({ 8: 0.3393, 10: 0.8234, 12: 1.8505 }),
  S8: Object.freeze({ 8: 0.4535, 10: 1.1311, 12: 2.3641 }),
  S9: Object.freeze({ 8: 0.6063, 10: 1.4908, 12: 2.9806 })
});

/** Alias historico publicado por /api/game como `clusterPays`. */
const CLUSTER_PAYS_UNITS = GRID_PAYS_UNITS;

/** Pagos de scatter segun cantidad en la cuadricula inicial (multiplos). */
const SCATTER_PAYS_UNITS = Object.freeze({
  3: 7.6,
  4: 22.7,
  5: 75.4,
  6: 226
});

const BASE_WEIGHTS = Object.freeze({
  S1: 1700,
  S2: 1550,
  S3: 1400,
  S4: 1250,
  S5: 1100,
  S6: 1000,
  S7: 900,
  S8: 800,
  S9: 700,
  SC: 310,
  MX: 175
});

/** Pesos potenciados del modo TROPICAL FEVER (mas bombas, mismos pagos dispersos). */
const FEATURE_WEIGHTS = Object.freeze({
  S1: 1700,
  S2: 1550,
  S3: 1400,
  S4: 1250,
  S5: 1100,
  S6: 1000,
  S7: 900,
  S8: 800,
  S9: 700,
  SC: 310,
  MX: 1040
});

/* --------------------------------------------------------------------------
 *  1.3 TABLA DE VALORES DE BOMBA (2x..250x) - SESGADA AL RANGO BAJO
 *      Media base ~5,50x | Media feature ~15,25x
 * -------------------------------------------------------------------------- */
const BASE_MULTIPLIER_TABLE = Object.freeze({
  2: 2200,
  3: 2000,
  4: 1600,
  5: 1200,
  6: 900,
  8: 650,
  10: 450,
  12: 300,
  15: 220,
  20: 150,
  25: 90,
  50: 40,
  100: 12,
  250: 3
});

const FEATURE_MULTIPLIER_TABLE = Object.freeze({
  2: 450,
  3: 520,
  4: 620,
  5: 680,
  6: 730,
  8: 760,
  11: 780,
  13: 740,
  16: 690,
  21: 620,
  26: 520,
  52: 340,
  104: 143,
  250: 37
});

module.exports = {
  GRID_PAYS_UNITS,
  CLUSTER_PAYS_UNITS,
  SCATTER_PAYS_UNITS,
  BASE_WEIGHTS,
  FEATURE_WEIGHTS,
  BASE_MULTIPLIER_TABLE,
  FEATURE_MULTIPLIER_TABLE
};
