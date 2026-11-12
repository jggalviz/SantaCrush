'use strict';

/**
 * Presupuesto de peso del frontend.
 *
 * El juego se publica como estaticos (`public/**`): todo lo que se cuele en ese
 * arbol lo descarga el jugador. Estos topes son el contrato de "ultraligero" y
 * convierten una regresion de assets en un test rojo en vez de en una portada
 * lenta:
 *
 *   - arte, tipografia y audio (`public/src/assets/**`)  < 3,4 MB
 *   - cada simbolo del tablero                     < 48 KB
 *   - hojas minificadas (`*.min.css`)              < 165 KB
 *   - modulos de la UI (`public/ui/**`)            < 220 KB
 *
 * El tope subio de 3,0 a 3,4 MB cuando el logotipo paso a ser animado: el WebP
 * de 12 fotogramas pesa ~267 KB (el lockup estatico anterior, 100 KB), asi que
 * el presupuesto tiene que cubrirlo o cada rebranding del logo romperia el
 * contrato por diseno.
 *
 * Tambien fija que los maestros no viajen al CDN y que el servidor local
 * aplique la cache larga al arte (igual que CloudFront en produccion).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'src', 'assets');
const SLOT_DIR = path.join(ASSETS_DIR, 'slot');
const CSS_DIR = path.join(PUBLIC_DIR, 'src', 'css');
const UI_DIR = path.join(PUBLIC_DIR, 'ui');

const MB = 1024 * 1024;
const KB = 1024;

/** Suma recursiva de bytes de un arbol. */
function sizeOf(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((acc, entry) => {
    const absolute = path.join(dir, entry.name);
    return acc + (entry.isDirectory() ? sizeOf(absolute) : fs.statSync(absolute).size);
  }, 0);
}

const mb = (bytes) => `${(bytes / MB).toFixed(2)} MB`;
const kb = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

test('el arte y el audio servidos no pasan de 3,4 MB', () => {
  // Incluye los dos MP3: los aplausos de victoria (~40 KB a 128 kbps) y el
  // bucle ambiental de 20 s `N-AUDIO-meridiano-con-fade.mp3` a 128 kbps CBR
  // (~314 KB). El VBR anterior a ~164 kbps pesaba ~401 KB y ya no se sirve.
  // Y el logo animado: 12 fotogramas de 480 x 294 a q=72 (~267 KB).
  const total = sizeOf(ASSETS_DIR);
  assert.ok(total < 3.4 * MB, `public/src/assets pesa ${mb(total)}: revisa los assets`);
});

test('los once simbolos son WebP y cada uno cabe en 48 KB', () => {
  const files = fs
    .readdirSync(SLOT_DIR)
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

  assert.deepEqual(
    files,
    Array.from({ length: 11 }, (_, index) => `s${index + 1}.webp`),
    'La carpeta slot solo debe contener los once WebP (los PNG maestros viven en design/symbols)'
  );

  for (const file of files) {
    const absolute = path.join(SLOT_DIR, file);
    const binary = fs.readFileSync(absolute);

    assert.equal(binary.toString('ascii', 0, 4), 'RIFF', `${file} debe ser un contenedor RIFF/WebP`);
    assert.equal(binary.toString('ascii', 8, 12), 'WEBP', `${file} debe ser un WebP real`);
    assert.ok(
      binary.length < 48 * KB,
      `${file} pesa ${kb(binary.length)}: ejecuta npm run build:symbols`
    );
  }
});

test('las hojas minificadas caben en 165 KB y las fuentes no se sirven de mas', () => {
  const total = ['style', 'theme'].reduce(
    (acc, name) => acc + fs.statSync(path.join(CSS_DIR, `${name}.min.css`)).size,
    0
  );
  assert.ok(total < 165 * KB, `Las hojas minificadas pesan ${kb(total)}`);

  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const linked = [...html.matchAll(/href="\/src\/css\/([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(
    linked,
    ['style.min.css', 'theme.min.css'],
    'index.html solo debe enlazar las dos hojas minificadas, en orden'
  );
});

test('los modulos de la UI caben en 220 KB', () => {
  const total = sizeOf(UI_DIR);
  assert.ok(total < 220 * KB, `public/ui pesa ${kb(total)}`);
});

test('los maestros de arte no viajan al CDN', () => {
  const stray = fs
    .readdirSync(path.join(ROOT_DIR, 'design', 'symbols'))
    .filter((name) => !/^s\d+\.png$/i.test(name));
  assert.deepEqual(stray, [], 'design/symbols solo guarda los maestros s1..s11');

  for (const dir of [PUBLIC_DIR, path.join(PUBLIC_DIR, 'src')]) {
    const media = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(png|jpe?g|gif|psd)$/i.test(entry.name))
      .map((entry) => entry.name);
    assert.deepEqual(media, [], `${path.relative(ROOT_DIR, dir)} no debe publicar PNG/JPEG/GIF`);
  }
});

test('el servidor local cachea el arte un ano e immutable', () => {
  const app = fs.readFileSync(path.join(ROOT_DIR, 'server', 'app.js'), 'utf8');

  assert.match(
    app,
    /relative\.startsWith\('src\/assets\/'\)[\s\S]{0,120}max-age=31536000, immutable/,
    'express.static debe cachear src/assets/** igual que CloudFront'
  );
  assert.match(app, /'no-cache'/, 'HTML, JS y CSS siguen revalidando en cada visita');

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
  const assets = vercel.headers.find((rule) => rule.source === '/src/assets/(.*)');
  assert.ok(assets, 'vercel.json debe declarar la regla de cache de /src/assets/*');
  assert.ok(
    assets.headers.some(
      (header) => header.key === 'Cache-Control' && /immutable/.test(header.value)
    ),
    'La regla de /src/assets/* debe ser immutable'
  );
});

test('el material de origen queda fuera del upload de Vercel', () => {
  const ignore = fs.readFileSync(path.join(ROOT_DIR, '.vercelignore'), 'utf8');
  for (const entry of ['design/', 'docs/', 'test/', 'sql/']) {
    assert.ok(ignore.includes(entry), `.vercelignore debe excluir ${entry}`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  for (const script of ['build:css', 'build:symbols', 'build:dist']) {
    assert.ok(pkg.scripts[script], `Falta el script ${script}`);
  }
  for (const hook of ['prestart', 'predev', 'vercel-build']) {
    assert.match(pkg.scripts[hook], /build-minify\.js/, `${hook} debe minificar el CSS`);
  }
});

test('el paquete de integracion (dist/) omite fuentes y previews', () => {
  const { planCopy } = require('../scripts/build-dist.js');
  const files = planCopy();
  const names = files.map((file) => file.relative);

  assert.ok(names.includes('index.html'), 'dist/ debe llevar index.html en la raiz');
  assert.ok(names.includes('src/css/style.min.css'), 'dist/ debe llevar las hojas minificadas');
  assert.ok(names.includes('src/assets/slot/s1.webp'), 'dist/ debe llevar los simbolos');
  assert.ok(
    names.includes('src/assets/AUDIO-WIN-NEW-stadium-applause.MP3'),
    'dist/ debe llevar los aplausos de victoria'
  );
  assert.ok(
    names.includes('src/assets/N-AUDIO-meridiano-con-fade.mp3'),
    'dist/ debe llevar el bucle ambiental'
  );

  for (const excluded of ['src/css/style.css', 'src/css/theme.css']) {
    assert.equal(names.includes(excluded), false, `${excluded} no debe publicarse (fuente legible)`);
  }
  assert.equal(
    names.some((name) => /^\.preview-/.test(name)),
    false,
    'Las previews internas no deben publicarse'
  );

  const total = files.reduce((acc, file) => acc + file.bytes, 0);
  assert.ok(
    total < 3.8 * MB,
    `dist/ pesa ${mb(total)}: el paquete de integracion debe bajar de 3,8 MB (arte + audio)`
  );
});
