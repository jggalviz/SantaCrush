'use strict';

/**
 * Prepara el paquete estatico que se sube al CDN / se integra en el sitio del
 * operador (Laravel, S3, nginx...): copia `public/` a `dist/` dejando fuera lo
 * que solo sirve en desarrollo.
 *
 *   npm run build:dist
 *
 * Se omite a proposito:
 *   - `src/css/style.css` y `theme.css`: las fuentes legibles (0,29 MB). El
 *     HTML enlaza los `.min.css`, asi que publicarlas es peso muerto que ademas
 *     invita a servir la version sin minificar.
 *   - `.preview-*.html`: maquetas internas de comparacion de temas.
 *   - `*.map`, `*.log` y cualquier `.DS_Store`.
 *
 * El resultado es el arbol que se sincroniza con el bucket o se copia a
 * `public/pana-crush/` en el proyecto del operador, mas un
 * `asset-manifest.json` con el inventario y el peso de cada archivo (util para
 * verificar una subida y para el cache-busting manual).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'public');
const TARGET_DIR = path.join(ROOT_DIR, 'dist');

/* Fuentes que no viajan: se sirve su version minificada. */
const EXCLUDED_FILES = new Set(['src/css/style.css', 'src/css/theme.css']);
const EXCLUDED_PATTERNS = [/\.preview-.*\.html$/i, /\.map$/i, /\.log$/i, /(^|\/)\.DS_Store$/];
const EXCLUDED_DIRS = new Set(['.git']);

/**
 * Recorre `public/` y devuelve la lista de archivos que deben publicarse.
 *
 * @param {string} [dir] raiz a recorrer (por defecto `public/`)
 * @returns {{ relative: string, bytes: number }[]}
 */
function planCopy(dir = SOURCE_DIR) {
  const files = [];

  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(SOURCE_DIR, absolute).split(path.sep).join('/');

      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(absolute);
        continue;
      }
      if (EXCLUDED_FILES.has(relative)) continue;
      if (EXCLUDED_PATTERNS.some((pattern) => pattern.test(relative))) continue;

      files.push({ relative, bytes: fs.statSync(absolute).size });
    }
  };

  walk(dir);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

/** Agrupa el inventario por extension para el resumen. */
function summarize(files) {
  const byExtension = new Map();
  for (const file of files) {
    const extension = path.extname(file.relative).toLowerCase() || '(sin extension)';
    const bucket = byExtension.get(extension) || { files: 0, bytes: 0 };
    bucket.files += 1;
    bucket.bytes += file.bytes;
    byExtension.set(extension, bucket);
  }
  return [...byExtension.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
}

function main() {
  if (TARGET_DIR !== path.join(ROOT_DIR, 'dist')) {
    throw new Error('El destino debe ser dist/ en la raiz del proyecto');
  }

  const files = planCopy();
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });

  for (const file of files) {
    const target = path.join(TARGET_DIR, file.relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(SOURCE_DIR, file.relative), target);
  }

  const total = files.reduce((acc, file) => acc + file.bytes, 0);
  const manifest = {
    generatedAt: new Date().toISOString(),
    files: Object.fromEntries(files.map((file) => [file.relative, file.bytes])),
    totalBytes: total
  };
  fs.writeFileSync(
    path.join(TARGET_DIR, 'asset-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  for (const [extension, bucket] of summarize(files)) {
    // eslint-disable-next-line no-console
    console.log(
      `${extension.padEnd(12)} ${String(bucket.files).padStart(3)} archivos  ` +
        `${(bucket.bytes / 1024).toFixed(1).padStart(8)} KB`
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[build:dist] ${path.relative(ROOT_DIR, TARGET_DIR)}/  ${files.length} archivos  ` +
      `total ${(total / 1024 / 1024).toFixed(2)} MB`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[build:dist] fallo:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { SOURCE_DIR, TARGET_DIR, EXCLUDED_FILES, planCopy, summarize, main };
