'use strict';

/**
 * Contrato de la configuracion central.
 *
 * `config/gameConfig.js` es la unica fuente de verdad para dimensiones,
 * apuestas, limites, bonus y defaults de entorno. El core la reexporta a traves
 * de `core/constants.js` y el navegador consume el espejo ESM generado.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const CONFIG_PATH = path.join(ROOT_DIR, 'config', 'gameConfig.js');
const BROWSER_CONFIG_PATH = path.join(ROOT_DIR, 'ui', 'config', 'gameConfig.js');
const BUILD_SCRIPT = require('../scripts/build-game-config');

const config = require('../config/gameConfig');
const core = require('../core');

const read = (file) => fs.readFileSync(file, 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('config/gameConfig.js centraliza grid, apuestas, limites, bonus y entorno', () => {
  const { GAME_CONFIG, PUBLIC_GAME_CONFIG, constants } = config;

  assert.equal(Object.isFrozen(GAME_CONFIG), true);
  assert.equal(Object.isFrozen(PUBLIC_GAME_CONFIG), true);
  assert.equal(Object.isFrozen(constants), true);

  assert.deepEqual(GAME_CONFIG.grid, {
    cols: 6,
    rows: 5,
    cells: 30,
    minPaySize: 8,
    minClusterSize: 8,
    payTiers: [8, 10, 12],
    stripLength: 120,
    stripRunLengths: [1, 1, 2, 2, 3, 3, 4],
    stripSeed: 0x7f4a7c15
  });
  assert.deepEqual(GAME_CONFIG.bets.ladderCredits, [
    0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100
  ]);
  assert.equal(GAME_CONFIG.bets.defaultCredits, 1);
  assert.equal(GAME_CONFIG.bets.defaultIndex, 3);
  assert.equal(GAME_CONFIG.bets.autoSpins, 10);
  assert.equal(GAME_CONFIG.limits.maxExposureMultiplier, 10000);
  assert.equal(GAME_CONFIG.limits.maxCascadeSteps, 40);
  assert.equal(GAME_CONFIG.limits.maxFeatureSpins, 10);
  assert.equal(GAME_CONFIG.feature.costMultiplier, 100);
  assert.equal(GAME_CONFIG.feature.spins, 10);
  assert.equal(GAME_CONFIG.api.baseUrl, '', 'el cliente usa mismo origen por defecto');
  assert.equal(GAME_CONFIG.api.externalBaseUrl, 'https://engine.latingames.net');
  assert.equal(GAME_CONFIG.api.timeoutMs, 15000);
  assert.deepEqual(GAME_CONFIG.api.connectOrigins, ['https://engine.latingames.net']);
  assert.equal(GAME_CONFIG.demo.startBalanceCents, 100000);
  assert.equal(GAME_CONFIG.env.DEMO_MODE_ENABLED, true);
  assert.equal(GAME_CONFIG.env.DEMO_START_BALANCE_CENTS, 100000);
  assert.equal(GAME_CONFIG.env.MAX_EXPOSURE_MULTIPLIER, 10000);
});

test('core/constants.js reexporta las mismas referencias que la config central', () => {
  const constants = require('../core/constants');

  for (const key of [
    'GAME_CODE',
    'GAME_NAME',
    'ENGINE_VERSION',
    'PAYTABLE_VERSION',
    'GRID_COLS',
    'GRID_ROWS',
    'GRID_CELLS',
    'MIN_GRID_PAY_SIZE',
    'MIN_CLUSTER_SIZE',
    'MAX_EXPOSURE_MULTIPLIER',
    'MAX_CASCADE_STEPS',
    'MAX_FEATURE_SPINS',
    'MICRO_PER_UNIT',
    'MAX_EXPOSURE_MICRO',
    'SCATTER',
    'MULTIPLIER',
    'REGULAR_SYMBOLS',
    'BET_LADDER_CREDITS',
    'STRIP_LENGTH',
    'STRIP_RUN_LENGTHS',
    'STRIP_SEED',
    'SINGLE_RUN_SYMBOLS',
    'FEATURE_CONFIG',
    'CERTIFIED_RTP'
  ]) {
    assert.equal(
      constants[key],
      config[key],
      `core/constants.js debe reexportar ${key} desde config/gameConfig.js`
    );
  }

  assert.equal(core.GRID_COLS, 6);
  assert.equal(core.GRID_ROWS, 5);
  assert.equal(core.BET_LADDER_CREDITS, config.BET_LADDER_CREDITS);
  assert.equal(core.FEATURE_CONFIG, config.FEATURE_CONFIG);
});

test('el espejo ESM del navegador esta sincronizado y no expone defaults de entorno', async () => {
  assert.equal(
    read(BROWSER_CONFIG_PATH),
    BUILD_SCRIPT.buildBrowserSource(),
    'Ejecuta `npm run build:config` tras editar config/gameConfig.js'
  );

  const source = read(BROWSER_CONFIG_PATH);
  assert.doesNotMatch(source, /process\.env|require\s*\(|module\.exports/);
  assert.match(source, /export const GAME_CONFIG/);

  const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
  const browser = await import(url);

  assert.deepEqual(
    browser.GAME_CONFIG,
    JSON.parse(JSON.stringify(config.PUBLIC_GAME_CONFIG))
  );
  assert.equal('env' in browser.GAME_CONFIG, false, 'El navegador no necesita defaults de entorno');

  const aliases = {
    GAME: 'game',
    GRID: 'grid',
    SYMBOLS: 'symbols',
    STRIPS: 'strips',
    BETS: 'bets',
    LIMITS: 'limits',
    FEATURE: 'feature',
    RTP: 'rtp',
    DEMO: 'demo',
    API: 'api'
  };
  for (const [alias, key] of Object.entries(aliases)) {
    assert.equal(browser[alias], browser.GAME_CONFIG[key]);
  }
  assert.equal(Object.isFrozen(browser.GAME_CONFIG), true);
  assert.equal(Object.isFrozen(browser.GAME_CONFIG.bets), true);
  assert.equal(Object.isFrozen(browser.GAME_CONFIG.bets.ladderCredits), true);
});

test('la logica de core/ no redefine valores que viven en la config', () => {
  const forbidden = [
    /\bGRID_COLS\s*=\s*\d/,
    /\bGRID_ROWS\s*=\s*\d/,
    /\bBET_LADDER_CREDITS\s*=\s*Object\.freeze\s*\(/,
    /\bMAX_EXPOSURE_MULTIPLIER\s*=\s*\d/,
    /\bMAX_FEATURE_SPINS\s*=\s*\d/,
    /\bMAX_CASCADE_STEPS\s*=\s*\d/
  ];

  for (const file of fs.readdirSync(CORE_DIR).filter((name) => name.endsWith('.js'))) {
    if (file === 'constants.js') continue; // fachada de reexportacion
    const code = stripComments(read(path.join(CORE_DIR, file)));
    for (const pattern of forbidden) {
      assert.doesNotMatch(code, pattern, `core/${file} no debe duplicar configuracion`);
    }
  }
});

test('server/config.js usa los defaults centrales y conserva la lectura de process.env', () => {
  const source = read(path.join(ROOT_DIR, 'server', 'config.js'));

  assert.match(source, /require\('\.\.\/config\/gameConfig'\)/);
  assert.match(source, /GAME_ENV\.DEMO_MODE_ENABLED/);
  assert.match(source, /GAME_ENV\.DEMO_START_BALANCE_CENTS/);
  assert.match(source, /GAME_ENV\.RATE_LIMIT_WINDOW_MS/);
  assert.match(source, /GAME_ENV\.ALLOWED_ORIGINS/);
  assert.match(source, /GAME_ENV\.SUPABASE_SCHEMA/);
  assert.match(source, /GAME_LIMITS\.maxExposureMultiplier/);
  assert.match(source, /process\.env/);
  assert.doesNotMatch(source, /DEMO_START_BALANCE_CENTS',\s*100000/);
  assert.doesNotMatch(source, /MAX_EXPOSURE_MULTIPLIER',\s*10000/);
});

test('config/gameConfig.js no contiene dependencias, DOM ni estado del proceso', () => {
  const code = stripComments(read(CONFIG_PATH));

  assert.doesNotMatch(code, /require\s*\(/);
  assert.doesNotMatch(code, /\b(?:document|window|HTMLElement|localStorage)\b/);
  assert.doesNotMatch(code, /\bprocess\s*\./);
});
