'use strict';

/**
 * Modo autonomo local (`TG_DEMO_OPERATOR_VIRTUAL=1`).
 *
 * Este archivo se ejecuta como un proceso de test independiente (node --test),
 * asi que puede fijar el entorno ANTES de cargar `server/config.js` y comprobar
 * que el flag gana a cualquier configuracion externa:
 *
 *   - DB_DRIVER=supabase + credenciales  -> se fuerza `memory`.
 *   - DEMO_MODE_ENABLED=false            -> se fuerza `true`.
 *   - ALLOW_DEV_SESSION=false            -> se fuerza `true` (fuera de prod).
 *   - API_CONNECT_ORIGINS=<host externo> -> se ignora; la CSP queda en 'self'.
 *
 * El resto de la suite corre con el flag apagado (`test/helpers/env.js`), de
 * modo que aqui se cubre exactamente el camino del operador virtual.
 */

require('./helpers/env');

process.env.TG_DEMO_OPERATOR_VIRTUAL = '1';
process.env.DB_DRIVER = 'supabase';
process.env.SUPABASE_URL = 'https://proyecto-de-prueba.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba';
process.env.DEMO_MODE_ENABLED = 'false';
process.env.ALLOW_DEV_SESSION = 'false';
process.env.API_CONNECT_ORIGINS = 'https://motor-externo.example.net';

const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../server/config');
const store = require('../server/db');
const { demoWallet } = require('../server/services/demoWallet');
const { startServer, createClient } = require('./helpers/server');

let server;
let request;

test.before(async () => {
  server = await startServer();
  request = createClient(server.baseUrl);
});

test.after(async () => {
  await server.close();
});

test.beforeEach(() => {
  store.__reset();
  demoWallet.reset();
});

/* -------------------------------------------------------------------------- */
/*  Configuracion forzada                                                     */
/* -------------------------------------------------------------------------- */

test('fuerza persistencia en memoria aunque DB_DRIVER apunte a Supabase', () => {
  assert.equal(config.db.driver, 'memory');
  assert.equal(config.isProduction, false);
});

test('fuerza la billetera virtual aunque DEMO_MODE_ENABLED=false', () => {
  assert.equal(config.demo.enabled, true);
  assert.equal(config.demo.startBalanceCents, 100000);
  assert.equal(config.demo.currency, 'VES');
});

test('permite emitir sesion local aunque ALLOW_DEV_SESSION=false', () => {
  assert.equal(config.session.allowDevSession, true);
});

test('ignora los origenes externos: la CSP solo permite el propio origen', () => {
  assert.deepEqual(config.api.connectOrigins, []);
});

test('publica el modo del operador virtual', () => {
  assert.deepEqual(config.operator, {
    virtualDemo: true,
    mode: 'LOCAL_VIRTUAL_DEMO',
    localEngineOnly: true,
    externalEngineAllowed: false
  });
});

/* -------------------------------------------------------------------------- */
/*  Superficie HTTP                                                           */
/* -------------------------------------------------------------------------- */

test('GET /api/health anuncia el modo autonomo y el driver en memoria', async () => {
  const response = await request('GET', '/api/health');

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.dbDriver, 'memory');
  assert.deepEqual(response.body.operator, {
    mode: 'LOCAL_VIRTUAL_DEMO',
    virtualDemo: true,
    localEngineOnly: true,
    virtualWallet: true
  });
});

test('la CSP del documento no permite llamar a ningun motor externo', async () => {
  const response = await request('GET', '/');
  const csp = response.headers.get('content-security-policy') || '';

  assert.match(csp, /connect-src 'self'/);
  assert.equal(csp.includes('motor-externo.example.net'), false);
  assert.equal(csp.includes('engine.latingames.net'), false);
});

test('una ronda completa se liquida en la cartera virtual sin tocar la base', async () => {
  const session = await request('POST', '/api/demo/session', {
    body: { playerId: 'invitado_demo' }
  });

  assert.equal(session.status, 200, session.text);
  assert.equal(session.body.demo, true);
  assert.equal(session.body.balance.cents, 100000);

  const spin = await request('POST', '/api/spin', {
    token: session.body.token,
    body: { betCents: 100, clientSeed: 'operador-virtual-1', roundRef: 'operador-virtual-1' }
  });

  assert.equal(spin.status, 200, spin.text);
  assert.equal(spin.body.demo, true);
  assert.equal(spin.body.audit.certifiedRtp, 0.9508);
  assert.equal(
    spin.body.balance.cents,
    100000 - spin.body.wagerCents + spin.body.totalWinCents
  );

  const snapshot = store.__snapshot();
  assert.equal(snapshot.rounds.length, 0);
  assert.equal(snapshot.ledger.length, 0);
});

/* -------------------------------------------------------------------------- */
/*  Guarda de produccion                                                      */
/* -------------------------------------------------------------------------- */

test('en produccion el modo autonomo aborta el arranque', () => {
  const configPath = require.resolve('../server/config');
  const previous = process.env.NODE_ENV;
  delete require.cache[configPath];
  process.env.NODE_ENV = 'production';

  try {
    assert.throws(
      () => require('../server/config'),
      /TG_DEMO_OPERATOR_VIRTUAL=1 es solo para desarrollo local/
    );
  } finally {
    process.env.NODE_ENV = previous;
    delete require.cache[configPath];
  }
});
