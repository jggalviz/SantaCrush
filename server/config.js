'use strict';

/**
 * Configuracion central del backend.
 * Se valida al arrancar: si falta algo critico en produccion, el proceso no
 * levanta (fail-fast) en lugar de arrancar en un estado inseguro.
 */

const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { GAME_CONFIG } = require('../config/gameConfig');

const GAME_ENV = GAME_CONFIG.env;
const GAME_LIMITS = GAME_CONFIG.limits;
const GAME_DEMO = GAME_CONFIG.demo;
const GAME_API = GAME_CONFIG.api;

const NODE_ENV = process.env.NODE_ENV || GAME_ENV.NODE_ENV;
const IS_PRODUCTION = NODE_ENV === 'production';

function str(name, fallback = '') {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  return raw.trim();
}

function int(name, fallback) {
  const raw = str(name);
  if (raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name, fallback) {
  const raw = str(name).toLowerCase();
  if (raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function list(name, fallback) {
  const raw = str(name);
  if (raw === '') return fallback;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

const SUPABASE_URL = str('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = str('SUPABASE_SERVICE_ROLE_KEY');
const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const SESSION_SECRET = str('SESSION_SECRET');

/**
 * Variables que un despliegue de produccion necesita ver DEFINIDAS.
 *
 * Se usa solo para diagnostico: cuando el arranque aborta, `server.js` publica
 * los NOMBRES ausentes (`missingEnv`) en el cuerpo del 503 `CONFIG_INVALID`.
 * El valor de una variable nunca sale de este modulo.
 */
const REQUIRED_ENV = Object.freeze([
  'DB_DRIVER',
  'SESSION_SECRET',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ALLOW_DEV_SESSION'
]);

/** Nombres obligatorios que llegan vacios o sin definir. */
const missingEnv = REQUIRED_ENV.filter((name) => str(name) === '');

/** Credenciales de Supabase ausentes (para nombrarlas en el diagnostico). */
const missingSupabaseEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(
  (name) => str(name) === ''
);

/**
 * Modo autonomo local ("operador virtual").
 *
 * Con `TG_DEMO_OPERATOR_VIRTUAL=1` el backend no depende de nada externo:
 *   - `DB_DRIVER` se fuerza a `memory` (se ignoran las credenciales Supabase).
 *   - `DEMO_MODE_ENABLED` se fuerza a `true`: la cartera VIRTUAL atiende todas
 *     las rondas y nunca escribe en una base de datos.
 *   - `ALLOW_DEV_SESSION` se fuerza a `true` (solo fuera de produccion) para
 *     poder emitir sesion local sin IdP.
 *   - `api.connectOrigins` queda vacio: la CSP solo permite `'self'`, de modo
 *     que el navegador no puede llamar a un motor externo.
 *
 * Es un modo de DESARROLLO: con `NODE_ENV=production` el arranque falla.
 */
const TG_DEMO_OPERATOR_VIRTUAL = bool(
  'TG_DEMO_OPERATOR_VIRTUAL',
  GAME_ENV.TG_DEMO_OPERATOR_VIRTUAL
);

const ALLOW_DEV_SESSION = TG_DEMO_OPERATOR_VIRTUAL
  ? !IS_PRODUCTION
  : bool('ALLOW_DEV_SESSION', IS_PRODUCTION ? false : GAME_ENV.ALLOW_DEV_SESSION);


/**
 * Modo "Fichas de Prueba" (jugar gratis).
 *
 * No es una sesion de jugador real: el backend emite un token firmado con el
 * claim `demo: true` y liquida las rondas en una cartera VIRTUAL en memoria.
 * Nunca se escribe en la base de datos de Supabase ni se mueve dinero real.
 */
const DEMO_MODE_ENABLED = TG_DEMO_OPERATOR_VIRTUAL
  ? true
  : bool('DEMO_MODE_ENABLED', GAME_ENV.DEMO_MODE_ENABLED);
const DEMO_START_BALANCE_CENTS = int(
  'DEMO_START_BALANCE_CENTS',
  GAME_ENV.DEMO_START_BALANCE_CENTS
);
const DEMO_SESSION_TTL_MS = int('DEMO_SESSION_TTL_MS', GAME_ENV.DEMO_SESSION_TTL_MS);
const DEMO_TOKEN_TTL_SECONDS = int(
  'DEMO_TOKEN_TTL_SECONDS',
  GAME_ENV.DEMO_TOKEN_TTL_SECONDS
);
const DEMO_MAX_SESSIONS = int('DEMO_MAX_SESSIONS', GAME_ENV.DEMO_MAX_SESSIONS);
const DEMO_MAX_IDEMPOTENT_ROUNDS = int(
  'DEMO_MAX_IDEMPOTENT_ROUNDS',
  GAME_ENV.DEMO_MAX_IDEMPOTENT_ROUNDS
);

/**
 * Driver de persistencia:
 *   - "supabase": produccion (debito/credito atomico via RPC).
 *   - "memory":   solo desarrollo local; el saldo vive en RAM y se pierde al
 *                 reiniciar. Se activa automaticamente si no hay credenciales
 *                 o si `TG_DEMO_OPERATOR_VIRTUAL=1`.
 */
const DB_DRIVER = TG_DEMO_OPERATOR_VIRTUAL
  ? 'memory'
  : str('DB_DRIVER', supabaseConfigured ? 'supabase' : 'memory');

const problems = [];

if (DB_DRIVER === 'supabase' && !supabaseConfigured) {
  problems.push(
    `DB_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ` +
      `(faltan: ${missingSupabaseEnv.join(', ')})`
  );
}
if (DB_DRIVER === 'memory' && IS_PRODUCTION) {
  problems.push('DB_DRIVER=memory esta prohibido con NODE_ENV=production');
}
if (IS_PRODUCTION && !supabaseConfigured && DB_DRIVER !== 'supabase') {
  // Sin credenciales el driver cae a memoria; se nombra la causa real para que
  // el 503 no parezca un problema de codigo.
  problems.push(
    `En produccion faltan las credenciales de Supabase (${missingSupabaseEnv.join(
      ', '
    )}); sin ellas el driver cae a memoria`
  );
}
if (TG_DEMO_OPERATOR_VIRTUAL && IS_PRODUCTION) {
  problems.push(
    'TG_DEMO_OPERATOR_VIRTUAL=1 es solo para desarrollo local: en produccion el motor debe usar Supabase'
  );
}
if (DB_DRIVER === 'supabase' && /^https?:\/\/.*\.supabase\.co\/?$/.test(SUPABASE_URL) === false) {
  problems.push('SUPABASE_URL no parece una URL de proyecto valida');
}
if (!/^[0-9a-f]{64}$/i.test(SESSION_SECRET)) {
  problems.push('SESSION_SECRET debe ser hexadecimal de 64 caracteres (32 bytes)');
}
if (IS_PRODUCTION && ALLOW_DEV_SESSION) {
  problems.push('ALLOW_DEV_SESSION debe ser false en produccion (el token debe venir de tu IdP)');
}
if (DEMO_MODE_ENABLED && DEMO_START_BALANCE_CENTS <= 0) {
  problems.push('DEMO_START_BALANCE_CENTS debe ser un entero positivo');
}
if (DEMO_MODE_ENABLED && (DEMO_SESSION_TTL_MS < 60000 || DEMO_TOKEN_TTL_SECONDS < 60)) {
  problems.push('El TTL del modo demo es demasiado corto (minimo 60 s de sesion y de token)');
}
if (DEMO_MAX_SESSIONS < 1 || DEMO_MAX_IDEMPOTENT_ROUNDS < 1) {
  problems.push('DEMO_MAX_SESSIONS y DEMO_MAX_IDEMPOTENT_ROUNDS deben ser >= 1');
}

if (problems.length > 0) {
  const message = `Configuracion invalida:\n  - ${problems.join('\n  - ')}`;
  if (IS_PRODUCTION || process.env.NODE_ENV === 'test') {
    /**
     * El error viaja con el diagnostico estructurado para que el entrypoint de
     * Vercel (`server.js`) pueda publicarlo en el 503 sin releer `process.env`
     * y sin exponer valores: `problems` son mensajes y `missingEnv` son
     * NOMBRES de variables.
     */
    const error = new Error(message);
    error.code = 'CONFIG_INVALID';
    error.problems = Object.freeze([...problems]);
    error.missingEnv = Object.freeze([...missingEnv]);
    throw error;
  }
  // En desarrollo se avisa pero se permite continuar con valores por defecto.
  // eslint-disable-next-line no-console
  console.warn(`[config] ${message}`);
}

const config = Object.freeze({
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  port: int('PORT', GAME_ENV.PORT),
  allowedOrigins: list('ALLOWED_ORIGINS', GAME_ENV.ALLOWED_ORIGINS),
  db: Object.freeze({
    driver: DB_DRIVER,
    supabaseUrl: SUPABASE_URL,
    supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    schema: str('SUPABASE_SCHEMA', GAME_ENV.SUPABASE_SCHEMA)
  }),
  session: Object.freeze({
    secret: SESSION_SECRET,
    ttlSeconds: int('SESSION_TTL_SECONDS', GAME_ENV.SESSION_TTL_SECONDS),
    allowDevSession: ALLOW_DEV_SESSION,
    devDemoPlayerId: str('DEV_DEMO_PLAYER_ID', GAME_ENV.DEV_DEMO_PLAYER_ID)
  }),
  demo: Object.freeze({
    enabled: DEMO_MODE_ENABLED,
    guestId: str('DEMO_GUEST_ID', GAME_DEMO.guestId),
    guestName: str('DEMO_GUEST_NAME', GAME_DEMO.guestName),
    currency: str('DEMO_CURRENCY', GAME_DEMO.currency),
    startBalanceCents: DEMO_START_BALANCE_CENTS,
    sessionTtlMs: DEMO_SESSION_TTL_MS,
    tokenTtlSeconds: DEMO_TOKEN_TTL_SECONDS,
    maxSessions: DEMO_MAX_SESSIONS,
    maxIdempotentRounds: DEMO_MAX_IDEMPOTENT_ROUNDS
  }),
  /**
   * Modo del operador.
   *
   * `virtualDemo: true` (TG_DEMO_OPERATOR_VIRTUAL=1) significa backend
   * autonomo: el motor matematico corre en este mismo proceso, la cartera es
   * virtual y el cliente solo puede llamar a `'self'`. Se publica en
   * `/api/health` para poder verificar el entorno de un vistazo.
   */
  operator: Object.freeze({
    virtualDemo: TG_DEMO_OPERATOR_VIRTUAL,
    mode: TG_DEMO_OPERATOR_VIRTUAL ? 'LOCAL_VIRTUAL_DEMO' : 'STANDARD',
    localEngineOnly: TG_DEMO_OPERATOR_VIRTUAL,
    externalEngineAllowed: !TG_DEMO_OPERATOR_VIRTUAL
  }),
  /* Origenes del motor externo permitidos por la CSP (connect-src). */
  api: Object.freeze({
    /* En modo autonomo la CSP solo admite el propio origen (`'self'`). */
    connectOrigins: Object.freeze(
      TG_DEMO_OPERATOR_VIRTUAL
        ? []
        : [...new Set([...GAME_API.connectOrigins, ...list('API_CONNECT_ORIGINS', [])])]
    )
  }),
  limits: Object.freeze({
    maxExposureMultiplier: int(
      'MAX_EXPOSURE_MULTIPLIER',
      GAME_LIMITS.maxExposureMultiplier
    ),
    rateLimitWindowMs: int('RATE_LIMIT_WINDOW_MS', GAME_ENV.RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: int(
      'RATE_LIMIT_MAX_REQUESTS',
      GAME_ENV.RATE_LIMIT_MAX_REQUESTS
    ),
    maxBodyBytes: str('MAX_BODY_BYTES', GAME_ENV.MAX_BODY_BYTES),
    idempotencyTtlMs: int('IDEMPOTENCY_TTL_MS', GAME_ENV.IDEMPOTENCY_TTL_MS)
  })
});

module.exports = config;
