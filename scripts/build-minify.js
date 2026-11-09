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
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const CSS_DIR = path.join(ROOT_DIR, 'public', 'src', 'css');
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
    written: previous !== output
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

module.exports = { CSS_DIR, SHEETS, minifyCss, minifySheet, assertEquivalent, main };
