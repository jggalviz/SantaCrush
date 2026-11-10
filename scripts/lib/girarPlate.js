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
 *   · surco oscuro que separa el aro de la cara, como en los otros botones;
 *   · cara con el degradado rojo de los discos - / + (carmin arriba, rojo vivo
 *     en el centro, granate al pie) y su reflejo de suelo;
 *   · bisel interior (luz blanca arriba, sombra vino abajo), brillo especular
 *     alto, destellos de cuatro puntas y sombra proyectada bajo la placa.
 *
 * La placa se dibuja EXACTAMENTE dentro de la caja que el CSS reserva al
 * pulsador (x 60, y 611, 529 x 156 px del lienzo 655 x 928 = 9,16 % / 65,84 %
 * / 80,76 % / 16,81 %), asi que sigue anclada al dibujo en cualquier escala. El
 * SVG se rasteriza a 3x y se reduce con Lanczos para que los filos queden
 * limpios al escalar.
 *
 * El maestro NO se toca: `build-desktop-art.js` aplica la placa sobre la copia
 * en memoria antes de recortar y codificar, asi que `npm run build:desktop-art`
 * siempre parte del arte original y el resultado es el mismo byte a byte.
 */

const sharp = require('sharp');

/* Caja del pulsador sobre el lienzo de d2 (655 x 928). Son los mismos
   porcentajes que declara el CSS: 9,16 % · 65,84 % · 80,76 % · 16,81 %. */
const BOX = { left: 60, top: 611, width: 529, height: 156 };

/* Aire alrededor de la placa para que la sombra proyectada respire. El fondo
   es la tarjeta verde, opaca, asi que solo se pinta dentro de esta ventana. */
const PAD = 16;
const SCALE = 3;

/* Geometria de la placa, en px del lienzo. El aro mide 10 px de grosor, la
   misma proporcion que el del AUTO (8 px sobre 100 de alto). */
const PLATE = { x: PAD + 4, y: PAD + 6, w: BOX.width - 8, h: BOX.height - 14, r: 36 };
/* Grosor del aro dorado (px del lienzo). */
PLATE.rim = 10;

/* Dibuja la placa sobre un lienzo con el aire ya incluido. */
const svg = () => {
  const { x, y, w, h, r, rim } = PLATE;
  const ix = x + rim;
  const iy = y + rim;
  const iw = w - rim * 2;
  const ih = h - rim * 2;
  const ir = r - rim;
  const cw = BOX.width + PAD * 2;
  const ch = BOX.height + PAD * 2;
  /* Destellos de cuatro puntas, como los que llevan las capsulas del arte. */
  const stars = [
    { cx: ix + iw * 0.085, cy: iy + ih * 0.24, r: ih * 0.21 },
    { cx: ix + iw * 0.5, cy: iy + ih * 0.08, r: ih * 0.11 }
  ];
  const star = ({ cx, cy, r }) => {
    const k = r * 0.3;
    return (
      `M ${cx} ${cy - r} L ${cx + k} ${cy - k} L ${cx + r} ${cy} L ${cx + k} ${cy + k} ` +
      `L ${cx} ${cy + r} L ${cx - k} ${cy + k} L ${cx - r} ${cy} L ${cx - k} ${cy - k} Z`
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
      <stop offset="0.68" stop-color="#f7a000"/>
      <stop offset="0.86" stop-color="#d37e00"/>
      <stop offset="1" stop-color="#a25a00"/>
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
    <!-- Reflejo de suelo: la cara revive en la base, como en las capsulas. -->
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.66" stop-color="#ff3b3b" stop-opacity="0"/>
      <stop offset="0.88" stop-color="#ff5f5f" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ff9a9a" stop-opacity="0.34"/>
    </linearGradient>
    <!-- Filo interior luminoso: solo el tramo alto del bisel. -->
    <linearGradient id="topline" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>
      <stop offset="0.09" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="0.26" stop-color="#ffffff" stop-opacity="0.1"/>
      <stop offset="0.44" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <!-- Filo interior del pie: la luz rebota en el suelo de la placa. -->
    <linearGradient id="sill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#ffb4b4" stop-opacity="0"/>
      <stop offset="0.9" stop-color="#ff8c8c" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#ffd2d2" stop-opacity="0.42"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-40%" width="160%" height="200%">
      <feGaussianBlur stdDeviation="5"/>
    </filter>
    <filter id="glow" x="-40%" y="-120%" width="180%" height="340%">
      <feGaussianBlur stdDeviation="8"/>
    </filter>
  </defs>

  <!-- 1 · Sombra proyectada bajo la placa. -->
  <rect x="${x + 2}" y="${y + 7}" width="${w}" height="${h}" rx="${r}"
        fill="#140200" opacity="0.5" filter="url(#soft)"/>

  <!-- 2 · Halo dorado caliente pegado al filo superior. -->
  <ellipse cx="${x + w * 0.46}" cy="${y + 2}" rx="${w * 0.3}" ry="7"
           fill="#ffe27a" opacity="0.3" filter="url(#glow)"/>

  <!-- 3 · Aro dorado exterior con filo marron, como el del AUTOGIRO. -->
  <rect x="${x - 1.2}" y="${y - 1.2}" width="${w + 2.4}" height="${h + 2.4}" rx="${r + 1.2}"
        fill="none" stroke="#4a1600" stroke-opacity="0.8" stroke-width="2"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"
        fill="url(#rim)" stroke="#4e2400" stroke-opacity="0.6" stroke-width="1.6"/>
  <rect x="${x + 1.8}" y="${y + 1.8}" width="${w - 3.6}" height="${h - 3.6}" rx="${r - 1.8}"
        fill="none" stroke="url(#topline)" stroke-width="1.6" opacity="0.7"/>

  <!-- 4 · Surco oscuro entre el aro y la cara. -->
  <rect x="${ix - 2.6}" y="${iy - 2.6}" width="${iw + 5.2}" height="${ih + 5.2}" rx="${ir + 2.6}"
        fill="none" stroke="#5e1a00" stroke-opacity="0.72" stroke-width="2.6"/>

  <!-- 5 · Cara roja: degradado navideno + brillo alto + reflejo de suelo. -->
  <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}" fill="url(#face)"/>
  <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}" fill="url(#gloss)"/>
  <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${ir}" fill="url(#floor)"/>

  <!-- 6 · Bisel interior: filo luminoso arriba, sombra vino abajo. -->
  <rect x="${ix + 1.4}" y="${iy + 1.4}" width="${iw - 2.8}" height="${ih - 2.8}" rx="${ir - 1.4}"
        fill="none" stroke="url(#bevel)" stroke-width="2.4"/>
  <rect x="${ix + 1.4}" y="${iy + 1.4}" width="${iw - 2.8}" height="${ih - 2.8}" rx="${ir - 1.4}"
        fill="none" stroke="url(#topline)" stroke-width="2.6"/>
  <rect x="${ix + 1.8}" y="${iy + 1.8}" width="${iw - 3.6}" height="${ih - 3.6}" rx="${ir - 1.8}"
        fill="none" stroke="url(#sill)" stroke-width="1.8"/>

  <!-- 7 · Reflejo especular: franja alta y los destellos de las capsulas. -->
  <ellipse cx="${ix + iw * 0.34}" cy="${iy + ih * 0.14}" rx="${iw * 0.26}" ry="${ih * 0.07}"
           fill="#ffffff" opacity="0.34" filter="url(#glow)"/>
  <path d="${star(stars[0])}" fill="#ffffff" opacity="0.5" filter="url(#glow)"/>
  <path d="${star(stars[1])}" fill="#ffffff" opacity="0.5" filter="url(#glow)"/>
  <path d="${star(stars[0])}" fill="#ffffff" opacity="0.9"/>
  <path d="${star(stars[1])}" fill="#ffffff" opacity="0.7"/>
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
     el hundimiento (`scale(0.94)`) recortaria el aro dorado. */
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

module.exports = { paintGirarPlate, GIRAR_BOX: BOX };

