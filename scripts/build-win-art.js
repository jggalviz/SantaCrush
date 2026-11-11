#!/usr/bin/env node
'use strict';

/**
 * Optimiza la animacion de victoria (WIN overlay).
 *
 *   npm run build:win
 *
 * El maestro vive en `design/win_celebracion.gif`: el Santa con gorro, el
 * letrero WIN dorado y los regalos de fondo, 724 x 724 px cuadrados, 3
 * fotogramas de 350 ms en bucle infinito y con canal alfa. Lo archiva
 * `scripts/build-santa-masters.js win` a partir de la entrega de diseno
 * (`Santa WIN Celebration-Animation.gif` en la raiz del repo). Igual que el
 * resto del arte, el GIF se guarda fuera de `public/` porque todo lo que hay en
 * `public/src/**` se publica en el CDN.
 *
 * El dibujo es cuadrado y NO se recorta: el script no usa `cover` ni `extract`,
 * asi que el Santa, las letras y los regalos llegan completos al overlay. El CSS
 * reserva una caja 1:1 con el `width`/`height` del HTML.
 *
 * Salidas:
 *   - `public/src/assets/win_celebracion.webp`: WebP ANIMADO (VP8X + ANIM +
 *     3 x ANMF) a calidad 76, 724 px (el tamano nativo del maestro: reescalar
 *     hacia arriba no anade detalle y multiplica el peso). Conserva los 350 ms
 *     por fotograma y el bucle infinito, y `alphaQuality: 100` mantiene el alfa
 *     sin perdida para que el velo oscuro no se vea por el borde del dibujo.
 *     Tope: 400 KB (el archivo actual ronda los 235 KB).
 *   - `public/src/assets/win_celebracion_still.webp`: el primer fotograma, mismo
 *     lienzo cuadrado y sin bloque ANIM. El CSS lo pinta en lugar del animado
 *     cuando el jugador pide `prefers-reduced-motion`: un WebP animado se
 *     reproduce solo y ninguna regla CSS puede pararlo. Tope: 160 KB.
 *
 * Es idempotente: misma entrada y mismas calidades -> mismos bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'design', 'win_celebracion.gif');
const ASSETS = path.join(ROOT, 'public', 'src', 'assets');
const TARGET = path.join(ASSETS, 'win_celebracion.webp');
const STILL = path.join(ASSETS, 'win_celebracion_still.webp');
const DEPLOY_DIR = path.join(ROOT, '.vercel', 'output', 'static', 'src', 'assets');

// El CSS pinta la animacion como maximo a 720 px CSS; 724 px es el nativo del
// maestro y cubre ~1x retina sin inventar pixeles.
const TARGET_WIDTH = 724;
const QUALITY = Number(process.env.WIN_QUALITY || 76);
const STILL_QUALITY = Number(process.env.WIN_STILL_QUALITY || 82);
const MAX_BYTES = 400 * 1024;
const MAX_STILL_BYTES = 160 * 1024;
// 0 = bucle infinito (el overlay dura menos de 5 s y asi el brillo no se corta).
const LOOP = 0;

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

/**
 * `.vercel/output` es un hard link de la repo: si se rompe (o la copia no
 * existe todavia) se refresca a mano para que el preview local no sirva el arte
 * anterior.
 */
function syncDeploy(file) {
  if (!fs.existsSync(DEPLOY_DIR)) return;
  const deployed = path.join(DEPLOY_DIR, path.basename(file));
  if (fs.existsSync(deployed) && fs.statSync(deployed).ino === fs.statSync(file).ino) return;
  fs.copyFileSync(file, deployed);
}


(async () => {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(
      `Falta el maestro ${path.relative(ROOT, SOURCE)}: ` +
        'archiva el GIF con `node scripts/build-santa-masters.js win`'
    );
  }

  const master = await sharp(SOURCE, { animated: true }).metadata();
  const pageHeight = master.pageHeight || master.height;
  const pages = master.pages || 1;

  if (!master.width || !pageHeight) {
    throw new Error(`${path.basename(SOURCE)} no declara medidas: revisa el GIF`);
  }
  if (pages < 2) {
    throw new Error(
      'El maestro trae un solo fotograma: el overlay espera la animacion de la ' +
        'celebracion, no una imagen fija'
    );
  }
  if (master.width !== pageHeight) {
    throw new Error(
      `El maestro mide ${master.width}x${pageHeight} y el contrato exige un lienzo ` +
        'cuadrado: el CSS reserva 1:1 y un rectangulo se deformaria o dejaria aire'
    );
  }
  if (!master.hasAlpha) {
    throw new Error(
      'El maestro no trae canal alfa: la animacion se pinta sobre el juego y un ' +
        'fondo opaco taparia la pantalla'
    );
  }

  const width = Math.min(TARGET_WIDTH, master.width);
  const delay = Array.isArray(master.delay) ? master.delay.slice(0, pages) : [];

  const webp = await sharp(SOURCE, { animated: true })
    .resize({ width, kernel: 'lanczos3' })
    .webp({
      quality: QUALITY,
      alphaQuality: 100,
      effort: 6,
      smartSubsample: true,
      loop: LOOP,
      delay
    })
    .toBuffer();

  const out = await sharp(webp, { animated: true }).metadata();
  if (out.format !== 'webp') {
    throw new Error(`El destino no es un WebP real: ${out.format}`);
  }
  if (out.pages !== pages) {
    throw new Error(
      `El WebP animado salio con ${out.pages} fotogramas y el maestro tiene ${pages}: ` +
        'se perderia parte de la celebracion'
    );
  }
  if (!out.hasAlpha) {
    throw new Error('El WebP animado salio sin canal alfa: revisa alphaQuality');
  }
  if (out.width !== width || out.pageHeight !== width) {
    throw new Error(
      `El WebP animado mide ${out.width}x${out.pageHeight} y el contrato exige ` +
        `${width}x${width} (cuadrado, sin recortes)`
    );
  }
  if (JSON.stringify(out.delay) !== JSON.stringify(delay)) {
    throw new Error(
      `El WebP animado cambio los tiempos (${out.delay} ms contra ${delay} ms del maestro)`
    );
  }
  if (webp.length >= MAX_BYTES) {
    throw new Error(
      `La animacion pesa ${kb(webp.length)} y el contrato exige menos de ` +
        `${MAX_BYTES / 1024} KB: baja WIN_QUALITY antes de publicarla`
    );
  }

  const still = await sharp(SOURCE, { page: 0 })
    .resize({ width, kernel: 'lanczos3' })
    .webp({ quality: STILL_QUALITY, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();

  const stillOut = await sharp(still).metadata();
  if (stillOut.format !== 'webp') {
    throw new Error(`El fotograma fijo no es un WebP real: ${stillOut.format}`);
  }
  if (stillOut.pages) {
    throw new Error('El fotograma fijo salio animado: `prefers-reduced-motion` no lo pararia');
  }
  if (stillOut.width !== width || stillOut.height !== width) {
    throw new Error(
      `El fotograma fijo mide ${stillOut.width}x${stillOut.height} y debe compartir el ` +
        `lienzo cuadrado ${width}x${width} de la animacion`
    );
  }
  if (still.length >= MAX_STILL_BYTES) {
    throw new Error(
      `El fotograma fijo pesa ${kb(still.length)} y el contrato exige menos de ` +
        `${MAX_STILL_BYTES / 1024} KB: baja WIN_STILL_QUALITY`
    );
  }

  fs.writeFileSync(TARGET, webp);
  fs.writeFileSync(STILL, still);
  syncDeploy(TARGET);
  syncDeploy(STILL);

  console.log(
    `origen  ${path.relative(ROOT, SOURCE)}  ${master.width}x${pageHeight}  ` +
      `${kb(fs.statSync(SOURCE).size)}  ${pages} fotogramas de ${delay.join('/')} ms`
  );
  console.log(
    `salida  ${path.relative(ROOT, TARGET)}  ${out.width}x${out.pageHeight}  ` +
      `${kb(webp.length)} (q=${QUALITY}, ${out.pages} fotogramas, bucle ${LOOP}, alfa intacta)`
  );
  console.log(
    `fijo    ${path.relative(ROOT, STILL)}  ${stillOut.width}x${stillOut.height}  ` +
      `${kb(still.length)} (q=${STILL_QUALITY}, prefers-reduced-motion)`
  );
})().catch((err) => {
  console.error(`build:win · ${err.message}`);
  process.exitCode = 1;
});
