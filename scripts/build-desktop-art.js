#!/usr/bin/env node
'use strict';

/**
 * Recorta y optimiza el arte maestro de la maquina de ESCRITORIO.
 *
 *   npm run build:desktop-art
 *
 * Los maestros viven en `design/` (nunca se publican: el CDN solo sirve
 * `public/src/**`) y llegan con un lienzo mayor y margenes transparentes
 * alrededor del dibujo. El CSS dibuja cada pieza con `background: url(...)
 * center / 100% 100%` sobre una caja con la relacion exacta de su recorte y
 * coloca los controles en % de esa caja: cualquier pixel transparente de mas
 * descentraria el dibujo y desalinearia las areas tactiles.
 *
 * Piezas del tema MeridianoBet Crush:
 *   design/d1.png -> public/src/assets/d1.webp  (1033 x 843) marco del tablero
 *   design/d2.png -> public/src/assets/d2.webp  ( 655 x 928) columna lateral:
 *                    nube del logo + 3 placas + consola completa (− / lectura
 *                    / + / MAX · GIRAR · FEVER · AUTO) en una sola pieza
 *
 * El tema anterior repartia la columna en dos piezas (`d5`, modulo hero con la
 * nube y las placas, y `d3`, la consola). Ambas quedan archivadas en `design/`:
 * el arte nuevo las funde en `d2`, asi que la columna entera se ancla con un
 * unico lienzo y no hay costura entre el hero y la consola.
 *
 * El script, para cada pieza:
 *   1. mide el bbox de los pixeles con alfa visible;
 *   2. comprueba que ese recorte respeta la relacion declarada aqui (que es la
 *      que usa el CSS: si el arte cambia de proporcion, esto falla y obliga a
 *      volver a medir los anclajes antes de publicar);
 *   3. escribe el WebP con alfa al tamano exacto del recorte.
 *
 * Es idempotente: misma entrada y misma calidad -> mismos bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { paintGirarPlate } = require('./lib/girarPlate');

const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'public', 'src', 'assets');
const DEPLOY_DIR = path.join(ROOT, '.vercel', 'output', 'static', 'src', 'assets');

/**
 * Lienzo de diseno de cada pieza: el CSS coloca sus capas en % de esta caja,
 * asi que el recorte visible tiene que medir exactamente lo mismo. La calidad
 * es la del contrato (`q = 90`): los degradados dorados y los brillos de
 * caramelo hacen banding visible por debajo.
 */
const PIECES = [
  {
    name: 'd1',
    label: 'marco del tablero',
    canvas: { width: 1033, height: 843 },
    quality: 90,
    maxBytes: 300 * 1024
  },
  // La columna lateral entera (655 x 928 de alfa sobre un maestro de 657 x 942)
  // se publica sin reescalar: en 1920 px el panel se pinta a ~670 px de ancho y
  // el arte va sobrado para DPR 2.
  // `paint` completa el arte antes de recortar: el maestro deja la franja del
  // GIRAR en el verde de la tarjeta y `scripts/lib/girarPlate.js` dibuja ahi la
  // placa roja (aro dorado, bisel y sombra) con el mismo lenguaje que los otros
  // cinco controles. Se aplica sobre la copia, nunca sobre `design/d2.png`.
  {
    name: 'd2',
    label: 'columna lateral (hero + consola)',
    canvas: { width: 655, height: 928 },
    paint: paintGirarPlate,
    quality: 90,
    maxBytes: 560 * 1024
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

/** BBox de los pixeles con alfa visible de un buffer ya decodificado. */
async function bboxOf(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return alphaBox(data, info.width, info.height, info.channels);
}

async function build({ name, label, canvas, quality, maxBytes, paint }) {
  const source = path.join(ROOT, 'design', `${name}.png`);
  const target = path.join(ASSETS_DIR, `${name}.webp`);
  if (!fs.existsSync(source)) {
    throw new Error(`Falta el arte de origen: ${path.relative(ROOT, source)}`);
  }

  // El maestro llega en PNG sin perdida; si la pieza declara `paint`, la capa
  // generada se compone aqui y el resto del proceso trabaja sobre esa copia.
  const raw = await sharp(source).ensureAlpha().png().toBuffer();
  const meta = await sharp(raw).metadata();

  // El recorte se mide SIEMPRE sobre el maestro. Una capa generada puede anadir
  // pixeles opacos fuera del dibujo (un aro, una sombra, un halo) y con ello
  // mover el encuadre que anclan los porcentajes del CSS: el arte se pintaria
  // desplazado respecto a su caja tactil. Por eso el bbox se toma antes de
  // pintar y despues se comprueba que la capa no lo ha estirado.
  const box = await bboxOf(raw);
  const art = paint ? await paint(raw) : raw;
  if (paint) {
    const painted = await bboxOf(art);
    const drift = ['left', 'top', 'width', 'height'].some(
      (key) => Math.abs(painted[key] - box[key]) > 1
    );
    if (drift) {
      throw new Error(
        `${name}: la capa generada mueve el recorte del maestro ` +
          `(${box.left},${box.top} ${box.width}x${box.height} -> ` +
          `${painted.left},${painted.top} ${painted.width}x${painted.height}). ` +
          'La placa debe quedarse dentro de su caja tactil: los anclajes del CSS no se mueven.'
      );
    }
  }

  const canvasRatio = canvas.width / canvas.height;
  const ratio = box.width / box.height;
  console.log(
    `${name} (${label})  origen ${meta.width}x${meta.height}  recorte ` +
      `${box.width}x${box.height} (ratio ${ratio.toFixed(4)} vs ${canvasRatio.toFixed(4)})`
  );
  if (Math.abs(ratio - canvasRatio) > 0.002) {
    throw new Error(
      `${name}: el recorte visible no respeta la relacion ${canvas.width}/${canvas.height}: ` +
        `${box.width}x${box.height} da ${ratio.toFixed(4)}. Vuelve a medir los anclajes del CSS ` +
        'y actualiza `canvas` antes de publicar.'
    );
  }

  const trimmed = await sharp(art)
    .ensureAlpha()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .resize(canvas.width, canvas.height, { fit: 'fill' })
    .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();

  const out = await sharp(trimmed).metadata();
  if (out.width !== canvas.width || out.height !== canvas.height) {
    throw new Error(
      `${name}: el WebP generado mide ${out.width}x${out.height}, se esperaba ${canvas.width}x${canvas.height}`
    );
  }
  if (trimmed.length > maxBytes) {
    throw new Error(
      `${name}: el WebP pesa ${kb(trimmed.length)} y el tope es ${kb(maxBytes)}. Revisa el arte.`
    );
  }

  fs.writeFileSync(target, trimmed);
  // `.vercel/output` es un hard link del repo: si se rompe, se refresca a mano.
  const deploy = path.join(DEPLOY_DIR, `${name}.webp`);
  if (fs.existsSync(deploy) && fs.statSync(deploy).ino !== fs.statSync(target).ino) {
    fs.copyFileSync(target, deploy);
  }

  // Las capas del CSS se anclan en % de este lienzo (bolsillo del marco, placas
  // del HUD, discos de la consola): el log deja las mismas medidas que usa la
  // hoja de estilo para que cualquier recalibracion sea trazable.
  console.log(
    `  -> ${path.relative(ROOT, target)}  ${out.width}x${out.height}  ${kb(trimmed.length)} ` +
      `(q=${quality}, alfa intacto)  fuente ${kb(fs.statSync(source).size)}`
  );
  console.log(
    `     bbox en el maestro: x ${box.left} (${pct(box.left, meta.width)}) · ` +
      `y ${box.top} (${pct(box.top, meta.height)})`
  );
}

(async () => {
  for (const piece of PIECES) {
    await build(piece);
  }
})().catch((err) => {
  console.error(`build:desktop-art · ${err.message}`);
  process.exitCode = 1;
});
