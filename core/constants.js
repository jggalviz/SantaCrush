'use strict';

/**
 * Constantes del motor matematico.
 *
 * La definicion vive en `config/gameConfig.js` para que core, servidor y
 * cliente compartan una unica fuente de verdad. Este modulo conserva el
 * contrato historico (`require('./constants')`) y no contiene valores propios.
 */

module.exports = require('../config/gameConfig').constants;

