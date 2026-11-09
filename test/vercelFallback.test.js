'use strict';

/**
 * ============================================================================
 *  Entrypoint de Vercel (`server.js`) con configuracion invalida
 * ============================================================================
 *  Cuando `server/config.js` aborta, el entrypoint NO debe devolver un 500
 *  opaco: publica un 503 `CONFIG_INVALID` con `error.problems` (mensajes) y
 *  `error.missing` (NOMBRES de variables). Estos tests arrancan `server.js` en
 *  un proceso hijo (igual que la funcion serverless) para verificar:
 *
 *    1. Que el detalle concreto llega al cliente, no solo a Runtime Logs.
 *    2. Que el 503 ya no afirma que faltan secretos cuando el problema real es
 *       otro (por ejemplo `TG_DEMO_OPERATOR_VIRTUAL=1` en produccion).
 *    3. Que ningun VALOR de `process.env` se filtra en la respuesta.
 * ============================================================================
 */

require('./helpers/env');

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const ENTRY = path.join(ROOT, 'server.js');

/** Variable centinela: si aparece en la respuesta, hay fuga de secreto. */
const SESSION_SECRET = 'f'.repeat(64);

const BOOT_SCRIPT = `
  const app = require(${JSON.stringify(ENTRY)});
  const server = app.listen(0, '127.0.0.1', () => {
    process.stdout.write('PORT:' + server.address().port + '\\n');
  });
  setInterval(() => {}, 1000);
`;

/**
 * Arranca `server.js` como lo haria Vercel (proceso hijo + `process.env`) y
 * devuelve el puerto efimero donde escucha el fallback.
 */
async function startEntrypoint(overrides) {
  const child = spawn(process.execPath, ['-e', BOOT_SCRIPT], {
    cwd: ROOT,
    env: { ...process.env, ...overrides },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server.js no arranco a tiempo. stderr: ${stderr}`));
    }, 15000);
    const poll = setInterval(() => {
      const match = /PORT:(\d+)/.exec(stdout);
      if (match) {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(Number(match[1]));
      }
    }, 25);
    child.on('exit', (code) => {
      clearTimeout(timer);
      clearInterval(poll);
      reject(new Error(`server.js termino con codigo ${code}. stderr: ${stderr}`));
    });
  });

  return {
    port,
    stderr: () => stderr,
    close: () =>
      new Promise((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill();
      })
  };
}

/** Entorno base de produccion, con las variables criticas bajo control. */
function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    TG_DEMO_OPERATOR_VIRTUAL: '0',
    /*
     * Produccion ESTRICTA: sin "Fichas de Prueba" el driver en memoria sigue
     * siendo un error fatal. El despliegue demo autonomo (DEMO_MODE_ENABLED=true
     * sin Supabase) se cubre en el ultimo test de este archivo.
     */
    DEMO_MODE_ENABLED: 'false',
    DB_DRIVER: 'supabase',
    SESSION_SECRET,
    SUPABASE_URL: 'https://proyecto-de-prueba.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba',
    ALLOW_DEV_SESSION: 'false',
    ...overrides
  };
}

test('sin credenciales de Supabase el 503 nombra las variables ausentes', async () => {
  const server = await startEntrypoint(
    productionEnv({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' })
  );

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    const body = await response.json();
    const text = JSON.stringify(body);

    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'CONFIG_INVALID');

    // El detalle accionable ya no vive solo en Runtime Logs.
    assert.deepEqual(body.error.missing, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    assert.equal(
      body.error.problems.some((problem) => problem.includes('SUPABASE_SERVICE_ROLE_KEY')),
      true
    );

    // Ni el secreto ni la clave de servicio se filtran en la respuesta.
    assert.equal(text.includes(SESSION_SECRET), false);
    assert.equal(text.includes('clave-de-prueba'), false);
  } finally {
    await server.close();
  }
});

test('el 503 identifica el modo autonomo en produccion, no "faltan secretos"', async () => {
  // Credenciales presentes: el unico problema real es TG_DEMO_OPERATOR_VIRTUAL=1.
  const server = await startEntrypoint(
    productionEnv({ TG_DEMO_OPERATOR_VIRTUAL: '1' })
  );

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.error.code, 'CONFIG_INVALID');
    assert.deepEqual(body.error.missing, []);
    assert.equal(
      body.error.problems.some((problem) =>
        problem.includes('TG_DEMO_OPERATOR_VIRTUAL=1 es solo para desarrollo local')
      ),
      true
    );
  } finally {
    await server.close();
  }
});

/* -------------------------------------------------------------------------- */
/*  Despliegue demo autonomo (Vercel sin Supabase)                             */
/* -------------------------------------------------------------------------- */

/**
 * Un despliegue de demostracion no tiene base de datos: la interfaz se sirve
 * igual y la API liquida las rondas en la cartera virtual en memoria. Este test
 * arranca el entrypoint REAL de Vercel con `NODE_ENV=production` y sin
 * credenciales de Supabase para comprobar que ya no responde 503.
 */
test('con Fichas de Prueba y sin Supabase el entrypoint arranca en memoria', async () => {
  const server = await startEntrypoint(
    productionEnv({
      DEMO_MODE_ENABLED: 'true',
      DB_DRIVER: 'memory',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: ''
    })
  );

  try {
    const health = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    const healthBody = await health.json();
    assert.equal(health.status, 200, JSON.stringify(healthBody));
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.dbDriver, 'memory');
    assert.equal(healthBody.operator.mode, 'STANDALONE_DEMO');
    assert.equal(healthBody.operator.virtualWallet, true);

    // La interfaz se sirve desde el HTML generado (el CDN publica public/src/**).
    const index = await fetch(`http://127.0.0.1:${server.port}/`);
    const html = await index.text();
    assert.equal(index.status, 200);
    assert.match(html, /Santa Crush/);

    // Fichas de Prueba: sesion virtual + ronda liquidada sin tocar Supabase.
    const demo = await fetch(`http://127.0.0.1:${server.port}/api/demo/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: 'invitado_demo' })
    });
    const demoBody = await demo.json();
    assert.equal(demo.status, 200, JSON.stringify(demoBody));
    assert.equal(demoBody.demo, true);
    assert.equal(demoBody.balance.cents, 100000);

    const spin = await fetch(`http://127.0.0.1:${server.port}/api/spin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${demoBody.token}`
      },
      body: JSON.stringify({
        betCents: 100,
        clientSeed: 'vercel-demo-seed',
        roundRef: 'vercel-demo-ref-1'
      })
    });
    const spinBody = await spin.json();
    assert.equal(spin.status, 200, JSON.stringify(spinBody));
    assert.equal(spinBody.demo, true);
    assert.equal(spinBody.audit.certifiedRtp, 0.9508);
  } finally {
    await server.close();
  }
});
