'use strict';

/**
 * Contrato de las hojas minificadas.
 *
 * `public/src/css/*.css` son las fuentes legibles; `*.min.css` es lo que enlaza
 * `index.html` y lo que viaja al CDN. Estos tests fijan las tres cosas que
 * pueden romperse en silencio:
 *
 *   1. que el `.min.css` exista y siga sincronizado con su fuente (si alguien
 *      edita `style.css` y olvida `npm run build:css`, el juego publicaria la
 *      version vieja);
 *   2. que el HTML cargue los minificados y en el orden correcto (el tema
 *      despues de la maqueta);
 *   3. que el minificador no toque nada significativo: cadenas, `url()`,
 *      `calc()` ni at-rules.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { minifyCss, contentHash, stampHtml } = require('../scripts/build-minify.js');

const ROOT_DIR = path.join(__dirname, '..');
const CSS_DIR = path.join(ROOT_DIR, 'public', 'src', 'css');
const INDEX_PATH = path.join(ROOT_DIR, 'public', 'index.html');

const read = (file) => fs.readFileSync(file, 'utf8');
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

for (const name of ['style', 'theme']) {
  test(`${name}.min.css esta sincronizado con ${name}.css`, () => {
    const sourcePath = path.join(CSS_DIR, `${name}.css`);
    const minPath = path.join(CSS_DIR, `${name}.min.css`);

    assert.ok(fs.existsSync(minPath), `Falta ${name}.min.css: ejecuta npm run build:css`);

    const source = read(sourcePath);
    const minified = read(minPath);

    assert.match(
      minified,
      /^\/\*! .*generado por scripts\/build-minify\.js/,
      `${name}.min.css debe llevar su cabecera de artefacto generado`
    );

    const body = minified.slice(minified.indexOf('*/') + 2).trim();
    assert.equal(
      body,
      minifyCss(source),
      `${name}.min.css quedo desactualizado: ejecuta npm run build:css`
    );

    assert.ok(
      Buffer.byteLength(minified) < Buffer.byteLength(source),
      `${name}.min.css debe pesar menos que la fuente`
    );

    const withoutHeader = minified.replace(/^\/\*![\s\S]*?\*\//, '');
    assert.equal(
      withoutHeader.includes('/*'),
      false,
      `${name}.min.css no debe conservar comentarios de desarrollo`
    );
  });
}

test('index.html carga las hojas minificadas en orden y no las fuentes', () => {
  const html = read(INDEX_PATH);

  assert.match(
    html,
    /href="\/src\/css\/style\.min\.css(?:\?v=[a-f0-9]+)?"/,
    'Falta style.min.css en index.html'
  );
  assert.match(
    html,
    /href="\/src\/css\/theme\.min\.css(?:\?v=[a-f0-9]+)?"/,
    'Falta theme.min.css en index.html'
  );
  assert.ok(
    html.indexOf('/src/css/style.min.css') < html.indexOf('/src/css/theme.min.css'),
    'El tema debe cargarse despues de la maqueta'
  );
  assert.doesNotMatch(
    html,
    /href="\/src\/css\/(style|theme)\.css"/,
    'index.html no debe cargar las fuentes sin minificar'
  );
});

test('index.html sella cada hoja con el hash de su contenido', () => {
  const html = read(INDEX_PATH);

  for (const name of ['style', 'theme']) {
    const version = contentHash(read(path.join(CSS_DIR, `${name}.min.css`)));
    const expected = `href="/src/css/${name}.min.css?v=${version}"`;

    /* Sin el sello, un navegador con la copia anterior (pestaña abierta,
       bfcache o proxy del operador) sigue pintando el diseño viejo aunque el
       deploy ya este en produccion: cada cambio de CSS debe estrenar URL. */
    assert.ok(
      html.includes(expected),
      `index.html debe enlazar ${expected}: ejecuta npm run build:css`
    );
  }
});

test('el sello del HTML es idempotente y reemplaza versiones viejas', () => {
  const sheets = [
    { name: 'style.min.css', version: 'aaaaaaaaaa' },
    { name: 'theme.min.css', version: 'bbbbbbbbbb' }
  ];
  const plain = '<link rel="stylesheet" href="/src/css/style.min.css" />';

  assert.equal(
    stampHtml(plain, sheets),
    '<link rel="stylesheet" href="/src/css/style.min.css?v=aaaaaaaaaa" />',
    'El sello debe añadirse cuando el HTML no lo lleva'
  );

  const stale = '<link rel="stylesheet" href="/src/css/style.min.css?v=0123456789" />';
  assert.equal(
    stampHtml(stale, sheets),
    '<link rel="stylesheet" href="/src/css/style.min.css?v=aaaaaaaaaa" />',
    'El sello debe reemplazar una version anterior, no acumular otra'
  );

  const stamped = stampHtml(plain, sheets);
  assert.equal(stampHtml(stamped, sheets), stamped, 'Sellar dos veces no cambia nada');

  assert.equal(
    stampHtml('<img src="/src/css/otra.css" />', sheets),
    '<img src="/src/css/otra.css" />',
    'El sello no debe tocar rutas que no sean las hojas'
  );
});

test('el minificador conserva cadenas, url(), calc() y at-rules', () => {
  const css = [
    '/* comentario de desarrollo */',
    '.a {',
    "  background: url('../assets/x.png') no-repeat;",
    '  width: calc(100% - 2px);',
    '  content: "@media no es una regla";',
    '  color: #fff;',
    '}',
    '@media (max-width: 10px) {',
    '  .b { padding: 0 1px; }',
    '}'
  ].join('\n');

  const out = minifyCss(css);

  assert.equal(out.includes('/*'), false, 'Los comentarios se van');
  assert.ok(out.includes("url('../assets/x.png')"), 'Las url() se copian tal cual');
  assert.ok(out.includes('calc(100% - 2px)'), 'calc() conserva sus espacios');
  assert.ok(out.includes('content: "@media no es una regla"'), 'Las cadenas no se tocan');
  assert.ok(out.includes('@media (max-width: 10px)'), 'Las at-rules sobreviven');
  assert.equal(out.includes('; }'), false, 'No quedan separadores con aire');
});

test('el minificado de las hojas reales ahorra al menos un 30 %', () => {
  const saved = ['style', 'theme'].map((name) => {
    const source = fs.statSync(path.join(CSS_DIR, `${name}.css`)).size;
    const minified = fs.statSync(path.join(CSS_DIR, `${name}.min.css`)).size;
    return { name, source, minified, ratio: minified / source };
  });

  for (const sheet of saved) {
    assert.ok(
      sheet.ratio < 0.7,
      `${sheet.name}: el minificado solo ahorra ${(100 - sheet.ratio * 100).toFixed(1)} % ` +
        `(${kb(sheet.source)} -> ${kb(sheet.minified)})`
    );
  }
});
