'use strict';

const crypto = require('node:crypto');

const { ENGINE_VERSION } = require('./constants');

/* ==========================================================================
 *  3. GENERADOR ALEATORIO CRIPTOGRAFICO (CSPRNG / HMAC-DRBG)
 *     - Semilla: crypto.randomBytes(32) -> 256 bits de entropia.
 *     - Flujo: HMAC-SHA256(serverSeed, `${clientSeed}:${counter}`).
 *     - Muestreo por rechazo: elimina el sesgo modular (GLI-19 3.2.1).
 * ========================================================================== */

const UINT32_RANGE = 0x100000000; // 2^32
const DRBG_MAX_BLOCKS = 0x7fffffff;

/**
 * Crea el flujo aleatorio determinista de la ronda.
 * @param {{serverSeed: string, clientSeed: string}} seeds
 * @returns {{int: (maxExclusive:number)=>number, float: ()=>number,
 *            draws: ()=>number, getState: ()=>{counter:number}}}
 */
function createRng({ serverSeed, clientSeed }) {
  if (typeof serverSeed !== 'string' || !/^[0-9a-f]{64}$/i.test(serverSeed)) {
    throw new Error('serverSeed debe ser 32 bytes en hexadecimal (64 chars).');
  }
  const clientSeedText = typeof clientSeed === 'string' && clientSeed.length > 0
    ? clientSeed
    : 'default-client-seed';

  const key = Buffer.from(serverSeed, 'hex');
  const data = Buffer.from(clientSeedText, 'utf8');
  const mac = crypto.createHmac('sha256', key);
  mac.update(data);
  mac.update(Buffer.from(':0', 'utf8'));
  let block = mac.digest();
  let offset = 0;
  let blockCounter = 1;
  let draws = 0;

  function nextUint32() {
    if (offset + 4 > block.length) {
      if (blockCounter > DRBG_MAX_BLOCKS) {
        throw new Error('DRBG agotado: limite de bloques excedido.');
      }
      const h = crypto.createHmac('sha256', key);
      h.update(data);
      h.update(Buffer.from(`:${blockCounter}`, 'utf8'));
      block = h.digest();
      offset = 0;
      blockCounter += 1;
    }
    const value = block.readUInt32BE(offset);
    offset += 4;
    draws += 1;
    return value;
  }

  /**
   * Entero uniforme en [0, maxExclusive). Rechazo sobre el mayor multiplo
   * de maxExclusive que cabe en 2^32.
   */
  function int(maxExclusive) {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > UINT32_RANGE) {
      throw new RangeError(`int(maxExclusive=${maxExclusive}) fuera de rango.`);
    }
    if (maxExclusive === 1) return 0;
    const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
    let sample;
    do {
      sample = nextUint32();
    } while (sample >= limit);
    return sample % maxExclusive;
  }

  return {
    int,
    float: () => int(UINT32_RANGE) / UINT32_RANGE,
    draws: () => draws,
    getState: () => ({ counter: blockCounter, offset, draws })
  };
}

/** Genera el par de semillas de una ronda con el CSPRNG del sistema. */
function createSeeds(clientSeed) {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  const safeClientSeed = normalizeClientSeed(clientSeed);
  const rngHash = crypto
    .createHash('sha256')
    .update(`${serverSeed}:${safeClientSeed}:${ENGINE_VERSION}`)
    .digest('hex');
  return {
    serverSeed,
    clientSeed: safeClientSeed,
    serverSeedHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    rngHash
  };
}

/** El client seed es informativo/auditoria; se sanea y acota a 64 chars. */
function normalizeClientSeed(clientSeed) {
  if (typeof clientSeed !== 'string') return crypto.randomBytes(16).toString('hex');
  const clean = clientSeed.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 64);
  return clean.length >= 4 ? clean : crypto.randomBytes(16).toString('hex');
}

/* --------------------------------------------------------------------------
 *  5.1 CONSTRUCCION DETERMINISTA DE LAS TIRAS
 *      mulberry32 (PRNG de construccion, NO de juego) genera siempre las
 *      mismas tiras a partir de STRIP_SEED. Las tiras son parte de las
 *      reglas del juego y se publican hasheadas en /api/game para auditoria.
 * -------------------------------------------------------------------------- */
function createStripRng(seed) {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(max) {
      return Math.floor(this.next() * max);
    }
  };
}

module.exports = {
  UINT32_RANGE,
  DRBG_MAX_BLOCKS,
  createRng,
  createSeeds,
  normalizeClientSeed,
  createStripRng
};
