'use strict';

/**
 * Convierte los once maestros del tablero a WebP con alfa sin perdida.
 *
 *   design/symbols/s1.png .. s11.png  ->  public/src/assets/slot/s1.webp .. s11.webp
 *
 * Las once piezas se pintan a ~80 px CSS (hasta 3x de densidad), asi que no se
 * reescala el arte: 335 x 341 px es la resolucion de dibujo y el WebP conserva
 * exactamente ese lienzo. Lo que cambia es el codec: el PNG de estos balones
 * pesa ~170 KB porque guarda el alfa sin comprimir, mientras que el WebP con
 * `alphaQuality: 100` deja el canal alfa intacto (sin perdida) y comprime el
 * color con perdida de alta calidad, bajando cada pieza a ~25 KB.
 *
 * Los PNG de `design/` son los maestros (no se publican): el arbol `public/` es
 * lo que se sube al CDN, asi que el peso muerto no debe vivir ahi.
 *
 *   npm run build:symbols            # escribe los WebP que falten o cambien
 *   SYMBOL_QUALITY=88 npm run build:symbols
 *
 * Garantias que comprueba el script antes de escribir:
 *   1. la salida es WebP real y de un solo cuadro (sin animacion);
 *   2. mide exactamente lo mismo que el maestro;
 *   3. el canal alfa decodificado es identico (alphaQuality sin perdida);
 *   4. cada pieza cabe en el tope de peso del contrato.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'design', 'symbols');
const TARGET_DIR = path.join(ROOT, 'public', 'src', 'assets', 'slot');

/* Calidad de color: 90 sobre un balon de 335 px es indistinguible del PNG a
   tamano de casilla y deja margen para el alfa sin perdida. */
// El arte de Santa Crush trae mas detalle por pieza que el set anterior (s5..s9
// rozan el tope de 48 KB a q=90). A q=82 la pieza mas pesada baja a 45.3 KB y
// deja aire para cualquier pieza nueva.
const QUALITY = Number(process.env.SYMBOL_QUALITY || 82);

/* Unica excepcion por pieza: el emblema BONO (scatter) junta oro, cintas,
   nieve y letras con antialias en el mismo lienzo, y a q=82 se pasa del tope
   (50.5 KB). A q=76 queda en 45.2 KB y a tamano de casilla no se distingue del
   maestro, asi que el resto del set conserva su calidad. */
const QUALITY_OVERRIDES = Object.freeze({ 's10.png': 76 });

/** Calidad efectiva de un maestro: su excepcion o la del set. */
function qualityFor(name) {
  return QUALITY_OVERRIDES[name] || QUALITY;
}

/* Tope por pieza: si un simbolo se pasa, el build falla y hay que revisar el
   arte en vez de publicar un tablero pesado sin enterarse. */
const MAX_BYTES = Number(process.env.SYMBOL_MAX_BYTES || 48 * 1024);

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function listMasters() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error(`Falta la carpeta de maestros: ${path.relative(ROOT, SOURCE_DIR)}`);
  }
  return fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => /^s\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
}

/**
 * Decodifica el WebP y comprueba que no altero el canal alfa.
 *
 * @param {Buffer} webp
 * @param {Buffer} sourceAlpha canal alfa del maestro en crudo
 * @returns {Promise<{ meta: object, info: object, alphaDiff: number }>}
 */
async function decode(webp, sourceAlpha) {
  const { data, info } = await sharp(webp, { limitInputPixels: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let alphaDiff = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== sourceAlpha[i]) alphaDiff += 1;
  }

  const meta = await sharp(webp).metadata();
  return { meta, info, alphaDiff };
}


async function build(name) {
  const sourcePath = path.join(SOURCE_DIR, name);
  const targetName = name.replace(/\.png$/i, '.webp');
  const targetPath = path.join(TARGET_DIR, targetName);

  const master = await sharp(sourcePath).metadata();
  const alpha = await sharp(sourcePath).ensureAlpha().raw().toBuffer();
  const quality = qualityFor(name);

  const webp = await sharp(sourcePath)
    .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();

  const { meta, info, alphaDiff } = await decode(webp, alpha);

  if (meta.format !== 'webp') {
    throw new Error(`${targetName}: la salida no es WebP (${meta.format})`);
  }
  if (meta.pages && meta.pages > 1) {
    throw new Error(`${targetName}: la salida salio animada (${meta.pages} cuadros)`);
  }
  if (info.width !== master.width || info.height !== master.height) {
    throw new Error(
      `${targetName}: mide ${info.width}x${info.height} y el maestro ${master.width}x${master.height}`
    );
  }
  if (alphaDiff > 0) {
    throw new Error(`${targetName}: el WebP altero el alfa en ${alphaDiff} pixeles`);
  }
  if (webp.length >= MAX_BYTES) {
    throw new Error(
      `${targetName}: ${kb(webp.length)} supera el tope de ${kb(MAX_BYTES)}; ` +
        'baja SYMBOL_QUALITY o revisa el maestro antes de publicarlo'
    );
  }

  const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath) : null;
  const identical = current !== null && current.equals(webp);

  if (!identical) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    fs.writeFileSync(targetPath, webp);
  }

  return {
    targetName,
    masterBytes: fs.statSync(sourcePath).size,
    bytes: webp.length,
    width: info.width,
    height: info.height,
    quality,
    written: !identical
  };
}

async function main() {
  const masters = listMasters();
  if (masters.length === 0) {
    throw new Error(`No hay maestros s1..s11 en ${path.relative(ROOT, SOURCE_DIR)}`);
  }

  const results = [];
  for (const name of masters) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await build(name));
  }

  const masterTotal = results.reduce((acc, r) => acc + r.masterBytes, 0);
  const webpTotal = results.reduce((acc, r) => acc + r.bytes, 0);
  const written = results.filter((r) => r.written).length;

  for (const r of results) {
    // eslint-disable-next-line no-console
    console.log(
      `${r.targetName.padEnd(10)} ${`${r.width}x${r.height}`.padEnd(9)} ` +
        `${kb(r.masterBytes).padStart(9)} -> ${kb(r.bytes).padStart(8)}  ` +
        `${(100 - (r.bytes / r.masterBytes) * 100).toFixed(1).padStart(5)} % menos` +
        `  q=${r.quality}` +
        (r.written ? '' : '  (sin cambios)')
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n[build:symbols] ${path.relative(ROOT, TARGET_DIR)}  ` +
      `${written}/${results.length} reescritos  ` +
      `total ${kb(masterTotal)} -> ${kb(webpTotal)} ` +
      `(${(100 - (webpTotal / masterTotal) * 100).toFixed(1)} % menos, q=${QUALITY})`
  );
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[build:symbols] fallo:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { SOURCE_DIR, TARGET_DIR, listMasters, build, main };
