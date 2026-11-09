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
 * Variables que un despliegue de produccion CON persistencia real necesita ver
 * DEFINIDAS (en un despliegue demo autonomo las de Supabase son opcionales).
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
 * Es un modo de DESARROLLO. Con `NODE_ENV=production` solo se admite si NO hay
 * credenciales de Supabase (despliegue demo autonomo); si las hay, el arranque
 * falla porque es una configuracion contradictoria.
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
 * Despliegue autonomo de demostracion ("demo sin base de datos").
 *
 * Permite publicar el juego en Vercel (o cualquier hosting) SIN Supabase: la
 * interfaz se sirve igual y la API resuelve todas las rondas en la cartera
 * virtual en memoria. Se activa cuando el modo "Fichas de Prueba" esta
 * habilitado y NO hay credenciales reales:
 *
 *   DEMO_MODE_ENABLED=true  +  sin SUPABASE_URL/SERVICE_ROLE_KEY  ->  demo
 *
 * En ese caso `NODE_ENV=production` ya NO bloquea el arranque (antes un driver
 * `memory` en produccion era un error fatal). La base de datos real no se toca
 * nunca: el 100% de las rondas se liquida en `demoWallet`.
 *
 * Para exigir persistencia real basta con definir las credenciales de Supabase
 * (el modo demo se desactiva solo) o `DEMO_MODE_ENABLED=false`.
 */
const STANDALONE_DEMO = DEMO_MODE_ENABLED && !supabaseConfigured;

/**
 * Nombres obligatorios que llegan vacios o sin definir.
 *
 * Es diagnostico, no bloqueo: `server.js` los publica como `error.missing` en
 * el 503 `CONFIG_INVALID`. En modo demo autonomo las credenciales de Supabase
 * son opcionales, asi que no se nombran como ausentes.
 */
const missingEnv = REQUIRED_ENV.filter(
  (name) =>
    str(name) === '' &&
    !(
      STANDALONE_DEMO &&
      (name === 'SUPABASE_URL' || name === 'SUPABASE_SERVICE_ROLE_KEY')
    )
);

/**
 * Driver de persistencia:
 *   - "supabase": produccion (debito/credito atomico via RPC).
 *   - "memory":   el saldo vive en RAM y se pierde al reiniciar. Se activa
 *                 automaticamente si no hay credenciales, si
 *                 `TG_DEMO_OPERATOR_VIRTUAL=1` o en un despliegue demo autonomo.
 */
const DB_DRIVER = TG_DEMO_OPERATOR_VIRTUAL || STANDALONE_DEMO
  ? 'memory'
  : str('DB_DRIVER', supabaseConfigured ? 'supabase' : 'memory');

const problems = [];
const warnings = [];

/*
 * En modo demo autonomo se ignora cualquier `DB_DRIVER` heredado del entorno:
 * la liquidacion ocurre en memoria por diseno, no por accidente.
 */
if (STANDALONE_DEMO && str('DB_DRIVER') !== '' && str('DB_DRIVER') !== 'memory') {
  warnings.push(
    `DB_DRIVER=${str('DB_DRIVER')} se ignora: el modo demo autonomo liquida en memoria`
  );
}
if (STANDALONE_DEMO) {
  warnings.push(
    IS_PRODUCTION
      ? 'Despliegue autonomo de DEMOSTRACION en produccion: sin Supabase, ' +
          'saldos virtuales en memoria y "Fichas de Prueba" habilitadas'
      : 'Modo demo autonomo: los saldos viven en memoria (sin Supabase)'
  );
}

/*
 * Persistencia real: solo se exige cuando el despliegue NO es una demo
 * autonoma. Con `DEMO_MODE_ENABLED=true` y sin credenciales el driver en
 * memoria es una decision de producto valida (Vercel sin Supabase).
 */
if (!STANDALONE_DEMO) {
  if (DB_DRIVER === 'supabase' && !supabaseConfigured) {
    problems.push(
      `DB_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ` +
        `(faltan: ${missingSupabaseEnv.join(', ')})`
    );
  }
  if (DB_DRIVER === 'memory' && IS_PRODUCTION) {
    problems.push(
      'DB_DRIVER=memory esta prohibido con NODE_ENV=production ' +
        '(define DEMO_MODE_ENABLED=true para publicar una demo sin Supabase)'
    );
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
}
if (TG_DEMO_OPERATOR_VIRTUAL && IS_PRODUCTION && !STANDALONE_DEMO) {
  problems.push(
    'TG_DEMO_OPERATOR_VIRTUAL=1 es solo para desarrollo local: con SUPABASE_URL y ' +
      'SUPABASE_SERVICE_ROLE_KEY definidas el motor debe usarlas ' +
      '(quita el flag o las credenciales)'
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

/*
 * Avisos: no bloquean el arranque, pero un despliegue demo en produccion debe
 * quedar registrado en los Runtime Logs (el driver en memoria no persiste).
 */
if (warnings.length > 0) {
  // eslint-disable-next-line no-console
  console.warn(`[config] ${warnings.join('\n  - ')}`);
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
    /**
     * `true` = demo autonoma: no hay Supabase configurado y todas las rondas se
     * liquidan en memoria. Es el modo de un despliegue de demostracion (Vercel).
     */
    standalone: STANDALONE_DEMO,
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
   *
   * `mode: 'STANDALONE_DEMO'` identifica el despliegue demo sin base de datos
   * (Vercel sin Supabase): interface estatica + cartera virtual en memoria.
   */
  operator: Object.freeze({
    virtualDemo: TG_DEMO_OPERATOR_VIRTUAL,
    mode: TG_DEMO_OPERATOR_VIRTUAL
      ? 'LOCAL_VIRTUAL_DEMO'
      : STANDALONE_DEMO
        ? 'STANDALONE_DEMO'
        : 'STANDARD',
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
