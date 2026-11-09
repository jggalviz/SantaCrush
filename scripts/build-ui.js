'use strict';

/**
 * Genera `public/ui/**` a partir de `ui/**`.
 *
 * `ui/` es la fuente canonica de la capa grafica (ES Modules). El navegador y
 * el CDN solo publican `public/**`, asi que este build materializa un espejo
 * byte a byte. No se edita `public/ui/**` a mano:
 *
 *   npm run build:ui
 *
 * Se ejecuta en `npm start`, `npm run dev` y `vercel-build`. La suite de tests
 * falla si el espejo queda desactualizado.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'ui');
const TARGET_DIR = path.join(ROOT_DIR, 'public', 'ui');

function listModules(dir = SOURCE_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return listModules(absolute);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolute] : [];
  });
}

/**
 * Copia todos los modulos `.js` del arbol `ui/` a `public/ui/`.
 * Limpia el destino para que no sobrevivan modulos eliminados.
 *
 * @returns {{ modules: number, targetDir: string }}
 */
function writeUiMirror() {
  const modules = listModules();
  fs.rmSync(TARGET_DIR, { recursive: true, force: true });

  for (const source of modules) {
    const relative = path.relative(SOURCE_DIR, source);
    const target = path.join(TARGET_DIR, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }

  return { modules: modules.length, targetDir: TARGET_DIR };
}

if (require.main === module) {
  const { modules } = writeUiMirror();
  // eslint-disable-next-line no-console
  console.log(`[build:ui] ${path.relative(ROOT_DIR, TARGET_DIR)} actualizado (${modules} modulos).`);
}

module.exports = { SOURCE_DIR, TARGET_DIR, listModules, writeUiMirror };
