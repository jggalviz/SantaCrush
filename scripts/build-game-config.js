'use strict';

/**
 * Genera `ui/config/gameConfig.js` a partir de `config/gameConfig.js` y
 * refresca el espejo `public/ui/**`.
 *
 * El navegador no puede consumir CommonJS, asi que este build materializa un
 * espejo ESM con los MISMOS valores publicos. No hay copia manual: cualquier
 * cambio debe hacerse en `config/gameConfig.js` y regenerarse con:
 *
 *   npm run build:config
 *
 * Forma parte de `npm start`, `npm run dev` y `vercel-build`.
 */

const fs = require('node:fs');
const path = require('node:path');

const { PUBLIC_GAME_CONFIG } = require('../config/gameConfig');

const ROOT_DIR = path.join(__dirname, '..');
const TARGET_DIR = path.join(ROOT_DIR, 'ui', 'config');
const TARGET_PATH = path.join(TARGET_DIR, 'gameConfig.js');

function buildBrowserSource() {
  const data = JSON.stringify(PUBLIC_GAME_CONFIG, null, 2);

  return [
    '/**',
    ' * ARCHIVO GENERADO por scripts/build-game-config.js.',
    ' * Fuente: config/gameConfig.js. No editar a mano:',
    ' *   npm run build:config',
    ' */',
    '',
    '/** Congela recursivamente para que el cliente no pueda mutar la config. */',
    'function deepFreeze(value) {',
    '  if (value && typeof value === \'object\' && !Object.isFrozen(value)) {',
    '    for (const key of Object.keys(value)) deepFreeze(value[key]);',
    '    Object.freeze(value);',
    '  }',
    '  return value;',
    '}',
    '',
    `export const GAME_CONFIG = deepFreeze(${data});`,
    '',
    '/* Accesos directos por dominio (mismos objetos, sin duplicar valores). */',
    'export const GAME = GAME_CONFIG.game;',
    'export const GRID = GAME_CONFIG.grid;',
    'export const SYMBOLS = GAME_CONFIG.symbols;',
    'export const STRIPS = GAME_CONFIG.strips;',
    'export const BETS = GAME_CONFIG.bets;',
    'export const LIMITS = GAME_CONFIG.limits;',
    'export const FEATURE = GAME_CONFIG.feature;',
    'export const RTP = GAME_CONFIG.rtp;',
    'export const DEMO = GAME_CONFIG.demo;',
    'export const API = GAME_CONFIG.api;',
    '',
    'export default GAME_CONFIG;',
    ''
  ].join('\n');
}

function writeBrowserConfig() {
  const source = buildBrowserSource();
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  fs.writeFileSync(TARGET_PATH, source, 'utf8');
  return source;
}

if (require.main === module) {
  const source = writeBrowserConfig();
  const { writeUiMirror } = require('./build-ui');
  writeUiMirror();
  // eslint-disable-next-line no-console
  console.log(
    `[build:config] ${path.relative(ROOT_DIR, TARGET_PATH)} actualizado ` +
      `(${Buffer.byteLength(source, 'utf8')} bytes) y public/ui sincronizado.`
  );
}

module.exports = { TARGET_PATH, buildBrowserSource, writeBrowserConfig };
