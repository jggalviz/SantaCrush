#!/usr/bin/env node
'use strict';

/**
 * Recorta y optimiza el ARTE NAVIDEÃ‘O de ESCRITORIO de Santa Crush.
 *
 *   npm run build:theme-art
 *
 * Los maestros viven en `design/` (nunca se publican: el CDN solo sirve
 * `public/**`) y el destino es el arbol tematico `public/assets/santa-crush/**`
 * que declara `config/gameConfig.js` -> `ASSETS`.
 *
 * Piezas:
 *   design/bg_desktop_toy_workshop.png  -> bg/bg-desktop.webp
 *       1672 x 941, opaco. El taller de juguetes es el escenario del escritorio
 *       y se pinta con `cover` + `center`, asi que se publica sin recortar y
 *       sin alfa (un canal transparente que nadie usa es peso muerto).
 *   design/frame_desktop_candy.png      -> console/slot-frame.webp
 *       1305 x 1090, recortado al bbox de alfa. Marco de caramelos de la
 *       ventana del tablero; el CSS lo pinta `100% 100%` sobre una caja con su
 *       relacion exacta y coloca `.board` en % de la ventana transparente.
 *   design/console_desktop_buttons.png  -> console/console-desktop.webp
 *       1041 x 1497, recortado al bbox de alfa. Columna lateral completa:
 *       Santa y el reno (hero), las tres placas del HUD, la fila - / lectura /
 *       + / MAX y los dos pulsadores grandes (AUTOGIRO y GIRAR).
 *
 * Movil (retrato, `movil/`):
 *   design/bg_mobile_toy_workshop.png   -> bg/bg-mobile.webp
 *       941 x 1672, opaco. El taller de juguetes en vertical: `body` lo pinta
 *       con `cover` + `center` por debajo de 900 px, sin recortar.
 *   design/frame_mobile_gold_bells.png  -> console/slot-frame-mobile.webp
 *       1447 x 1076, recortado al bbox de alfa. Marco de campanas doradas con
 *       las tres placas del HUD arriba y la ventana del tablero debajo.
 *   design/console_mobile_santa_reindeer.png -> console/console-mobile.webp
 *       1775 x 879, recortado al bbox de alfa. Panel con Santa y reno: los
 *       cinco discos (CRUSH, AUTO, GIRAR, - y +) y la fila de capsulas del pie.
 *
 * Cada pieza:
 *   1. mide el bbox de los pixeles con alfa visible (las opacas, el lienzo);
 *   2. comprueba que el recorte respeta la relacion declarada, que es la que
 *      usa el CSS (si el arte cambia de proporcion, esto falla y obliga a
 *      volver a medir los anclajes antes de publicar);
 *   3. escribe el WebP al tamano exacto de su lienzo y aplica el tope de peso.
 *
 * Es idempotente: misma entrada y misma calidad -> mismos bytes.
 * Ver `docs/ASSETS.md`.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(ROOT, 'public', 'assets', 'santa-crush');

const PIECES = [
  {
    name: 'bg-desktop',
    label: 'fondo del taller de juguetes',
    source: path.join(ROOT, 'design', 'bg_desktop_toy_workshop.png'),
    target: path.join(THEME_DIR, 'bg', 'bg-desktop.webp'),
    canvas: { width: 1672, height: 941 },
    opaque: true,
    quality: 78,
    maxBytes: 420 * 1024
  },
  {
    name: 'slot-frame',
    label: 'marco de caramelos del tablero',
    source: path.join(ROOT, 'design', 'frame_desktop_candy.png'),
    target: path.join(THEME_DIR, 'console', 'slot-frame.webp'),
    canvas: { width: 1305, height: 1090 },
    quality: 90,
    maxBytes: 340 * 1024
  },
  {
    name: 'console-desktop',
    label: 'consola de mandos (hero + placas + pulsadores)',
    source: path.join(ROOT, 'design', 'console_desktop_buttons.png'),
    target: path.join(THEME_DIR, 'console', 'console-desktop.webp'),
    canvas: { width: 1041, height: 1497 },
    quality: 88,
    maxBytes: 620 * 1024
  },
  /* --- Movil (retrato) ---------------------------------------------------
     Mismo contrato que el escritorio, con los maestros de `movil/` copiados a
     `design/`. El marco y la consola se recortan al bbox de su alfa y se
     publican al lienzo que declara el CSS; el fondo vertical es opaco. */
  {
    name: 'bg-mobile',
    label: 'fondo vertical del taller de juguetes',
    source: path.join(ROOT, 'design', 'bg_mobile_toy_workshop.png'),
    target: path.join(THEME_DIR, 'bg', 'bg-mobile.webp'),
    canvas: { width: 941, height: 1672 },
    opaque: true,
    quality: 76,
    maxBytes: 340 * 1024
  },
  {
    name: 'slot-frame-mobile',
    label: 'marco de campanas doradas del tablero',
    source: path.join(ROOT, 'design', 'frame_mobile_gold_bells.png'),
    target: path.join(THEME_DIR, 'console', 'slot-frame-mobile.webp'),
    canvas: { width: 1447, height: 1076 },
    quality: 86,
    maxBytes: 340 * 1024
  },
  {
    name: 'console-mobile',
    label: 'consola movil (Santa y reno + discos + capsulas)',
    source: path.join(ROOT, 'design', 'console_mobile_santa_reindeer.png'),
    target: path.join(THEME_DIR, 'console', 'console-mobile.webp'),
    canvas: { width: 1775, height: 879 },
    quality: 86,
    maxBytes: 440 * 1024
  }
];

/** BBox de los pixeles con alfa visible. */
function alphaBox(data, width, height, channels, threshold = 8) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[(row + x) * channels + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('La imagen no tiene un solo pixel visible: revisa el alfa del arte');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const pct = (n, d) => `${((n / d) * 100).toFixed(2)}%`;

async function build({ name, label, source, target, canvas, opaque, quality, maxBytes }) {
  if (!fs.existsSync(source)) {
    throw new Error(`Falta el arte de origen: ${path.relative(ROOT, source)}`);
  }

  const meta = await sharp(source).metadata();
  let output;

  if (opaque) {
    if (meta.width !== canvas.width || meta.height !== canvas.height) {
      throw new Error(
        `${name}: el maestro mide ${meta.width}x${meta.height} y el lienzo declarado es ` +
          `${canvas.width}x${canvas.height}. El fondo se pinta con 'cover', asi que se publica sin recortar.`
      );
    }
    console.log(`${name} (${label})  origen ${meta.width}x${meta.height}  opaco, sin recorte`);
    output = await sharp(source)
      .flatten({ background: '#0a1c4a' })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();
  } else {
    const base = sharp(source).ensureAlpha();
    const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
    const box = alphaBox(data, info.width, info.height, info.channels);

    const canvasRatio = canvas.width / canvas.height;
    const ratio = box.width / box.height;
    console.log(
      `${name} (${label})  origen ${meta.width}x${meta.height}  recorte ${box.width}x${box.height} ` +
        `(ratio ${ratio.toFixed(4)} vs ${canvasRatio.toFixed(4)})`
    );
    if (Math.abs(ratio - canvasRatio) > 0.002) {
      throw new Error(
        `${name}: el recorte visible no respeta la relacion ${canvas.width}/${canvas.height}: ` +
          `${box.width}x${box.height} da ${ratio.toFixed(4)}. Vuelve a medir los anclajes del CSS ` +
          'y actualiza `canvas` antes de publicar.'
      );
    }

    output = await sharp(source)
      .ensureAlpha()
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .resize(canvas.width, canvas.height, { fit: 'fill' })
      .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
      .toBuffer();

    console.log(
      `     lienzo del CSS: ${canvas.width}x${canvas.height}  bbox en el maestro x ${box.left} ` +
        `(${pct(box.left, meta.width)}) Â· y ${box.top} (${pct(box.top, meta.height)})`
    );
  }

  const out = await sharp(output).metadata();
  if (out.width !== canvas.width || out.height !== canvas.height) {
    throw new Error(
      `${name}: el WebP generado mide ${out.width}x${out.height}, se esperaba ${canvas.width}x${canvas.height}`
    );
  }
  if (output.length > maxBytes) {
    throw new Error(
      `${name}: el WebP pesa ${kb(output.length)} y el tope es ${kb(maxBytes)}. Baja la calidad o revisa el arte.`
    );
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  console.log(
    `  -> ${path.relative(ROOT, target)}  ${out.width}x${out.height}  ${kb(output.length)} ` +
      `(q=${quality})  fuente ${kb(fs.statSync(source).size)}`
  );
}

(async () => {
  for (const piece of PIECES) {
    await build(piece);
  }
})().catch((err) => {
  console.error(`build:theme-art Â· ${err.message}`);
  process.exitCode = 1;
});
