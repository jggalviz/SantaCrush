'use strict';

/**
 * ============================================================================
 *  Despliegue demo autonomo (Vercel sin Supabase)
 * ============================================================================
 *  El juego se publica sin base de datos: la interfaz se sirve igual y todas
 *  las rondas se liquidan en la cartera virtual en memoria. Estos tests fijan
 *  el entorno ANTES de cargar `server/config.js` (por eso viven en su propio
 *  archivo: `node --test` ejecuta cada uno en un proceso) y comprueban:
 *
 *    1. `NODE_ENV=production` + `DEMO_MODE_ENABLED=true` + sin credenciales
 *       arranca con driver `memory` (antes abortaba).
 *    2. Un `DB_DRIVER=supabase` heredado se ignora en ese modo.
 *    3. Con credenciales reales la persistencia NO se degrada a memoria.
 *    4. Sin modo demo, la produccion sigue siendo fail-fast (contrato intacto).
 *    5. El 503 deja de pedir Supabase cuando la demo es autonoma.
 * ============================================================================
 */

require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');

const CONFIG_PATH = require.resolve('../server/config');

/** Variables que controla este archivo; se restauran despues de cada carga. */
const MANAGED_ENV = [
  'NODE_ENV',
  'DEMO_MODE_ENABLED',
  'DB_DRIVER',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TG_DEMO_OPERATOR_VIRTUAL',
  'ALLOW_DEV_SESSION',
  'SESSION_SECRET'
];

/**
 * Carga `server/config.js` con las variables indicadas y devuelve la
 * configuracion congelada o el Error `CONFIG_INVALID`, sin dejar rastro en
 * `process.env` ni en `require.cache`.
 */
function loadConfig(overrides = {}) {
  const saved = new Map(MANAGED_ENV.map((name) => [name, process.env[name]]));

  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  delete require.cache[CONFIG_PATH];
  try {
    return { config: require('../server/config') };
  } catch (error) {
    return { error };
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    delete require.cache[CONFIG_PATH];
  }
}

/** Entorno base: produccion sin Supabase y con "Fichas de Prueba" al gusto. */
function productionDemoEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    DEMO_MODE_ENABLED: 'true',
    DB_DRIVER: 'memory',
    SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    TG_DEMO_OPERATOR_VIRTUAL: '0',
    ALLOW_DEV_SESSION: 'false',
    SESSION_SECRET:
      '6f1d8b2a4c9e7053bd81f6a2e35c47890ab12de34f5c6057e8d9a1b2c3d4e5f6',
    ...overrides
  };
}

/* -------------------------------------------------------------------------- */
/*  Modo demo autonomo                                                        */
/* -------------------------------------------------------------------------- */

test('en produccion, con Fichas de Prueba y sin Supabase arranca en memoria', () => {
  const { config, error } = loadConfig(productionDemoEnv());

  assert.equal(error, undefined, error && error.message);
  assert.equal(config.isProduction, true);
  assert.equal(config.db.driver, 'memory');
  assert.equal(config.demo.enabled, true);
  assert.equal(config.demo.standalone, true);
  /* `/api/health` lo publica tal cual para verificar el despliegue. */
  assert.equal(config.operator.mode, 'STANDALONE_DEMO');
  /* El modo demo nunca emite sesiones de jugador real. */
  assert.equal(config.session.allowDevSession, false);
});

test('ignora un DB_DRIVER=supabase heredado cuando no hay credenciales', () => {
  const { config, error } = loadConfig(productionDemoEnv({ DB_DRIVER: 'supabase' }));

  assert.equal(error, undefined, error && error.message);
  assert.equal(config.db.driver, 'memory');
  assert.equal(config.demo.standalone, true);
});

test('con credenciales reales el modo demo no degrada la persistencia', () => {
  const { config, error } = loadConfig(
    productionDemoEnv({
      DB_DRIVER: 'supabase',
      SUPABASE_URL: 'https://proyecto-de-prueba.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba'
    })
  );

  assert.equal(error, undefined, error && error.message);
  assert.equal(config.db.driver, 'supabase');
  assert.equal(config.demo.standalone, false);
  assert.equal(config.operator.mode, 'STANDARD');
});


/* -------------------------------------------------------------------------- */
/*  El contrato estricto sigue intacto                                        */
/* -------------------------------------------------------------------------- */

test('sin Fichas de Prueba la produccion sigue siendo fail-fast', () => {
  const { error } = loadConfig(productionDemoEnv({ DEMO_MODE_ENABLED: 'false' }));

  assert.ok(error, 'la configuracion debe abortar');
  assert.equal(error.code, 'CONFIG_INVALID');
  assert.equal(
    error.problems.some((problem) =>
      problem.includes('DB_DRIVER=memory esta prohibido con NODE_ENV=production')
    ),
    true
  );
  /* Y el diagnostico sigue nombrando las credenciales ausentes. */
  assert.deepEqual(error.missingEnv, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
});

test('en modo demo el 503 no pide Supabase: solo lo que de verdad falta', () => {
  const { error } = loadConfig(productionDemoEnv({ SESSION_SECRET: '' }));

  assert.ok(error, 'la configuracion debe abortar');
  assert.equal(error.code, 'CONFIG_INVALID');
  assert.equal(
    error.problems.some((problem) => problem.includes('SESSION_SECRET')),
    true
  );
  assert.deepEqual(error.missingEnv, ['SESSION_SECRET']);
});

/* -------------------------------------------------------------------------- */
/*  Modo autonomo local en produccion                                         */
/* -------------------------------------------------------------------------- */

test('el modo autonomo local tambien arranca en produccion sin credenciales', () => {
  const { config, error } = loadConfig(
    productionDemoEnv({
      TG_DEMO_OPERATOR_VIRTUAL: '1',
      DEMO_MODE_ENABLED: 'false',
      DB_DRIVER: 'supabase',
      ALLOW_DEV_SESSION: 'true'
    })
  );

  assert.equal(error, undefined, error && error.message);
  assert.equal(config.db.driver, 'memory');
  assert.equal(config.demo.enabled, true);
  assert.deepEqual(config.api.connectOrigins, []);
  /* Ni siquiera el flag autonomo habilita sesiones reales en produccion. */
  assert.equal(config.session.allowDevSession, false);
});

