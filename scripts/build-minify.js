'use strict';

/**
 * Minifica las hojas del juego: `style.css` y `theme.css` -> `.min.css`.
 *
 *   public/src/css/style.css  -> public/src/css/style.min.css
 *   public/src/css/theme.css  -> public/src/css/theme.min.css
 *
 * Las fuentes se quedan legibles (son las que leen los tests y quien edita el
 * diseno); `index.html` enlaza los `.min.css`, que se generan en cada arranque:
 *
 *   npm run build:css
 *
 * Minificador propio, conservador y sin dependencias: no reescribe valores ni
 * selectores, solo quita comentarios, colapsa espacios y recorta separadores.
 * Antes de escribir compara fuente y salida (llaves, parentesis, cadenas,
 * `url()` y at-rules) y aborta si el minificado perdio algo por el camino, de
 * modo que un CSS roto nunca llega a publicarse.
 *
 * Ademas sella `index.html` con `?v=<hash del contenido>` en cada hoja. Las
 * hojas se sirven con `max-age=0, must-revalidate`, pero eso solo obliga a
 * revalidar al navegador que decide hacerlo: una pestaña ya abierta, el
 * `bfcache` de Safari/iOS o el proxy de un operador movil siguen sirviendo su
 * copia y el jugador ve el diseño anterior aunque el deploy ya este en
 * produccion. Con el hash en la URL cada cambio de CSS estrena URL (en el
 * navegador y en el CDN de Vercel, que indexa por URL completa) y la version
 * vieja deja de ser alcanzable.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const CSS_DIR = path.join(ROOT_DIR, 'public', 'src', 'css');
const INDEX_PATH = path.join(ROOT_DIR, 'public', 'index.html');
const SHEETS = ['style', 'theme'];

/**
 * Quita los comentarios (salvo los de licencia), colapsa espacios y recorta
 * los separadores de bloque.
 *
 * @param {string} source CSS de entrada
 * @returns {string} CSS minificado
 */
function minifyCss(source) {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (char === '/' && source[index + 1] === '*') {
      const keep = source[index + 2] === '!';
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      if (keep) out += source.slice(index, stop);
      index = stop;
      continue;
    }

    /* Las cadenas se copian tal cual: dentro puede haber llaves, punto y coma
       o dobles espacios significativos. */
    if (char === '"' || char === "'") {
      const quote = char;
      out += char;
      index += 1;
      while (index < source.length) {
        const current = source[index];
        out += current;
        index += 1;
        if (current === '\\') {
          if (index < source.length) {
            out += source[index];
            index += 1;
          }
          continue;
        }
        if (current === quote) break;
      }
      continue;
    }

    if (/\s/.test(char)) {
      while (index < source.length && /\s/.test(source[index])) index += 1;
      out += ' ';
      continue;
    }

    out += char;
    index += 1;
  }

  return out
    .replace(/\s*([{};,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/^\s+|\s+$/g, '');
}

/** Extrae las `url(...)` sin comillas ni espacios sobrantes. */
function urls(css) {
  return [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)]
    .map((match) => match[2].trim())
    .sort();
}

/** Extrae los literales de cadena. */
function strings(css) {
  return [...css.matchAll(/(['"])((?:\\.|(?!\1)[\s\S])*)\1/g)].map((match) => match[2]).sort();
}

/** Extrae las at-rules (`@media`, `@supports`, `@keyframes`...). */
function atRules(css) {
  return [...css.matchAll(/@(-[a-z]+-)?[a-z-]+[^{;]*/gi)].map((match) => match[0].trim()).sort();
}

/** Comprueba que el minificado conserva la estructura del original. */
function assertEquivalent(source, minified, name) {
  /* Los comentarios se van en la salida, asi que la comparacion se hace contra
     la fuente sin ellos: un `(ver nota)` dentro de un comentario no debe contar
     como parentesis del CSS. */
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const balance = (text, open, close) =>
    [...text].reduce(
      (depth, char) => (char === open ? depth + 1 : char === close ? depth - 1 : depth),
      0
    );

  for (const [open, close] of [
    ['{', '}'],
    ['(', ')']
  ]) {
    if (balance(minified, open, close) !== 0) {
      throw new Error(`${name}: el minificado desbalancea "${open}${close}"`);
    }
    if (balance(clean, open, close) !== balance(minified, open, close)) {
      throw new Error(`${name}: el minificado cambio el numero de "${open}${close}"`);
    }
  }

  const strayComments = minified.replace(/\/\*![\s\S]*?\*\//g, '');
  if (strayComments.includes('/*')) {
    throw new Error(`${name}: el minificado conserva comentarios`);
  }

  for (const [label, pick] of [
    ['url()', urls],
    ['cadenas', strings],
    ['at-rules', atRules]
  ]) {
    if (pick(clean).join('\u0000') !== pick(minified).join('\u0000')) {
      throw new Error(`${name}: el minificado altero las ${label}`);
    }
  }

  /* Recuento de bloques y de declaraciones: es la red que detecta un bloque
     comido por el colapso de espacios. Se compara la lista de propiedades (no
     los valores) porque el minificador no toca valores. */
  const count = (text, pattern) => (text.match(pattern) || []).length;
  const rules = /\{/g;
  if (count(clean, rules) !== count(minified, rules)) {
    throw new Error(`${name}: el minificado perdio bloques`);
  }

  const declarations = /[{};]\s*([a-z-]+)\s*:/g;
  const properties = (text) => [...text.matchAll(declarations)].map((m) => m[1]).sort().join(',');
  if (properties(clean) !== properties(minified)) {
    throw new Error(`${name}: el minificado perdio declaraciones`);
  }
}

/**
 * Hash corto del contenido publicado: identifica la version de la hoja.
 *
 * @param {string} text contenido exacto del `.min.css`
 * @returns {string} 10 hex de SHA-256
 */
function contentHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 10);
}

/**
 * Escapa un texto para usarlo literal dentro de un `RegExp`.
 *
 * @param {string} text texto a escapar
 * @returns {string} texto seguro dentro de un `RegExp`
 */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aplica (o corrige) el `?v=<hash>` de las hojas en un HTML. Pura: no toca
 * disco, de modo que los tests puedan ejercitarla con HTML de ejemplo.
 *
 * Sustituye un `?v=` previo en vez de acumularlo, asi que es idempotente.
 *
 * @param {string} html documento
 * @param {{ name: string, version: string }[]} entries hojas y su hash
 * @returns {string} documento con los `<link>` sellados
 */
function stampHtml(html, entries) {
  let next = html;

  for (const { name, version } of entries) {
    const pattern = new RegExp(`href="/src/css/${escapeRegExp(name)}(?:\\?v=[^"]*)?"`, 'g');
    next = next.replace(pattern, `href="/src/css/${name}?v=${version}"`);
  }

  return next;
}

/**
 * Sella los `<link>` de las hojas en `public/index.html` con `?v=<hash>`.
 *
 * Idempotente: si el hash no cambio, el HTML queda intacto (sin diffs
 * ruidosos). Solo toca el `href` de las dos hojas minificadas; el resto del
 * documento y el `?v=` de otros assets se respetan tal cual.
 *
 * @param {{ name: string, version: string }[]} results hojas minificadas
 * @returns {{ changed: boolean, entries: { name: string, version: string }[] }}
 */
function stampIndexHtml(results) {
  const entries = results.map((result) => ({ name: result.name, version: result.version }));
  if (!fs.existsSync(INDEX_PATH)) return { changed: false, entries };

  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const next = stampHtml(html, entries);
  const changed = next !== html;
  if (changed) fs.writeFileSync(INDEX_PATH, next, 'utf8');

  return { changed, entries };
}

/**
 * Minifica una hoja y escribe `<nombre>.min.css`.
 *
 * @param {string} name nombre sin extension (`style`, `theme`)
 */
function minifySheet(name) {
  const sourcePath = path.join(CSS_DIR, `${name}.css`);
  const targetPath = path.join(CSS_DIR, `${name}.min.css`);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Falta ${path.relative(ROOT_DIR, sourcePath)}`);
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  const minified = minifyCss(source);
  assertEquivalent(source, minified, `${name}.css`);

  const header =
    `/*! ${name}.min.css - generado por scripts/build-minify.js desde ${name}.css. ` +
    'No editar a mano. */\n';
  const output = `${header}${minified}\n`;
  const previous = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;

  if (previous !== output) fs.writeFileSync(targetPath, output, 'utf8');

  return {
    name: `${name}.min.css`,
    sourceBytes: Buffer.byteLength(source, 'utf8'),
    bytes: Buffer.byteLength(output, 'utf8'),
    written: previous !== output,
    version: contentHash(output)
  };
}

function main() {
  const results = SHEETS.map(minifySheet);
  const sourceTotal = results.reduce((acc, r) => acc + r.sourceBytes, 0);
  const minTotal = results.reduce((acc, r) => acc + r.bytes, 0);

  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(
      `${r.name.padEnd(14)} ${(r.sourceBytes / 1024).toFixed(1).padStart(7)} KB -> ` +
        `${(r.bytes / 1024).toFixed(1).padStart(6)} KB  ` +
        `${(100 - (r.bytes / r.sourceBytes) * 100).toFixed(1).padStart(5)} % menos` +
        (r.written ? '' : '  (sin cambios)')
    );
  }

  const stamp = stampIndexHtml(results);

  // eslint-disable-next-line no-console
  console.log(
    `[build:css] index.html ${stamp.changed ? 'sellado' : 'sin cambios'}:  ` +
      stamp.entries.map((entry) => `${entry.name}?v=${entry.version}`).join('  ')
  );

  // eslint-disable-next-line no-console
  console.log(
    `[build:css] ${SHEETS.length} hojas  total ${(sourceTotal / 1024).toFixed(1)} KB -> ` +
      `${(minTotal / 1024).toFixed(1)} KB (${(100 - (minTotal / sourceTotal) * 100).toFixed(1)} % menos)`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[build:css] fallo:', error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  CSS_DIR,
  SHEETS,
  INDEX_PATH,
  minifyCss,
  minifySheet,
  contentHash,
  stampHtml,
  stampIndexHtml,
  assertEquivalent,
  main
};
