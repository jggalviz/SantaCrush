'use strict';

/**
 * Contrato de assets del frontend.
 *
 * El tablero usa tres motivos de la marca: los once WebP de
 * `public/src/assets/slot` (nueve simbolos navideños, el sello del scatter y el
 * bono del multiplicador) y el motor de 11 simbolos (nueve regulares, el scatter
 * y el multiplicador). `format.js` es la unica fuente de verdad de su imagen.
 * Esta prueba evita que un renombrado o una ruta rota llegue a produccion.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SLOT_DIR = path.join(PUBLIC_DIR, 'src', 'assets', 'slot');
const FORMAT_PATH = path.join(PUBLIC_DIR, 'ui', 'lib', 'format.js');
const STYLE_PATH = path.join(PUBLIC_DIR, 'src', 'css', 'style.css');
const THEME_PATH = path.join(PUBLIC_DIR, 'src', 'css', 'theme.css');
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html');
const LOGO_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'MERIDIANOBET-CRUSH-LOGO.webp');
const LOGO_MASTER_PATH = path.join(ROOT_DIR, 'design', 'MeridianoBet Sports Crush Logo.png');
const WIN_ART_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'victoria_deportiva.webp');
const WIN_MASTER_PATH = path.join(ROOT_DIR, 'design', 'victoria_deportiva.png');
const WIN_SOUND_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'AUDIO-WIN-NEW-stadium-applause.MP3');
const MUSIC_SOUND_PATH = path.join(
  PUBLIC_DIR,
  'src',
  'assets',
  'Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3'
);
const RETIRED_WIN_SOUND_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'AUDIO-WIN-2.MP3');
const UNVERSIONED_MUSIC_PATH = path.join(
  PUBLIC_DIR,
  'src',
  'assets',
  'Sport_Crush_Energy_Gaming_Loop_20s.mp3'
);
const SFX_PATH = path.join(PUBLIC_DIR, 'ui', 'audio', 'sfx.js');
const PUBLIC_SRC_DIR = path.join(PUBLIC_DIR, 'src');

const read = (file) => fs.readFileSync(file, 'utf8');

/* Tablas MPEG-1/2/2.5 para auditar los MP3 sin dependencias externas. */
const MP3_BITRATES = {
  '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
};
const MP3_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

/**
 * Recorre las cabeceras de frame de un MP3 y devuelve formato, duracion y
 * bitrate medio. Sin esto, cambiar el audio por otro archivo mas pesado o mas
 * corto pasaria desapercibido: la duracion del bucle debe seguir siendo 20 s.
 */
function readMp3Frames(buffer) {
  let offset = 0;
  if (buffer.toString('ascii', 0, 3) === 'ID3') {
    const size =
      ((buffer[6] & 0x7f) << 21) |
      ((buffer[7] & 0x7f) << 14) |
      ((buffer[8] & 0x7f) << 7) |
      (buffer[9] & 0x7f);
    offset = 10 + size + ((buffer[5] & 0x10) ? 10 : 0);
  }

  const bitrates = new Set();
  let frames = 0;
  let seconds = 0;
  let sampleRate = 0;
  let channels = 0;

  while (offset < buffer.length - 4) {
    const byte1 = buffer[offset + 1];
    const byte2 = buffer[offset + 2];
    const versionBits = (byte1 >> 3) & 0x03;
    const layerBits = (byte1 >> 1) & 0x03;
    const bitrateIndex = (byte2 >> 4) & 0x0f;
    const rateIndex = (byte2 >> 2) & 0x03;
    const padding = (byte2 >> 1) & 0x01;
    const validHeader =
      buffer[offset] === 0xff &&
      (byte1 & 0xe0) === 0xe0 &&
      versionBits !== 1 &&
      layerBits !== 0 &&
      bitrateIndex !== 0 &&
      bitrateIndex !== 15 &&
      rateIndex !== 3;

    if (!validHeader) {
      offset += 1;
      continue;
    }

    const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
    const layer = 4 - layerBits;
    const bitrate = MP3_BITRATES[`${version === 1 ? 1 : 2}-${layer}`][bitrateIndex] * 1000;
    const rate = MP3_RATES[version][rateIndex];
    const samples = layer === 1 ? 384 : layer === 2 ? 1152 : version === 1 ? 1152 : 576;
    const frameBytes = layer === 1
      ? (Math.floor((12 * bitrate) / rate) + padding) * 4
      : Math.floor(((version === 1 ? 144 : 72) * bitrate) / rate) + padding;

    frames += 1;
    seconds += samples / rate;
    sampleRate = sampleRate || rate;
    channels = (buffer[offset + 3] >> 6) === 3 ? 1 : 2;
    bitrates.add(bitrate);
    offset += frameBytes;
  }

  return {
    frames,
    seconds,
    sampleRate,
    channels,
    vbr: bitrates.size > 1,
    avgKbps: seconds > 0 ? Math.round((buffer.length * 8) / seconds / 1000) : 0
  };
}

/** Recorre los bloques de nivel superior de un contenedor RIFF/WebP. */
const webpChunks = (buffer) => {
  const chunks = [];
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const fourCC = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    chunks.push({ fourCC, offset, size });
    offset += 8 + size + (size % 2);
  }

  return chunks;
};

test('los once simbolos de las casillas viven en public/src/assets/slot', () => {
  for (let index = 1; index <= 11; index += 1) {
    const file = path.join(SLOT_DIR, `s${index}.webp`);
    assert.ok(fs.existsSync(file), `Falta ${path.relative(ROOT_DIR, file)}`);
    assert.ok(fs.statSync(file).size > 0, `${path.basename(file)} esta vacio`);
  }
});

test('los 11 simbolos del motor apuntan a imagenes existentes', () => {
  const source = read(FORMAT_PATH);
  const slotMatches = [...source.matchAll(/image:\s*`\$\{SYMBOL_IMAGE_PATH\}([^`]+)`/g)];

  assert.equal(slotMatches.length, 9, 'format.js debe mapear S1-S9 sobre los simbolos navideños');
  assert.equal(
    (source.match(/image:\s*BRAND_LOGO_IMAGE/g) || []).length,
    1,
    'Solo el scatter cae con el logotipo de Santa Crush'
  );
  assert.equal(
    (source.match(/image:\s*MULTIPLIER_IMAGE/g) || []).length,
    1,
    'El multiplicador usa el bono, no el logotipo del scatter'
  );
  assert.match(
    source,
    /const BRAND_LOGO_IMAGE = `\$\{SYMBOL_IMAGE_PATH\}s10\.webp`;/,
    'El logo del tablero es s10.webp'
  );
  assert.match(
    source,
    /const MULTIPLIER_IMAGE = `\$\{SYMBOL_IMAGE_PATH\}s11\.webp`;/,
    'El bono del multiplicador es s11.webp'
  );

  for (const [, fileName] of slotMatches) {
    const file = path.join(SLOT_DIR, fileName);
    assert.ok(fs.existsSync(file), `Simbolo sin asset: ${path.relative(ROOT_DIR, file)}`);
    assert.match(fileName, /^s\d+\.webp$/, `Nombre de asset inesperado: ${fileName}`);
  }

  for (const fileName of ['s10.webp', 's11.webp']) {
    const file = path.join(SLOT_DIR, fileName);
    assert.ok(fs.existsSync(file), `Falta ${path.relative(ROOT_DIR, file)}`);
  }
});

test('el tablero solo usa los simbolos navideños, el sello y el bono', () => {
  // La cuadricula usa el set navideño de `public/src/assets/slot` (s1 = S1 ...
  // s9 = S9, en el mismo orden que la tabla de pagos), el logotipo s10.webp cae
  // como scatter (SC) y el bono navideño s11.webp es el multiplicador (MX), que
  // se pinta con su valor encima. Ya no queda ninguna pieza de caramelo en el
  // tablero.
  const source = read(FORMAT_PATH);
  const start = source.indexOf('export const SYMBOLS');
  const end = source.indexOf('export const SYMBOL_KEYS');
  assert.ok(start >= 0 && end > start, 'format.js debe declarar el mapa SYMBOLS');

  assert.match(
    source,
    /const SYMBOL_IMAGE_PATH = '\/src\/assets\/slot\/';/,
    'Los simbolos se sirven desde /src/assets/slot/'
  );

  const block = source.slice(start, end);
  assert.equal(
    (block.match(/^ {2}[A-Z][A-Z0-9]:/gm) || []).length,
    11,
    'El mapa debe cubrir S1-S9, SC y MX'
  );

  const ladder = [...block.matchAll(/^ {2}(S[1-9]): { glyph: '[^']*', name: '[^']*', image: `\$\{SYMBOL_IMAGE_PATH\}(s\d+)\.webp`/gm)];
  assert.equal(ladder.length, 9, 'Los nueve regulares deben venir de la carpeta slot');
  ladder.forEach(([, symbol, file], index) => {
    assert.equal(file, `s${index + 1}`, `${symbol} debe usar s${index + 1}.webp`);
  });

  assert.match(block, /SC: [^\n]*BRAND_LOGO_IMAGE/, 'El scatter es el logo s10.webp');
  assert.match(block, /MX: [^\n]*MULTIPLIER_IMAGE/, 'El multiplicador cae con el bono s11.webp');
  assert.doesNotMatch(block, /candy_/, 'Ninguna casilla del mapa vuelve a los caramelos');
  assert.doesNotMatch(source, /candy_4\.png|BOMB_IMAGE_PATH/, 'format.js ya no sirve el caramelo de la bomba');
});

test('los nueve simbolos comparten bloque y el especial tiene el suyo', () => {
  const css = read(STYLE_PATH);
  const theme = read(THEME_PATH);

  // Ningun regular tiene bloque propio: ya no hay regla por simbolo, asi que los
  // nueve se pintan con el mismo vidrio.
  assert.doesNotMatch(css, /\.tile\[data-sym="S[1-9]"\]/, 'Ningun simbolo regular se pinta con bloque propio');
  assert.doesNotMatch(theme, /\.tile\[data-sym="S[1-9]"\]/, 'El tema tampoco pinta simbolos distintos');

  // El bloque especial (scatter + multiplicador) es el unico con estilo propio:
  // filo de oro, halo calido y la casilla dibujada un 4 % mas grande que su hueco,
  // para que sobresalga de la rejilla sin llegar a pisar al vecino.
  const logoBlock = css.match(
    /\.tile\[data-sym="SC"\],\r?\n\.tile\[data-sym="MX"\] \{\r?\n  --logo-tile-scale: [^}]*\}/
  );
  assert.ok(logoBlock, 'El bloque del logo debe tener regla propia');
  for (const declaration of [
    'border-color: rgba(255, 230, 150, 0.98);',
    'transform: scale(var(--logo-tile-scale));',
    '0 0 0 2px rgba(122, 52, 4, 0.9)',
    'rgba(255, 198, 40, 0.78)'
  ]) {
    assert.ok(
      logoBlock[0].includes(declaration),
      `El bloque del logo se pinta en oro con \`${declaration}\``
    );
  }
  assert.match(logoBlock[0], /--logo-tile-scale: 1\.04;/, 'La medalla crece un 4 % sobre su hueco');

  // La medalla (oro macizo + abanico de rayos + barrido de luz) vive en `::before`,
  // que ningun tema repinta: asi el bloque no depende de la especificidad del tema.
  const medal = css.match(/\.tile\[data-sym="SC"\]::before,\r?\n\.tile\[data-sym="MX"\]::before \{([^}]*)\}/);
  assert.ok(medal, 'La medalla debe pintarse en un pseudo elemento');
  assert.match(medal[1], /repeating-conic-gradient\(/, 'La medalla lleva el abanico de rayos');
  assert.match(medal[1], /radial-gradient\(78% 92% at 50% 28%[^;]*#ffc23c/, 'La medalla va en oro, no en blanco');
  assert.match(medal[1], /animation: logo-tile-sheen/, 'La medalla barre una banda de luz sin parar');
  assert.match(
    css,
    /@keyframes logo-tile-sheen \{\r?\n  0% \{ background-position: -60% 50%/,
    'El barrido recorre la medalla en diagonal'
  );

  assert.match(
    theme,
    /html\[data-theme="santa-crush"\] \.tile\[data-sym="SC"\],\r?\nhtml\[data-theme="santa-crush"\] \.tile\[data-sym="MX"\] \{[^}]*border-color:[^}]*rgba\(255, 214, 84/,
    'El tema repinta el bloque del logo (scatter y multiplicador) en oro'
  );

  // El scatter y el bono llenan su bloque de borde a borde: el arte del sello es
  // el circulo 1:1 de `npm run build:seals` y el del bono ocupa su lienzo, los dos
  // encajados en 335 x 341, asi que `object-view-box` no tiene nada que recortar y
  // `contain` los ajusta por el alto: en la casilla apaisada del movil (52 x 29)
  // quedan centrados y enteros.
  assert.match(
    css,
    /\.tile\[data-sym="SC"\],\r?\n\.tile\[data-sym="MX"\] \{\r?\n  --logo-bleed: 0%;\r?\n  overflow: visible;\r?\n  z-index: 3;\r?\n\}/,
    'La casilla del sello no recorta y se pone por delante de sus vecinas'
  );
  const logoImage = css.match(
    /\.tile\[data-sym="SC"\] \.tile__img,\r?\n\.tile\[data-sym="MX"\] \.tile__img \{([^}]*)\}/
  );
  assert.ok(logoImage, 'El sello debe declarar su tamano dentro de la casilla');
  for (const declaration of [
    'left: calc(var(--logo-bleed) * -1);',
    'top: calc(var(--logo-bleed) * -1);',
    'width: calc(100% + var(--logo-bleed) * 2);',
    'height: calc(100% + var(--logo-bleed) * 2);',
    'object-fit: contain;',
    'object-view-box: inset(0);',
    'animation: logo-tile-lift'
  ]) {
    assert.ok(
      logoImage[1].includes(declaration),
      `El sello llena su bloque y flota con \`${declaration}\``
    );
  }
});

test('el bono del multiplicador viaja en el lienzo comun de las casillas', () => {
  const css = read(STYLE_PATH);
  const file = path.join(SLOT_DIR, 's11.webp');

  // El bono viaja como WebP estatico con alfa y en el mismo lienzo de 335 x 341
  // que el resto de piezas: el build los genera todos con el mismo contrato.
  assert.ok(fs.existsSync(file), 'Falta public/src/assets/slot/s11.webp');
  const binary = fs.readFileSync(file);
  assert.equal(binary.toString('ascii', 0, 4), 'RIFF', 's11.webp debe ser un contenedor RIFF/WebP');
  assert.equal(binary.toString('ascii', 8, 12), 'WEBP', 's11.webp debe ser un WebP real');

  const chunks = webpChunks(binary);
  assert.equal(chunks[0].fourCC, 'VP8X', 's11.webp debe declarar caracteristicas extendidas (VP8X)');
  assert.ok(
    chunks.some((chunk) => chunk.fourCC === 'ALPH'),
    'El bono del multiplicador debe conservar el canal alfa'
  );
  assert.equal(
    chunks.some((chunk) => chunk.fourCC === 'ANMF'),
    false,
    'El bono estatico no debe traer fotogramas ANMF'
  );

  const width = binary.readUIntLE(chunks[0].offset + 12, 3) + 1;
  const height = binary.readUIntLE(chunks[0].offset + 15, 3) + 1;
  assert.equal(width, 335, 'El bono del multiplicador mide 335 px de ancho');
  assert.equal(height, 341, 'El bono del multiplicador mide 341 px de alto');
  assert.ok(
    binary.length < 60 * 1024,
    `s11.webp pesa ${(binary.length / 1024).toFixed(1)} KB: ejecuta npm run build:symbols`
  );

  // La pieza llena su lienzo, asi que no necesita recorte de aire
  // (`object-view-box`) ni sangrado (`--logo-bleed`): el bloque compartido ya los
  // declara neutros y ningun simbolo debe reajustarlos por su cuenta.
  assert.match(
    css,
    /\.tile\[data-sym="SC"\],\r?\n\.tile\[data-sym="MX"\] \{\r?\n  --logo-bleed: 0%;/,
    'La casilla del especial ocupa la casilla entera, sin sangrado'
  );
  assert.deepEqual(
    [...css.matchAll(/--logo-bleed: ([^;]+);/g)].map((match) => match[1]),
    ['0%'],
    'Solo el encaje compartido declara el sangrado, y a cero: MX no reajusta nada'
  );
});

test('el scatter es el sello de marca y el multiplicador el bono navideño', async () => {
  // `s10` se deriva de `design/MBETN-LOGO@3x.png` con `npm run build:seals`, que
  // convierte en alfa el fondo blanco del maestro y repone el disco interior al
  // 90 % de opacidad. El contrato del sello se mide sobre los pixeles servidos:
  // alfa de verdad fuera del circulo y, por dentro, el relleno blanco exacto en
  // vez del parche opaco que tapaba la medalla de la casilla.
  //
  // `s11` ya no es copia del sello: el multiplicador cae con el arte del bono
  // navideño, asi que se mide como arte propio (alfa real, sin fondo opaco).
  const { SEAL_FILL_OPACITY } = require('../scripts/build-brand-seals.js');
  const expectedAlpha = Math.round(255 * SEAL_FILL_OPACITY);
  const scatter = path.join(SLOT_DIR, 's10.webp');
  const multiplier = path.join(SLOT_DIR, 's11.webp');

  assert.ok(
    !fs.readFileSync(scatter).equals(fs.readFileSync(multiplier)),
    'El multiplicador no vuelve a caer con el sello del scatter: su arte es el bono'
  );

  for (const file of [scatter]) {
    const fileName = path.basename(file);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const total = info.width * info.height;

    let transparent = 0;
    let flatWhite = 0;
    let globe = 0;
    const whiteAlpha = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a === 0) transparent += 1;
      // Blanco solido opaco: el parche que tapaba la medalla.
      if (a > 240 && r > 245 && g > 245 && b > 245) flatWhite += 1;
      // Alfa del relleno: el disco blanco del sello.
      if (r > 248 && g > 248 && b > 248) whiteAlpha.set(a, (whiteAlpha.get(a) || 0) + 1);
      // El arte del globo terraqueo tenia azules y verdes que el sello no usa.
      if (a > 200 && b > 90 && g > 70 && r < 90 && b > r + 60) globe += 1;
    }

    // Fuera del circulo el lienzo sigue limpio, asi que el sello recorta redondo.
    const clear = transparent / total;
    assert.ok(
      clear > 0.15 && clear < 0.35,
      `${fileName} debe dejar transparentes las esquinas del lienzo (${(clear * 100).toFixed(1)} % transparente)`
    );
    assert.ok(
      flatWhite / total < 0.005,
      `${fileName} conserva un fondo blanco opaco: el disco debe ir al ${SEAL_FILL_OPACITY * 100} %`
    );
    assert.equal(globe, 0, `${fileName} no puede contener el planeta del logo anterior`);

    // Y el relleno del disco tiene que estar ahi, con el alfa que pide el build.
    const [dominantAlpha, dominantCount] = [...whiteAlpha.entries()].sort((left, right) => right[1] - left[1])[0] || [0, 0];
    assert.ok(
      dominantCount / total > 0.2,
      `${fileName} no trae el relleno blanco del disco: ejecuta npm run build:seals y npm run build:symbols`
    );
    assert.ok(
      Math.abs(dominantAlpha - expectedAlpha) <= 2,
      `${fileName}: el disco debe ir al ${SEAL_FILL_OPACITY * 100} % de opacidad (alfa ${expectedAlpha}) y llega en alfa ${dominantAlpha}`
    );
  }

  /* El bono del multiplicador: arte dibujado sobre alfa, con el lazo rojo y el
     oro del regalo por debajo de la etiqueta del valor que pinta el motor. */
  const bonus = await sharp(multiplier).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bonusTotal = bonus.info.width * bonus.info.height;
  let bonusClear = 0;
  let bonusRed = 0;
  let bonusGold = 0;
  for (let i = 0; i < bonus.data.length; i += 4) {
    const [r, g, b, a] = [bonus.data[i], bonus.data[i + 1], bonus.data[i + 2], bonus.data[i + 3]];
    if (a === 0) bonusClear += 1;
    if (a > 200 && r > 150 && g < 110 && b < 110) bonusRed += 1;
    if (a > 200 && r > 200 && g > 140 && b < 120) bonusGold += 1;
  }

  const bonusClearRatio = bonusClear / bonusTotal;
  assert.ok(
    bonusClearRatio > 0.2 && bonusClearRatio < 0.45,
    `s11.webp debe recortarse sobre alfa (${(bonusClearRatio * 100).toFixed(1)} % transparente)`
  );
  assert.ok(bonusRed / bonusTotal > 0.08, 's11.webp debe traer el lazo rojo del bono');
  assert.ok(bonusGold / bonusTotal > 0.08, 's11.webp debe traer el oro del bono');

  // El tablero, la tabla de pagos y las animaciones de `MX` leen `SYMBOLS[..].image`,
  // asi que la unica mencion valida de los dos especiales es la declaracion de
  // `lib/format.js`: si otro modulo clava la ruta a mano, puede quedarse con el
  // arte viejo mientras el mapa ya apunta al nuevo.
  const uiDir = path.join(PUBLIC_DIR, 'ui');
  const modules = fs
    .readdirSync(uiDir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.js'))
    .map((entry) => path.join(uiDir, String(entry)));

  for (const module of modules) {
    if (path.basename(module) === 'format.js') continue;
    assert.doesNotMatch(
      read(module),
      /s1[01]\.webp/,
      `${path.relative(ROOT_DIR, module)} debe leer el sello de SYMBOLS, no clavarlo`
    );
  }
});

test('el logotipo de Santa Crush se sirve ligero y con su proporcion 2:1', () => {
  const html = read(INDEX_PATH);

  assert.ok(fs.existsSync(LOGO_PATH), 'Falta public/src/assets/MERIDIANOBET-CRUSH-LOGO.webp');

  // El peso es parte del contrato: el maestro PNG pesa 1,8 MB y el WebP servido
  // queda por debajo de 200 KB. Es un WebP estatico (VP8X + ALPH + VP8): el
  // logotipo nuevo es un lockup fijo, no la animacion de cinco fotogramas del
  // tema anterior.
  const binary = fs.readFileSync(LOGO_PATH);
  assert.equal(binary.toString('ascii', 0, 4), 'RIFF', 'El logo debe ser un contenedor RIFF/WebP');
  assert.equal(binary.toString('ascii', 8, 12), 'WEBP', 'El logo debe ser un contenedor RIFF/WebP');

  const chunks = webpChunks(binary);
  assert.equal(chunks[0].fourCC, 'VP8X', 'El logo debe declarar caracteristicas extendidas (VP8X)');

  const flags = binary.readUInt8(chunks[0].offset + 8);
  assert.equal((flags & 0x02) === 0, true, 'El logo no debe declarar animacion (bloque ANIM)');
  assert.equal((flags & 0x10) !== 0, true, 'El logo debe declarar canal alfa');
  assert.ok(
    chunks.some((chunk) => chunk.fourCC === 'ALPH'),
    'El logo debe traer el plano alfa como bloque ALPH'
  );
  assert.equal(
    chunks.some((chunk) => chunk.fourCC === 'ANMF'),
    false,
    'El logo estatico no debe traer fotogramas ANMF'
  );

  // Lienzo: 900 x 450, la misma proporcion 2:1 del maestro. Se sirve a 240 px de
  // ancho como maximo, asi que 900 cubre pantallas de alta densidad sin reescalar
  // en el navegador y sin publicar el PNG completo.
  const width = binary.readUIntLE(chunks[0].offset + 12, 3) + 1;
  const height = binary.readUIntLE(chunks[0].offset + 15, 3) + 1;
  assert.equal(width, 900, 'El logo debe servirse a 900 px de ancho');
  assert.equal(height, 450, 'El logo debe conservar la proporcion 2:1 (900 x 450)');

  assert.ok(
    binary.length < 200 * 1024,
    `El logo debe pesar menos de 200 KB (pesa ${(binary.length / 1024).toFixed(1)} KB)`
  );

  assert.match(html, /<div class="machine__hero">/);
  assert.match(html, /src="\/src\/assets\/MERIDIANOBET-CRUSH-LOGO\.webp"/);
  assert.match(html, /alt="Santa Crush"/);
  // La caja reserva la proporcion del archivo: si el HTML dice 1:1 el navegador
  // aparta el doble de alto del que ocupa el dibujo y el tablero salta al cargar.
  assert.match(html, /width="480" height="240"/, 'El logo debe reservar 480x240 px (2:1)');
});

test('el maestro del logo vive fuera de public/ y no viaja al CDN', () => {
  // El PNG pesa 1,8 MB: si se queda en `public/src`, se publica en cada deploy y
  // el directorio deja de ser solo lo que consume el cliente.
  assert.ok(
    fs.existsSync(LOGO_MASTER_PATH),
    'Falta el maestro design/MeridianoBet Sports Crush Logo.png'
  );
  assert.ok(fs.statSync(LOGO_MASTER_PATH).size > 0, 'El maestro del logo esta vacio');

  const signature = fs.readFileSync(LOGO_MASTER_PATH).subarray(0, 8);
  assert.deepEqual(
    [...signature],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    'El maestro del logo debe seguir siendo un PNG'
  );

  const media = /\.(gif|png|jpe?g|webp|avif|psd|tiff?|mp4|mov|webm)$/i;
  const strays = fs
    .readdirSync(PUBLIC_SRC_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && media.test(entry.name))
    .map((entry) => entry.name);
  assert.deepEqual(
    strays,
    [],
    `public/src solo debe contener carpetas publicadas; sobran: ${strays.join(', ')}`
  );
});

test('la barra superior solo lleva los controles del juego', () => {
  const html = read(INDEX_PATH);
  const css = read(STYLE_PATH);
  const theme = read(path.join(PUBLIC_DIR, 'src', 'css', 'theme.css'));

  // La pestaña del navegador lleva solo el nombre del producto: ni la grilla
  // ni el RTP ni el tope de premio son parte del titulo (viven en la tabla de
  // pagos, en la ayuda y en la descripcion).
  assert.match(html, /<title>Santa Crush<\/title>/);
  assert.match(html, /<meta name="theme-color" content="#c8102e" \/>/);
  assert.match(
    html,
    /<meta name="description" content="Santa Crush: /,
    'La descripcion debe nombrar la marca nueva'
  );
  assert.doesNotMatch(html, /PANA CRUSH|Pana Crush|pana crush/, 'No deben quedar restos de la marca anterior');

  // La cabecera se quedo en la fila de controles: ni insignia del balon, ni
  // titulo visible, ni subtitulo comercial. El nombre sobrevive en el `<h1>`
  // para lectores de pantalla (unico encabezado de nivel 1 del documento) y en
  // la pestaña del navegador. Las comprobaciones evitan que la marca vuelva por
  // inercia de un merge.
  assert.doesNotMatch(html, /class="brand|brand__/, 'La barra no lleva marca visible');
  assert.doesNotMatch(css, /\.brand\b|\.brand__/, 'style.css no debe conservar reglas de marca');
  assert.doesNotMatch(theme, /\.brand__/, 'theme.css no debe conservar reglas de marca');
  assert.doesNotMatch(html, /Sports Grid Pays/, 'La barra no lleva subtitulo comercial');
  assert.match(
    html,
    /<h1 class="sr-only">Santa Crush<\/h1>/,
    'El nombre sigue disponible para lectores de pantalla'
  );
  // La barra es transparente: ni cristal en `style.css` ni repinte en el tema.
  assert.doesNotMatch(css, /\.topbar\s*\{[^}]*background/, 'La barra no lleva fondo propio');
  assert.doesNotMatch(
    theme,
    /html\[data-theme="santa-crush"\] \.topbar\s*\{/,
    'theme.css no debe repintar la barra'
  );

  // El contrato con el JS no cambia: el controlador busca estos ids y pinta el
  // silencio con `aria-pressed`, no con el texto del boton.
  assert.match(html, /class="icon-btn icon-btn--sound" id="btn-sound" type="button" aria-pressed="true"/);
  assert.match(html, /class="icon-btn icon-btn--help icon-btn--paytable" id="btn-help" type="button"/);
  // La ayuda lleva rotulo visible y el glifo de tabla: el `?` no decia que abre
  // la tabla de premios.
  assert.match(
    html,
    /<span class="icon-btn__label" aria-hidden="true">Tabla de pagos<\/span>/,
    'el boton de la barra se anuncia con su nombre'
  );
  assert.match(html, /aria-haspopup="dialog" aria-controls="modal"/);
  assert.doesNotMatch(html, />\?<\/button>/, 'La barra no conserva el interrogante');
  assert.match(
    html,
    /<div class="topbar__audio" role="group" aria-label="Audio y ayuda">/,
    'Sonido y ayuda comparten la capsula de audio'
  );
  assert.match(
    css,
    /\.icon-btn\[aria-pressed="false"\] \.icon-btn__mute \{ display: inline; \}/,
    'El icono de silencio se pinta por CSS desde `aria-pressed`'
  );
  // El rotulo visible y las tablas del documento: maqueta en `style.css`,
  // material en `theme.css`.
  assert.match(css, /\.topbar \.icon-btn\.icon-btn--paytable \{/);
  assert.match(css, /\.icon-btn__label--short \{ display: none; \}/);
  assert.match(css, /\.paytable__scroll \{/);
  assert.match(css, /\.paytable__chip \{/);
  assert.match(theme, /html\[data-theme="santa-crush"\] \.topbar \.icon-btn__label \{/);
  assert.match(theme, /html\[data-theme="santa-crush"\] \.paytable__chip \{/);

  // La capa de marca pinta los controles que quedan en la barra; la maqueta
  // (geometria, fondo y alineacion) vive en style.css.
  for (const selector of ['.topbar__audio', '.topbar .btn--demo']) {
    assert.ok(
      theme.includes(`html[data-theme="santa-crush"] ${selector}`),
      `theme.css debe pintar \`${selector}\``
    );
  }
  assert.doesNotMatch(html, /[\u{1F507}-\u{1F50A}]/u, 'La barra usa SVG, no emojis de altavoz');
});

test('el cartel de victoria se sirve en WebP con alfa y el maestro queda fuera de public/', () => {
  const html = read(INDEX_PATH);
  const css = read(STYLE_PATH);
  const ui = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'GameView.js'));

  // El maestro (1,8 MB) se archiva en `design/`: no viaja al CDN ni se puede
  // colar como respaldo en `public/src/assets`.
  assert.ok(fs.existsSync(WIN_MASTER_PATH), 'Falta el maestro design/victoria_deportiva.png');
  assert.ok(fs.statSync(WIN_MASTER_PATH).size > 0, 'El maestro del cartel esta vacio');
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', 'Victoria deportiva brillante.png')),
    'El PNG maestro no debe quedarse en public/src/assets'
  );
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', 'victoria_dulce.webp')),
    'El cartel anterior (victoria_dulce.webp) ya no se sirve'
  );

  assert.ok(fs.existsSync(WIN_ART_PATH), 'Falta public/src/assets/victoria_deportiva.webp');
  const binary = fs.readFileSync(WIN_ART_PATH);
  assert.equal(binary.toString('ascii', 0, 4), 'RIFF', 'El cartel debe ser un contenedor RIFF/WebP');
  assert.equal(binary.toString('ascii', 8, 12), 'WEBP', 'El cartel debe ser un WebP real');

  const chunks = webpChunks(binary);
  assert.equal(chunks[0].fourCC, 'VP8X', 'El cartel debe declarar extensiones (VP8X)');
  assert.ok(
    chunks.some((chunk) => chunk.fourCC === 'ALPH'),
    'El cartel debe conservar el canal alfa del maestro (ALPH): sin el, el velo taparia la pantalla'
  );
  assert.ok(
    chunks.some((chunk) => chunk.fourCC === 'VP8 '),
    'El cartel debe ser un WebP lossy (VP8), no un PNG disfrazado'
  );

  // Sin deformar. `build:win` recorta antes de reescalar, asi que la caja util
  // del maestro es 1621 x 878 (el lienzo 1774 x 887 tiene aire transparente a
  // los lados) y 1280 x 693 conserva esa relacion 1,846:1.
  const master = fs.readFileSync(WIN_MASTER_PATH);
  assert.equal(master.toString('ascii', 1, 4), 'PNG', 'design/victoria_deportiva.png debe ser el PNG maestro');
  const masterWidth = master.readUInt32BE(16);
  const masterHeight = master.readUInt32BE(20);
  const width = binary.readUIntLE(chunks[0].offset + 12, 3) + 1;
  const height = binary.readUIntLE(chunks[0].offset + 15, 3) + 1;

  assert.equal(masterWidth, 1774, 'El maestro deportivo mide 1774 px de ancho');
  assert.equal(masterHeight, 887, 'El maestro deportivo mide 887 px de alto');
  assert.equal(width, 1280, 'El cartel debe servirse a 1280 px de ancho (ver build:win)');
  assert.equal(height, 693, 'El cartel debe servirse a 693 px de alto (caja recortada)');
  assert.ok(
    Math.abs(width / height - 1621 / 878) < 0.002,
    `El cartel deforma la caja recortada del maestro: ${width}x${height} contra 1621x878`
  );

  // Peso: el lienzo completo a q=90 pesa 816 KB y se pinta a 700 px CSS como
  // maximo. 1280 px conservan el detalle retina y dejan el archivo en ~317 KB.
  assert.ok(
    binary.length < 400 * 1024,
    `El cartel pesa ${(binary.length / 1024).toFixed(1)} KB (objetivo < 400 KB)`
  );

  // Capa dedicada, con el arte, la lluvia y el importe que rellena `GameView`.
  // Es decorativa (`aria-hidden`): el banner del tablero anuncia el premio.
  assert.match(
    html,
    /<div class="win" id="win-overlay" hidden aria-hidden="true">/,
    'Falta la capa #win-overlay'
  );
  assert.match(
    html,
    /src="\/src\/assets\/victoria_deportiva\.webp"/,
    'La capa debe usar el WebP optimizado del cartel deportivo'
  );
  // La caja reservada por el HTML tiene que coincidir con el WebP (sin saltos).
  assert.match(
    html,
    /width="1280" height="693"/,
    'El HTML debe reservar la caja 1280x693 del cartel'
  );
  assert.match(html, /id="win-rain"/, 'Falta el contenedor de la lluvia de pelotas');
  assert.match(html, /id="win-amount"/, 'Falta el contador del premio');
  assert.match(html, /id="win-currency"/, 'Falta la divisa del premio');

  // Velo oscuro con blur y rayos girando; la capa nunca debe generar scroll.
  assert.match(css, /\.win\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/);
  assert.match(css, /\.win\s*\{[^}]*background:\s*rgba\(0, 0, 0, 0\.75\);/);
  assert.match(css, /\.win\s*\{[^}]*\n\s*backdrop-filter:\s*blur\(4px\);/);
  assert.match(css, /\.win\s*\{[^}]*overflow:\s*clip;/);
  assert.match(
    css,
    /@keyframes rotateRays\s*\{\s*from\s*\{\s*transform:\s*rotate\(0deg\);\s*\}\s*to\s*\{\s*transform:\s*rotate\(360deg\);\s*\}\s*\}/,
    'Los rayos deben girar con `rotateRays`'
  );

  // El cartel apaisado se centra y se adapta: techo de escritorio (700 px),
  // ancho de movil (92vw) y alto disponible (54vh x 1,85).
  assert.match(
    css,
    /\.win__art\s*\{[^}]*width:\s*min\(700px,\s*92vw,\s*calc\(54vh \* 1\.85\)\);/,
    'El cartel debe escalar con sus tres techos (escritorio, movil y alto)'
  );
  assert.match(
    css,
    /\.win__stage\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/,
    'El cartel y el importe deben quedar centrados en el velo'
  );

  // Logica: la capa se abre para cualquier victoria y la intensidad escala con
  // `win / bet` (antes solo big/mega/epic la abrian y el 88 % de las victorias
  // del modo base se quedaban en el banner).
  assert.match(ui, /resolveWinProfile_\(key, cents, betCents\)/);
  assert.match(
    ui,
    /showWinOverlay\(level, amountText, \{ cents = null, profile = null \} = \{\}\)/
  );
  assert.match(ui, /this\.showWinOverlay\(key, amountText, \{ cents, profile \}\)/);
  assert.match(ui, /zone: 'sides'/);

  // Tres perfiles con su lluvia y permanencia, y autocierre escalado por nivel.
  assert.match(ui, /low: Object\.freeze\(\{[\s\S]*?balls: 8,[\s\S]*?durationMs: 1700,/);
  assert.match(ui, /mid: Object\.freeze\(\{[\s\S]*?balls: 22,[\s\S]*?durationMs: 3000,/);
  assert.match(ui, /high: Object\.freeze\(\{[\s\S]*?balls: 42,[\s\S]*?durationMs: 4200,/);
  assert.match(
    ui,
    /WIN_HIGH_MS = Object\.freeze\(\{ big: 3800, mega: 4200, epic: 4600 \}\)/,
    'big/mega/epic deben escalar la permanencia'
  );

  // Cualquier importe > 0 abre; ya no hay umbral binario por ratio.
  assert.match(
    ui,
    /if \(key !== 'win'\) return true;\s*const won = Number\(cents\);\s*return Number\.isFinite\(won\) && won > 0;/,
    'Cualquier victoria valida debe abrir la capa'
  );
  assert.doesNotMatch(ui, /WIN_OVERLAY_MIN_RATIO/, 'El umbral binario ya no debe existir');

  // Movimiento reducido: la capa se abre en version estatica, no se cancela.
  assert.doesNotMatch(
    ui,
    /if \(!node \|\| REDUCED_MOTION\) return false;/,
    'Con prefers-reduced-motion la capa debe abrirse (sin animaciones), no descartarse'
  );
  assert.match(
    ui,
    /if \(this\.fx && !REDUCED_MOTION && tier\.balls > 0\) \{/,
    'Sin movimiento no se lanza la lluvia de pelotas'
  );
  assert.match(ui, /rollWinAmount_\(cents, amountText, tier\.rollMs\)/);

  // El renderizador de ronda pasa la apuesta real para elegir el perfil.
  const animator = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'RoundAnimator.js'));
  assert.match(
    animator,
    /celebrate\(level\.key, formatCents\(total\), \{ cents: total, betCents: round\.betCents \}\)/,
    'RoundAnimator debe pasar betCents a celebrate'
  );

  // Perfiles CSS: entrada sutil para < 1x y rebote marcado para > 10x.
  assert.match(css, /\.win\.is-low \.win__rays\s*\{[^}]*opacity:\s*0\.22;[^}]*animation:\s*none;/);
  assert.match(css, /\.win\.is-low \.win__art\s*\{[^}]*animation:\s*win-pop-soft/);
  assert.match(css, /\.win\.is-high \.win__art\s*\{[^}]*animation:\s*win-pop-big/);
  assert.match(css, /@keyframes win-pop-big\s*\{[\s\S]*?scale\(1\.12\)/);

  // La media query apaga animaciones (incluidos los perfiles) sin ocultar la capa.
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.win\.is-high \.win__art \{ animation: none; \}/,
    'La media query debe apagar tambien el rebote de los premios altos'
  );
});

test('la victoria llueve los simbolos del tablero en lugar de caramelos', () => {
  const fx = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'fx.js'));
  const css = read(STYLE_PATH);
  const ui = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'GameView.js'));

  // La municion sale del mapa de simbolos: los nueve regulares de `assets/slot`,
  // que son los mismos WebP que el jugador acaba de ver en la rejilla. Los dos
  // especiales (s10 scatter, s11 bono) no caen: son premios, no simbolos.
  assert.match(
    fx,
    /import \{ SYMBOLS \} from '\.\.\/lib\/format\.js';/,
    'fx.js debe reutilizar el mapa SYMBOLS en lugar de duplicar rutas'
  );
  assert.match(fx, /const BALL_FACES = Object\.freeze\(\[/);
  assert.match(
    fx,
    /\['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'\]/,
    'La lluvia debe usar los nueve simbolos regulares'
  );
  assert.match(fx, /\.map\(\(key\) => SYMBOLS\[key\]\)\);/);

  // Cada particula es una imagen de simbolo con su glifo como respaldo.
  assert.match(fx, /function ballRain\(/);
  assert.match(fx, /const face = pick\(BALL_FACES\);/);
  assert.match(fx, /img\.src = face\.image;/);
  assert.match(fx, /glyph\.textContent = face\.glyph;/);
  assert.match(fx, /el\.append\(glyph, img\);/);
  assert.match(
    fx,
    /img\.addEventListener\('error', \(\) => img\.remove\(\), \{ once: true \}\)/,
    'Un WebP que no llega debe dejar el glifo del simbolo, no un hueco'
  );
  assert.match(fx, /return \{ clear, sparkBurst, flash, ballRain, mega \};/);

  // Ni caramelos ni monedas: el generador de la victoria solo conoce balones.
  assert.doesNotMatch(fx, /COIN_FACES|coinRain|fx__coin/, 'El generador no debe volver a las monedas');
  assert.doesNotMatch(fx, /[\u{1F36C}\u{1F36D}\u{1FA99}]/u, 'Sin emojis de caramelo ni de moneda');

  // Animacion propia y caja cuadrada: el glifo y la pelota comparten celda y la
  // imagen se dibuja con `contain` para no deformar el balon.
  assert.match(css, /\.fx__ball\s*\{[^}]*animation:\s*ball-fall/);
  assert.match(css, /@keyframes ball-fall\s*\{/);
  assert.match(css, /\.fx__ball-img\s*\{[^}]*object-fit:\s*contain;/);
  assert.match(css, /\.fx__ball > \* \{ grid-area: 1 \/ 1; \}/, 'Glifo y pelota comparten celda');
  assert.doesNotMatch(css, /\.fx__coin|coin-fall/, 'El CSS ya no pinta monedas');

  // La pantalla de victoria le pasa su contenedor y cae por los laterales.
  // El contenedor sale de `ref_`: si el nodo faltara, `ballRain` recibe `null` y
  // usa su propia capa en vez de reventar por una referencia nula.
  assert.match(
    ui,
    /this\.fx\.ballRain\(\{\s*count: tier\.balls,\s*host: this\.ref_\('winRain'\),\s*zone: 'sides'\s*\}\)/,
    'La pantalla de victoria debe llover balones por los laterales'
  );
  assert.match(
    ui,
    /const WIN_ART_SRC = '\/src\/assets\/victoria_deportiva\.webp';/,
    'La precarga debe apuntar al cartel nuevo'
  );
});

test('la victoria usa los aplausos nuevos y el fondo suena en bucle mas suave', () => {
  // El archivo se normaliza a `.MP3` exacto: el doble sufijo `.MP3.mpeg` hacia
  // que la ruta del cliente y el MIME del CDN dependieran del servidor. Los
  // aplausos de estadio sustituyen al MP3 anterior (`AUDIO-WIN-2.MP3`).
  assert.ok(
    fs.existsSync(WIN_SOUND_PATH),
    'Falta public/src/assets/AUDIO-WIN-NEW-stadium-applause.MP3'
  );
  assert.ok(
    !fs.existsSync(
      path.join(PUBLIC_DIR, 'src', 'assets', 'AUDIO-WIN-NEW-stadium-applause.MP3.mpeg')
    ),
    'El asset antiguo con doble extension no debe seguir en public/'
  );
  assert.ok(!fs.existsSync(RETIRED_WIN_SOUND_PATH), 'AUDIO-WIN-2.MP3 ya no debe servirse');
  assert.ok(
    fs.existsSync(MUSIC_SOUND_PATH),
    'Falta public/src/assets/Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3'
  );
  assert.ok(
    !fs.existsSync(UNVERSIONED_MUSIC_PATH),
    'El bucle sin version en el nombre no debe volver: la cache de src/assets es immutable un ano'
  );

  const binary = fs.readFileSync(WIN_SOUND_PATH);
  const hasId3 = binary.toString('ascii', 0, 3) === 'ID3';
  const hasMpegFrame = binary[0] === 0xff && (binary[1] & 0xe0) === 0xe0;
  assert.ok(hasId3 || hasMpegFrame, 'AUDIO-WIN-NEW-stadium-applause.MP3 debe ser un MP3 valido');
  assert.ok(binary.length > 0 && binary.length < 200 * 1024, 'El MP3 de victoria debe ser ligero');

  /* Los aplausos ya venian a 128 kbps: no se reencodean para no sumar una
     generacion de perdida al sonido que mas se oye. */
  const winFrames = readMp3Frames(binary);
  assert.ok(
    winFrames.avgKbps >= 96 && winFrames.avgKbps <= 160,
    `Los aplausos deben rondar los 128 kbps (miden ${winFrames.avgKbps} kbps)`
  );

  const music = fs.readFileSync(MUSIC_SOUND_PATH);
  const musicHasId3 = music.toString('ascii', 0, 3) === 'ID3';
  const musicHasMpegFrame = music[0] === 0xff && (music[1] & 0xe0) === 0xe0;
  assert.ok(musicHasId3 || musicHasMpegFrame, 'El bucle ambiental debe ser un MP3 valido');
  assert.ok(
    music.length > 0 && music.length < 460 * 1024,
    'El bucle ambiental de 20 s debe pesar menos de 460 KB'
  );

  /* El bucle se reencoderiza desde el maestro de 256 kbps a LAME VBR `-q:a 4`:
     conserva duracion, frecuencia y canales, y baja un 36 % de peso. */
  const musicFrames = readMp3Frames(music);
  assert.equal(musicFrames.sampleRate, 44100, 'El bucle debe seguir a 44,1 kHz');
  assert.equal(musicFrames.channels, 2, 'El bucle debe seguir en estereo');
  assert.ok(
    musicFrames.seconds > 19.9 && musicFrames.seconds < 20.3,
    `El bucle debe durar ~20 s (mide ${musicFrames.seconds.toFixed(2)} s)`
  );
  assert.ok(
    musicFrames.avgKbps >= 128 && musicFrames.avgKbps <= 192,
    `El bucle debe rondar los 160 kbps (mide ${musicFrames.avgKbps} kbps)`
  );
  assert.ok(musicFrames.vbr, 'El bucle se sirve en VBR para gastar menos sin perder calidad');

  const sfx = read(SFX_PATH);
  assert.match(
    sfx,
    /export const WIN_SOUND_SRC = '\/src\/assets\/AUDIO-WIN-NEW-stadium-applause\.MP3';/,
    'sfx.js debe apuntar a la ruta publica de los aplausos nuevos'
  );
  assert.match(
    sfx,
    /export const MUSIC_SOUND_SRC = '\/src\/assets\/Sport_Crush_Energy_Gaming_Loop_20s_160k\.mp3';/,
    'sfx.js debe apuntar a la ruta publica del bucle ambiental comprimido'
  );
  assert.match(
    sfx,
    /void preloadSound\(WIN_SOUND_SRC\);/,
    'Los aplausos deben precargarse al crear el reproductor'
  );
  assert.match(
    sfx,
    /void preloadSound\(MUSIC_SOUND_SRC\);/,
    'El bucle ambiental tambien debe precargarse'
  );
  assert.match(
    sfx,
    /fetch\(src, \{\s*cache: 'force-cache',\s*credentials: 'same-origin'\s*\}\)/,
    'La precarga debe usar el mismo origen y la cache del navegador'
  );
  assert.match(sfx, /ctx\.decodeAudioData\(/, 'Los MP3 deben decodificarse en el AudioContext');
  assert.match(sfx, /function unlockContext\(ctx\)/, 'El primer gesto debe desbloquear el audio');
  assert.match(sfx, /createGain\(\)/, 'El reproductor debe controlar el volumen con un GainNode');
  assert.match(
    sfx,
    /gain\.gain\.setValueAtTime\(WIN_SOUND_VOLUME, ctx\.currentTime\)/,
    'El volumen de los aplausos debe fijarse antes de reproducir'
  );
  assert.match(sfx, /source\.loop = true;/, 'La musica ambiental debe reproducirse en bucle');
  assert.match(
    sfx,
    /gain\.gain\.setValueAtTime\(MUSIC_VOLUME, ctx\.currentTime\)/,
    'La musica ambiental debe fijar su propio volumen'
  );

  /* Politica por defecto: la musica suena al empezar, sin esperar a girar. */
  assert.match(
    sfx,
    /const FIRST_GESTURES = \['pointerdown', 'touchstart', 'touchend', 'keydown', 'click'\];/,
    'sfx.js debe enganchar el primer gesto de la pagina para desbloquear el audio'
  );
  assert.match(
    sfx,
    /function bindFirstGesture\(\)/,
    'El arranque por defecto necesita el enganche del primer gesto'
  );
  assert.match(
    sfx,
    /autostart\(\)\s*{[\s\S]{0,200}void ensureMusic\(ctx\);/,
    'autostart debe intentar arrancar la musica de inmediato'
  );

  const main = read(path.join(PUBLIC_DIR, 'ui', 'main.js'));
  assert.match(
    main,
    /sfx\.autostart\(\);/,
    'main.js debe arrancar la musica por defecto al iniciar el juego'
  );

  // Mezcla equilibrada: el fondo tiene que quedar por debajo de la victoria.
  const winVolume = Number(sfx.match(/const WIN_SOUND_VOLUME = ([\d.]+);/)[1]);
  const musicVolume = Number(sfx.match(/const MUSIC_VOLUME = ([\d.]+);/)[1]);
  assert.ok(
    musicVolume < winVolume,
    `La musica (${musicVolume}) debe quedar por debajo de los aplausos (${winVolume})`
  );

  assert.doesNotMatch(sfx, /arpeggio/, 'La victoria ya no debe usar el arpegio sintetizado anterior');

  const animator = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'RoundAnimator.js'));
  assert.match(
    animator,
    /this\.sfx\.win\(level\.key\);/,
    'RoundAnimator debe seguir disparando el sonido de victoria al celebrar'
  );
  assert.match(
    sfx,
    /while \(activeWinSources\.size >= MAX_WIN_VOICES\)/,
    'Las cascadas con premio deben poder solapar voces de victoria'
  );
});

test('la capa candyland mantiene el tablero protagonista y los caramelos grandes', () => {
  const css = read(STYLE_PATH);

  assert.match(
    css,
    /\.machine__logo\s*\{[^}]*max-width:\s*min\(240px,\s*42vw\);[^}]*max-height:\s*110px;[^}]*\}/,
    'El logo debe quedar acotado a 240x110 px como maximo'
  );
  assert.match(
    css,
    /\.tile__img\s*\{[^}]*width:\s*85%;[^}]*height:\s*85%;[^}]*object-fit:\s*contain;[^}]*\}/,
    'Los caramelos deben ocupar el 85% de la casilla'
  );
  assert.match(css, /linear-gradient\(155deg,\s*#8be8ff/, 'El fondo debe ser candyland azul/rosa');
  assert.doesNotMatch(css, /#0b1a13|#0f261c/i, 'No deben quedar fondos verde oscuro');
});

test('la maquina completa cabe en el viewport sin scroll vertical', () => {
  const css = read(STYLE_PATH);

  assert.match(
    css,
    /html\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;[^}]*\}/,
    'html debe fijar el alto del viewport y bloquear el scroll'
  );
  assert.match(
    css,
    /\.app\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;[^}]*\}/,
    'El contenedor principal debe medir 100dvh sin desbordar'
  );
  assert.match(
    css,
    /\.machine\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;[^}]*\}/,
    'La maquina debe poder encogerse para ceder alto al tablero'
  );
  assert.match(
    css,
    /\.board\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/,
    'El tablero debe ser el bloque flexible del layout'
  );
  assert.match(
    css,
    /\.grid\s*\{[^}]*aspect-ratio:\s*6\s*\/\s*5;/,
    'La cuadricula 6x5 debe conservar su proporcion'
  );
});

test('el escalado del tablero y las casillas se adapta al alto disponible', () => {
  const css = read(STYLE_PATH);

  assert.match(
    css,
    /\.stage\s*\{[^}]*min-height:\s*0;[^}]*\}/,
    'El escenario debe poder encogerse para no empujar contenido fuera'
  );
  assert.match(
    css,
    /\.grid\s*\{[^}]*min-width:\s*0;[^}]*min-height:\s*0;[^}]*aspect-ratio:\s*6\s*\/\s*5;/,
    'La cuadricula debe poder encogerse y conservar su proporcion'
  );
  assert.match(
    css,
    /\.tile\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*min-width:\s*0;[^}]*min-height:\s*0;[^}]*\}/,
    'Cada casilla debe llenar su celda sin desbordar'
  );
  assert.match(
    css,
    /@media \(max-width: 760px\)[\s\S]*?\.board\s*\{[^}]*flex:\s*0 1 auto;[^}]*min-height:\s*0;/,
    'En movil el tablero abraza la cuadricula y puede encogerse'
  );
  assert.match(
    css,
    /width:\s*min\(100%,\s*calc\(\(100dvh - var\(--board-chrome\)\)\s*\*\s*6\s*\/\s*5\)\)/,
    'El ancho del tablero debe combinar el ancho y el alto disponibles'
  );
  assert.match(
    css,
    /@media \(min-width: 900px\) and \(max-height: 660px\)\s*\{\s*\.machine__hero\s*\{\s*display:\s*none;\s*\}/,
    'En escritorio bajo el logo desaparece para ceder alto al tablero'
  );
  assert.match(
    css,
    /\.machine__side \.machine__hero\s*\{[^}]*position:\s*absolute;[^}]*\}/,
    'En movil el logo se superpone al marco y no compite por el alto'
  );
  assert.match(
    css,
    /\.controls\s*\{[^}]*flex-shrink:\s*1;[^}]*min-height:\s*0;/,
    'Los controles deben poder comprimirse dentro de la maquina'
  );
});

test('cada dispositivo pinta su propio fondo ilustrado en WebP optimizado y sin reescalar', () => {
  const css = read(STYLE_PATH);

  // Los dos fondos ilustrados viven ya en el arbol tematico
  // (`public/assets/santa-crush/bg/**`), uno por dispositivo: el escritorio en
  // `bg-desktop.webp` y el movil en `bg-mobile.webp`. Los dos se publican sin
  // recortar y sin alfa porque se pintan con `cover`, y su maestro sigue
  // archivado en `design/` para no viajar al CDN.

  // Escritorio: el taller de juguetes vive en el arbol tematico y `body` lo
  // pinta centrado, escalado con `cover` y anclado al viewport.
  const deskWebp = path.join(PUBLIC_DIR, 'assets', 'santa-crush', 'bg', 'bg-desktop.webp');
  assert.ok(fs.existsSync(deskWebp), 'Falta public/assets/santa-crush/bg/bg-desktop.webp');
  const deskBinary = fs.readFileSync(deskWebp);
  assert.equal(deskBinary.toString('ascii', 0, 4), 'RIFF', 'bg-desktop.webp debe ser un contenedor RIFF/WebP');
  assert.equal(deskBinary.toString('ascii', 8, 12), 'WEBP', 'bg-desktop.webp debe ser un WebP real');

  // Se publica sin recortar (se pinta con `cover`) y sin alfa: el lienzo del
  // WebP tiene que medir exactamente lo que el PNG maestro.
  const deskMaster = path.join(ROOT_DIR, 'design', 'bg_desktop_toy_workshop.png');
  assert.ok(fs.existsSync(deskMaster), 'Falta el maestro design/bg_desktop_toy_workshop.png');
  const deskPng = fs.readFileSync(deskMaster);
  assert.equal(deskPng.toString('ascii', 1, 4), 'PNG', 'design/bg_desktop_toy_workshop.png debe ser el PNG maestro');

  const deskLossy = webpChunks(deskBinary).find((chunk) => chunk.fourCC === 'VP8 ');
  assert.ok(deskLossy, 'bg-desktop.webp debe ser un WebP lossy (bloque VP8), sin alfa que nadie pinta');
  assert.equal(
    deskBinary.readUInt16LE(deskLossy.offset + 14) & 0x3fff,
    deskPng.readUInt32BE(16),
    'bg-desktop.webp debe conservar el ancho del maestro'
  );
  assert.equal(
    deskBinary.readUInt16LE(deskLossy.offset + 16) & 0x3fff,
    deskPng.readUInt32BE(20),
    'bg-desktop.webp debe conservar el alto del maestro'
  );
  assert.ok(
    deskBinary.length < 420 * 1024,
    `bg-desktop.webp pesa ${(deskBinary.length / 1024).toFixed(1)} KB (objetivo < 420 KB)`
  );
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'bg_desktop_toy_workshop.png')),
    'El maestro del taller no debe servirse desde public/src'
  );

  assert.match(
    css,
    /body\s*\{[^}]*background:\s*url\('\.\.\/\.\.\/assets\/santa-crush\/bg\/bg-desktop\.webp'\)\s*no-repeat\s*center\s*center\s*\/\s*cover\s*fixed;/,
    'El escritorio debe pintar el taller de juguetes con `cover`, centrado y `fixed`'
  );
  // El respaldo inmediato (degradados de `html`) va en la misma gama nocturna,
  // para que el relevo no salte de color mientras baja el WebP.
  assert.match(
    css,
    /html\s*\{\s*background-color:\s*#0a1c4a;/,
    'El respaldo de `html` debe ser el azul marino del estadio'
  );

  // Movil: el taller de juguetes en vertical, con el mismo encuadre pero sin
  // `fixed` (en iOS el fondo fijo se repinta mal al girar el telefono).
  const mobWebp = path.join(PUBLIC_DIR, 'assets', 'santa-crush', 'bg', 'bg-mobile.webp');
  assert.ok(fs.existsSync(mobWebp), 'Falta public/assets/santa-crush/bg/bg-mobile.webp');
  const mobBinary = fs.readFileSync(mobWebp);
  assert.equal(mobBinary.toString('ascii', 0, 4), 'RIFF', 'bg-mobile.webp debe ser un contenedor RIFF/WebP');
  assert.equal(mobBinary.toString('ascii', 8, 12), 'WEBP', 'bg-mobile.webp debe ser un WebP real');

  const mobMaster = path.join(ROOT_DIR, 'design', 'bg_mobile_toy_workshop.png');
  assert.ok(fs.existsSync(mobMaster), 'Falta el maestro design/bg_mobile_toy_workshop.png');
  const mobPng = fs.readFileSync(mobMaster);
  assert.equal(mobPng.toString('ascii', 1, 4), 'PNG', 'design/bg_mobile_toy_workshop.png debe ser el PNG maestro');

  const mobLossy = webpChunks(mobBinary).find((chunk) => chunk.fourCC === 'VP8 ');
  assert.ok(mobLossy, 'bg-mobile.webp debe ser un WebP lossy (bloque VP8), sin alfa que nadie pinta');
  assert.equal(
    mobBinary.readUInt16LE(mobLossy.offset + 14) & 0x3fff,
    mobPng.readUInt32BE(16),
    'bg-mobile.webp debe conservar el ancho del maestro'
  );
  assert.equal(
    mobBinary.readUInt16LE(mobLossy.offset + 16) & 0x3fff,
    mobPng.readUInt32BE(20),
    'bg-mobile.webp debe conservar el alto del maestro'
  );
  assert.ok(
    mobBinary.length < 340 * 1024,
    `bg-mobile.webp pesa ${(mobBinary.length / 1024).toFixed(1)} KB (objetivo < 340 KB)`
  );
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'bg_mobile_toy_workshop.png')),
    'El maestro del taller vertical no debe servirse desde public/src'
  );

  assert.match(
    css,
    /@media \(max-width: 899px\) \{\s*body \{\s*background: url\('\.\.\/\.\.\/assets\/santa-crush\/bg\/bg-mobile\.webp'\) no-repeat center center \/ cover;\s*\}\s*\}/,
    'Por debajo de 900 px el fondo debe ser el taller de juguetes vertical, centrado y con `cover`'
  );
  assert.doesNotMatch(
    css,
    /avenida_fantastica_reino_caramelos/,
    'El CSS no debe referenciar el fondo movil retirado'
  );

  // El fondo anterior (248 KB de WebP + 7,4 MB de SVG) se archiva en `design/`:
  // ni se sirve desde el CDN ni queda como respaldo muerto en el CSS.
  for (const retired of ['background.webp', 'background.svg']) {
    assert.ok(
      !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', retired)),
      `${retired} no debe seguir en public/src/assets`
    );
    assert.ok(
      fs.existsSync(path.join(ROOT_DIR, 'design', retired)),
      `El fondo retirado debe conservarse en design/${retired}`
    );
  }
  assert.doesNotMatch(css, /assets\/background\.(?:webp|svg)/, 'El CSS no debe referenciar el fondo retirado');

  // El reino del arcoiris cede el escritorio al estadio: el maestro se queda
  // archivado en `design/`, el WebP que se servia se retira y el CSS no puede
  // volver a pintarlo.
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, 'design', 'reino_de_caramelos_y_arcoiris.png')),
    'El maestro del fondo retirado debe conservarse en design/'
  );
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', 'reino_de_caramelos_y_arcoiris.webp')),
    'reino_de_caramelos_y_arcoiris.webp no debe seguir en public/src/assets'
  );
  assert.doesNotMatch(
    css,
    /reino_de_caramelos_y_arcoiris/,
    'El CSS no debe referenciar el fondo retirado'
  );

  // Sin scroll vertical: el fondo no empuja la maqueta ni en escritorio ni en
  // movil (el `body` recorta y la carcasa mide el viewport dinamico).
  assert.match(css, /body\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/, 'El body no debe generar scroll');
  assert.match(css, /\.app\s*\{[^}]*height:\s*100dvh;/, 'La carcasa sigue midiendo `100dvh`');
});

test('las fuentes candy se sirven como WOFF2 propios y sin bloquear el render', () => {
  const css = read(STYLE_PATH);
  const html = read(INDEX_PATH);
  const fontsDir = path.join(PUBLIC_DIR, 'src', 'assets', 'fonts');
  const families = [
    'fredoka-latin.woff2',
    'fredoka-latin-ext.woff2',
    'lilita-one-latin.woff2',
    'lilita-one-latin-ext.woff2'
  ];

  for (const name of families) {
    const file = path.join(fontsDir, name);
    assert.ok(fs.existsSync(file), `Falta public/src/assets/fonts/${name}`);
    assert.ok(fs.statSync(file).size > 0, `${name} esta vacio`);
    assert.equal(
      fs.readFileSync(file).subarray(0, 4).toString('ascii'),
      'wOF2',
      `${name} debe ser un WOFF2 real`
    );

    const urlPattern = new RegExp(`url\\('\\.\\./assets/fonts/${name.replace(/[.]/g, '\\.')}'\\)`);
    assert.match(css, urlPattern, `${name} debe declararse en style.css`);
  }

  assert.match(
    css,
    /@font-face\s*\{[^}]*font-family:\s*'Fredoka';[^}]*font-weight:\s*300 900;[^}]*font-display:\s*swap;/,
    'Fredoka es variable (300-700) y debe declararse con `font-display: swap`'
  );
  assert.match(
    css,
    /@font-face\s*\{[^}]*font-family:\s*'Lilita One';[^}]*font-weight:\s*400 900;[^}]*font-display:\s*swap;/,
    'Lilita One solo tiene 400 y debe declararse con `font-display: swap`'
  );
  assert.match(
    html,
    /<link rel="preload" as="font" type="font\/woff2"[\s\S]*?href="\/src\/assets\/fonts\/fredoka-latin\.woff2" crossorigin \/>/,
    'El HTML debe precargar Fredoka desde el propio origen'
  );
  assert.match(
    html,
    /<link rel="preload" as="font" type="font\/woff2"[\s\S]*?href="\/src\/assets\/fonts\/lilita-one-latin\.woff2" crossorigin \/>/,
    'El HTML debe precargar Lilita One desde el propio origen'
  );
  assert.doesNotMatch(
    css,
    /url\(\s*['"]?https?:\/\/fonts\.(?:googleapis|gstatic)\.com/,
    'La CSP solo permite el propio origen: las fuentes no se piden a terceros'
  );
  assert.doesNotMatch(
    css,
    /@import\s+(?:url\()?['"]?https?:\/\/fonts\./,
    'No debe quedar un @import remoto de Google Fonts'
  );
});



test('los rotulos del case no se repintan: el DOM solo guarda nombre accesible y estado', () => {
  const css = read(STYLE_PATH);

  // Las capsulas de la fila inferior (AUTOGIRO · AUTO · GIRAR · APUESTA) vienen
  // vacias en `console-mobile.webp`: los rotulos visibles los pone la hoja de
  // estilo (los `::after` de la seccion 6, la ventana de chips del autogiro y
  // `.bet-readout`). Lo que ninguna regla puede volver a pintar es el texto del
  // DOM, que solo guarda el nombre accesible: se recorta a 1x1 en una sola
  // regla compartida, que ademas es la unica que toca a `#spin-label`.
  const start = css.indexOf('.machine__side .controls #btn-feature .btn__title,');
  assert.ok(start > -1, 'Debe existir una regla unica para los rotulos impresos en el case');

  const block = css.slice(start, css.indexOf('}', start));
  for (const selector of [
    '.machine__side .controls #btn-auto .btn__title,',
    '.machine__side .controls__bet #btn-bet-max .chip__label,',
    '.machine__side .controls #spin-label {'
  ]) {
    assert.ok(
      block.includes(selector),
      `La regla compartida debe cubrir ${selector.replace(/[,\s{]+$/, '')}`
    );
  }

  for (const declaration of [
    'position: absolute;',
    'width: 1px;',
    'height: 1px;',
    'overflow: hidden;',
    'clip-path: inset(50%);'
  ]) {
    assert.ok(block.includes(declaration), `Un rotulo impreso en el case necesita \`${declaration}\``);
  }

  // Oculto de verdad: sin colocacion ni tipografia propia sobre el arte.
  assert.doesNotMatch(
    block,
    /\b(?:top|left|right|bottom|transform|font-size|letter-spacing|color|text-shadow):/,
    'Si la placa la pinta el case, el rotulo no necesita geometria ni estilo de texto'
  );

  // El case es la unica capa grafica de la consola movil.
  assert.match(
    css,
    /\.machine__side \.controls \{[\s\S]*?background: url\('\.\.\/\.\.\/assets\/santa-crush\/console\/console-mobile\.webp'\) no-repeat center \/ contain;/,
    'La carcasa movil debe pintar `console-mobile.webp`, que ya trae los discos y las capsulas dibujados'
  );

  // Y los textos siguen en el HTML: son el nombre accesible de cada pulsador y
  // `#spin-label` cambia a "GIRANDO…" mientras el motor gira.
  const html = read(INDEX_PATH);
  assert.match(
    html,
    /<span class="btn__spin-label" id="spin-label">GIRAR<\/span>/,
    'El estado del giro debe seguir en el DOM para lectores de pantalla'
  );
  assert.match(
    html,
    /<span class="chip__label">MAX<\/span>/,
    'El nombre accesible de la apuesta maxima no se borra: solo se oculta'
  );
  assert.match(
    html,
    /id="btn-auto"[^>]*>[\s\S]*?<span class="btn__title">AUTO<\/span>/,
    'El pulsador AUTO conserva su texto como nombre accesible'
  );
  assert.match(html, /<span class="balance__value" id="balance-value">/, 'El saldo dinamico sigue en el HUD');
  assert.match(html, /<strong class="bet-readout__value" id="bet-readout">/, 'La apuesta dinamica sigue en el HUD');
});
test('la consola y el tablero comparten el mismo eje X en movil', () => {
  const css = read(STYLE_PATH);

  // 1) Una sola columna: el marco (marca + HUD + tablero) y la consola son las
  //    dos filas de la maquina y las dos se ciñen a `--m-w`, asi que su eje X
  //    no puede separarse.
  const machineGrid = css.match(
    /\.machine\s*\{[^}]*grid-template-areas:\s*"frame"\s*"console";[^}]*\}/
  );
  assert.ok(machineGrid, 'La maquina movil debe apilar marco y consola en una columna');
  assert.match(machineGrid[0], /display:\s*grid;/, 'La maquina centra por rejilla');
  assert.match(machineGrid[0], /grid-template-columns:\s*minmax\(0, 1fr\);/, 'Una sola pista de ancho');
  assert.match(machineGrid[0], /justify-items:\s*center;/, 'Las dos filas se centran en la columna');
  assert.match(
    machineGrid[0],
    /padding:\s*0;/,
    'Sin padding propio: el aire lateral lo pone `.app` y es simetrico'
  );
  // El ancho sale del alto libre menos la separacion, repartido entre la
  // relacion del marco (1076 / 1447 = 0,7436, la del recorte sin estirar) y la
  // de la consola (879 / 1775 = 0,4952): 1,2388 en total.
  // `cqw`/`cqh` en lugar de `%`: dentro de una custom property un `%` se
  // resuelve contra la propiedad que la usa, y el mismo token medía el ancho en
  // `width` y el alto en `height` (el HUD caía 12 px bajo sus placas).
  assert.match(
    machineGrid[0],
    /--m-w:\s*min\(100cqw,\s*calc\(\(100cqh - clamp\(4px, 1\.2dvh, 10px\)\) \/ 1\.2388\)\);/,
    'El ancho de la maquina descuenta marco + separacion + consola del alto libre'
  );

  // 2) Las dos piezas se miden con esa unidad y con la relacion exacta de su
  //    lienzo (`contain` sobre una caja con esa relacion llena el 100%).
  const frameRule = css.match(/\.machine__table\s*\{[^}]*aspect-ratio:\s*1447 \/ 1076;[^}]*\}/);
  assert.ok(frameRule, 'El marco debe declarar la relacion exacta de su recorte, 1447/1076');
  assert.match(frameRule[0], /width:\s*var\(--m-w\);/, 'El marco se mide con `--m-w`');

  const caseRule = css.match(
    /\.machine__side \.controls\s*\{[^}]*aspect-ratio:\s*1775 \/ 879;[^}]*\}/
  );
  assert.ok(caseRule, 'La consola debe declarar su relacion 1775/879');
  const rule = caseRule[0];
  assert.match(rule, /grid-area:\s*console;/, 'La consola vive en la fila `console`');
  assert.match(rule, /width:\s*var\(--m-w\);/, 'La consola comparte el ancho exacto del marco');
  assert.match(rule, /justify-self:\s*center;/, 'Centrada por rejilla, no por un margen heredado');
  assert.match(rule, /padding:\s*0;/, 'Sin aire lateral descompensado');
  assert.match(rule, /border:\s*0;/, 'Sin filo que desplace el dibujo');
  assert.match(rule, /align-self:\s*center;/, 'La fila no estira el case');
  assert.match(
    rule,
    /background:\s*url\('\.\.\/\.\.\/assets\/santa-crush\/console\/console-mobile\.webp'\)\s*no-repeat\s*center\s*\/\s*contain;/,
    'El dibujo se pinta centrado en su propia caja'
  );

  // 3) El tablero tapa la ventana transparente del marco con % del recorte
  //    (medido: x 8,29-91,57 %, y 42,30-90,45 %), con un pelo de aire por fuera
  //    para que su filo se meta bajo el aro dorado y no asome el fondo.
  assert.match(
    css,
    /\.machine__table \.board\s*\{[^}]*position:\s*absolute;[^}]*left:\s*7\.80%;[^}]*top:\s*41\.85%;[^}]*width:\s*84\.26%;[^}]*height:\s*49\.05%;[^}]*\}/,
    'El tablero se coloca en la ventana del marco, no en el flujo de la fila'
  );

  // 4) La marca y el HUD caen sobre sus huecos del arte nuevo: el cielo alto
  //    sostiene el logo centrado en el marco y la franja de las tres placas
  //    doradas va de 27,20 a 90,00 % del ancho y de 25,40 a 33,60 % del alto del
  //    recorte.
  const hudRule = css.match(
    /\.machine__side \.hud\s*\{[^}]*width:\s*calc\(var\(--m-w\) \* 0\.6280\);[^}]*\}/
  );
  assert.ok(hudRule, 'El HUD debe medir la franja exacta de las tres placas');
  assert.match(
    hudRule[0],
    /height:\s*calc\(var\(--frame-h\) \* 0\.0820\);/,
    'La franja mide el alto interior de las placas del HUD'
  );
  assert.match(
    hudRule[0],
    /margin-left:\s*calc\(\(100% - var\(--m-w\)\) \/ 2 \+ var\(--m-w\) \* 0\.2720\);/,
    'La franja arranca en la primera placa del HUD (27,20 % del marco)'
  );
  assert.match(
    hudRule[0],
    /margin-top:\s*calc\(var\(--frame-h\) \* 0\.2540\);/,
    'La franja cae sobre sus placas y no sobre la ventana'
  );

  const heroRule = css.match(/\.machine__side \.machine__hero\s*\{[^}]*--logo-w:[\s\S]*?\n  \}/);
  assert.ok(heroRule, 'La marca debe declarar su caja sobre el cielo del estadio');
  assert.match(
    heroRule[0],
    /left:\s*calc\(\(100% - var\(--m-w\)\) \/ 2 \+ \(var\(--m-w\) - var\(--logo-w\)\) \/ 2\);/,
    'El logo se centra en el marco con su ancho real, no con un porcentaje fijo'
  );
  assert.match(
    heroRule[0],
    /bottom:\s*calc\(var\(--frame-h\) \* 0\.7750\);/,
    'La base del logo se apoya sobre la franja de las placas del HUD'
  );

  // 5) La chapa del logo: 78 % del ancho del marco y la caja con la proporcion
  //    real del arte (2:1). `--logo-sky` es lo que hay entre el filo superior de
  //    `.machine` y la base del logo: la mitad del sobrante vertical de la
  //    rejilla (alto del escenario menos marco, separacion y consola) mas el
  //    22,50 % del marco que queda por encima de la base. De ahi se descuentan
  //    14 px (10 del balanceo + 4 de colchon), el resto se divide por 1,05 —lo
  //    que trepa la esquina alta del PNG al girar -3° y crecer un 3 %— y se
  //    duplica porque el ancho es el doble del alto. Sin ese tope el 78 % se
  //    corta contra el filo en tablet vertical y en 320 px.
  assert.match(
    heroRule[0],
    /--logo-sky:\s*calc\(\s*\(100cqh - \(var\(--frame-h\) \+ var\(--row-gap\) \+ var\(--m-w\) \* 0\.4952\)\) \/ 2\s*\+ var\(--frame-h\) \* 0\.2250\s*\);/,
    'El aire del logo se mide con el hueco real, no con un porcentaje fijo'
  );
  assert.match(
    heroRule[0],
    /--logo-w:\s*min\(\s*calc\(var\(--m-w\) \* 0\.78\),\s*max\(0px, \(var\(--logo-sky\) - 14px\) \* 2 \/ 1\.05\)\s*\);/,
    'El logo apunta al 78 % del ancho del marco y nunca rebasa el filo superior'
  );
  assert.match(
    heroRule[0],
    /--logo-h:\s*calc\(var\(--logo-w\) \/ 2\);/,
    'La caja del logo conserva la proporcion 2:1 del PNG (900 x 450)'
  );
  assert.doesNotMatch(heroRule[0], /var\(--m-w\) \* 0\.44\b/, 'El logo ya no se ata al 44 % anterior');
  assert.equal(
    (css.match(/--logo-w:\s*min\(/g) || []).length,
    1,
    'El tope del logo vive en una sola regla, comun a todo el rango movil'
  );
});

test('el logo recupera presencia en tablets con aire reservado y sin mover su base', () => {
  const css = read(STYLE_PATH);

  // En tablet vertical (600-899 px, alto de sobra) el marco se estira hasta la
  // barra superior, asi que el unico cielo del logo es el 22,50 % del arte que
  // queda sobre las placas del HUD: a 768 x 1024 la chapa medía 192 px, el 27,5 %
  // del marco, menos que en un telefono de 390 px. Ese tramo reserva un aire
  // vertical propio que `--m-w` descuenta del alto libre; como la rejilla esta
  // centrada, la mitad de ese aire sube por encima del marco y entra en
  // `--logo-sky`, que es quien gobierna el tope de la chapa.
  const midStart = css.indexOf(
    '@media (min-width: 600px) and (max-width: 899px) and (min-height: 521px)'
  );
  assert.notEqual(midStart, -1, 'El tramo 600-899 px debe declarar su breakpoint');
  const midBlock = css.slice(midStart, css.indexOf('\n}', midStart) + 2);

  assert.match(
    midBlock,
    /--logo-air:\s*clamp\(0px,\s*calc\(100cqh \* 0\.08\),\s*78px\);/,
    'El aire de la marca se mide con el alto del escenario y lleva techo'
  );
  const airRule = midBlock.match(/--logo-air:\s*clamp\(0px,\s*[^,]+,\s*(\d+)px\);/);
  assert.ok(airRule, 'El aire debe estar acotado por arriba');
  assert.ok(
    Number(airRule[1]) <= 96,
    'El techo del aire no puede comerse el tablero (<= 96 px)'
  );

  assert.match(
    midBlock,
    /--m-w:\s*min\(\s*100cqw,\s*calc\(\(100cqh - var\(--row-gap\) - var\(--logo-air\)\) \/ 1\.2388\)\s*\);/,
    'El aire se descuenta del alto libre y el ancho del viewport sigue siendo el tope'
  );
  assert.match(
    midBlock,
    /var\(--row-gap\)/,
    'La separacion marco-consola se resta una sola vez, con el token de la rejilla'
  );

  // El aire no toca ni la base del logo (sigue a 0,8013 del marco, por encima
  // del HUD) ni el `--logo-sky`: es el mismo tope de todo el rango movil, que
  // ahora recibe mas cielo porque la maquina es mas baja.
  assert.doesNotMatch(midBlock, /--logo-sky/, 'El cielo se sigue derivando de la geometria real');
  assert.doesNotMatch(midBlock, /--logo-w/, 'El tope del logo no se duplica en el tramo intermedio');
  assert.doesNotMatch(midBlock, /\.machine__logo|\.machine__hero|\.hud/, 'El marco, el logo y el HUD no se recolocan aqui');

  // El horizontal bajo queda fuera: ahi manda la regla de `max-height: 520px`,
  // que comprime la cabecera justo para devolverle alto al dibujo.
  assert.match(
    css,
    /@media \(max-width: 899px\) and \(orientation: landscape\) and \(max-height: 520px\)/,
    'El modo compacto de paisaje conserva su propia regla'
  );
});

test('el arte de las dos maquinas se sirve con su lienzo exacto y los maestros quedan fuera de public/', () => {
  // Cada pieza se pinta con `background: url(...) center / contain` sobre una
  // caja con la relacion de su lienzo; si el WebP cambia de medidas, `contain`
  // lo centra con aire y los controles se salen del arte.
  //
  // Movil (`build-mobile-art.js`): las corazas del tema anterior siguen
  // publicadas en `public/src/assets/**` (el CSS ya pinta el arte navideño del
  // arbol tematico, ver el test de `build:theme-art`).
  // Escritorio (`build-desktop-art.js`): d1 (marco del tablero) y d2 (columna
  // lateral entera: nube del logo + placas + consola), a q=90 y con el mismo
  // contrato de lienzo.
  const pieces = [
    { name: 'marco_movil', size: '1392x1093', max: 300 * 1024, build: 'build-mobile-art.js' },
    { name: 'consola_movil', size: '1780x883', max: 512 * 1024, build: 'build-mobile-art.js' },
    { name: 'd1', size: '1033x843', max: 300 * 1024, build: 'build-desktop-art.js' },
    { name: 'd2', size: '655x928', max: 560 * 1024, build: 'build-desktop-art.js' }
  ];
  const css = read(STYLE_PATH);

  for (const { name, size, max, build } of pieces) {
    const asset = path.join(PUBLIC_DIR, 'src', 'assets', `${name}.webp`);
    assert.ok(fs.existsSync(asset), `Falta public/src/assets/${name}.webp`);
    const binary = fs.readFileSync(asset);
    assert.equal(binary.toString('ascii', 0, 4), 'RIFF', `${name} debe ser un contenedor RIFF/WebP`);
    assert.equal(binary.toString('ascii', 8, 12), 'WEBP', `${name} debe ser un contenedor RIFF/WebP`);

    const canvas = webpChunks(binary).find((chunk) => chunk.fourCC === 'VP8X');
    assert.ok(canvas, `${name} debe declarar caracteristicas extendidas (VP8X)`);
    const width = binary.readUIntLE(canvas.offset + 12, 3) + 1;
    const height = binary.readUIntLE(canvas.offset + 15, 3) + 1;
    assert.equal(`${width}x${height}`, size, `El lienzo de ${name} debe ser exactamente ${size}`);

    // Los degradados dorados hacen banding por debajo de q=92 en la consola; el
    // tope deja aire para subir la calidad sin servir un PNG disfrazado de WebP.
    assert.ok(
      binary.length < max,
      `${name} debe pesar menos de ${max / 1024} KB (pesa ${(binary.length / 1024).toFixed(1)} KB)`
    );

    // Los maestros llegan con margenes transparentes y pesan MB: se publica
    // todo `public/src/**`, asi que viven en `design/` y solo se sirve el
    // recorte que produce el script de cada maqueta.
    assert.ok(
      fs.existsSync(path.join(ROOT_DIR, 'design', `${name}.png`)),
      `El arte master debe estar en design/${name}.png`
    );
    for (const stray of [`${name}.png`, `${name}.webp`]) {
      assert.ok(
        !fs.existsSync(path.join(PUBLIC_DIR, 'src', stray)),
        `${stray} no debe servirse desde public/src`
      );
    }

    // El script de la pieza declara el mismo lienzo que el CSS.
    const script = fs.readFileSync(path.join(ROOT_DIR, 'scripts', build), 'utf8');
    const [w, h] = size.split('x');
    assert.match(
      script,
      new RegExp(`name: '${name}',[\\s\\S]{0,90}?canvas: \\{ width: ${w}, height: ${h} \\}`),
      `${build} debe recortar ${name} a ${size}`
    );
  }

  // El arte de escritorio se compila a q=90 y el comando queda registrado.
  const desktop = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'build-desktop-art.js'), 'utf8');
  for (const name of ['d1', 'd2']) {
    const block = desktop.slice(desktop.indexOf(`name: '${name}'`));
    assert.match(block.slice(0, 200), /quality: 90,/, `${name} se compila a calidad 90`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['build:desktop-art'], 'node scripts/build-desktop-art.js');

  // El CSS de escritorio pinta las dos piezas a sangre y ancla los controles
  // en % del lienzo (las mismas medidas que imprime el script). Se buscan todas
  // las reglas del selector: las capas anteriores tambien declaran cajas para
  // estos botones y solo una lleva la geometria del arte.
  for (const name of ['d1', 'd2']) {
    assert.match(
      css,
      new RegExp(`url\\('\\.\\.\\/assets\\/${name}\\.webp'\\) no-repeat center \\/ 100% 100%`),
      `El CSS debe pintar ${name}.webp sin aire (100% 100%)`
    );
  }
  // El tema anterior partia la columna en dos piezas: ambas quedan archivadas
  // en `design/` y ni se sirven ni se pintan.
  for (const retired of ['d5', 'd3']) {
    assert.doesNotMatch(css, new RegExp(`${retired}\\.webp`), `El CSS ya no debe referenciar ${retired}.webp`);
    assert.ok(
      !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', `${retired}.webp`)),
      `${retired}.webp no debe servirse: d2 funde el hero y la consola`
    );
    assert.ok(
      fs.existsSync(path.join(ROOT_DIR, 'design', `${retired}.png`)),
      `El arte retirado debe conservarse en design/${retired}.png`
    );
  }
  const bodies = (selector) => [...css.matchAll(new RegExp(`${selector} \\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
  const spinBodies = bodies('\\.machine__side \\.controls \\.btn--spin');
  assert.ok(spinBodies.length, 'La capsula GIRAR debe declarar su caja');
  for (const declaration of ['left: 9.16%;', 'top: 65.84%;', 'width: 80.76%;', 'height: 16.81%;']) {
    assert.ok(
      spinBodies.some((body) => body.includes(declaration)),
      `El GIRAR se ancla al dibujo con \`${declaration}\``
    );
  }
  const windowBodies = bodies('\\.machine__table \\.board');
  assert.ok(windowBodies.length, 'El tablero debe declarar su caja sobre la ventana del marco');
  for (const declaration of ['left: 5.3%;', 'top: 12.2%;', 'width: 89%;', 'height: 80.45%;']) {
    assert.ok(
      windowBodies.some((body) => body.includes(declaration)),
      `La ventana de d1 se cubre con \`${declaration}\``
    );
  }

  // Geometria de la columna lateral (d2 · 655 x 928): el hero y la consola son
  // una sola pieza, asi que el ancho sale del alto comun y no queda ninguna
  // separacion vertical entre ambas mitades.
  assert.match(
    css,
    /--frame-h: min\([\s\S]{0,180}?\/ 1\.93120\)/,
    'El marco descuenta la columna lateral con 1,22539 (d1) + 0,70582 (d2)'
  );
  assert.match(
    css,
    /--frame-w: calc\(var\(--frame-h\) \* 1\.22539\)/,
    'El marco mide 1033/843 de su alto'
  );
  assert.match(
    css,
    /--side-w: calc\(var\(--frame-h\) \/ 1\.41679\)/,
    'La columna lateral mide 655/928 de su alto'
  );

  const sideBodies = bodies('\\.machine__side');
  assert.ok(sideBodies.length, 'La columna lateral debe declarar su caja');
  assert.ok(
    sideBodies.some((body) => body.includes('width: var(--side-w);') && body.includes('height: var(--frame-h);')),
    'La columna lateral comparte el alto del marco'
  );

  const heroBodies = bodies('\\.machine__side \\.machine__hero');
  assert.ok(heroBodies.length, 'El hero debe declarar su caja');
  assert.ok(
    heroBodies.some((body) => body.includes('inset: 0;')),
    'El hero mide lo mismo que el lienzo de d2'
  );

  const hudBodies = bodies('\\.machine__side \\.hud');
  assert.ok(hudBodies.length, 'Las placas deben declarar su banda sobre el dibujo');
  for (const declaration of [
    'left: 8.24%;',
    'top: 36.96%;',
    'width: 83.82%;',
    'height: 7%;',
    'grid-template-columns: 30.42% 29.70% 30.23%;',
    'column-gap: 4.83%;'
  ]) {
    assert.ok(
      hudBodies.some((body) => body.includes(declaration)),
      `Las placas se anclan al dibujo con \`${declaration}\``
    );
  }

  const logoBodies = bodies('\\.machine__side \\.machine__logo');
  assert.ok(logoBodies.length, 'El logo debe declarar su caja sobre la nube');
  // 80 % es el ancho con el que el logo MONTA sobre el borde dorado de la nube:
  // la placa mide 394 px de ancho (aro ~414 px) sobre el lienzo de 655 x 928 y el
  // arte del lockup mide 514,1 px, asi que se sale 50 px por cada lado y tapa el
  // aro en vez de flotar dentro del hueco. Es el techo: al 84 % ya se come la base
  // de la corona y su filo inferior roza la barra del HUD.
  for (const declaration of ['left: 50%;', 'top: 21.6%;', 'width: 80%;', 'aspect-ratio: 2 / 1;']) {
    assert.ok(
      logoBodies.some((body) => body.includes(declaration)),
      `El logo se apoya en la nube de d2 con \`${declaration}\``
    );
  }
  assert.ok(
    logoBodies.some((body) => body.includes('top: 21.6%;') && body.includes('width: 80%;')),
    'El logo monta sobre el borde dorado de la nube de d2 (80 % del ancho)'
  );
  assert.ok(
    logoBodies.some((body) => body.includes('width: 54%;') && body.includes('top: 12.8%;')),
    'En ventanas bajas el logo se encoge al 54 % y mantiene su anclaje en 12,8 %'
  );
  // La respiracion del escritorio va acotada en su propio juego de keyframes
  // (-4 px y 2 %): con los -7 px y el 3 % de la animacion movil el pico del
  // arte subiria ~1,9 px por encima del filo dorado del hueco.
  assert.ok(
    logoBodies.some((body) => body.includes('animation: pana-logo-breathe-side')),
    'La chapa de escritorio usa su respiracion acotada'
  );
  assert.match(
    css,
    /@keyframes pana-logo-breathe-side \{\s*0%,\s*100% \{ transform: translateY\(0\) scale\(1\); \}\s*50% \{ transform: translateY\(-4px\) scale\(1\.02\); \}\s*\}/,
    'El vaiven de escritorio se queda en -4 px y un 2 % para no rozar el borde'
  );
  // El case de escritorio responde como un pulsador de arcade: se hunde un 5 %
  // (y con el, su trozo de dibujo) y suelta un destello especular al pasar el
  // cursor o al pulsar.
  assert.match(
    css,
    /\.machine__side \.controls \.gbtn:active:not\(:disabled\) \{\s*transform: scale\(0\.95\);/,
    'El pulsador de escritorio se hunde con `scale(0.95)`'
  );
  assert.match(
    css,
    /\.machine__side \.controls \.gbtn:hover:not\(:disabled\)::after,[\s\S]{0,140}?animation: pana-art-sheen/,
    'El `::after` del pulsador barre un destello de luz al pasar el cursor'
  );
  assert.match(
    css,
    /@keyframes pana-art-sheen \{\s*from \{ background-position: 140% 0; \}\s*to \{ background-position: -60% 0; \}\s*\}/,
    'El destello recorre la capsula de un borde al otro'
  );
  assert.match(
    css,
    /\.machine__side \.controls \.gbtn \{[^}]*transition:[\s\S]{0,120}?transform 0\.14s cubic-bezier/,
    'La transicion del hundimiento es fluida (curva de muelle)'
  );

  // La variante sin iconos del arte no es la que se publica.
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', 'consola_movil_sin_iconos.webp')),
    'La variante sin iconos no debe servirse desde public/src/assets'
  );
});

test('el pulsador se hunde en 80 ms al tocarlo y vuelve con la misma curva', () => {
  const css = read(STYLE_PATH);

  // La transicion vive en la capa tactil (no en `:active`), asi el retorno al
  // soltar tambien anima y el hundimiento no aparece de golpe.
  const touchLayer = css.match(/\.machine__side \.controls \.gbtn,[\s\S]*?\}/);
  assert.ok(touchLayer, 'La capa tactil del case debe declarar sus reglas base');
  assert.match(
    touchLayer[0],
    /transition:\s*transform 0\.08s ease,\s*filter 0\.08s ease,\s*box-shadow 0\.08s ease;/,
    'El hundimiento entra y sale en 80 ms'
  );

  // Los seis pulsadores comparten la misma respuesta fisica: 6 % menos y 1 px
  // hacia abajo, con un punto de brillo que ilumina la tinta del case.
  const press = css.match(
    /\.machine__side \.controls #btn-feature:active:not\(:disabled\),[\s\S]*?transform: scale\(0\.94\) translateY\(1px\);[\s\S]*?filter: brightness\(1\.06\) saturate\(1\.04\);\s*\}/
  );
  assert.ok(press, 'La seccion 7bis debe hundir el pulsador con `scale(0.94)`');
  for (const id of ['#btn-feature', '#btn-auto', '.btn--spin', '#btn-bet-down', '#btn-bet-up', '#btn-bet-max']) {
    assert.ok(press[0].includes(id), `El hundimiento debe cubrir ${id}`);
  }

  // El origen se clava en el centro de la caja tactil, que ahora es el bbox
  // medido del disco: el hundimiento cierra el bisel hacia el pulsador fisico y
  // no desplaza el arte ni un pixel.
  assert.match(
    css,
    /#btn-feature\s*\{\s*transform-origin:\s*50% 50%;\s*\}/,
    'FEVER encoge hacia el centro de su disco'
  );
  assert.match(
    css,
    /#btn-auto\s*\{\s*transform-origin:\s*50% 50%;\s*\}/,
    'AUTO encoge hacia el centro de su disco'
  );
  assert.match(
    css,
    /\.btn--spin\s*\{\s*transform-origin:\s*50% 50%;\s*\}/,
    'El GIRAR encoge hacia el centro de su disco'
  );
});


test('la caja tactil de cada pulsador es su bbox del arte y el velo se recorta con --disc', () => {
  const css = read(STYLE_PATH);

  // Medido sobre `console-mobile.webp` (1775 x 879) con el analisis de alfa y
  // color: discos x 3,3-18,3 / 18,9-34,3 / 65,2-80,2 / 80,9-96,1 % · y
  // 40,77-70,60 %, aro del GIRAR x 35,3-64,2 % (la caja tactil se queda con el
  // cuadrado que cabe entero sobre el disco y encima de la capsula GIRAR:
  // x 37,9-61,6 % · y 21,4-69,2 %) y el tramo MAX de la capsula APUESTA
  // x 86,0-92,4 % · y 75,5-80,7 %. La caja tactil es exactamente ese recuadro,
  // asi que el dedo siempre cae sobre el dibujo.
  const boxes = [
    [/\.machine__side \.controls #btn-feature\.gbtn \{([^}]*)\}/, ['left: 3.30%;', 'top: 40.77%;', 'width: 15.00%;', 'height: 29.83%;']],
    [/\.machine__side \.controls #btn-auto\.gbtn \{([^}]*)\}/, ['left: 18.90%;', 'top: 40.77%;', 'width: 15.40%;', 'height: 29.83%;']],
    [/\.machine__side \.controls \.btn--spin\.gbtn \{([^}]*)\}/, ['left: 37.9%;', 'top: 21.4%;', 'width: 23.7%;', 'height: 47.8%;']],
    [/\.machine__side \.controls__bet #btn-bet-down \{([^}]*)\}/, ['left: 65.20%;', 'top: 40.77%;']],
    [/\.machine__side \.controls__bet #btn-bet-up \{([^}]*)\}/, ['left: 80.90%;', 'top: 40.77%;']],
    [/\.machine__side \.controls__bet #btn-bet-max \{([^}]*)\}/, ['left: 86.0%;', 'top: 75.5%;', 'width: 6.4%;', 'height: 5.2%;']]
  ];
  for (const [pattern, declarations] of boxes) {
    // Las reglas de `--disc` no llevan geometria: se busca la que la declare
    // completa, que es la que coloca el pulsador sobre el dibujo.
    const bodies = [...css.matchAll(new RegExp(pattern.source, 'g'))].map((match) => match[1]);
    assert.ok(bodies.length, `Falta la regla tactil ${pattern.source}`);
    assert.ok(
      bodies.some((body) => declarations.every((declaration) => body.includes(declaration))),
      `Ninguna regla de ${pattern.source} declara ${declarations.join(' ')}`
    );
  }

  // Los dos discos que comparten caja declaran una sola vez el tamano comun.
  const discPair = css.match(
    /\.machine__side \.controls__bet #btn-bet-down,\s*\n\s*\.machine__side \.controls__bet #btn-bet-up \{([^}]*)\}/
  );
  assert.ok(discPair, 'Los discos − y + comparten su regla base');
  assert.ok(discPair[1].includes('width: 15.00%;'), 'Los dos discos minus/plus miden 15,00 % de ancho');
  assert.ok(discPair[1].includes('height: 29.83%;'), 'Los dos discos minus/plus miden 29,83 % de alto');

  // `--disc` (top right bottom left, en % de la caja tactil) recorta el velo del
  // hundimiento. Con la caja ceñida al bbox del arte el recorte no necesita
  // aire: si alguien vuelve a estirar una caja para incluir la placa, este es el
  // valor que debe crecer con ella.
  const discs = {
    '.machine__side .controls #btn-feature': '0',
    '.machine__side .controls #btn-auto': '0',
    '.machine__side .controls .btn--spin': '0',
    '.machine__side .controls__bet #btn-bet-down': '0',
    '.machine__side .controls__bet #btn-bet-up': '0',
    '.machine__side .controls__bet #btn-bet-max': '0',
  };
  for (const [selector, disc] of Object.entries(discs)) {
    const rule = css.match(
      new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{\\s*--disc:\\s*([^;]+);`)
    );
    assert.ok(rule, `${selector} debe declarar su recorte --disc`);
    assert.equal(rule[1].trim(), disc, `${selector} recorta el velo a su disco`);
  }

  // El velo es un `::before` absoluto que se ciñe con `inset: var(--disc)`.
  assert.match(
    css,
    /#btn-feature:active:not\(:disabled\)::before,[\s\S]*?#btn-auto:active:not\(:disabled\)::before,[\s\S]*?\.chip\.gbtn:active:not\(:disabled\)::before\s*\{[\s\S]*?inset: var\(--disc\);[\s\S]*?pointer-events: none;/,
    'El velo de los pulsadores circulares se recorta con `--disc` y no captura el toque'
  );

  // Un borde duro dibujaria un circulo sobre el aro (y cruzaria la corona del
  // GIRAR), asi que los circulares difuminan el ultimo tramo con una mascara.
  assert.match(
    css,
    /#btn-feature:active:not\(:disabled\)::before,[\s\S]*?mask-image: radial-gradient\(closest-side,[\s\S]*?\);/,
    'El velo circular debe difuminar su borde con una mascara radial'
  );
  assert.match(
    css,
    /\.btn--spin:active:not\(:disabled\)::before\s*\{[\s\S]*?mask-image: radial-gradient\(closest-side,/,
    'El GIRAR tambien difumina el borde de su velo'
  );

  // La placa APUESTA es una pildora con aro dorado nitido: borde recto y sin
  // mascara heredada del grupo circular.
  const maxVeil = css.match(/#btn-bet-max:active:not\(:disabled\)::before\s*\{[\s\S]*?\}/);
  assert.ok(maxVeil, 'La placa APUESTA debe tener su propio velo');
  assert.match(maxVeil[0], /border-radius: 999px;/, 'APUESTA se hunde como pildora');
  assert.match(maxVeil[0], /mask-image: none;/, 'La pildora anula la mascara circular');
});


test('el reset de pintura del case deja viva la respuesta al toque', () => {
  const css = read(STYLE_PATH);

  // El boton candy pinta fondo, halos y un `inset` blanco en `:active`; si el
  // reset no incluyera ese estado, el velo candy taparia el disco del case.
  const reset = css.match(
    /\.machine__side \.controls #btn-spin,\s*\n[\s\S]*?\{\s*background: none;\s*box-shadow: none;\s*border: 0;\s*animation: none;\s*\}/
  );
  assert.ok(reset, 'Debe existir un reset de pintura por id para la capa tactil');
  for (const selector of [
    '#btn-spin:active:not(:disabled)',
    '#btn-feature:active:not(:disabled)',
    '#btn-auto:active:not(:disabled)',
    '#btn-bet-down:active:not(:disabled)',
    '#btn-bet-up:active:not(:disabled)',
    '#btn-bet-max:active:not(:disabled)',
  ]) {
    assert.ok(reset[0].includes(selector), `El reset debe cubrir ${selector}, no solo el reposo`);
  }
  assert.doesNotMatch(
    reset[0],
    /transform:|filter:/,
    'El reset solo apaga pintura: `transform` y `filter` son el hundimiento'
  );

  // El reset de reposo/hover se excluye de `:active` para no cancelar el
  // hundimiento mientras el dedo sigue apoyado (el hover tactil se queda pegado).
  const restReset = css.match(
    /\.machine__side \.controls #btn-spin:hover:not\(:disabled\):not\(:active\),[\s\S]*?\{\s*transform: none;\s*filter: none;\s*\}/
  );
  assert.ok(restReset, 'El reset de reposo debe usar `:not(:active)`');
  for (const selector of [
    '#btn-feature:hover:not(:disabled):not(:active)',
    '#btn-auto:hover:not(:disabled):not(:active)',
    '#btn-bet-down:hover:not(:disabled):not(:active)',
    '#btn-bet-up:hover:not(:disabled):not(:active)',
    '#btn-bet-max:hover:not(:disabled):not(:active)',
  ]) {
    assert.ok(restReset[0].includes(selector), `El reset de reposo debe cubrir ${selector}`);
  }
});

test('el GIRAR del case recupera el acabado candy: cristal y destellos', () => {
  const css = read(STYLE_PATH);

  // El reflejo cuelga de `#btn-spin` (solo ese pulsador) y se recorta al domo
  // del disco: el velo de pulsación de la sección 7 sigue siendo suyo, pero la
  // caja es la misma, así el `scale(0.94)` de 7bis no deforma el cristal.
  const glass = css.match(/\.machine__side \.controls #btn-spin::before\s*\{[\s\S]*?\n  \}/);
  assert.ok(glass, 'El GIRAR debe declarar su reflejo de cristal');
  assert.match(
    glass[0],
    /linear-gradient\(180deg, rgba\(255, 255, 255, 0\.6\) 0%, rgba\(255, 255, 255, 0\) 60%\)/,
    'El reflejo usa el degradado de cristal de la mitad superior'
  );
  assert.match(glass[0], /height: 41%;/, 'El reflejo se queda en la mitad superior del disco');
  assert.match(glass[0], /mask-image: radial-gradient\(closest-side,/, 'El domo se difumina en el aro');
  assert.match(glass[0], /pointer-events: none;/, 'El reflejo no captura el toque');

  // Los tres `.spin-spark` del DOM vuelven a pintarse sobre el case, con el
  // parpadeo `twinkle` y un ritmo distinto en cada esquina.
  const sparks = css.match(/\.machine__side \.controls #btn-spin \.spin-spark\s*\{[\s\S]*?\n  \}/);
  assert.ok(sparks, 'Los destellos del GIRAR deben repintarse');
  assert.match(sparks[0], /display: block;/, 'El case ya no apaga los destellos');
  assert.match(sparks[0], /animation: twinkle 2\.6s ease-in-out infinite;/, 'Parpadeo `twinkle` en el GIRAR');
  assert.doesNotMatch(sparks[0], /display: none;/, 'Los destellos no pueden quedar ocultos');

  for (const [spark, duration, delay] of [['--b', '3.2s', '0.9s'], ['--c', '3.8s', '1.7s']]) {
    const rule = css.match(
      new RegExp(`#btn-spin \\.spin-spark${spark}\\s*\\{[\\s\\S]*?\\n  \\}`)
    );
    assert.ok(rule, `El destello ${spark} debe tener su esquina`);
    assert.match(rule[0], new RegExp(`animation-duration: ${duration};`), `${spark} parpadea a su ritmo`);
    assert.match(rule[0], new RegExp(`animation-delay: ${delay};`), `${spark} entra desfasado`);
  }

  assert.match(
    css,
    /@keyframes twinkle \{\s*0%, 100% \{ opacity: 0\.3; transform: scale\(0\.8\); \}\s*50% \{ opacity: 1; transform: scale\(1\.2\); \}/,
    'El parpadeo crece y se enciende hacia la mitad del ciclo'
  );

  // Con movimiento reducido los destellos siguen visibles pero quietos.
  assert.match(
    css,
    /#btn-spin \.spin-spark \{\s*animation: none;\s*opacity: 0\.8;\s*\}/,
    'Con `prefers-reduced-motion` los destellos se quedan fijos'
  );
});

test('la zona tactil del GIRAR no se recorta con el alto del boton candy', () => {
  const css = read(STYLE_PATH);

  // El boton candy limita su alto a 130 px: por debajo de 768 px de ancho el
  // case mide menos y no se notaba, pero a 899 el cuadrado tactil del GIRAR
  // mide ~213 px (23,7 % de la consola) y la zona tactil se quedaba corta, sin
  // cubrir el tercio inferior del disco.
  assert.match(
    css,
    /\.btn--spin\.gbtn\s*\{[\s\S]*?max-height: none;/,
    'En el case el alto del GIRAR lo manda el dibujo, no la regla de escritorio'
  );
  assert.match(
    css,
    /\.machine__side \.controls \.btn--spin\s*\{[\s\S]*?max-height: 130px;/,
    'La regla de escritorio del boton candy conserva su limite propio'
  );
});


/* -------------------------------------------------------------------------- */
/*  Capa de marca (Santa Crush)                                              */
/* -------------------------------------------------------------------------- */

test('la capa de marca se sirve y se carga despues de style.css', () => {
  const themePath = path.join(PUBLIC_DIR, 'src', 'css', 'theme.css');

  assert.ok(fs.existsSync(themePath), 'Falta public/src/css/theme.css');
  const theme = read(themePath);
  const html = read(INDEX_PATH);

  assert.ok(theme.length > 0, 'theme.css esta vacio');
  assert.match(
    html,
    /<link rel="stylesheet" href="\/src\/css\/theme\.min\.css" \/>/,
    'index.html debe enlazar la capa de marca minificada'
  );
  assert.ok(
    html.indexOf('/src/css/style.min.css') < html.indexOf('/src/css/theme.min.css'),
    'theme.min.css debe cargarse DESPUES de style.min.css para poder sobrescribirlo'
  );

  /* El tema se declara bajo un prefijo con especificidad propia y no usa
     !important: cualquier override nuevo debe seguir la misma regla. */
  const withoutComments = theme.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(
    /!important/.test(withoutComments),
    false,
    'La capa de marca no debe usar !important'
  );
  assert.ok(
    withoutComments.includes('html[data-theme="santa-crush"]'),
    'Los overrides deben colgar de html[data-theme="santa-crush"]'
  );

  /* Estructura plana: un `}` desplazado anida medio archivo y el navegador
     descarta las reglas en silencio, asi que se comprueba explicitamente. */
  let depth = 0;
  let nested = false;
  for (const char of withoutComments) {
    if (char === '{') {
      if (depth > 0) nested = true;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    }
  }
  assert.equal(nested, false, 'theme.css debe ser CSS plano: hay bloques anidados');
  assert.equal(depth, 0, 'theme.css tiene llaves desbalanceadas');
  assert.equal(
    /(^|\n)\s*(html\[data-theme="santa-crush"\]\s*)?\.(machine|topbar|modal__card)\s*\{[^}]*(width|height|display|position)\s*:/.test(
      withoutComments
    ),
    false,
    'La capa de marca solo cambia color, fondo, borde y sombra'
  );
});

test('la capa de marca define la paleta Santa Crush (rojo, blanco, gris)', () => {
  const theme = read(path.join(PUBLIC_DIR, 'src', 'css', 'theme.css'));

  for (const token of ['--brand-red:', '--brand-white:', '--brand-grey-200:', '--brand-ink:']) {
    assert.ok(theme.includes(token), `Falta el token ${token} en theme.css`);
  }
  assert.match(theme, /--brand-red:\s*#[0-9a-f]{6};/i, '--brand-red debe ser un hex de 6 digitos');
});

test('el modal de reglas se lee sobre la consola marina del tema (contraste AA)', () => {
  const theme = read(THEME_PATH);

  /* La tarjeta del tema es la consola del juego —panel marino con filo de oro—,
     no una hoja blanca, mientras la capa base escribe la tinta del modal morado
     (crema al 80-90 %). Se comprueba cada zona del documento y despues el par
     texto/fondo sobre el propio degradado del panel. */
  const expects = [
    [
      /html\[data-theme="santa-crush"\] \.modal__card \{[^}]*linear-gradient\(160deg, #123a86 0%, #0a1c4a 56%, #05102c 100%\)/,
      'La tarjeta del modal se pinta con el panel marino del tablero',
    ],
    [
      /html\[data-theme="santa-crush"\] \.modal__card \{[^}]*color: var\(--brand-panel-ink\);/,
      'La tarjeta hereda la tinta clara del panel',
    ],
    [
      /html\[data-theme="santa-crush"\] \.modal__head h2 \{[^}]*color: var\(--brand-white\);/,
      'El titulo del modal va en blanco puro sobre la banda oscura',
    ],
    [
      /html\[data-theme="santa-crush"\] \.modal__body h3 \{[^}]*color: var\(--brand-panel-gold\);/,
      'Los subtitulos ("COMO SE JUEGA", "PAGOS POR DISPERSION") van en el oro claro del panel',
    ],
    [
      /html\[data-theme="santa-crush"\] \.modal__body p,[\s\S]{0,140}?color: var\(--brand-panel-ink\);/,
      'Los parrafos y las listas van en la tinta clara del panel',
    ],
    [
      /html\[data-theme="santa-crush"\] \.paytable th \{[^}]*color: var\(--brand-panel-dim\);/,
      'La cabecera de la tabla va en el azul claro del panel',
    ],
    [
      /html\[data-theme="santa-crush"\] \.paytable td \{[^}]*color: var\(--brand-panel-ink\);/,
      'Las filas de simbolos van en la tinta clara del panel',
    ],
    [
      /html\[data-theme="santa-crush"\] \.paytable td:last-child \{[^}]*color: var\(--brand-panel-gold\);/,
      'Los multiplicadores destacan en oro claro, no en un tono palido',
    ],
    [
      /html\[data-theme="santa-crush"\] \.auth-form__label \{[^}]*color: var\(--brand-panel-dim\);/,
      'La etiqueta del campo de sesion usa el azul claro del panel',
    ],
  ];

  for (const [pattern, message] of expects) {
    assert.match(theme, pattern, message);
  }

  /* Nada de la tinta translucida del modal caramelo: era la que se perdia sobre
     el panel. */
  assert.doesNotMatch(
    theme,
    /#fff5c1|#ffe593|#fff0a0|#fff1a0|rgba\(255, 245, 255|rgba\(255, 239, 255|rgba\(255, 220, 246/,
    'El tema no debe reutilizar la tinta clara del modal caramelo'
  );

  /* Tampoco la hoja blanca ni su tinta oscura: el documento es la consola. */
  assert.doesNotMatch(
    theme,
    /\.modal__card \{[^}]*background: linear-gradient\(165deg, var\(--brand-white\)/,
    'La tarjeta del modal no vuelve a ser una hoja blanca'
  );
  assert.doesNotMatch(
    theme,
    /\.modal__card \{[^}]*color: var\(--brand-ink\);/,
    'La tinta oscura de marca no vuelve a la tarjeta del modal'
  );

  /* Contraste real (WCAG 2.1) de los pares que pinta el modal. El fondo de
     referencia se lee del propio degradado: el tramo MAS CLARO (la luz de
     estadio de arriba) es el peor caso para una tinta clara, asi que si alguien
     aclara el panel, el test lo detecta. */
  const gradient = theme.match(
    /linear-gradient\(160deg, (#[0-9a-f]{6}) 0%, (#[0-9a-f]{6}) 56%, (#[0-9a-f]{6}) 100%\)/i
  );
  assert.ok(gradient, 'La consola del modal debe declarar su degradado marino en tres paradas');
  const panelTop = gradient[1];

  const token = (name) => {
    const match = theme.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i'));
    assert.ok(match, `Falta el token --${name} en theme.css`);
    return match[1];
  };
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
    const [r, g, b] = channels.map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (foreground, background) => {
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };

  const pairs = [
    ['parrafos, listas y filas sobre el panel', token('brand-panel-ink'), panelTop, 7],
    ['subtitulos y multiplicadores', token('brand-panel-gold'), panelTop, 7],
    ['cabecera de la tabla y etiquetas', token('brand-panel-dim'), panelTop, 4.5],
    ['titulo del modal', token('brand-white'), panelTop, 4.5],
  ];

  for (const [label, foreground, background, minimum] of pairs) {
    const ratio = contrast(foreground, background);
    assert.ok(
      ratio >= minimum,
      `${label}: contraste ${ratio.toFixed(2)}:1, por debajo de ${minimum}:1`
    );
  }
});

test('la pastilla del multiplicador se pinta como una cuenta de rubi con volumen', () => {
  const css = read(STYLE_PATH);
  const theme = read(THEME_PATH);

  // La etiqueta tiene dos bloques: el anclaje en la seccion del tablero y el
  // acabado junto al latido de la medalla. Se aisla el del acabado por su primer
  // token de paleta.
  const paletteAt = css.indexOf('--badge-top:');
  assert.ok(paletteAt > -1, 'Debe existir el bloque de acabado de `.tile__bomb-value`');
  const start = css.lastIndexOf('.tile__bomb-value {', paletteAt);
  assert.ok(start > -1, 'El bloque de acabado debe declararse en `.tile__bomb-value`');
  const block = css.slice(start, css.indexOf('}', start));

  // Volumen: el degradado baja por cuatro paradas (frambuesa -> rubi -> vino) y
  // lleva dos capas encima (reflejo alto y foco de color), no un color plano.
  const gradient = block.match(/linear-gradient\(180deg, var\(--badge-top\)[^;]*;/);
  assert.ok(gradient, 'El cuerpo de la pastilla debe ser un degradado vertical con tokens');
  assert.equal(
    (gradient[0].match(/var\(--badge-(?:top|mid|deep|base)\)/g) || []).length,
    4,
    'El degradado necesita cuatro paradas para que el filo inferior no se aplane'
  );
  assert.match(
    block,
    /radial-gradient\([^;]*var\(--badge-flare\)/,
    'La pastilla necesita un foco de color arriba que le de profundidad'
  );
  assert.match(
    block,
    /linear-gradient\(180deg, rgba\(255, 255, 255, 0\.44\)/,
    'El reflejo del casquete alto separa el rubi de la luz'
  );

  // Relieve y resplandor: luz interior arriba, sombra interior abajo y un aro
  // oscuro con halo de color fuera, para que se despegue del oro de la medalla.
  for (const shadow of [
    'inset 0 1px 0 rgba(255, 255, 255, 0.94)',
    'inset 0 -2px 3px rgba(52, 0, 18, 0.6)',
    'inset 0 0 7px rgba(255, 255, 255, 0.22)',
    '0 0 0 1px var(--badge-ring)',
    '0 0 9px var(--badge-glow)'
  ]) {
    assert.ok(block.includes(shadow), `El relieve de la pastilla necesita \`${shadow}\``);
  }
  assert.match(block, /border:\s*1\.25px solid var\(--badge-rim\);/, 'Filo de perla alrededor de la pastilla');
  assert.match(block, /rotate:\s*-4deg;/, 'La pastilla se gira con `rotate` para no pisar el latido');

  // La tinta no se engorda con `text-stroke`: el blanco ya contrasta con el rubi.
  const ink = css.match(/\.tile__bomb-value \{\s*font-weight: 900;[\s\S]*?\}/);
  assert.ok(ink, 'La tinta de la cifra debe declararse en su propia regla');
  assert.match(ink[0], /-webkit-text-stroke: 0;/, 'Sin contorno: a este tamano engorda la cifra');

  // El tema solo mueve la paleta; geometria, relieve y latido son compartidos.
  const themeStart = theme.indexOf('html[data-theme="santa-crush"] .tile__bomb-value {');
  assert.ok(themeStart > -1, 'La capa de marca debe redefinir la pastilla');
  const themeBlock = theme.slice(themeStart, theme.indexOf('}', themeStart));
  for (const token of ['--badge-top:', '--badge-mid:', '--badge-deep:', '--badge-glow:', '--badge-ink:']) {
    assert.ok(themeBlock.includes(token), `El tema debe redefinir ${token}`);
  }
  assert.doesNotMatch(
    themeBlock,
    /\b(?:border|border-radius|box-shadow|background|padding|font-size|rotate):/,
    'El tema no repite geometria ni sombras: solo cambia los tokens de paleta'
  );
});


/* --------------------------------------------------------------------------
   Arte navideño del TEMA (`public/assets/santa-crush/**`)
   -------------------------------------------------------------------------- */
test('el arte navideño del tema se sirve desde el arbol con su lienzo exacto', () => {
  const css = read(STYLE_PATH);
  const themeDir = path.join(PUBLIC_DIR, 'assets', 'santa-crush');

  // Cada pieza se publica recortada al bbox de su alfa con `build:theme-art`;
  // el CSS la pinta `100% 100%` sobre una caja con la relacion del recorte.
  // Escritorio: marco de caramelos y consola de mandos. Movil: marco de campanas
  // doradas y panel con Santa y reno.
  const pieces = [
    {
      name: 'slot-frame',
      target: path.join(themeDir, 'console', 'slot-frame.webp'),
      master: path.join(ROOT_DIR, 'design', 'frame_desktop_candy.png'),
      canvas: '1305x1090',
      max: 340 * 1024
    },
    {
      name: 'console-desktop',
      target: path.join(themeDir, 'console', 'console-desktop.webp'),
      master: path.join(ROOT_DIR, 'design', 'console_desktop_buttons.png'),
      canvas: '1041x1497',
      max: 620 * 1024
    },
    {
      name: 'slot-frame-mobile',
      target: path.join(themeDir, 'console', 'slot-frame-mobile.webp'),
      master: path.join(ROOT_DIR, 'design', 'frame_mobile_gold_bells.png'),
      canvas: '1447x1076',
      max: 340 * 1024
    },
    {
      name: 'console-mobile',
      target: path.join(themeDir, 'console', 'console-mobile.webp'),
      master: path.join(ROOT_DIR, 'design', 'console_mobile_santa_reindeer.png'),
      canvas: '1775x879',
      max: 440 * 1024,
      /* La consola movil se pinta con `contain` sobre una caja que ya tiene la
         relacion exacta del lienzo: mismo resultado que `100% 100%`. */
      paint: 'contain'
    }
  ];

  for (const { name, target, master, canvas, max, paint = '100% 100%' } of pieces) {
    assert.ok(fs.existsSync(target), `Falta public/assets/santa-crush/console/${name}.webp`);
    const binary = fs.readFileSync(target);
    assert.equal(binary.toString('ascii', 0, 4), 'RIFF', `${name} debe ser un contenedor RIFF/WebP`);
    assert.equal(binary.toString('ascii', 8, 12), 'WEBP', `${name} debe ser un WebP real`);

    const extended = webpChunks(binary).find((chunk) => chunk.fourCC === 'VP8X');
    assert.ok(extended, `${name} debe declarar VP8X (el recorte lleva alfa)`);
    const width = binary.readUIntLE(extended.offset + 12, 3) + 1;
    const height = binary.readUIntLE(extended.offset + 15, 3) + 1;
    assert.equal(`${width}x${height}`, canvas, `El lienzo de ${name} debe ser exactamente ${canvas}`);

    assert.ok(
      binary.length < max,
      `${name} debe pesar menos de ${max / 1024} KB (pesa ${(binary.length / 1024).toFixed(1)} KB)`
    );
    assert.ok(fs.existsSync(master), `Falta el maestro ${path.relative(ROOT_DIR, master)}`);
    assert.ok(
      !fs.existsSync(path.join(PUBLIC_DIR, 'src', path.basename(master))),
      `El maestro de ${name} no debe servirse desde public/src`
    );

    // El CSS pinta la pieza a sangre sobre la caja de su lienzo.
    assert.match(
      css,
      new RegExp(`url\\('\\.\\.\\/\\.\\.\\/assets\\/santa-crush\\/console\\/${name}\\.webp'\\) no-repeat center \\/ ${paint}`),
      `El CSS debe pintar ${name}.webp sin aire (${paint})`
    );
  }

  // El reparto del alto usa las relaciones de los dos recortes nuevos:
  // 1305/1090 = 1,19725 (marco) y 1041/1497 = 0,69539 (consola).
  assert.match(css, /--frame-w: calc\(var\(--frame-h\) \* 1\.19725\)/, 'El marco mide 1305/1090 de su alto');
  assert.match(css, /--side-w: calc\(var\(--frame-h\) \* 0\.69539\)/, 'La consola mide 1041/1497 de su alto');
  assert.match(
    css,
    /--frame-h: min\([\s\S]{0,220}?\/ 1\.89264\)/,
    'El alto comun descuenta marco y consola (1,19725 + 0,69539)'
  );

  // La ventana transparente del marco (x 6,36-93,64 % · y 14,95-91,47 %) se
  // cubre con el tablero un pelo por fuera.
  const windowBodies = [...css.matchAll(/\.machine__table \.board \{([^}]*)\}/g)].map((match) => match[1]);
  for (const declaration of ['left: 6.2%;', 'top: 14.8%;', 'width: 87.6%;', 'height: 76.9%;']) {
    assert.ok(
      windowBodies.some((body) => body.includes(declaration)),
      `La ventana del marco de caramelos se cubre con \`${declaration}\``
    );
  }

  // El HUD y los mandos se anclan a los huecos medidos sobre la consola nueva.
  const bodies = (selector) => [...css.matchAll(new RegExp(`${selector} \\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
  const hudBodies = bodies('\\.machine__side \\.hud');
  for (const declaration of ['left: 6.72%;', 'top: 33.2%;', 'width: 85.98%;', 'height: 9.4%;']) {
    assert.ok(hudBodies.some((body) => body.includes(declaration)), `El HUD se ancla con \`${declaration}\``);
  }
  const spinBodies = bodies(
    '\\.machine__side \\.controls \\.btn--spin,\\s*\\n\\s*\\.machine__side \\.controls #btn-spin'
  );
  for (const declaration of ['left: 12%;', 'top: 67.4%;', 'width: 76%;', 'height: 10.2%;']) {
    assert.ok(
      spinBodies.some((body) => body.includes(declaration)),
      `El GIRAR se ancla con \`${declaration}\``
    );
  }

  // Los dos caramelos grandes del pie siguen siendo ventanas al arte: el amarillo
  // es el FEVER (compra el bonus) y el rojo, el AUTO. Su recorte es el del dibujo.
  const featureBodies = bodies('\\.machine__side \\.controls #btn-feature');
  for (const declaration of ['--art-x: 10.18;', '--art-y: 80.09;', 'left: 10.18%;', 'top: 80.09%;']) {
    assert.ok(
      featureBodies.some((body) => body.includes(declaration)),
      `El FEVER recorta el caramelo amarillo con \`${declaration}\``
    );
  }
  const autoBodies = bodies('\\.machine__side \\.controls #btn-auto');
  for (const declaration of ['--art-x: 51.68;', '--art-y: 79.96;', 'left: 51.68%;', 'top: 79.96%;']) {
    assert.ok(
      autoBodies.some((body) => body.includes(declaration)),
      `El AUTO recorta el caramelo rojo con \`${declaration}\``
    );
  }

  // El comando de arte queda registrado y declara los mismos lienzos.
  const pkg = JSON.parse(read(path.join(ROOT_DIR, 'package.json')));
  assert.equal(pkg.scripts['build:theme-art'], 'node scripts/build-santa-crush-art.js');
  const script = read(path.join(ROOT_DIR, 'scripts', 'build-santa-crush-art.js'));
  for (const { name, canvas } of pieces) {
    const [w, h] = canvas.split('x');
    assert.match(
      script,
      new RegExp(`name: '${name}',[\\s\\S]{0,400}?canvas: \\{ width: ${w}, height: ${h} \\}`),
      `El script debe recortar ${name} a ${canvas}`
    );
  }
});

