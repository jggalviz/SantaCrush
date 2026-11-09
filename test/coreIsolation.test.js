'use strict';

/**
 * Invariantes de la separacion del motor matematico en `core/`.
 *
 * El objetivo es que la logica de juego sea portable (Node puro, simuladores,
 * auditoria) y que nunca dependa del DOM, canvas, UI, Express o persistencia.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const CORE_DIR = path.join(ROOT_DIR, 'core');
const CONFIG_DIR = path.join(ROOT_DIR, 'config');
const CONFIG_IMPORT = '../config/gameConfig';

const CONFIG_MODULES = Object.freeze(['gameConfig.js']);

const CORE_MODULES = Object.freeze([
  'constants.js',
  'paytables.js',
  'money.js',
  'rng.js',
  'fastRng.js',
  'pickers.js',
  'reels.js',
  'grid.js',
  'spin.js',
  'model.js',
  'round.js',
  'index.js'
]);

const read = (absolutePath) => fs.readFileSync(absolutePath, 'utf8');

/** Quita comentarios para analizar solo codigo ejecutable. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function requireSpecifiers(source) {
  return [...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]);
}

test('core/ contiene todas las piezas del motor matematico', () => {
  assert.ok(fs.existsSync(CORE_DIR), 'Falta la carpeta core/');

  for (const moduleName of CORE_MODULES) {
    assert.ok(
      fs.existsSync(path.join(CORE_DIR, moduleName)),
      `Falta core/${moduleName}`
    );
  }
});

test('core/ solo importa node:crypto, modulos de core/ y la config central', () => {
  for (const moduleName of CORE_MODULES) {
    const source = read(path.join(CORE_DIR, moduleName));
    const specifiers = requireSpecifiers(source);

    for (const specifier of specifiers) {
      const isConfigImport = moduleName === 'constants.js' && specifier === CONFIG_IMPORT;
      assert.ok(
        specifier === 'node:crypto' || specifier.startsWith('./') || isConfigImport,
        `core/${moduleName} no puede importar "${specifier}"`
      );

      if (specifier.startsWith('./')) {
        const resolved = path.resolve(CORE_DIR, specifier);
        const relative = path.relative(CORE_DIR, resolved);
        assert.equal(
          relative.startsWith('..') || path.isAbsolute(relative),
          false,
          `core/${moduleName} importa fuera de core/: "${specifier}"`
        );
      }
    }

    assert.doesNotMatch(
      source,
      /^\s*(?:import|export)\s/m,
      `core/${moduleName} debe usar CommonJS y no ESM`
    );
    assert.doesNotMatch(
      source,
      /\bimport\s*\(/,
      `core/${moduleName} no debe usar import() dinamico`
    );
  }
});

test('core/ y config/gameConfig.js no contienen APIs de navegador, UI ni backend', () => {
  const forbidden = [
    {
      pattern: /\b(?:document|window|navigator|localStorage|sessionStorage|HTMLElement|Image|Audio|AudioContext|requestAnimationFrame|WebSocket)\b/,
      label: 'API de navegador/DOM/UI'
    },
    {
      pattern: /\b(?:express|helmet|compression|cors|supabase|sharp|mongoose|sequelize)\b/,
      label: 'dependencia de servidor, red o persistencia'
    },
    {
      pattern: /require\s*\(\s*['"](?:node:)?(?:fs|path|http|https|net|tls|dgram|worker_threads|child_process|express)['"]\s*\)/,
      label: 'modulo de I/O o servidor'
    },
    {
      pattern: /\bprocess\s*\.\s*(?:env|argv|cwd|exit)\b/,
      label: 'estado global del proceso'
    }
  ];

  for (const moduleName of CORE_MODULES) {
    const code = stripComments(read(path.join(CORE_DIR, moduleName)));

    for (const rule of forbidden) {
      assert.doesNotMatch(
        code,
        rule.pattern,
        `core/${moduleName} no puede usar ${rule.label}`
      );
    }
  }

  for (const moduleName of CONFIG_MODULES) {
    const source = read(path.join(CONFIG_DIR, moduleName));
    const code = stripComments(source);

    for (const rule of forbidden) {
      assert.doesNotMatch(
        code,
        rule.pattern,
        `config/${moduleName} no puede usar ${rule.label}`
      );
    }

    assert.deepEqual(
      requireSpecifiers(code),
      [],
      `config/${moduleName} debe ser datos puros, sin require`
    );
  }
});

test('cargar core/ no arrastra modulos de server/ ni dependencias de la app', () => {
  const core = require('../core');
  assert.equal(typeof core.playRound, 'function');

  const loaded = Object.keys(require.cache);
  const serverSegment = `${path.sep}server${path.sep}`;
  const appDependencies = /node_modules[\\/](?:express|helmet|compression|cors|@supabase|sharp)[\\/]/;

  for (const file of loaded) {
    assert.equal(
      file.includes(serverSegment),
      false,
      `core/ arrastro un modulo de server/: ${file}`
    );
    assert.doesNotMatch(file, appDependencies, `core/ arrastro una dependencia de app: ${file}`);
  }
});

test('la fachada historica reexporta exactamente el core sin logica duplicada', () => {
  const core = require('../core');
  const legacyEngine = require('../server/engine/gridEngine');
  const legacyFastRng = require('../scripts/lib/fastRng');

  assert.equal(legacyEngine.playRound, core.playRound);
  assert.equal(legacyEngine.gameInfo, core.gameInfo);
  assert.equal(legacyEngine.model, core.model);
  assert.equal(legacyFastRng.createFastRng, require('../core/fastRng').createFastRng);

  const legacySource = stripComments(read(path.join(ROOT_DIR, 'server', 'engine', 'gridEngine.js')));
  assert.doesNotMatch(legacySource, /function\s+\w+|const\s+\w+\s*=/, 'La fachada no debe contener logica');
});
