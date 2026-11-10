'use strict';

/**
 * ============================================================================
 *  COMPATIBILIDAD - El PRNG offline vive en `core/fastRng.js`
 * ============================================================================
 *  Se conserva este alias para scripts/tests historicos. No contiene logica.
 * ============================================================================
 */

module.exports = require('../../core/fastRng');
