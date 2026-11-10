'use strict';

/**
 * Invariantes del despliegue en Vercel.
 *
 * Estas comprobaciones existen porque el preset `@vercel/express` inspecciona
 * el repositorio en tiempo de build: si se rompen, el despliegue puede compilar
 * el frontend como si fuera backend o dejar de detectar el entrypoint.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');

function readVercelConfig() {
  return JSON.parse(read('vercel.json'));
}

/** Quita comentarios para que las comprobaciones no fallen por documentación. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readExcludePatterns() {
  const config = readVercelConfig();
  const pattern = config.functions && config.functions['server.js'] && config.functions['server.js'].excludeFiles;
  assert.equal(
    typeof pattern,
    'string',
    'vercel.json debe declarar functions["server.js"].excludeFiles (ver docs/DEPLOY_VERCEL.md §5.1)'
  );
  return pattern
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((item) => item.trim());
}

test('vercel.json fija el preset Express y no declara builds manuales', () => {
  const config = readVercelConfig();

  assert.equal(config.framework, 'express');
  assert.equal(config.builds, undefined, 'El preset Express resuelve el entrypoint; no uses "builds"');
});

test('la funcion serverless excluye public/ y .env (el HTML va en server/generated)', () => {
  const patterns = readExcludePatterns();

  for (const expected of ['public', '.env', '.env.*']) {
    assert.ok(
      patterns.includes(expected),
      `Falta "${expected}" en functions["server.js"].excludeFiles (ver docs/DEPLOY_VERCEL.md §5.1)`
    );
  }

  const config = readVercelConfig();
  assert.equal(
    config.functions['server.js'].includeFiles,
    undefined,
    'No uses includeFiles: el HTML se incrusta con `npm run build:index`'
  );
});

test('server.js importa express literalmente (requisito de @vercel/express)', () => {
  // El builder oficial busca esta cadena en el archivo; un simple require de
  // ./server/app no basta para que lo detecte como entrypoint.
  assert.match(read('server.js'), /require\(\s*['"]express['"]\s*\)/);
});

test('Vercel sirve / desde el HTML generado y no traza public/', () => {
  const appCode = stripComments(read('server/app.js'));

  assert.doesNotMatch(appCode, /res\.sendFile\s*\(/);
  assert.match(
    appCode,
    /app\.get\(\s*['"]\/['"],[\s\S]*?res\.type\(\s*['"]html['"]\s*\)\.send\(\s*INDEX_HTML\s*\)/,
    'GET / debe responder el HTML generado (server/generated/indexHtml.js)'
  );
  assert.match(appCode, /express\.static\(\s*staticDir\s*,/);
  assert.doesNotMatch(
    appCode,
    /express\.static\(\s*PUBLIC_DIR/,
    'Usa staticDir (parametro): en Vercel es null y NFT no debe trazar public/'
  );
  assert.match(
    appCode,
    /express\.static\(\s*staticDir,\s*\{[\s\S]*?index:\s*['"]index\.html['"]/,
    'express.static debe declarar index: "index.html" en local'
  );

  assert.match(
    read('server.js'),
    /createApp\(\s*\{\s*staticDir:\s*null\s*\}\s*\)/,
    'En Vercel la funcion no debe servir public/'
  );
  assert.match(
    read('server/index.js'),
    /createApp\(\s*\{\s*staticDir:\s*PUBLIC_DIR\s*\}\s*\)/,
    'En local `npm start` si debe servir public/'
  );
});

test('.vercelignore ancla las carpetas de origen para no borrar el arte publicado', () => {
  // Gitignore aplica los patrones sin barra inicial a cualquier nivel del arbol:
  // la regla `slot/` excluia tambien `public/src/assets/slot/`, asi que el build
  // generaba los once simbolos y Vercel los dejaba fuera del despliegue (404 en
  // produccion y la rejilla cayendo al emoji de reserva). Toda carpeta de origen
  // va anclada a la raiz y ninguna regla puede tocar el arbol publicado.
  const rules = read('.vercelignore')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  for (const rule of rules) {
    if (/^[^/].*\/$/.test(rule)) {
      assert.fail(
        `La regla "${rule}" se aplica a cualquier nivel del arbol: anclala como "/${rule}" ` +
          'para que no excluya el arte de public/src/assets'
      );
    }
  }

  assert.ok(rules.includes('/slot/'), 'El arte fuente del escritorio se excluye anclado a la raiz');
  assert.equal(rules.includes('slot/'), false, 'La regla sin anclar se llevaria public/src/assets/slot');

  for (const published of ['/public/', '/src/', '/ui/']) {
    assert.equal(rules.includes(published), false, `${published} no puede viajar en .vercelignore`);
  }
});

test('server/generated/indexHtml.js refleja public/index.html', () => {
  const { INDEX_HTML } = require('../server/generated/indexHtml');

  assert.equal(
    INDEX_HTML,
    read('public/index.html'),
    'Ejecuta `npm run build:index` despues de editar public/index.html'
  );
});

test('la UI vive en ui/ y se publica desde public/ui', () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'public', 'index.html')), 'Falta public/index.html');
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'ui', 'main.js')), 'Falta ui/main.js (fuente canonica)');
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, 'public', 'ui', 'main.js')),
    'Falta public/ui/main.js: ejecuta `npm run build:ui`'
  );
  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, 'index.html')),
    false,
    'index.html debe estar solo en public/ para que el CDN lo publique'
  );
});
