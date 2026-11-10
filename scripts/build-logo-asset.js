#!/usr/bin/env node
'use strict';

/**
 * Publica el logotipo animado de Santa Crush.
 *
 *   npm run build:logo
 *
 * El maestro vive en `design/SANTA-CRUSH-LOGO-ANIMADO.gif`: 959 x 587 px, 12
 * fotogramas con canal alfa y 2,5 MB (el lockup del mono Santa con el rotulo
 * SANTA CRUSH, la corona de acebo y la campana que se mece). Igual que el resto
 * del arte se guarda fuera de `public/`, porque todo lo que hay en `public/src/**`
 * se publica en el CDN y el GIF completo viajaria en cada deploy.
 *
 * El script escribe `public/src/assets/SANTA-CRUSH-LOGO.webp` respetando el
 * contrato de `test/frontendAssets.test.js`:
 *   - WebP ANIMADO de verdad (VP8X + bloque ANIM + un ANMF por fotograma) y con
 *     alfa real, para que el logo flote sobre la nube del hero sin caja blanca;
 *   - 480 x 294 px, la proporcion 959/587 del maestro. El CSS lo pinta a ~390 px
 *     de ancho en escritorio y ~330 px en un telefono de 430 px, asi que 480
 *     cubre el caso normal sin reescalar de forma visible;
 *   - los 12 fotogramas y sus retardos se conservan tal cual: la animacion es la
 *     que entrego diseno, no una remuestreada a 10 fps;
 *   - menos de 280 KB (12 fotogramas con degradados dorados no bajan de ahi sin
 *     que el rotulo empiece a mostrar bandas).
 *
 * Calidad 78 y no 92: cada punto de calidad cuesta ~7 KB sobre el archivo final
 * (el arte lleva degradados, brillos y alfa) y a 390 px de ancho el error es
 * indistinguible. `alphaQuality: 88` mantiene limpio el recorte del mono sin
 * pagar el sobrecoste de `smartSubsample`, que en un logo con silueta tan
 * marcada no cambia un pixel.
 *
 * Es idempotente: misma entrada y misma calidad -> mismos bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'design', 'SANTA-CRUSH-LOGO-ANIMADO.gif');
const TARGET = path.join(ROOT, 'public', 'src', 'assets', 'SANTA-CRUSH-LOGO.webp');
const DEPLOY = path.join(
  ROOT,
  '.vercel',
  'output',
  'static',
  'src',
  'assets',
  'SANTA-CRUSH-LOGO.webp'
);

// Contrato del logo: 480 px de ancho y 12 fotogramas animados.
const WIDTH = Number(process.env.LOGO_WIDTH || 480);
const QUALITY = Number(process.env.LOGO_QUALITY || 78);
const ALPHA_QUALITY = Number(process.env.LOGO_ALPHA_QUALITY || 88);
const FRAMES = 12;
const MAX_BYTES = 280 * 1024;


/** Trocea un RIFF/WebP en sus chunks (fourCC + offset + tamano). */
function webpChunks(buffer) {
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const fourCC = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    chunks.push({ fourCC, offset, size });
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

/** Metadatos de un WebP animado, fotograma a fotograma. */
async function inspect(buffer) {
  const meta = await sharp(buffer, { animated: true }).metadata();
  return {
    ...meta,
    frames: meta.pages || 1,
    frameHeight: meta.pageHeight || meta.height
  };
}

(async () => {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Falta el maestro del logo: ${path.relative(ROOT, SOURCE)}`);
  }

  const master = await inspect(fs.readFileSync(SOURCE));
  if (master.format !== 'gif') {
    throw new Error(`El maestro del logo debe ser el GIF animado (es ${master.format})`);
  }
  if (master.frames !== FRAMES) {
    throw new Error(
      `El maestro trae ${master.frames} fotogramas y el contrato exige ${FRAMES}: ` +
        'actualiza el test y este script antes de publicarlo'
    );
  }
  if (!master.hasAlpha) {
    throw new Error('El maestro del logo debe traer canal alfa: el tema lo pinta sobre la nube');
  }

  const width = Math.min(WIDTH, master.width);
  const height = Math.round(width * (master.frameHeight / master.width));

  // Se codifica desde el GIF con `animated: true`: sharp reescala cada fotograma
  // y conserva su retardo, de modo que el WebP resultante pesa una fraccion del
  // maestro y se reproduce igual.
  const webp = await sharp(SOURCE, { animated: true })
    .resize({ width, height, fit: 'fill', kernel: 'lanczos3' })
    .webp({
      quality: QUALITY,
      alphaQuality: ALPHA_QUALITY,
      effort: 6
    })
    .toBuffer();

  const output = await inspect(webp);
  if (output.format !== 'webp') {
    throw new Error(`La salida no es WebP (${output.format})`);
  }
  if (output.frames !== master.frames) {
    throw new Error(`El WebP trae ${output.frames} fotogramas de los ${master.frames} del maestro`);
  }
  if (output.width !== width || output.frameHeight !== height) {
    throw new Error(
      `El WebP mide ${output.width}x${output.frameHeight}, se esperaba ${width}x${height}`
    );
  }
  if (JSON.stringify(output.delay) !== JSON.stringify(master.delay)) {
    throw new Error('El WebP altero los retardos de los fotogramas: el logo se veria a tirones');
  }

  // Un WebP animado con alfa declara ambas cosas en el byte de flags de VP8X.
  const chunks = webpChunks(webp);
  if (chunks[0].fourCC !== 'VP8X') {
    throw new Error('El logo debe declarar caracteristicas extendidas (VP8X)');
  }
  const flags = webp.readUInt8(chunks[0].offset + 8);
  if ((flags & 0x02) === 0) {
    throw new Error('El logo debe declarar animacion (bloque ANIM)');
  }
  if ((flags & 0x10) === 0) {
    throw new Error('El logo debe declarar canal alfa');
  }
  if (!chunks.some((chunk) => chunk.fourCC === 'ANIM')) {
    throw new Error('Falta el bloque ANIM con el bucle y el fondo');
  }
  const frames = chunks.filter((chunk) => chunk.fourCC === 'ANMF').length;
  if (frames !== master.frames) {
    throw new Error(`El contenedor trae ${frames} bloques ANMF y el maestro ${master.frames}`);
  }

  if (webp.length >= MAX_BYTES) {
    throw new Error(
      `El logo pesa ${(webp.length / 1024).toFixed(1)} KB y el contrato exige menos de ` +
        `${MAX_BYTES / 1024} KB: baja LOGO_QUALITY antes de publicarlo`
    );
  }

  fs.writeFileSync(TARGET, webp);
  // `.vercel/output` no se versiona: si existe, se refresca a mano.
  if (fs.existsSync(path.dirname(DEPLOY))) {
    fs.copyFileSync(TARGET, DEPLOY);
  }

  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  console.log(
    `origen  ${path.relative(ROOT, SOURCE)}  ${master.width}x${master.frameHeight}  ` +
      `${master.frames} fotogramas  ${kb(fs.statSync(SOURCE).size)}`
  );
  console.log(
    `salida  ${path.relative(ROOT, TARGET)}  ${output.width}x${output.frameHeight}  ` +
      `${output.frames} fotogramas  ${kb(webp.length)} (q=${QUALITY}, animado con alfa)`
  );
  console.log(
    `ahorro  ${(100 - (webp.length / fs.statSync(SOURCE).size) * 100).toFixed(1)} % menos que el maestro`
  );
})().catch((err) => {
  console.error(`build:logo · ${err.message}`);
  process.exitCode = 1;
});
