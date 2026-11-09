'use strict';

/**
 * Contrato de la capa UI (`ui/`).
 *
 * Fija la separacion pedida:
 *   - `ui/services/ApiClient.js` es el UNICO modulo que habla con /api/*.
 *   - `ui/controllers/GameController.js` gestiona apuestas sin tocar el DOM.
 *   - `ui/renderers/**` y `ui/components/**` no hacen red ni calculan premios.
 *   - `public/ui/**` es un espejo generado y no se edita a mano.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const UI_DIR = path.join(ROOT_DIR, 'ui');
const MIRROR_DIR = path.join(ROOT_DIR, 'public', 'ui');
const BUILD_UI = require('../scripts/build-ui');

const read = (file) => fs.readFileSync(file, 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const relative = (file) => path.relative(ROOT_DIR, file).replace(/\\/g, '/');
const allModules = (dir = UI_DIR) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const absolute = path.join(dir, entry.name);
  if (entry.isDirectory()) return allModules(absolute);
  return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
});

/* Cargador ESM para data URLs con imports relativos del arbol ui/. */
const urlCache = new Map();
const moduleCache = new Map();

function buildModuleUrl(modulePath) {
  const file = path.resolve(UI_DIR, modulePath);
  if (urlCache.has(file)) return urlCache.get(file);

  const source = read(file).replace(
    /(\bfrom\s+['"])(\.[^'"]+)(['"])/g,
    (_match, head, specifier, tail) => {
      const resolved = path.resolve(path.dirname(file), specifier);
      return `${head}${buildModuleUrl(resolved)}${tail}`;
    }
  );

  const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  urlCache.set(file, url);
  return url;
}

function loadUiModule(modulePath) {
  const file = path.resolve(UI_DIR, modulePath);
  if (!moduleCache.has(file)) moduleCache.set(file, import(buildModuleUrl(modulePath)));
  return moduleCache.get(file);
}

test('public/ui es un espejo byte a byte de ui/ (fuente canonica)', () => {
  const modules = BUILD_UI.listModules();
  assert.ok(modules.length > 0, 'ui/ debe contener modulos');

  for (const source of modules) {
    const target = path.join(MIRROR_DIR, path.relative(UI_DIR, source));
    assert.ok(fs.existsSync(target), `Falta el espejo: ${relative(target)}`);
    assert.equal(read(target), read(source), `Espejo desactualizado: ${relative(target)} (npm run build:ui)`);
  }

  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'public', 'src', 'js')), false,
    'public/src/js ya no debe existir: la UI vive en ui/');
});

test('index.html carga la capa ui/ y declara el endpoint configurable', () => {
  const html = read(path.join(ROOT_DIR, 'public', 'index.html'));

  assert.match(html, /<script type="module" src="\/ui\/main\.js"><\/script>/);
  assert.match(html, /<meta name="game-api-base" content="" \/>/);
  assert.doesNotMatch(html, /\/src\/js\/main\.js/);
});

test('main.js compone servicios, controlador, vista y controles sin cablear el DOM a mano', () => {
  const main = read(path.join(UI_DIR, 'main.js'));

  assert.match(main, /new ApiClient\(/);
  assert.match(main, /new SessionManager\(/);
  assert.match(main, /new GameView\(\)/);
  assert.match(main, /new GameController\(/);
  assert.match(main, /new GameControls\(\{ ui, controller: game \}\)\.mount\(\)/);
  assert.doesNotMatch(main, /addEventListener\('click'/, 'los controles viven en components/GameControls.js');
});

test('ApiClient normaliza mismo origen y el motor externo', async () => {
  const { normalizeApiBaseUrl, joinApiUrl, resolveApiBaseUrl, ApiClient } = await loadUiModule('services/ApiClient.js');

  assert.equal(normalizeApiBaseUrl(''), '');
  assert.equal(normalizeApiBaseUrl('/gateway/'), '/gateway');
  assert.equal(normalizeApiBaseUrl('https://engine.latingames.net/'), 'https://engine.latingames.net');
  assert.equal(normalizeApiBaseUrl('engine.latingames.net'), 'https://engine.latingames.net');
  assert.equal(normalizeApiBaseUrl('//engine.latingames.net'), 'https://engine.latingames.net');
  assert.equal(normalizeApiBaseUrl('javascript:alert(1)'), '', 'esquemas no HTTP degradan a mismo origen');

  assert.equal(joinApiUrl('', '/api/spin'), '/api/spin');
  assert.equal(joinApiUrl('https://engine.latingames.net/', '/api/spin'), 'https://engine.latingames.net/api/spin');
  assert.equal(joinApiUrl('/gateway', 'api/spin'), '/gateway/api/spin');

  assert.equal(
    resolveApiBaseUrl({
      windowRef: { __TROPICAL_GRID__: { apiBaseUrl: 'https://engine.latingames.net' } },
      documentRef: null
    }),
    'https://engine.latingames.net',
    'el runtime del operador tiene prioridad'
  );
  assert.equal(
    resolveApiBaseUrl({
      windowRef: {},
      documentRef: { querySelector: () => ({ content: 'https://engine.latingames.net/' }) }
    }),
    'https://engine.latingames.net',
    'el meta tag es el segundo nivel'
  );
  assert.equal(
    resolveApiBaseUrl({ windowRef: {}, documentRef: null }),
    '',
    'sin overrides se usa el mismo origen de API.baseUrl'
  );

  assert.equal(new ApiClient({ baseUrl: '' }).url('/api/game'), '/api/game');
});

test('ApiClient es el unico servicio HTTP y conserva token/idempotencia', async () => {
  const { ApiClient } = await loadUiModule('services/ApiClient.js');
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ ok: true, roundId: 'r1' })
    };
  };

  try {
    const client = new ApiClient({
      baseUrl: 'engine.latingames.net/',
      getToken: () => 'tok-123'
    });

    const payload = await client.spin({
      betCents: 250,
      buyFeature: true,
      roundRef: 'round-ref-1',
      clientSeed: 'seed-1'
    });

    assert.deepEqual(payload, { ok: true, roundId: 'r1' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://engine.latingames.net/api/spin');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-123');
    assert.equal(calls[0].init.credentials, 'omit');
    assert.equal(calls[0].init.cache, 'no-store');
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      betCents: 250,
      buyFeature: true,
      roundRef: 'round-ref-1',
      clientSeed: 'seed-1'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('solo services habla con /api y ningun renderer/componente hace red', () => {
  const networkModules = allModules().filter((file) => /\bfetch\s*\(/.test(read(file)));
  assert.deepEqual(
    networkModules.map(relative).sort(),
    ['ui/audio/sfx.js', 'ui/services/ApiClient.js'],
    'solo el API cliente (backend) y el audio (asset) pueden usar fetch'
  );

  for (const file of allModules()) {
    const name = relative(file);
    if (name.startsWith('ui/services/') || name === 'ui/audio/sfx.js' || name === 'ui/main.js') continue;
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /\/api\//, `${name} no debe conocer rutas del backend`);
    assert.doesNotMatch(code, /\bfetch\s*\(/, `${name} no debe hacer peticiones HTTP`);
  }
});

test('GameController conserva la logica de apuesta sin tocar el DOM', () => {
  const controller = stripComments(read(path.join(UI_DIR, 'controllers', 'GameController.js')));

  assert.match(controller, /this\.api\.spin\(/);
  assert.match(controller, /this\.api\.gameInfo\(/);
  assert.match(controller, /get betCents\(\)/);
  assert.match(controller, /changeBet\(direction\)/);

  for (const domApi of ['document', 'window', 'HTMLElement', 'localStorage', 'querySelector', 'getElementById']) {
    assert.doesNotMatch(
      controller,
      new RegExp(`\\b${domApi}\\b`),
      `GameController no debe usar ${domApi}: el dibujado vive en renderers/`
    );
  }

  assert.doesNotMatch(controller, /celebrate\(|renderGrid\(/,
    'GameController delega el dibujado en RoundAnimator/GameView');
});

test('renderizadores y componentes solo reciben payloads o acciones', () => {
  for (const file of allModules().filter((name) => /[\\/](renderers|components)[\\/]/.test(name))) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /from\s+['"][^'"]*(?:ApiClient|SessionManager)/, `${relative(file)} no debe importar servicios`);
    assert.doesNotMatch(code, /\bapi\s*\.\s*(?:spin|player|gameInfo)\s*\(/, `${relative(file)} no debe pedir rondas`);
  }

  const animator = stripComments(read(path.join(UI_DIR, 'renderers', 'RoundAnimator.js')));
  assert.match(animator, /const total = round\.totalWinCents/,
    'el importe mostrado debe venir del payload');
  assert.doesNotMatch(animator, /\bwinCents\s*[=+*/-]=/, 'la animacion no debe recalcular premios');

  const controls = stripComments(read(path.join(UI_DIR, 'components', 'GameControls.js')));
  assert.match(controls, /this\.controller\.spin\(/);
  assert.doesNotMatch(controls, /betCents|credits|Math\.round|balanceCents/, 'los controles no calculan apuestas');
});

test('la UI no importa core/ ni server/ (el motor es autoritativo)', () => {
  for (const file of allModules()) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /from\s+['"][^'"]*(?:\/|\.\.\/)(?:core|server)\//, `${relative(file)} importa backend`);
    assert.doesNotMatch(code, /\brequire\s*\(/, `${relative(file)} es ESM puro`);
  }
});

test('la CSP permite el motor externo configurado', () => {
  const app = read(path.join(ROOT_DIR, 'server', 'app.js'));
  const vercel = read(path.join(ROOT_DIR, 'vercel.json'));

  assert.match(app, /connectSrc: \["'self'", \.\.\.config\.api\.connectOrigins\]/);
  assert.match(vercel, /connect-src 'self' https:\/\/engine\.latingames\.net;/);
  assert.match(vercel, /"source": "\/ui\/\(\.\*\)"/);
});
