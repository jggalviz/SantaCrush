#!/usr/bin/env node
'use strict';

/**
 * Optimiza el logotipo animado de Santa Crush.
 *
 *   npm run build:logo
 *
 * El maestro vive en `design/SANTA-CRUSH-LOGO-ANIMADO.gif`: una tira vertical
 * de 12 fotogramas de 959 x 587 px (959 x 7044 en total) con canal alfa y
 * 2,4 MB. Igual que el arte del case, se guarda fuera de `public/` porque todo
 * lo que hay en `public/src/**` se publica en el CDN y el GIF completo viajaria
 * en cada deploy.
 *
 * El script escribe `public/src/assets/SANTA-CRUSH-LOGO-ANIMADO.webp` respetando
 * el contrato de `test/frontendAssets.test.js`:
 *   - WebP ANIMADO real (VP8X con flag ANIM + un bloque ANMF por fotograma): el
 *     navegador lo reproduce solo dentro del `<img>`, sin JS ni sprites CSS, y
 *     el archivo pesa ~7 veces menos que el GIF;
 *   - los 12 fotogramas y sus retardos originales (270, 30, 230, 70, 200, 100,
 *     170, 130, 130, 170, 100, 270 ms; 1,88 s de ciclo) se conservan: la
 *     cadencia del baile del mono es parte del arte, no un detalle del formato;
 *   - el lienzo del fotograma se mantiene entero (959 x 587), sin recortar el
 *     alfa: el CSS reserva la caja con esa misma relacion (1,6337) y asi el
 *     logo no salta al cargar;
 *   - 480 px de ancho, que cubre 1,9x el tamano con el que el CSS lo pinta en un
 *     telefono (0,72 del ancho de la maquina) y evita reescalados visibles en la
 *     mayoria de pantallas;
 *   - alfa exacta: `alphaQuality: 100` comprime el canal alfa sin perdida.
 *
 * Calidad 72 y no 84: el logo va en movimiento y a 480 px nativo el error es
 * indistinguible, mientras que cada punto de calidad cuesta ~5 KB sobre un
 * archivo que ya lleva 12 fotogramas. `smartSubsample` y `effort: 6` recortan
 * peso sin tocar la silueta.
 *
 * Es idempotente: misma entrada y misma calidad -> mismos bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const NAME = 'SANTA-CRUSH-LOGO-ANIMADO.webp';
const SOURCE = path.join(ROOT, 'design', 'SANTA-CRUSH-LOGO-ANIMADO.gif');
const TARGET = path.join(ROOT, 'public', 'src', 'assets', NAME);
const DEPLOY = path.join(ROOT, '.vercel', 'output', 'static', 'src', 'assets', NAME);

// Contrato del maestro: 12 fotogramas de 959 x 587 con estos retardos. Si el
// arte cambia, este bloque y el test del logo se actualizan juntos.
const FRAME_WIDTH = 959;
const FRAME_HEIGHT = 587;
const ASPECT = FRAME_WIDTH / FRAME_HEIGHT;
const FRAMES = 12;
const DELAYS = [270, 30, 230, 70, 200, 100, 170, 130, 130, 170, 100, 270];

// Ancho servido y tope de peso. 480 px cubre casi 2x el tamano con el que el
// CSS pinta la chapa en un telefono; 480 KB deja aire al presupuesto movil de
// assets (3,4 MB contando este logo).
const WIDTH = Number(process.env.LOGO_WIDTH || 480);
const MAX_BYTES = 480 * 1024;

// Ver el comentario de cabecera: 72 deja el archivo muy por debajo del tope y
// en movimiento no se distingue del maestro.
const QUALITY = Number(process.env.LOGO_QUALITY || 72);

/** Compara dos listas de retardos (sharp las devuelve en ms). */
function sameDelays(a = [], b = []) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

(async () => {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Falta el maestro del logo: ${path.relative(ROOT, SOURCE)}`);
  }

  const source = await sharp(SOURCE, { animated: true }).metadata();
  if (source.format !== 'gif') {
    throw new Error(`El maestro debe ser un GIF animado (es ${source.format})`);
  }
  if (!source.hasAlpha) {
    throw new Error('El maestro del logo debe traer canal alfa: la chapa va sobre el arte del marco');
  }
  if (source.width !== FRAME_WIDTH || source.pageHeight !== FRAME_HEIGHT) {
    throw new Error(
      `Cada fotograma mide ${source.width}x${source.pageHeight} y el contrato exige ` +
        `${FRAME_WIDTH}x${FRAME_HEIGHT}: actualiza el test y este script antes de publicarlo`
    );
  }
  if (source.pages !== FRAMES || !sameDelays(source.delay, DELAYS)) {
    throw new Error(
      `El maestro trae ${source.pages} fotogramas con retardos ${source.delay.join(',')}; ` +
        `el contrato espera ${FRAMES} con ${DELAYS.join(',')}`
    );
  }

  const width = Math.min(WIDTH, FRAME_WIDTH);
  const height = Math.round(width / ASPECT);

  // Solo se fija el ancho: sharp decodifica el GIF como 12 paginas de 959 x 587,
  // asi que `resize` escala cada fotograma y deriva su alto de la relacion del
  // lienzo. Pasarle un `height` multiplicado por los fotogramas lo aplicaria a
  // CADA pagina y el archivo saldria 12 veces mas alto.
  const webp = await sharp(SOURCE, { animated: true, pages: -1 })
    .resize({ width, kernel: 'lanczos3' })
    .webp({ quality: QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();

  const output = await sharp(webp, { animated: true }).metadata();
  if (output.format !== 'webp') {
    throw new Error(`La salida no es WebP (${output.format})`);
  }
  if (output.pages !== FRAMES) {
    throw new Error(`El WebP trae ${output.pages} fotogramas y deben viajar los ${FRAMES}`);
  }
  if (!sameDelays(output.delay, DELAYS)) {
    throw new Error(`El WebP altero la cadencia: ${output.delay.join(',')} en vez de ${DELAYS.join(',')}`);
  }
  if (output.width !== width || Math.round(output.height / (output.pages || 1)) !== height) {
    throw new Error(
      `El WebP mide ${output.width}x${output.height} en ${output.pages} fotogramas y se esperaba ` +
        `${width}x${height} por fotograma`
    );
  }
  if (!output.hasAlpha) {
    throw new Error('El WebP perdio el canal alfa: revisa alphaQuality');
  }

  if (webp.length >= MAX_BYTES) {
    throw new Error(
      `El logo pesa ${(webp.length / 1024).toFixed(1)} KB y el contrato exige menos de ` +
        `${MAX_BYTES / 1024} KB: baja LOGO_QUALITY antes de publicarlo`
    );
  }

  fs.writeFileSync(TARGET, webp);
  // `.vercel/output` es un hard link del repo: si se rompe, se refresca a mano.
  if (fs.existsSync(DEPLOY) && fs.statSync(DEPLOY).ino !== fs.statSync(TARGET).ino) {
    fs.copyFileSync(TARGET, DEPLOY);
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  const seconds = (DELAYS.reduce((acc, ms) => acc + ms, 0) / 1000).toFixed(2);
  console.log(
    `origen  ${path.relative(ROOT, SOURCE)}  ${source.width}x${source.pageHeight} x${source.pages}  ` +
      `${kb(fs.statSync(SOURCE).size)}`
  );
  console.log(
    `salida  ${path.relative(ROOT, TARGET)}  ${output.width}x${height} x${output.pages}  ` +
      `${kb(webp.length)} (q=${QUALITY}, ${seconds} s de ciclo, alfa intacta)`
  );
  console.log(
    `ahorro  ${(100 - (webp.length / fs.statSync(SOURCE).size) * 100).toFixed(1)} % menos que el maestro`
  );
})().catch((err) => {
  console.error(`build:logo · ${err.message}`);
  process.exitCode = 1;
});
