'use strict';

/**
 * ============================================================================
 *  COMPATIBILIDAD - El motor matematico vive en `core/`
 * ============================================================================
 *  Este archivo se conserva unicamente para no romper consumidores historicos
 *  que importaban `server/engine/gridEngine`. No contiene logica de juego.
 *
 *  Ruta recomendada: `require('../../core')` desde `server/` o
 *  `require('./core')` desde la raiz del proyecto.
 * ============================================================================
 */

module.exports = require('../../core');
