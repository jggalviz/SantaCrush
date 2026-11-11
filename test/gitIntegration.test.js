'use strict';

/**
 * Contrato de integracion con el repositorio del backend.
 *
 * El build no es solo un paso de desarrollo: el equipo de backend hace
 * `git pull` de la rama `development` y publica `dist/` sin instalar Node ni
 * ejecutar la build. Ese acuerdo se fija aqui en tres comprobaciones:
 *
 *   1. `.gitignore` no puede excluir `dist/` (el paquete viaja en git).
 *   2. `npm run build` regenera TODO el paquete, en orden y sin huecos.
 *   3. `dist/` versionado esta sincronizado con `public/`: si alguien edita el
 *      frontend y no reconstruye, el test se pone rojo antes del push.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SOURCE_DIR, TARGET_DIR, planCopy } = require('../scripts/build-dist.js');

const ROOT_DIR = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');

/** Reglas activas de `.gitignore` (sin comentarios ni lineas vacias). */
function gitignoreRules() {
  return read('.gitignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

test('.gitignore no excluye dist/ (el backend lo baja con git pull)', () => {
  // `dist`, `dist/`, `/dist` y `/dist/` excluirian el paquete que publica el
  // backend; una negacion (`!/dist/`) no bloquea nada.
  const blockers = gitignoreRules().filter(
    (rule) => !rule.startsWith('!') && rule.replace(/^\//, '').replace(/\/$/, '') === 'dist'
  );

  assert.deepEqual(
    blockers,
    [],
    'dist/ debe versionarse: es el paquete compilado que el backend publica tras el ' +
      'merge (ver docs/GIT_INTEGRATION.md)'
  );
});

test('npm run build encadena toda la build y termina en el staging de dist/', () => {
  const pkg = JSON.parse(read('package.json'));
  const build = pkg.scripts && pkg.scripts.build;

  assert.equal(typeof build, 'string', 'Falta el script "build" en package.json');

  const steps = [
    'build-game-config.js',
    'build-ui.js',
    'build-minify.js',
    'build-index-html.js',
    'build-dist.js'
  ];
  for (const step of steps) {
    assert.ok(build.includes(step), `"npm run build" debe ejecutar scripts/${step}`);
  }

  // El staging copia `public/`, asi que va despues de generar todo lo demas.
  const order = steps.map((step) => build.indexOf(step));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    '"npm run build" debe respetar el orden de los pasos'
  );
});

test('dist/ versionado coincide con public/ (el build no puede quedar caduco)', () => {
  const files = planCopy();
  assert.ok(files.length > 0, 'build-dist.planCopy() no devolvio archivos');

  const stale = [];
  for (const file of files) {
    const staged = path.join(TARGET_DIR, file.relative);
    if (!fs.existsSync(staged)) {
      stale.push(`falta ${file.relative}`);
      continue;
    }
    const source = fs.readFileSync(path.join(SOURCE_DIR, file.relative));
    if (!fs.readFileSync(staged).equals(source)) stale.push(`desfasado ${file.relative}`);
  }

  assert.deepEqual(
    stale.slice(0, 8),
    [],
    `dist/ no refleja public/ (${stale.length} archivos). Ejecuta "npm run build" y ` +
      'commitea dist/ con el resto del cambio'
  );
  assert.ok(
    fs.existsSync(path.join(TARGET_DIR, 'asset-manifest.json')),
    'dist/asset-manifest.json lo escribe `npm run build:dist`'
  );
  assert.equal(
    fs.existsSync(path.join(TARGET_DIR, '.env')),
    false,
    'dist/ no debe llevar .env: el paquete es publico'
  );
});
