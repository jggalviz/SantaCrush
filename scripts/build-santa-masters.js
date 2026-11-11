'use strict';

/**
 * Deriva los maestros de las maquinas (d1, d2, marco_movil,
 * consola_movil) y el cartel de victoria desde el arte de 5 Santa Crush.
 *
 *   desk/Marco navideño de caramelos brillantes.png    -> design/d1.png (1033x863)
 *   desk/Interfaz Navideña con Campanas Doradas.png    -> design/d2.png ( 655x928)
 *   movil/Marco navideño de campanas doradas.png       -> design/marco_movil.png (1392x1093)
 *   movil/Panel navideño brillante con Santa y reno.png -> design/consola_movil.png (1780x883)
 *   Victoria navideña con mono y regalos.png           -> design/victoria_navidena.png
 *
 * Los maestros se reencajan para que el hueco/ventana del arte caiga donde el
 * CSS mide los anclajes, pero SIEMPRE con escala uniforme: recortar o estirar
 * un solo eje para clavar una caja antes se comia la cresta de la nieve del
 * toldo (d1) y la base del letrero del premio (victoria).
 */

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DESIGN = path.join(ROOT, 'design');

/**
 * Piezas a regenerar. `node scripts/build-santa-masters.js d1 victoria` rehace
 * solo esas dos; sin argumentos se rehace todo el juego de maestros.
 *
 * El selector existe porque este script parte del arte de origen (`desk/`,
 * `movil/`, `slot/`, el GIF del logo), que no siempre es el vigente: correrlo
 * entero para retocar una pieza pisaria los simbolos ya importados. Con nombres
 * se regenera solo lo que se toca y el resto queda como esta en `design/`.
 */
const PICK = new Set(process.argv.slice(2));
const wants = (piece) => PICK.size === 0 || PICK.has(piece);

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

/**
 * Recorta el alfa y encaja el dibujo en `canvas` con escala uniforme. El lienzo
 * comparte la relacion del bbox (la comprueba `build-desktop-art.js`), asi que
 * `fill` no deforma: solo reescala.
 */
async function fitInk(file, canvas) {
  const ink = await inkOf(file);
  return sharp(ink.data, { raw: { width: ink.info.width, height: ink.info.height, channels: 4 } })
    .resize(canvas.width, canvas.height, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

(async () => {
  /* ---------------------------------------------------------------- d1 ---- */
  if (wants('d1')) {
    // Marco del tablero. El maestro (1388 x 1133) trae margen transparente; el
    // dibujo util mide 1301 x 1088 (1,1958:1) y su ventana transparente queda en
    // x 6,15-93,77 % · y 14,98-91,64 % de esa caja.
    //
    // Antes el arte se reescalaba en los dos ejes por separado para clavar la
    // ventana en un lienzo de 1033 x 843 (1,2254:1) y el sobrante se recortaba
    // por arriba y por abajo: 27 px del toldo, justo la cresta de nieve y los
    // adornos, quedaban guillotinados contra el borde. El lienzo pasa a la
    // relacion del dibujo (1033 x 863, 1,197:1) para que el marco respire; el CSS
    // mide la ventana en % de esta caja nueva (ver `--frame-w` y `.machine__table
    // .board`), asi que los anclajes siguen trazables sobre el dibujo.
    const d1 = await fitInk(
      path.join(ROOT, 'desk', 'Marco navideño de caramelos brillantes.png'),
      { width: 1033, height: 863 }
    );
    fs.writeFileSync(path.join(DESIGN, 'd1.png'), d1);
    console.log('design/d1.png  1033x863 (escala uniforme, sin recortar el toldo)');
  }

  /* ---------------------------------------------------------------- d2 ---- */
  if (wants('d2')) {
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
  }

  /* ------------------------------------------------------- marco_movil ---- */
  if (wants('marco_movil')) {
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
  }

  /* ----------------------------------------------------- consola_movil ---- */
  if (wants('consola_movil')) {
    const consolaInk = await inkOf(path.join(ROOT, 'movil', 'Panel navideño brillante con Santa y reno.png'));
    const consola = await sharp(consolaInk.data, {
      raw: { width: consolaInk.info.width, height: consolaInk.info.height, channels: 4 }
    })
      .resize(1780, 883, { fit: 'fill', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(DESIGN, 'consola_movil.png'), consola);
    console.log('design/consola_movil.png  1780x883');
  }
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
  /* -------------------------------------------------------- victoria ------ */
  if (wants('victoria')) {
    // Cartel del premio: mono con gorro, letrero WIN y campanas con lazo. El
    // dibujo mide 1394 x 1066 (1,3077:1) tras recortar el alfa.
    //
    // El maestro anterior se reescalaba con `fit: 'cover'` a una banda de
    // 1638 x 887 (1,847:1) y se centraba en un lienzo de 1774 x 887. `cover`
    // recorta el eje que sobra: se comia la base del letrero (campanas, lazo y
    // remate dorado) y el importe y el aviso caian sobre un cartel cortado en
    // seco. Ahora se publica el recorte al alfa tal cual y es el CSS el que
    // reserva la caja con la relacion real del dibujo.
    const victoria = await sharp(path.join(ROOT, 'Victoria navideña con mono y regalos.png'))
      .ensureAlpha()
      .trim({ threshold: 8 })
      .png()
      .toBuffer();
    const victoriaMeta = await sharp(victoria).metadata();
    fs.writeFileSync(path.join(DESIGN, 'victoria_navidena.png'), victoria);
    console.log(
      `design/victoria_navidena.png  ${victoriaMeta.width}x${victoriaMeta.height} ` +
        `(recorte al alfa, ${(victoriaMeta.width / victoriaMeta.height).toFixed(4)}:1)`
    );
  }

  /* ---------------------------------------------------------- fondos ------- */
  if (wants('fondos')) {
    fs.copyFileSync(
      path.join(ROOT, 'desk', 'Festive Christmas Toy Workshop.png'),
      path.join(DESIGN, 'fondo_desk_meridino_crush.png')
    );
    fs.copyFileSync(
      path.join(ROOT, 'movil', 'Vibrant Christmas Toy Workshop Wonderland.png'),
      path.join(DESIGN, 'avenida_fantastica_reino_caramelos.png')
    );
    console.log('design/fondo_desk_meridino_crush.png + avenida_fantastica_reino_caramelos.png');
  }

  /* --------------------------------------------------------- simbolos ------ */
  // Los simbolos vigentes los importa `npm run build:slot-art` de `slot/`
  // (recorte al alfa y lienzo 335 x 341). Este bloque solo reencaja los s1..s9
  // de origen: no toca s10 (BONO) ni s11 (sello del regalo).
  if (wants('simbolos')) {
    for (let index = 1; index <= 9; index += 1) {
      const source = path.join(ROOT, 'slot', `s${index}.png`);
      if (!fs.existsSync(source)) throw new Error(`Falta el simbolo ${path.relative(ROOT, source)}`);
      const canvas = await containIn(source, { width: 335, height: 341 }, { left: 0, top: 0, width: 335, height: 341 });
      fs.writeFileSync(path.join(DESIGN, 'symbols', `s${index}.png`), canvas);
    }
    console.log('design/symbols/s1..s9.png  335x341');
  }

  /* ------------------------------------------------------------- sello ----- */
  if (wants('sello')) {
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
  }

  /* -------------------------------------------------------------- logo ----- */
  if (wants('logo')) {
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
  }
})().catch((error) => {
  console.error(`build:santa-masters · ${error.message}`);
  process.exitCode = 1;
});
