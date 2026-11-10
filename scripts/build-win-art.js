#!/usr/bin/env node
'use strict';

/**
 * Optimiza el cartel de victoria (WIN overlay).
 *
 *   npm run build:win
 *
 * El maestro vive en `design/victoria_deportiva.png` (el PNG
 * `Victoria deportiva brillante.png`): 1774 x 887 px y alfa real (las esquinas
 * son transparentes). Igual que el resto del arte, se archiva fuera de
 * `public/` porque todo lo que hay en `public/src/**` se publica en el CDN y el
 * PNG pesa 1,8 MB.
 *
 * El script escribe `public/src/assets/victoria_deportiva.webp` con este
 * contrato:
 *   - WebP con alfa (VP8X + ALPH + VP8) a calidad 90. `alphaQuality: 100`
 *     conserva el canal alfa sin perdida: el recorte del cartel no gana halos
 *     blancos ni escalones en el borde de las letras.
 *   - 1280 px de ancho (1280 x 693 con la caja recortada). El CSS no pinta el
 *     arte por encima de 700 px CSS, asi que 1280 cubre pantallas retina
 *     (1,8x) sin cargar los ~317 KB de un lienzo mayor.
 *   - Antes de reescalar se recorta el alfa vacio (`trim`). Este maestro trae
 *     aire transparente a los lados (la caja util mide 1621 x 878), asi que el
 *     cartel se publica pegado a su contenido en lugar de arrastrar margen
 *     muerto que el CSS tendria que escalar.
 *   - Tope de peso: 400 KB (el WebP actual ronda los 317 KB).
 *
 * La relacion de aspecto se valida contra la caja recortada, que es la que se
 * reescala: comparar contra el lienzo original fallaria en cuanto `trim` quita
 * margen asimetrico.
 *
 * Es idempotente: misma entrada y misma calidad -> mismos bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'design', 'victoria_deportiva.png');
const TARGET = path.join(ROOT, 'public', 'src', 'assets', 'victoria_deportiva.webp');
const DEPLOY = path.join(ROOT, '.vercel', 'output', 'static', 'src', 'assets', 'victoria_deportiva.webp');

// El arte se pinta como maximo a 700 px CSS: 1280 px cubre retina (1,8x) sin
// inflar la descarga (370 KB a 1420 px contra 317 KB aqui).
const TARGET_WIDTH = 1280;
const QUALITY = Number(process.env.WIN_QUALITY || 82);
const MAX_BYTES = 400 * 1024;

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

(async () => {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Falta el maestro ${path.relative(ROOT, SOURCE)}: mueve el PNG a design/`);
  }

  const master = await sharp(SOURCE).metadata();
  if (!master.width || !master.height) {
    throw new Error(`${path.basename(SOURCE)} no declara medidas: revisa el PNG`);
  }
  if (!master.hasAlpha) {
    throw new Error(
      'El maestro no trae canal alfa: el cartel se recorta sobre el juego y un fondo ' +
        'opaco taparia la pantalla. Exporta el PNG con transparencia.'
    );
  }

  // Recorte del alfa vacio. Este maestro trae aire transparente a los lados
  // (1621 x 878 utiles de 1774 x 887), asi que el recorte no es cosmetico:
  // evita publicar margen muerto que el CSS tendria que escalar.
  const trimmed = await sharp(SOURCE)
    .ensureAlpha()
    .trim({ threshold: 1 })
    .toBuffer({ resolveWithObject: true });
  const crop = trimmed.info.trimOffsetLeft || trimmed.info.trimOffsetTop
    ? `${trimmed.info.trimOffsetLeft},${trimmed.info.trimOffsetTop}`
    : null;
  const cropWidth = trimmed.info.width || master.width;
  const cropHeight = trimmed.info.height || master.height;

  const webp = await sharp(trimmed.data)
    .resize({ width: TARGET_WIDTH, fit: 'inside', withoutEnlargement: true })
    .webp({
      quality: QUALITY,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true
    })
    .toBuffer();

  const out = await sharp(webp).metadata();
  if (out.format !== 'webp') {
    throw new Error(`El destino no es un WebP real: ${out.format}`);
  }
  if (!out.hasAlpha) {
    throw new Error('El WebP salio sin canal alfa: revisa alphaQuality y el maestro');
  }
  if (out.width !== TARGET_WIDTH) {
    throw new Error(
      `El WebP mide ${out.width}px de ancho y el contrato exige ${TARGET_WIDTH}px ` +
        '(ver cabecera: 1280 px cubren retina a 700 px CSS)'
    );
  }
  if (Math.abs(out.width / out.height - cropWidth / cropHeight) > 0.002) {
    throw new Error(
      `El WebP mide ${out.width}x${out.height} y rompe la relacion de la caja recortada ` +
        `${cropWidth}x${cropHeight} (maestro ${master.width}x${master.height}): el cartel se deformaria`
    );
  }
  if (webp.length >= MAX_BYTES) {
    throw new Error(
      `El cartel pesa ${kb(webp.length)} y el contrato exige menos de ${MAX_BYTES / 1024} KB: ` +
        'baja WIN_QUALITY antes de publicarlo'
    );
  }

  fs.writeFileSync(TARGET, webp);
  // `.vercel/output` es un hard link del repo: si se rompe, se refresca a mano.
  if (fs.existsSync(DEPLOY) && fs.statSync(DEPLOY).ino !== fs.statSync(TARGET).ino) {
    fs.copyFileSync(TARGET, DEPLOY);
  }

  console.log(
    `origen  ${path.relative(ROOT, SOURCE)}  ${master.width}x${master.height}  ` +
      `${kb(fs.statSync(SOURCE).size)}${crop ? `  (alfa recortado en ${crop} -> ${cropWidth}x${cropHeight})` : '  (alfa ya ajustado)'}`
  );
  console.log(
    `salida  ${path.relative(ROOT, TARGET)}  ${out.width}x${out.height}  ` +
      `${kb(webp.length)} (q=${QUALITY}, alfa intacta)`
  );
  console.log(
    `ahorro  ${(100 - (webp.length / fs.statSync(SOURCE).size) * 100).toFixed(1)} % menos que el maestro`
  );
})().catch((err) => {
  console.error(`build:win · ${err.message}`);
  process.exitCode = 1;
});
