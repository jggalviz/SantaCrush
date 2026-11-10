'use strict';

/**
 * Normaliza el arte fuente del tablero a los maestros de `design/symbols/`.
 *
 *   <origen>/s1.png .. s9.png        ->  design/symbols/s1.png .. s9.png
 *   <origen>/Bono ....png            ->  design/symbols/s10.png  (scatter, SC)
 *   <origen>/Regalo ....png          ->  design/symbols/s11.png  (multiplicador, MX)
 *
 * El disenador entrega cada pieza en su propio lienzo: los nueve motivos
 * regulares a 404 x 381 px y las dos piezas de marca a ~1.300 px, todas con
 * aire transparente alrededor. El tablero, en cambio, pinta las once casillas
 * con un unico contrato (`npm run build:symbols`): WebP de 335 x 341 px, alfa
 * sin perdida y menos de 48 KB por pieza. Este script es el paso que traduce
 * uno en otro:
 *
 *   1. recorta al bbox de los pixeles visibles (alfa > 8), de modo que el aire
 *      del render no se coma la casilla;
 *   2. encaja la pieza en 335 x 341 px sin deformarla (`contain`), centrada:
 *      el arte grande baja a la resolucion de dibujo del tablero, que es ~80 px
 *      CSS con hasta 3x de densidad;
 *   3. escribe el PNG maestro con el alfa intacto (el WebP publicado lo deriva
 *      despues `npm run build:symbols`, que es el unico que se sirve).
 *
 * Las dos piezas de marca son **dos dibujos distintos** y no se derivan de un
 * logo: el scatter (SC) cae con el emblema BONO y el multiplicador (MX) con el
 * sello del regalo, asi que el jugador distingue el bono del valor que lo
 * multiplica sin leer la etiqueta. `scripts/build-brand-seals.js` queda como
 * herramienta historica del sello anterior y ya no alimenta el tablero.
 *
 *   npm run build:slot-art -- --source="C:/Users/yo/Desktop/Latin Games/5 Santa Crush/slot"
 *   npm run build:symbols     # maestros -> public/src/assets/slot/*.webp
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const TARGET_DIR = path.join(ROOT, 'design', 'symbols');

/* Lienzo comun del tablero (ver scripts/build-symbol-assets.js). */
const CANVAS_WIDTH = 335;
const CANVAS_HEIGHT = 341;

/* Un pixel cuenta como tinta a partir de este alfa: por debajo es el halo de
   compresion del render y recortarlo dejaria un filo duro. */
const ALPHA_THRESHOLD = 8;

/* Las nueve piezas regulares llegan numeradas y en el mismo orden que la tabla
   de pagos (s1 = S1 ... s9 = S9). Las dos piezas de marca llegan nombradas por
   su contenido: este mapa es el unico sitio que traduce ese nombre al hueco del
   tablero, y por eso las reglas son explicitas en vez de adivinar por tamano. */
const BRAND_SOURCES = Object.freeze([
  { pattern: /^bono[\s._-]/i, target: 's10.png', role: 'scatter (SC)' },
  { pattern: /^regalo[\s._-]/i, target: 's11.png', role: 'multiplicador (MX)' }
]);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

/**
 * Carpeta de origen: `--source=<ruta>` o el primer argumento posicional.
 *
 * @param {string[]} argv
 * @returns {string} ruta absoluta existente
 */
function parseSource(argv) {
  const flag = argv.find((arg) => arg.startsWith('--source='));
  const positional = argv.find((arg) => !arg.startsWith('-'));
  const value = (flag ? flag.slice('--source='.length) : positional) || '';
  const cleaned = value.replace(/^["']|["']$/g, '').trim();
  if (!cleaned) {
    throw new Error(
      'Falta la carpeta de origen: npm run build:slot-art -- --source="<carpeta con s1..s9 y las piezas de marca>"'
    );
  }
  const resolved = path.resolve(cleaned);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`No existe la carpeta de origen: ${resolved}`);
  }
  return resolved;
}

/**
 * Empareja cada archivo del origen con su maestro de destino.
 *
 * @param {string} sourceDir
 * @returns {Array<{ file: string, target: string, role: string }>}
 */
function listSources(sourceDir) {
  const files = fs.readdirSync(sourceDir).filter((name) => /\.png$/i.test(name));
  const plan = [];

  for (let index = 1; index <= 9; index += 1) {
    const match = files.find((name) => new RegExp(`^s${index}\\.png$`, 'i').test(name));
    if (match) plan.push({ file: match, target: `s${index}.png`, role: `regular (S${index})` });
  }

  for (const brand of BRAND_SOURCES) {
    const match = files.find((name) => brand.pattern.test(name));
    if (match) plan.push({ file: match, target: brand.target, role: brand.role });
  }

  const found = new Set(plan.map((entry) => entry.target));
  const missing = [];
  for (let index = 1; index <= 9; index += 1) {
    if (!found.has(`s${index}.png`)) missing.push(`s${index}.png`);
  }
  for (const brand of BRAND_SOURCES) {
    if (!found.has(brand.target)) missing.push(`${brand.target} (${brand.pattern})`);
  }
  if (missing.length > 0) {
    throw new Error(`Faltan piezas en ${sourceDir}: ${missing.join(', ')}`);
  }

  return plan.sort((left, right) => Number(left.target.match(/\d+/)[0]) - Number(right.target.match(/\d+/)[0]));
}

/**
 * BBox de los pixeles visibles de un PNG.
 *
 * @param {string|Buffer} input
 * @returns {Promise<{ left: number, top: number, width: number, height: number }>}
 */
async function visibleBox(input) {
  const { data, info } = await sharp(input, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  if (right < left || bottom < top) {
    throw new Error('la pieza no tiene pixeles visibles: revisa el alfa del origen');
  }

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Recorta, encaja en el lienzo comun y devuelve el PNG maestro.
 *
 * @param {string} sourcePath
 * @returns {Promise<{ png: Buffer, source: object, box: object, ink: object }>}
 */
async function normalize(sourcePath) {
  const source = await sharp(sourcePath).metadata();
  const box = await visibleBox(sourcePath);

  const png = await sharp(sourcePath, { limitInputPixels: false })
    .ensureAlpha()
    .extract(box)
    .resize({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: 'lanczos3'
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const meta = await sharp(png).metadata();
  if (meta.width !== CANVAS_WIDTH || meta.height !== CANVAS_HEIGHT) {
    throw new Error(`la salida mide ${meta.width}x${meta.height} y el lienzo es ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`);
  }
  if (!meta.hasAlpha) {
    throw new Error('la salida perdio el canal alfa');
  }

  const ink = await visibleBox(png);
  if (ink.width < CANVAS_WIDTH * 0.3 || ink.height < CANVAS_HEIGHT * 0.3) {
    throw new Error(`la pieza quedo diminuta en el lienzo (${ink.width}x${ink.height})`);
  }

  return { png, source, box, ink };
}

async function main() {
  const sourceDir = parseSource(process.argv.slice(2));
  const plan = listSources(sourceDir);
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  let written = 0;
  for (const entry of plan) {
    const sourcePath = path.join(sourceDir, entry.file);
    const targetPath = path.join(TARGET_DIR, entry.target);
    // eslint-disable-next-line no-await-in-loop
    const { png, source, box, ink } = await normalize(sourcePath);

    const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
    const identical = current !== null && current.equals(png);
    if (!identical) {
      fs.writeFileSync(targetPath, png);
      written += 1;
    }

    const air = `${CANVAS_WIDTH - ink.width}x${CANVAS_HEIGHT - ink.height}`;
    // eslint-disable-next-line no-console
    console.log(
      `${entry.target.padEnd(8)} <- ${entry.file.slice(0, 34).padEnd(34)} ` +
        `${`${source.width}x${source.height}`.padStart(9)}  recorte ${`${box.width}x${box.height}`.padStart(9)}  ` +
        `tinta ${`${ink.width}x${ink.height}`.padStart(8)} (aire ${air.padEnd(7)}) ` +
        `${kb(png.length).padStart(8)}${identical ? '  (sin cambios)' : ''}`
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n[build:slot-art] ${path.relative(ROOT, TARGET_DIR)}  ${written}/${plan.length} reescritos  ` +
      `lienzo ${CANVAS_WIDTH}x${CANVAS_HEIGHT}`
  );
  if (written > 0) {
    // eslint-disable-next-line no-console
    console.log('[build:slot-art] siguiente paso: npm run build:symbols (genera los WebP que se sirven)');
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[build:slot-art] fallo:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  TARGET_DIR,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  BRAND_SOURCES,
  parseSource,
  listSources,
  visibleBox,
  normalize,
  main
};
