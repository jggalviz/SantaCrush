'use strict';

/**
 * Deriva los cuatro maestros de las maquinas (d1, d2, marco_movil,
 * consola_movil) desde el arte de 5 Santa Crush.
 *
 *   desk/Marco navideño de caramelos brillantes.png    -> design/d1.png (1033x843)
 *   desk/Interfaz Navideña con Campanas Doradas.png    -> design/d2.png ( 655x928)
 *   movil/Marco navideño de campanas doradas.png       -> design/marco_movil.png (1392x1093)
 *   movil/Panel navideño brillante con Santa y reno.png -> design/consola_movil.png (1780x883)
 *
 * El CSS no se toca: los maestros se reencajan para que el hueco/ventana del
 * arte caiga donde el CSS mide los anclajes.
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DESIGN = path.join(ROOT, 'design');

/** BBox de la tinta (alfa >= 16) de un buffer RGBA en crudo. */
function inkBox(data, width, height, threshold = 16) {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('el maestro llego vacio (no hay un solo pixel opaco)');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** Recorta al bbox de alfa y devuelve RGBA en crudo del recorte. */
async function inkOf(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const box = inkBox(data, info.width, info.height);
  const ink = await sharp(file)
    .ensureAlpha()
    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { ...ink, box };
}

/** Lienzo del tamano pedido a partir de tiras reescaladas (remap de filas). */
async function rowRemap(base, canvas, strips) {
  const inputs = [];
  for (const strip of strips) {
    const height = Math.max(1, strip.srcBottom - strip.srcTop);
    const target = Math.max(1, strip.tgtBottom - strip.tgtTop);
    const input = await sharp(base)
      .extract({ left: 0, top: strip.srcTop, width: canvas.width, height })
      .resize(canvas.width, target, { fit: 'fill' })
      .png()
      .toBuffer();
    inputs.push({ input, left: 0, top: strip.tgtTop });
  }
  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(inputs)
    .png()
    .toBuffer();
}


/**
 * Reencaja la tinta para que su HUECO caiga sobre el rectangulo que mide el CSS
 * (`dstHole`, en px del lienzo) y recorta el excedente del borde exterior.
 */
async function alignByHole(file, canvas, srcHole, dstHole) {
  const { data, info } = await inkOf(file);
  const sx = dstHole.width / srcHole.width;
  const sy = dstHole.height / srcHole.height;
  const scaledW = Math.round(info.width * sx);
  const scaledH = Math.round(info.height * sy);
  const left = Math.round(dstHole.left - srcHole.left * sx);
  const top = Math.round(dstHole.top - srcHole.top * sy);
  const ex = -left;
  const ey = -top;
  if (ex < 0 || ey < 0 || ex + canvas.width > scaledW || ey + canvas.height > scaledH) {
    throw new Error(
      `la tinta reencajada (${scaledW}x${scaledH} en ${left},${top}) no cubre el lienzo ` +
        `${canvas.width}x${canvas.height}: el arte dejaria un borde transparente`
    );
  }
  const scaled = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize(scaledW, scaledH, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  return sharp(scaled)
    .extract({ left: ex, top: ey, width: canvas.width, height: canvas.height })
    .png()
    .toBuffer();
}

(async () => {
  /* ---------------------------------------------------------------- d1 ---- */
  // Marco del tablero: la ventana del arte debe caer donde el CSS la mide
  // (hueco del maestro vigente: x 5,61-94,29 % · y 12,50-92,98 % de 1033x843).
  const d1 = await alignByHole(
    path.join(ROOT, 'desk', 'Marco navideño de caramelos brillantes.png'),
    { width: 1033, height: 843 },
    { left: 79, top: 163, width: 1140, height: 836 },
    { left: 58, top: 105, width: 916, height: 676 }
  );
  fs.writeFileSync(path.join(DESIGN, 'd1.png'), d1);
  console.log('design/d1.png  1033x843');

  /* ---------------------------------------------------------------- d2 ---- */
  // Columna lateral: el arte se estira al lienzo y luego se reasignan las
  // franjas para que placas, discos y pastillas caigan en su caja del CSS.
  const d2Ink = await inkOf(path.join(ROOT, 'desk', 'Interfaz Navideña con Campanas Doradas.png'));
  const fitted = await sharp(d2Ink.data, {
    raw: { width: d2Ink.info.width, height: d2Ink.info.height, channels: 4 }
  })
    .resize(655, 928, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const d2 = await rowRemap(fitted, { width: 655, height: 928 }, [
    { srcTop: 0, srcBottom: 325, tgtTop: 0, tgtBottom: 343 },
    { srcTop: 325, srcBottom: 386, tgtTop: 343, tgtBottom: 404 },
    { srcTop: 386, srcBottom: 446, tgtTop: 404, tgtBottom: 464 },
    { srcTop: 446, srcBottom: 476, tgtTop: 464, tgtBottom: 514 },
    { srcTop: 476, srcBottom: 573, tgtTop: 514, tgtBottom: 604 },
    { srcTop: 573, srcBottom: 741, tgtTop: 604, tgtBottom: 778 },
    { srcTop: 741, srcBottom: 827, tgtTop: 778, tgtBottom: 878 },
    { srcTop: 827, srcBottom: 860, tgtTop: 878, tgtBottom: 928 }
  ]);
  fs.writeFileSync(path.join(DESIGN, 'd2.png'), d2);
  console.log('design/d2.png  655x928');

  /* ------------------------------------------------------- marco_movil ---- */
  // La ventana del marco movil debe caer en la caja del tablero
  // (7,20-92,90 % · 39,40-92,40 %) para que la cuadricula no se meta bajo el aro.
  const marco = await alignByHole(
    path.join(ROOT, 'movil', 'Marco navideño de campanas doradas.png'),
    { width: 1392, height: 1093 },
    { left: 117, top: 456, width: 1208, height: 520 },
    {
      left: Math.round(1392 * 0.072),
      top: Math.round(1093 * 0.394),
      width: Math.round(1392 * (0.929 - 0.072)),
      height: Math.round(1093 * (0.924 - 0.394))
    }
  );
  fs.writeFileSync(path.join(DESIGN, 'marco_movil.png'), marco);
  console.log('design/marco_movil.png  1392x1093');

  /* ----------------------------------------------------- consola_movil ---- */
  const consolaInk = await inkOf(path.join(ROOT, 'movil', 'Panel navideño brillante con Santa y reno.png'));
  const consola = await sharp(consolaInk.data, {
    raw: { width: consolaInk.info.width, height: consolaInk.info.height, channels: 4 }
  })
    .resize(1780, 883, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(DESIGN, 'consola_movil.png'), consola);
  console.log('design/consola_movil.png  1780x883');
})().catch((error) => {
  console.error(`build:santa-masters · ${error.message}`);
  process.exitCode = 1;
});


/* ======================================================================== */
/*  Auxiliares para las piezas sueltas (victoria, fondos, simbolos, logo)   */
/* ======================================================================== */

/** Nº de pixeles con alfa > 8: sirve para elegir el fotograma mas completo. */
async function inkCount(buffer) {
  const { data } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) count += 1;
  return count;
}

/** Recorta al alfa y encaja en `box` sin deformar (contain), centrado. */
async function containIn(file, canvas, box) {
  const trimmed = await sharp(file).ensureAlpha().trim({ threshold: 8 }).toBuffer();
  const scaled = await sharp(trimmed)
    .resize({ width: box.width, height: box.height, fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = box.left + Math.round((box.width - scaled.info.width) / 2);
  const top = box.top + Math.round((box.height - scaled.info.height) / 2);
  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: scaled.data, left, top }])
    .png()
    .toBuffer();
}

(async () => {
  /* ----------------------------------------------------------- victoria ---- */
  // El cartel se sirve a 1280x693 (1,847:1) pero el maestro debe medir
  // 1774x887: se recorta a la relacion publicada y se centra en el lienzo.
  const WIN_W = 1638;
  const WIN_H = 887;
  const victoriaTrim = await sharp(path.join(ROOT, 'Victoria navideña con mono y regalos.png'))
    .ensureAlpha()
    .trim({ threshold: 8 })
    .toBuffer();
  const victoriaCrop = await sharp(victoriaTrim)
    .resize(WIN_W, WIN_H, { fit: 'cover', position: 'attention', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const victoria = await sharp({
    create: {
      width: 1774,
      height: 887,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{ input: victoriaCrop, left: Math.round((1774 - WIN_W) / 2), top: 0 }])
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(DESIGN, 'victoria_deportiva.png'), victoria);
  console.log('design/victoria_deportiva.png  1774x887 (caja 1638x887)');

  /* ---------------------------------------------------------- fondos ------- */
  fs.copyFileSync(
    path.join(ROOT, 'desk', 'Festive Christmas Toy Workshop.png'),
    path.join(DESIGN, 'fondo_desk_meridino_crush.png')
  );
  fs.copyFileSync(
    path.join(ROOT, 'movil', 'Vibrant Christmas Toy Workshop Wonderland.png'),
    path.join(DESIGN, 'avenida_fantastica_reino_caramelos.png')
  );
  console.log('design/fondo_desk_meridino_crush.png + avenida_fantastica_reino_caramelos.png');

  /* --------------------------------------------------------- simbolos ------ */
  for (let index = 1; index <= 9; index += 1) {
    const source = path.join(ROOT, 'slot', `s${index}.png`);
    if (!fs.existsSync(source)) throw new Error(`Falta el simbolo ${path.relative(ROOT, source)}`);
    const canvas = await containIn(source, { width: 335, height: 341 }, { left: 0, top: 0, width: 335, height: 341 });
    fs.writeFileSync(path.join(DESIGN, 'symbols', `s${index}.png`), canvas);
  }
  console.log('design/symbols/s1..s9.png  335x341');

  /* ------------------------------------------------------------- sello ----- */
  // Maestro del sello: fondo blanco opaco (el build lo pasa a alfa) y un aro
  // dorado con rayas de caramelo sobre disco blanco, centrado en el lienzo.
  const sealSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <circle cx="512" cy="512" r="510" fill="#8a4a06"/>
  <circle cx="512" cy="512" r="502" fill="#ffd85e"/>
  <circle cx="512" cy="512" r="462" fill="#f2a71b"/>
  <circle cx="512" cy="512" r="452" fill="#ffffff"/>
  <circle cx="512" cy="512" r="430" fill="none" stroke="#d61f2c" stroke-width="38" stroke-dasharray="30 30"/>
  <circle cx="512" cy="512" r="404" fill="#ffffff"/>
  <path d="M512 236 L537 300 L605 300 L550 340 L571 406 L512 366 L453 406 L474 340 L419 300 L487 300 Z" fill="#f2a71b" stroke="#8a4a06" stroke-width="6"/>
  <text x="512" y="576" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold"
        font-size="176" letter-spacing="6" fill="#c8102e">SANTA</text>
  <text x="512" y="716" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold"
        font-size="120" letter-spacing="16" fill="#1f7a3a">CRUSH</text>
</svg>`;
  const sealMaster = await sharp(Buffer.from(sealSvg), { density: 288 })
    .resize(1024, 1024, { fit: 'fill' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(DESIGN, 'MBETN-LOGO@3x.png'), sealMaster);
  console.log('design/MBETN-LOGO@3x.png  1024x1024 (sello circular)');

  /* -------------------------------------------------------------- logo ----- */
  // Del GIF animado se toma el fotograma con mas tinta (el lockup completo) y
  // se encaja en el lienzo 2:1 que exige build:logo.
  const gif = path.join(ROOT, 'SANTA-CRUSH-LOGO-ANIMADO.gif');
  const pages = (await sharp(gif).metadata()).pages || 1;
  let best = null;
  for (let page = 0; page < pages; page += 1) {
    const frame = await sharp(gif, { page, pages: 1 }).png().toBuffer();
    const count = await inkCount(frame);
    if (!best || count > best.count) best = { page, count, frame };
  }
  const logo = await containIn(best.frame, { width: 1774, height: 887 }, { left: 0, top: 0, width: 1774, height: 887 });
  fs.writeFileSync(path.join(DESIGN, 'MeridianoBet Sports Crush Logo.png'), logo);
  console.log(`design/MeridianoBet Sports Crush Logo.png  1774x887 (fotograma ${best.page}/${pages})`);
})().catch((error) => {
  console.error(`build:santa-masters · ${error.message}`);
  process.exitCode = 1;
});
