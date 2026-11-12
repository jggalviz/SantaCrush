#!/usr/bin/env node
'use strict';

/**
 * Recorta y optimiza el arte de la maquina movil (marco + consola).
 *
 *   npm run build:art
 *
 * Los maestros viven en `design/` (nunca se publican: el CDN solo sirve
 * `public/src/**`) y llegan con un lienzo mayor y margenes transparentes
 * alrededor del dibujo. El CSS dibuja cada pieza con `background: url(...)
 * center / contain` sobre una caja con la relacion exacta de su recorte, y
 * coloca los controles en % de esa caja: cualquier pixel transparente de mas
 * descentraria el dibujo y desalinearia las areas tactiles.
 *
 * Piezas:
 *   design/marco_movil.png   -> public/src/assets/marco_movil.webp   (1244 x 1216)
 *   design/consola_movil.png -> public/src/assets/consola_movil.webp (1780 x 883)
 *
 * Los dos maestros vigentes son el marco de baston de caramelo (adornos de
 * Navidad arriba, cenefa tricolor, tres placas rojas del HUD y una ventana
 * interior alta) y el panel azul con corona dorada (cinco discos y cuatro placas
 * de pie). Los nombres de destino NO cambian: el CSS y el HTML siguen apuntando
 * a `marco_movil.webp` y `consola_movil.webp`, asi que el cambio de arte no toca
 * el mapeo de los componentes. El WebP del marco se sirve con `?v=3` en el CSS
 * y en el `preload` porque `/src/assets/**` viaja como `immutable`: al
 * republicar el mismo nombre hay que subir la version, o los clientes se quedan
 * con el arte viejo bajo los anclajes del CSS.
 *
 * El maestro vigente (`design/marco_movil.png`, 1244 x 1216) sale del
 * entregable `movil/9f8ed94d-9976-4a0d-a378-ebae884d2f8b.png` (1254 x 1254 con
 * alfa): se recorta su bbox de alfa (1248 x 1225) y se encaja al lienzo. El
 * dibujo conserva las posiciones del anterior —ventana 8,28 / 32,07 /
 * 83,44 x 60,61 % frente a 8,12 / 32,15 / 83,52 x 60,61 %—, asi que las capas
 * superpuestas del CSS (HUD y tablero) caen sobre su sitio sin recalibrar un
 * solo porcentaje.
 *
 * `design/marco_movil_v1.png` es el toldo con la nube rosa (el marco mas
 * antiguo, 1325 x 941 tras el recorte). El arte del marco anterior al de baston
 * (el estadio con focos y banderines) se sigue pudiendo regenerar desde su
 * maestro de origen, `movil/Marco navideño de campanas doradas.png`. Se
 * conservan como referencia: el dueño del marco vigente es siempre
 * `design/marco_movil.png`, de modo que el CSS y esta tabla hablan siempre de la
 * misma pieza.
 *
 * El script, para cada pieza:
 *   1. mide el bbox de los pixeles con alfa visible;
 *   2. comprueba que ese recorte respeta la relacion del lienzo de diseno;
 *   3. escribe el WebP con alfa al tamano exacto del lienzo.
 *
 * Es idempotente: misma entrada y misma calidad -> mismos bytes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'public', 'src', 'assets');
const DEPLOY_DIR = path.join(ROOT, '.vercel', 'output', 'static', 'src', 'assets');

/**
 * Lienzo de diseno de cada pieza: el CSS coloca sus capas en % de esta caja,
 * asi que el recorte visible tiene que medir exactamente lo mismo.
 *
 * `quality` sube en la consola porque sus degradados dorados hacen banding
 * visible muy por debajo de 92.
 *
 * Presupuesto (el arte nuevo trae mas detalle que el anterior):
 *   - el marco de baston se publica en 1244 x 1216 (la relacion de su dibujo,
 *     1443 x 1414 tras el recorte de alfa) y a q=82 pesa ~256 kB. El lienzo se
 *     quedo en 1244 px de ancho justo por esto: a 1447 px el mismo dibujo pedia
 *     ~308 kB y el total servido (arte + audio) se pasaba de los 3 MB que vigila
 *     `test/assetBudget.test.js`. Un telefono a 3x pinta el marco a 1170 px de
 *     dispositivo y la tablet del tramo movil no pasa de ~532 CSS px, asi que
 *     1244 px de origen siguen siendo de sobra;
 *   - el panel azul con corona es la pieza movil mas rica (1780x883, 28 % mas
 *     pixeles que la anterior) y a q=92 pesa 482 kB: su tope sube a 512 kB en
 *     vez de bajar la calidad y arriesgar banding en el azul y el dorado (d5 de
 *     escritorio ya viaja con 560 kB).
 */
const PIECES = [
  {
    name: 'marco_movil',
    canvas: { width: 1244, height: 1216 },
    quality: 82,
    maxBytes: 280 * 1024
  },
  {
    name: 'consola_movil',
    canvas: { width: 1780, height: 883 },
    quality: 92,
    maxBytes: 512 * 1024
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

async function build({ name, canvas, quality, maxBytes }) {
  const source = path.join(ROOT, 'design', `${name}.png`);
  const target = path.join(ASSETS_DIR, `${name}.webp`);
  if (!fs.existsSync(source)) {
    throw new Error(`Falta el arte de origen: ${path.relative(ROOT, source)}`);
  }

  const base = sharp(source).ensureAlpha();
  const meta = await base.metadata();
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const box = alphaBox(data, info.width, info.height, info.channels);

  const canvasRatio = canvas.width / canvas.height;
  const ratio = box.width / box.height;
  console.log(
    `${name}  origen ${meta.width}x${meta.height}  recorte ${box.width}x${box.height} ` +
      `(ratio ${ratio.toFixed(4)} vs ${canvasRatio.toFixed(4)})`
  );
  if (Math.abs(ratio - canvasRatio) > 0.002) {
    throw new Error(
      `${name}: el recorte visible no respeta la relacion ${canvas.width}/${canvas.height}: ` +
        `${box.width}x${box.height} da ${ratio.toFixed(4)}. Ajusta el arte antes de publicarlo.`
    );
  }

  // Si el recorte ya mide el lienzo no se reescala: un `resize` a la misma
  // medida re-muestrea (y encarece el WebP) sin aportar nada.
  const cropped = sharp(source)
    .ensureAlpha()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height });
  const fitted =
    box.width === canvas.width && box.height === canvas.height
      ? cropped
      : cropped.resize(canvas.width, canvas.height, { fit: 'fill' });

  const trimmed = await fitted
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
      `${name}: el WebP pesa ${kb(trimmed.length)} y el tope es ${kb(maxBytes)}. Baja la calidad del arte.`
    );
  }

  fs.writeFileSync(target, trimmed);
  // `.vercel/output` es un hard link del repo: si se rompe, se refresca a mano.
  const deploy = path.join(DEPLOY_DIR, `${name}.webp`);
  if (fs.existsSync(deploy) && fs.statSync(deploy).ino !== fs.statSync(target).ino) {
    fs.copyFileSync(target, deploy);
  }

  console.log(
    `  -> ${path.relative(ROOT, target)}  ${out.width}x${out.height}  ${kb(trimmed.length)} ` +
      `(q=${quality}, alfa intacto)`
  );
  console.log(`  fuente ${kb(fs.statSync(source).size)}`);
}

(async () => {
  for (const piece of PIECES) {
    await build(piece);
  }
})().catch((err) => {
  console.error(`build:art · ${err.message}`);
  process.exitCode = 1;
});
