'use strict';

/**
 * HERRAMIENTA HISTORICA: ya no alimenta el tablero.
 *
 * Los maestros publicados se importan con `npm run build:slot-art` desde el arte
 * del disenador (`s10` = emblema BONO del scatter, `s11` = sello del regalo del
 * multiplicador). Ejecutar este script sobrescribe los dos maestros con el sello
 * anterior derivado de `design/MBETN-LOGO@3x.png`, asi que despues habria que
 * repetir `build:slot-art` y `build:symbols`.
 *
 * Deriva los dos sellos de marca del tablero desde un unico maestro.
 *
 *   design/MBETN-LOGO@3x.png  ->  design/symbols/s10.png  (scatter, SC)
 *                             ->  design/symbols/s11.png  (multiplicador, MX)
 *
 * El maestro llega como PNG cuadrado con **fondo blanco opaco**: el aro, el
 * logotipo y la moneda estan dibujados sobre un lienzo blanco, no sobre alfa.
 * Pintado en una casilla eso se ve como un parche blanco plano sobre la medalla
 * dorada, asi que el script no recorta: **convierte el blanco en alfa**. Para
 * cada pixel toma `a = 255 - min(r, g, b)` (el blanco puro da 0 y la tinta da
 * casi 255) y despeja el color original (`C = (P - 255 + a) * 255 / a`), que es
 * el inverso del alpha blending sobre blanco. Asi los bordes del aro y de las
 * letras conservan su antialias de verdad, sin halo rosado.
 *
 * Encima de ese alfa se repone el **relleno del disco**: el blanco interior del
 * sello vuelve al 90 % de opacidad (`rgba(255, 255, 255, 0.9)`), de modo que los
 * rayos dorados de la casilla (`logo-tile-sheen`) se filtran un 10 % por dentro
 * del aro sin que el logotipo pierda legibilidad. Fuera del circulo el lienzo
 * sigue transparente, asi que el sello se recorta redondo sobre la medalla.
 *
 * Los dos derivados son **el mismo sello circular** —moneda, `m`, `Bet` y el
 * texto interior dentro del aro— y se encajan 1:1 en el lienzo comun de
 * 335 x 341 px, sin sangrado ni recorte de aire (`--logo-bleed: 0%` y
 * `object-view-box: inset(0)` en `style.css`):
 *
 *   - `s10.png` (scatter, SC): el simbolo que mejor paga.
 *   - `s11.png` (multiplicador, MX): el mismo sello, con la etiqueta del valor
 *     (`2x` .. `250x`) que pinta el motor encima.
 *
 * Comparten dibujo a proposito: el tablero tiene un unico sello de marca y lo
 * que distingue a `MX` es la etiqueta del multiplicador, no el arte.
 *
 *   npm run build:seals     # reescribe los dos maestros
 *   npm run build:symbols   # los convierte a WebP (el que se publica)
 *
 * El planeta del logo anterior se conserva fuera del flujo del build en
 * `design/legacy/s10-planeta.png` (los maestros publicables son los `s*.png` de
 * `design/symbols`), para poder volver atras sin tocar el historial de git.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'design', 'MBETN-LOGO@3x.png');
const SYMBOLS_DIR = path.join(ROOT, 'design', 'symbols');
const CANVAS_WIDTH = 335;
const CANVAS_HEIGHT = 341;

/* Opacidad del relleno interior del sello: el disco blanco se repone al 90 %
   (`rgba(255, 255, 255, 0.9)`). El 10 % que queda libre deja pasar los rayos
   dorados de la casilla sin que el logotipo se lave. */
const SEAL_FILL_OPACITY = 0.9;

function readRaw(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

/**
 * Convierte el blanco del lienzo en transparencia (inverso del alpha blending).
 *
 * @param {Buffer} data RGBA en crudo
 * @param {number} width
 * @param {number} height
 * @returns {{ rgba: Buffer, width: number, height: number }}
 */
function whiteToAlpha(data, width, height) {
  const rgba = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = 255 - Math.min(r, g, b);
    if (alpha <= 0) continue;

    const scale = 255 / alpha;
    const solve = (channel) => Math.max(0, Math.min(255, Math.round((channel - 255 + alpha) * scale)));
    rgba[i] = solve(r);
    rgba[i + 1] = solve(g);
    rgba[i + 2] = solve(b);
    rgba[i + 3] = alpha;
  }
  return { rgba, width, height };
}

/**
 * Repone el relleno blanco del sello sobre la tinta ya transparentada.
 *
 * `whiteToAlpha` deja el disco interior en alfa 0, que es lo correcto fuera del
 * circulo pero deja el sello hueco por dentro. Aqui se pinta ese disco en blanco
 * con `SEAL_FILL_OPACITY` (90 %) y la tinta se compone encima con un
 * `source-over` en alfa recto, de modo que el antialias del aro y de las letras
 * se mezcla con el relleno en vez de con el lienzo:
 *
 *   aOut = aInk + fill * (1 - aInk)
 *   COut = (CInk * aInk + 255 * fill * (1 - aInk)) / aOut
 *
 * El filo del disco se dibuja con 1 px de transicion para que el redondeo del
 * escalado no deje un escalon de alfa.
 *
 * @param {{ rgba: Buffer, width: number, height: number }} ink
 * @param {{ cx: number, cy: number, radius: number }} disc
 * @param {number} [opacity]
 * @returns {{ rgba: Buffer, width: number, height: number }}
 */
function fillDisc(ink, disc, opacity = SEAL_FILL_OPACITY) {
  const { width, height } = ink;
  const rgba = Buffer.alloc(ink.rgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const inkAlpha = ink.rgba[i + 3] / 255;
      const distance = Math.hypot(x + 0.5 - disc.cx, y + 0.5 - disc.cy);
      const coverage = Math.max(0, Math.min(1, disc.radius + 0.5 - distance));
      const fillAlpha = opacity * coverage;
      const outAlpha = inkAlpha + fillAlpha * (1 - inkAlpha);
      if (outAlpha <= 0) continue;

      const over = (channel) =>
        Math.round((channel * inkAlpha + 255 * fillAlpha * (1 - inkAlpha)) / outAlpha);
      rgba[i] = over(ink.rgba[i]);
      rgba[i + 1] = over(ink.rgba[i + 1]);
      rgba[i + 2] = over(ink.rgba[i + 2]);
      rgba[i + 3] = Math.round(outAlpha * 255);
    }
  }

  return { rgba, width, height };
}

/** Caja de la tinta (alfa > 8) dentro de un RGBA en crudo. */
function inkBox(rgba, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error('la pieza no tiene tinta');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/** Recorta un RGBA en crudo a la caja indicada. */
function crop(rgba, width, box) {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const from = ((box.top + y) * width + box.left) * 4;
    rgba.copy(out, y * box.width * 4, from, from + box.width * 4);
  }
  return out;
}

/**
 * Encaja una pieza en el lienzo comun 335 x 341 sin deformarla: se escala al
 * ancho del lienzo y se centra en las dos direcciones, de modo que el aire queda
 * repartido y `object-view-box` puede recortarlo con un inset simetrico.
 */
async function fitCanvas(rgba, width, height, label) {
  const scaled = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize({
      width: CANVAS_WIDTH,
      height: Math.max(1, Math.round((height * CANVAS_WIDTH) / width)),
      fit: 'inside',
      kernel: 'lanczos3'
    })
    .png()
    .toBuffer()
    .then((buffer) => readRaw(buffer));

  const box = inkBox(scaled.data, scaled.info.width, scaled.info.height);
  const artWidth = box.width;
  const artHeight = box.height;
  if (artWidth > CANVAS_WIDTH || artHeight > CANVAS_HEIGHT) {
    throw new Error(`${label}: la tinta (${artWidth}x${artHeight}) no cabe en el lienzo`);
  }

  // Se recorta la caja de tinta y se centra en el lienzo comun.
  const tight = crop(scaled.data, scaled.info.width, box);
  const top = Math.round((CANVAS_HEIGHT - artHeight) / 2);
  const left = Math.round((CANVAS_WIDTH - artWidth) / 2);

  const canvas = Buffer.alloc(CANVAS_WIDTH * CANVAS_HEIGHT * 4);
  for (let y = 0; y < artHeight; y += 1) {
    const from = y * artWidth * 4;
    tight.copy(canvas, ((top + y) * CANVAS_WIDTH + left) * 4, from, from + artWidth * 4);
  }

  return { canvas, artWidth, artHeight, top, left };
}
async function writePng(canvas, target) {
  const buffer = await sharp(canvas, { raw: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(target, buffer);
  return buffer;
}



async function main() {
  if (!fs.existsSync(MASTER_PATH)) {
    throw new Error(`Falta el maestro de la marca: ${path.relative(ROOT, MASTER_PATH)}`);
  }

  const master = await readRaw(fs.readFileSync(MASTER_PATH));
  const { width, height } = master.info;
  const ink = whiteToAlpha(master.data, width, height);

  /* El sello del maestro es el bbox de su tinta: ese cuadrado es el circulo y su
     centro y radio son el sistema de referencia del relleno. */
  const sealBox = inkBox(ink.rgba, width, height);
  const disc = {
    cx: sealBox.left + sealBox.width / 2,
    cy: sealBox.top + sealBox.height / 2,
    radius: Math.max(sealBox.width, sealBox.height) / 2
  };

  const filled = fillDisc(ink, disc);
  const seal = await fitCanvas(
    crop(filled.rgba, width, sealBox),
    sealBox.width,
    sealBox.height,
    'sello'
  );

  /* Los dos simbolos de marca caen con el mismo sello circular: se escribe una
     vez y se copia, para que `s10.png` y `s11.png` no puedan divergir. */
  const bytes = await writePng(seal.canvas, path.join(SYMBOLS_DIR, 's11.png'));
  fs.writeFileSync(path.join(SYMBOLS_DIR, 's10.png'), bytes);

  const rows = [
    ['s10.png (scatter)', `${seal.artWidth}x${seal.artHeight} de tinta`, `${(bytes.length / 1024).toFixed(1)} KB`],
    ['s11.png (multiplicador)', `${seal.artWidth}x${seal.artHeight} de tinta`, `${(bytes.length / 1024).toFixed(1)} KB`]
  ];
  for (const row of rows) {
    // eslint-disable-next-line no-console
    console.log(`${row[0].padEnd(24)} ${row[1].padEnd(20)} ${row[2].padStart(9)}  sello circular al ${SEAL_FILL_OPACITY * 100} %`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[build:seals] fallo:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  MASTER_PATH,
  SYMBOLS_DIR,
  SEAL_FILL_OPACITY,
  whiteToAlpha,
  fillDisc,
  inkBox,
  fitCanvas,
  main
};

