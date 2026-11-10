'use strict';

/**
 * ============================================================================
 *  CONFIGURACION UNICA DEL JUEGO
 * ============================================================================
 *  Fuente de verdad para identidad, dimensiones, apuestas, limites, bonus y
 *  valores por defecto del entorno (incluido DEMO_MODE_ENABLED).
 *
 *  Reglas:
 *    - Solo datos: sin DOM, Express, base de datos, filesystem ni process.env.
 *    - Este archivo es CommonJS (lo consume `core/` y `server/`).
 *    - `ui/config/gameConfig.js` es un espejo ESM GENERADO para el cliente con
 *      `npm run build:config`; `public/ui/**` recibe la copia publicada. No
 *      editar esos archivos a mano.
 *    - Los valores de entorno reales se siguen leyendo en `server/config.js`;
 *      aqui viven sus DEFAULTS para que no haya copias en la logica.
 * ============================================================================
 */

/* ==========================================================================
 *  1. IDENTIDAD DEL JUEGO
 * ========================================================================== */

const GAME = Object.freeze({
  code: 'TROPICAL_GRID_6X5_95_10K',
  name: 'Tropical Grid 6x5',
  engineVersion: '1.1.0',
  paytableVersion: 'TG65-95-10K-v2'
});

/* ==========================================================================
 *  2. DIMENSIONES, SIMBOLOS Y TIRAS
 * ========================================================================== */

const GRID_COLS = 6;
const GRID_ROWS = 5;
const MIN_GRID_PAY_SIZE = 8;

const GRID = Object.freeze({
  cols: GRID_COLS,
  rows: GRID_ROWS,
  cells: GRID_COLS * GRID_ROWS, // 30
  minPaySize: MIN_GRID_PAY_SIZE,
  /* Alias heredado: el minimo de pago es el mismo (8 apariciones). */
  minClusterSize: MIN_GRID_PAY_SIZE,
  /* Tramos de pago por dispersion: 8-9 / 10-11 / 12+. */
  payTiers: Object.freeze([MIN_GRID_PAY_SIZE, 10, 12]),

  /* Tira fisica determinista (ver docs/MATH_MODEL.md). */
  stripLength: 120,
  stripRunLengths: Object.freeze([1, 1, 2, 2, 3, 3, 4]),
  stripSeed: 0x7f4a7c15
});

const SCATTER = 'SC';
const MULTIPLIER = 'MX';

const SYMBOLS = Object.freeze({
  scatter: SCATTER,
  multiplier: MULTIPLIER,
  regular: Object.freeze(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']),
  /* SCATTER y MULTIPLICADOR nunca se apilan (run = 1). */
  singleRun: Object.freeze([SCATTER, MULTIPLIER])
});

/* ==========================================================================
 *  3. APUESTAS Y LIMITES
 * ========================================================================== */

/** Escalera oficial de apuestas en creditos (validada por el backend). */
const BET_LADDER_CREDITS = Object.freeze([
  0.10, 0.20, 0.50, 1, 2, 5, 10, 20, 50, 100
]);

const DEFAULT_BET_CREDITS = 1;

const BETS = Object.freeze({
  ladderCredits: BET_LADDER_CREDITS,
  minCredits: BET_LADDER_CREDITS[0],
  maxCredits: BET_LADDER_CREDITS[BET_LADDER_CREDITS.length - 1],
  defaultCredits: DEFAULT_BET_CREDITS,
  defaultIndex: BET_LADDER_CREDITS.indexOf(DEFAULT_BET_CREDITS),
  /* Tiradas del boton Automatico en el cliente. */
  autoSpins: 10,
  /* Paquetes del selector de autogiro (boton AUTO): cantidades cerradas, nunca
     un numero libre. `autoSpins` sigue siendo el paquete por defecto. */
  quickSpins: Object.freeze([5, 10, 25])
});

const MAX_EXPOSURE_MULTIPLIER = 10000; // 10.000x
const MAX_FEATURE_SPINS = 10;
/** 1 unidad de apuesta = 10.000 micro-unidades (precision 0,0001x). */
const MICRO_PER_UNIT = 10000;

const LIMITS = Object.freeze({
  maxExposureMultiplier: MAX_EXPOSURE_MULTIPLIER,
  /* Tope de exposicion en micro-unidades de apuesta: 10.000x. */
  maxExposureMicro: MAX_EXPOSURE_MULTIPLIER * MICRO_PER_UNIT,
  maxCascadeSteps: 40,
  maxFeatureSpins: MAX_FEATURE_SPINS,
  /* Cotas internas del motor para evitar importes fuera de rango. */
  maxEngineAmountCents: 100000000
});

/* ==========================================================================
 *  4. BONUS Y RTP CERTIFICADO
 * ========================================================================== */

const FEATURE_CONFIG = Object.freeze({
  id: 'TROPICAL_FEVER',
  // El id se mantiene: es el identificador del modo bonus que ya viaja en la
  // config publica. El rotulo visible es el de la marca.
  label: 'Santa Crush',
  costMultiplier: 100, // 100x la apuesta base
  spins: MAX_FEATURE_SPINS
});

/**
 * RTP certificado por simulacion (ver docs/MATH_MODEL.md).
 * `base` y `feature` son el RTP medido sobre la apuesta; `*StandardError` y
 * `*Ci95` documentan la precision de la medicion (error estandar en puntos
 * porcentuales). Se actualiza solo al recalibrar; NUNCA en caliente.
 */
const CERTIFIED_RTP = Object.freeze({
  target: 0.95,
  base: 0.9508,
  feature: 0.9498,
  baseStandardError: 0.0037,
  featureStandardError: 0.0016,
  baseCi95: Object.freeze([0.9434, 0.9581]),
  featureCi95: Object.freeze([0.9466, 0.9530]),
  simulatedRoundsBase: 1000000,
  simulatedRoundsFeature: 500000,
  simulatedSpinsFeature: 5000000,
  calibratedAt: '2026-10-27'
});

/* ==========================================================================
 *  5. MODO DEMO Y DEFAULTS DE ENTORNO
 * ========================================================================== */

const DEMO_CONFIG = Object.freeze({
  enabledByDefault: true,
  guestId: 'invitado_demo',
  guestName: 'Invitado Demo',
  currency: 'VES',
  startBalanceCents: 100000, // 1.000,00
  sessionTtlMs: 30 * 60 * 1000,
  tokenTtlSeconds: 2 * 60 * 60,
  maxSessions: 2000,
  maxIdempotentRounds: 5
});

/**
 * Contrato del servicio HTTP del cliente.
 *
 * `baseUrl` vacio significa mismo origen (`/api/...`). Para usar el motor
 * externo basta con definir `https://engine.latingames.net` en el runtime del
 * navegador (`window.__TROPICAL_GRID__.apiBaseUrl`) o en
 * `<meta name="game-api-base" content="...">`; no hay que recompilar la UI.
 *
 * `connectOrigins` alimenta la CSP del backend y de Vercel. Si el motor cambia
 * de host, actualiza ambas cosas (config y cabeceras de despliegue).
 */
const API = Object.freeze({
  baseUrl: '',
  externalBaseUrl: 'https://engine.latingames.net',
  timeoutMs: 15000,
  connectOrigins: Object.freeze(['https://engine.latingames.net'])
});

/**
 * Defaults de variables de entorno. `server/config.js` lee `process.env` y usa
 * estos valores cuando la variable no esta definida; ningun otro modulo debe
 * repetir los numeros.
 */
const ENV_DEFAULTS = Object.freeze({
  NODE_ENV: 'development',
  PORT: 3000,
  ALLOWED_ORIGINS: Object.freeze(['http://localhost:3000', 'http://127.0.0.1:3000']),
  SUPABASE_SCHEMA: 'public',
  SESSION_TTL_SECONDS: 3600,
  ALLOW_DEV_SESSION: true,
  DEV_DEMO_PLAYER_ID: '00000000-0000-4000-8000-000000000001',

  /*
   * Modo autonomo local (operador virtual). El default es `false` para que en
   * produccion el backend siga exigiendo su driver real; el `.env` local lo
   * activa con 1 y `server/config.js` fuerza memoria + cartera virtual + CSP de
   * mismo origen.
   */
  TG_DEMO_OPERATOR_VIRTUAL: false,

  DEMO_MODE_ENABLED: DEMO_CONFIG.enabledByDefault,
  DEMO_GUEST_ID: DEMO_CONFIG.guestId,
  DEMO_GUEST_NAME: DEMO_CONFIG.guestName,
  DEMO_CURRENCY: DEMO_CONFIG.currency,
  DEMO_START_BALANCE_CENTS: DEMO_CONFIG.startBalanceCents,
  DEMO_SESSION_TTL_MS: DEMO_CONFIG.sessionTtlMs,
  DEMO_TOKEN_TTL_SECONDS: DEMO_CONFIG.tokenTtlSeconds,
  DEMO_MAX_SESSIONS: DEMO_CONFIG.maxSessions,
  DEMO_MAX_IDEMPOTENT_ROUNDS: DEMO_CONFIG.maxIdempotentRounds,

  MAX_EXPOSURE_MULTIPLIER,
  RATE_LIMIT_WINDOW_MS: 1000,
  RATE_LIMIT_MAX_REQUESTS: 12,
  MAX_BODY_BYTES: '8kb',
  IDEMPOTENCY_TTL_MS: 10 * 60 * 1000
});

/* ==========================================================================
 *  6. OBJETOS PUBLICOS Y EXPORTACIONES
 * ========================================================================== */

/** Configuracion que puede recibir el navegador (sin defaults de entorno). */
const PUBLIC_GAME_CONFIG = Object.freeze({
  game: GAME,
  grid: GRID,
  symbols: SYMBOLS,
  strips: Object.freeze({
    length: GRID.stripLength,
    runLengths: GRID.stripRunLengths,
    seed: GRID.stripSeed,
    singleRunSymbols: SYMBOLS.singleRun
  }),
  bets: BETS,
  limits: LIMITS,
  feature: FEATURE_CONFIG,
  rtp: CERTIFIED_RTP,
  demo: DEMO_CONFIG,
  api: API
});

/** Configuracion completa del backend (incluye defaults de entorno). */
const GAME_CONFIG = Object.freeze({
  ...PUBLIC_GAME_CONFIG,
  env: ENV_DEFAULTS
});

/**
 * Constantes planas compatibles con el contrato historico de `core/constants`.
 * Mantener los mismos nombres evita tocar las formulas del motor.
 */
const constants = Object.freeze({
  GAME_CODE: GAME.code,
  GAME_NAME: GAME.name,
  ENGINE_VERSION: GAME.engineVersion,
  PAYTABLE_VERSION: GAME.paytableVersion,

  GRID_COLS,
  GRID_ROWS,
  GRID_CELLS: GRID.cols * GRID.rows,
  MIN_GRID_PAY_SIZE,
  MIN_CLUSTER_SIZE: MIN_GRID_PAY_SIZE,

  MAX_EXPOSURE_MULTIPLIER: LIMITS.maxExposureMultiplier,
  MAX_CASCADE_STEPS: LIMITS.maxCascadeSteps,
  MAX_FEATURE_SPINS: LIMITS.maxFeatureSpins,
  MAX_ENGINE_AMOUNT_CENTS: LIMITS.maxEngineAmountCents,

  MICRO_PER_UNIT,
  MAX_EXPOSURE_MICRO: LIMITS.maxExposureMicro,

  SCATTER,
  MULTIPLIER,
  REGULAR_SYMBOLS: SYMBOLS.regular,
  BET_LADDER_CREDITS: BETS.ladderCredits,
  DEFAULT_BET_CREDITS: BETS.defaultCredits,
  DEFAULT_BET_INDEX: BETS.defaultIndex,
  AUTO_SPINS: BETS.autoSpins,

  STRIP_LENGTH: GRID.stripLength,
  STRIP_RUN_LENGTHS: GRID.stripRunLengths,
  STRIP_SEED: GRID.stripSeed,
  SINGLE_RUN_SYMBOLS: SYMBOLS.singleRun,

  FEATURE_CONFIG,
  CERTIFIED_RTP
});

module.exports = {
  GAME_CONFIG,
  PUBLIC_GAME_CONFIG,
  DEMO_CONFIG,
  ENV_DEFAULTS,

  /* API plana para `core/constants` y consumidores historicos. */
  ...constants,

  /**
   * Sub-objeto sin las constantes planas. Sirve para reexportar en el core sin
   * filtrar `GAME_CONFIG` ni metadatos de modulo.
   */
  constants
};
