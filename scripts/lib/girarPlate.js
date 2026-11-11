'use strict';

/**
 * Placa roja del pulsador GIRAR para el arte de escritorio (`d2`).
 *
 *   const { paintGirarPlate } = require('./lib/girarPlate');
 *   const art = await paintGirarPlate(pngDelMaestro);
 *
 * En `design/d2.png` los otros cinco controles ya llegan dibujados (los discos
 * - / + / MAX y las capsulas AUTOGIRO / AUTO), pero la franja del GIRAR era el
 * verde liso de la tarjeta: el boton se leia como un hueco, no como un
 * pulsador. Este modulo dibuja esa placa con el mismo lenguaje del resto del
 * case, y solo sobre la copia que se publica:
 *
 *   · aro dorado exterior con el degradado del AUTOGIRO/AUTO (arriba claro,
 *     abajo quemado) y su filo marron;
 *   · surco oscuro de un pixel que separa el aro de la cara, como en los otros
 *     botones (antes medía 2,6 px y se comía un tercio del aro);
 *   · cara con el degradado rojo de los discos - / + (carmin arriba, rojo vivo
 *     en el centro, granate al pie) y su reflejo de suelo;
 *   · bisel interior (luz blanca arriba, sombra vino abajo), brillo especular
 *     alto, destellos de cuatro puntas y sombra proyectada bajo la placa.
 *
 * GEOMETRIA · La placa va CENTRADA en la caja que el CSS reserva al pulsador
 * (x 60, y 708, 529 x 170 px del lienzo 655 x 1091 = 9,16 % / 64,89 % / 80,76 %
 * / 15,58 %): 4 px de aire a los lados y 7 arriba y abajo. Centrada, el centro
 * de la placa coincide con el de la caja tactil y el velo de recorte del CSS
 * (`border-radius`, medido sobre esa misma caja) puede seguir su curvatura.
 *
 * El radio exterior (41 px) y el grosor del aro (11 px) repiten la proporcion
 * medida sobre las capsulas del arte (radio 0,26 del alto total y aro 0,07), y
 * la cara es el rectangulo concentrico que queda dentro del aro (radio 30).
 *
 * MASCARA · El pulsador recorta su `background-image` con `border-radius`; con
 * el valor antiguo (`999px`, capsula de 78 px) el velo mordia 10 px de cada
 * esquina y el aro terminaba en un corte recto. `MASK_CSS` publica el radio del
 * velo en % del lienzo (escala con el panel) dos px MAYOR que el de la placa:
 * sigue su curvatura sin morder nunca el filo marron, cuyo trazo va centrado en
 * el borde. El CSS lo consume tal cual y el test comprueba que no se separan.
 *
 * El maestro NO se toca: `build-desktop-art.js` aplica la placa sobre la copia
 * en memoria antes de recortar y codificar, asi que `npm run build:desktop-art`
 * siempre parte del arte original y el resultado es el mismo byte a byte.
 */

const sharp = require('sharp');

/* Caja del pulsador sobre el lienzo de d2 (655 x 1091). Son los mismos
   porcentajes que declara el CSS: 9,16 % · 64,89 % · 80,76 % · 15,58 %. */
const BOX = { left: 60, top: 708, width: 529, height: 170 };

/* Aire alrededor de la placa para que la sombra proyectada respire. El fondo
   es la tarjeta verde, opaca, asi que solo se pinta dentro de esta ventana. */
const PAD = 16;
const SCALE = 3;

/* La placa queda centrada en la caja tactil (ver cabecera). */
const INSET_X = 4;
const INSET_Y = 7;

const PLATE = {
  x: PAD + INSET_X,
  y: PAD + INSET_Y,
  w: BOX.width - INSET_X * 2,
  h: BOX.height - INSET_Y * 2,
  /* Radio exterior: 0,26 del alto de la placa (dibujo de 156 px), como el aro
     del AUTO (27 px de radio sobre 105 px de capsula). */
  r: 41,
  /* Grosor del aro dorado: 0,07 del alto, como el del AUTO (7/105). */
  rim: 11
};

/* Cara roja: el rectangulo concentrico que queda dentro del aro. */
const FACE = {
  x: PLATE.x + PLATE.rim,
  y: PLATE.y + PLATE.rim,
  w: PLATE.w - PLATE.rim * 2,
  h: PLATE.h - PLATE.rim * 2,
  r: PLATE.r - PLATE.rim
};

/* Radio del velo de recorte del CSS (`border-radius`), dos px por fuera del
   aro para no morder su filo. Se publica en % de la caja para que escale igual
   que el arte en cualquier ancho de panel. */
const MASK_RADIUS = PLATE.r + 2;
const asPct = (value, total) => ((value / total) * 100).toFixed(2);
const MASK_CSS = `${asPct(MASK_RADIUS, BOX.width)}% / ${asPct(MASK_RADIUS, BOX.height)}%`;

/* Dibuja la placa sobre un lienzo con el aire ya incluido. */
const svg = () => {
  const { x, y, w, h, r, rim } = PLATE;
  const { x: ix, y: iy, w: iw, h: ih, r: ir } = FACE;
  const cw = BOX.width + PAD * 2;
  const ch = BOX.height + PAD * 2;
  /* Destellos de cuatro puntas, como los que llevan las capsulas del arte. */
  const stars = [
    { cx: ix + iw * 0.085, cy: iy + ih * 0.24, r: ih * 0.21 },
    { cx: ix + iw * 0.5, cy: iy + ih * 0.08, r: ih * 0.11 }
  ];
  const star = ({ cx, cy, r: rad }) => {
    const k = rad * 0.3;
    return (
      `M ${cx} ${cy - rad} L ${cx + k} ${cy - k} L ${cx + rad} ${cy} L ${cx + k} ${cy + k} ` +
      `L ${cx} ${cy + rad} L ${cx - k} ${cy + k} L ${cx - rad} ${cy} L ${cx - k} ${cy - k} Z`
    );
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cw * SCALE}" height="${ch * SCALE}"
     viewBox="0 0 ${cw} ${ch}">
  <defs>
    <!-- Aro: el mismo dorado del AUTOGIRO (claro arriba, naranja quemado abajo). -->
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6b4"/>
      <stop offset="0.05" stop-color="#ffe448"/>
      <stop offset="0.18" stop-color="#ffd008"/>
      <stop offset="0.42" stop-color="#ffbb00"/>
      <stop offset="0.68" stop-color="#ffab00"/>
      <stop offset="0.88" stop-color="#f79d00"/>
      <stop offset="1" stop-color="#e08a00"/>
    </linearGradient>
    <!-- Cara: el rojo de los discos - y + (carmin arriba, vivo en el centro,
         granate al pie) con el reflejo de suelo del arte. -->
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff2a35"/>
      <stop offset="0.05" stop-color="#fa1a24"/>
      <stop offset="0.16" stop-color="#f60c15"/>
      <stop offset="0.34" stop-color="#f10106"/>
      <stop offset="0.56" stop-color="#e40000"/>
      <stop offset="0.76" stop-color="#d60000"/>
      <stop offset="0.92" stop-color="#cf0000"/>
      <stop offset="1" stop-color="#e10c0c"/>
    </linearGradient>
    <!-- Bisel interior: luz arriba, sombra vino abajo. -->
    <linearGradient id="bevel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.62"/>
      <stop offset="0.22" stop-color="#ffffff" stop-opacity="0.18"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.78" stop-color="#5a0000" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#3d0000" stop-opacity="0.5"/>
    </linearGradient>
    <!-- Brillo alto: la cara se aclara arriba y se apaga antes de la mitad. -->
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="0.1" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="0.26" stop-color="#ffffff" stop-opacity="0.02"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- Reflejo de suelo: la cara revive antes del pie, como en las capsulas. -->
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.66" stop-color="#ff3b3b" stop-opacity="0"/>
      <stop offset="0.88" stop-color="#ff5f5f" stop-opacity="0.16"/>
      <stop offset="0.97" stop-color="#ff9a9a" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#8e0000" stop-opacity="0.3"/>
    </linearGradient>
    <!-- Filo interior luminoso: solo el tramo alto del bisel. -->
    <linearGradient id="topline" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="0.09" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.26" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="0.44" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- Pie de la cara: el vino del bisel, no el rosa del caramelo antiguo. -->
    <linearGradient id="sill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.68" stop-color="#4a0000" stop-opacity="0"/>
      <stop offset="0.92" stop-color="#4a0000" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#3a0000" stop-opacity="0.42"/>
    </linearGradient>
    <!-- Surco entre aro y cara: casi invisible arriba (donde manda el filo
         blanco) y oscuro al pie, como el hairline del AUTO. -->
    <linearGradient id="groove" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5e1a00" stop-opacity="0.06"/>
      <stop offset="0.3" stop-color="#5e1a00" stop-opacity="0.36"/>
      <stop offset="0.75" stop-color="#5e1a00" stop-opacity="0.48"/>
      <stop offset="1" stop-color="#3d0d00" stop-opacity="0.58"/>
    </linearGradient>
    <!-- Mascaras de recorte: la cara no puede salirse del aro (los destellos
         llevan desenfoque) y el aro no puede salirse de la placa. -->
    <clipPath id="faceClip">
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}"/>
    </clipPath>
    <clipPath id="plateClip">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>
    </clipPath>
    <filter id="soft" x="-30%" y="-40%" width="160%" height="200%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
    <filter id="glow" x="-40%" y="-120%" width="180%" height="340%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>

  <!-- 1 · Sombra proyectada bajo la placa: es lo unico que debe verse por
       detras del aro, asi que va fuera de los recortes. -->
  <rect x="${x + 2}" y="${y + 7}" width="${w}" height="${h}" rx="${r}"
        fill="#140200" opacity="0.5" filter="url(#soft)"/>

  <!-- 2 · Aro dorado: halo caliente, oro y linea de luz, recortados al contorno
       de la placa para que el halo no manche la tarjeta verde. -->
  <g clip-path="url(#plateClip)">
    <ellipse cx="${x + w * 0.46}" cy="${y + 2}" rx="${w * 0.3}" ry="7"
             fill="#ffe27a" opacity="0.3" filter="url(#glow)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#rim)"/>
    <rect x="${x + 1.8}" y="${y + 1.8}" width="${w - 3.6}" height="${h - 3.6}" rx="${r - 1.8}"
          fill="none" stroke="url(#topline)" stroke-width="1.6" opacity="0.7"/>
  </g>
  <!-- Filo exterior marron: trazo centrado en el borde, sin recorte. -->
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"
        fill="none" stroke="#4a1600" stroke-opacity="0.8" stroke-width="2"/>

  <!-- 3 · Cara roja: degradado navideno, brillo alto, suelo, bisel y destellos.
       Todo el grupo queda recortado al rectangulo interior del aro. -->
  <g clip-path="url(#faceClip)">
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}" fill="url(#face)"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}" fill="url(#gloss)"/>
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}" fill="url(#floor)"/>
    <rect x="${ix + 1.4}" y="${iy + 1.4}" width="${iw - 2.8}" height="${ih - 2.8}" rx="${ir - 1.4}"
          fill="none" stroke="url(#bevel)" stroke-width="2.4"/>
    <rect x="${ix + 1.6}" y="${iy + 1.6}" width="${iw - 3.2}" height="${ih - 3.2}" rx="${ir - 1.6}"
          fill="none" stroke="url(#topline)" stroke-width="2.6"/>
    <rect x="${ix + 1.2}" y="${iy + 1.2}" width="${iw - 2.4}" height="${ih - 2.4}" rx="${ir - 1.2}"
          fill="none" stroke="url(#sill)" stroke-width="1.6"/>
    <ellipse cx="${ix + iw * 0.34}" cy="${iy + ih * 0.14}" rx="${iw * 0.26}" ry="${ih * 0.07}"
             fill="#ffffff" opacity="0.34" filter="url(#glow)"/>
    <path d="${star(stars[0])}" fill="#ffffff" opacity="0.5" filter="url(#glow)"/>
    <path d="${star(stars[1])}" fill="#ffffff" opacity="0.5" filter="url(#glow)"/>
    <path d="${star(stars[0])}" fill="#ffffff" opacity="0.9"/>
    <path d="${star(stars[1])}" fill="#ffffff" opacity="0.7"/>
  </g>

  <!-- 4 · Surco del borde: un hairline sobre la costura aro/cara. Antes eran
       2,6 px de trazo centrados 2,6 px fuera de la cara y se comian un tercio
       del aro. -->
  <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}"
        fill="none" stroke="url(#groove)" stroke-width="1.8"/>

</svg>`;
};


/**
 * Devuelve una copia del arte con la placa del GIRAR ya pintada.
 *
 * @param {Buffer} source PNG del maestro `design/d2.png`
 * @returns {Promise<Buffer>} PNG del mismo tamano con la placa compuesta
 */
const paintGirarPlate = async (source) => {
  const cw = BOX.width + PAD * 2;
  const ch = BOX.height + PAD * 2;
  /* La placa no debe invadir la caja tactil del pulsador: si alguien la agranda,
     el velo del CSS (`border-radius: ${MASK_CSS}` sobre la misma caja) recortaria
     el aro dorado. */
  const margin = 2;
  if (
    PLATE.x - PAD < margin ||
    PLATE.y - PAD < margin ||
    PLATE.x - PAD + PLATE.w > BOX.width - margin ||
    PLATE.y - PAD + PLATE.h > BOX.height - margin
  ) {
    throw new Error('La placa del GIRAR se sale de la caja tactil del pulsador');
  }
  const plate = await sharp(Buffer.from(svg()))
    .resize(cw, ch, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const meta = await sharp(plate).metadata();
  if (meta.width !== cw || meta.height !== ch) {
    throw new Error(`La placa del GIRAR mide ${meta.width}x${meta.height}: se esperaba ${cw}x${ch}`);
  }
  return sharp(source)
    .ensureAlpha()
    .composite([{ input: plate, left: BOX.left - PAD, top: BOX.top - PAD, blend: 'over' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

module.exports = {
  paintGirarPlate,
  GIRAR_BOX: BOX,
  /* Geometria publicada para que el CSS y el test hablen del mismo numero:
     `maskCss` es el `border-radius` que el pulsador debe declarar. */
  GIRAR_PLATE: {
    box: BOX,
    pad: PAD,
    inset: { x: INSET_X, y: INSET_Y },
    plate: PLATE,
    face: FACE,
    maskRadius: MASK_RADIUS,
    maskCss: MASK_CSS
  }
};

