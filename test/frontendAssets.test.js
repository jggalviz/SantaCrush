'use strict';

/**
 * Contrato de assets del frontend.
 *
 * El tablero usa tres motivos de la marca: los once WebP de
 * `public/src/assets/slot` (nueve motivos navideños y los dos sellos de la marca) y el motor de 11 simbolos (nueve regulares, el scatter y el
 * multiplicador). `format.js` es la unica fuente de verdad de su imagen. Esta
 * prueba evita que un renombrado o una ruta rota llegue a produccion.
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
const WIN_ART_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'win_celebracion.webp');
const WIN_ART_STILL_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'win_celebracion_still.webp');
const WIN_MASTER_PATH = path.join(ROOT_DIR, 'design', 'win_celebracion.gif');
const WIN_SOUND_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'AUDIO-WIN-NEW-stadium-applause.MP3');
const MUSIC_SOUND_PATH = path.join(
  PUBLIC_DIR,
  'src',
  'assets',
  'N-AUDIO-meridiano-con-fade.mp3'
);
const RETIRED_WIN_SOUND_PATH = path.join(PUBLIC_DIR, 'src', 'assets', 'AUDIO-WIN-2.MP3');
const RETIRED_MUSIC_PATH = path.join(
  PUBLIC_DIR,
  'src',
  'assets',
  'Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3'
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

test('los once WebP de las casillas viven en public/src/assets/slot', () => {
  for (let index = 1; index <= 11; index += 1) {
    const file = path.join(SLOT_DIR, `s${index}.webp`);
    assert.ok(fs.existsSync(file), `Falta ${path.relative(ROOT_DIR, file)}`);
    assert.ok(fs.statSync(file).size > 0, `${path.basename(file)} esta vacio`);
  }
});

test('los 11 simbolos del motor apuntan a imagenes existentes', () => {
  const source = read(FORMAT_PATH);
  const slotMatches = [...source.matchAll(/image: slotImage\('([^']+)'\)/g)];

  assert.equal(slotMatches.length, 9, 'format.js debe mapear S1-S9 sobre los nueve motivos');
  assert.equal(
    (source.match(/image:\s*BRAND_LOGO_IMAGE/g) || []).length,
    1,
    'Solo el scatter cae con el emblema BONO'
  );
  assert.equal(
    (source.match(/image:\s*MULTIPLIER_IMAGE/g) || []).length,
    1,
    'El multiplicador usa su propia pieza, no la del scatter'
  );
  assert.match(
    source,
    /const BRAND_LOGO_IMAGE = slotImage\('s10\.webp'\);/,
    'El scatter del tablero es s10.webp'
  );
  assert.match(
    source,
    /const MULTIPLIER_IMAGE = slotImage\('s11\.webp'\);/,
    'El multiplicador es s11.webp'
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

test('el tablero solo usa los nueve motivos y las dos piezas de marca', () => {
  // La cuadricula no usa los caramelos: los nueve regulares son los motivos
  // navideños de `public/src/assets/slot` (s1 = S1 ... s9 = S9), el emblema BONO
  // de s10.webp cae como scatter (SC) y el sello del regalo de s11.webp es el
  // multiplicador (MX), que se pinta con su valor encima. Las dos piezas de marca
  // son dibujos distintos, asi que el bono no se confunde con el multiplicador.
  const source = read(FORMAT_PATH);
  const start = source.indexOf('export const SYMBOLS');
  const end = source.indexOf('export const SYMBOL_KEYS');
  assert.ok(start >= 0 && end > start, 'format.js debe declarar el mapa SYMBOLS');

  assert.match(
    source,
    /const SYMBOL_IMAGE_PATH = '\/src\/assets\/slot\/';/,
    'Los motivos se sirven desde /src/assets/slot/'
  );

  const block = source.slice(start, end);
  assert.equal(
    (block.match(/^ {2}[A-Z][A-Z0-9]:/gm) || []).length,
    11,
    'El mapa debe cubrir S1-S9, SC y MX'
  );

  const ladder = [...block.matchAll(/^ {2}(S[1-9]): { glyph: '[^']*', name: '[^']*', image: slotImage\('(s\d+)\.webp'\)/gm)];
  assert.equal(ladder.length, 9, 'Los nueve regulares deben venir de la carpeta slot');
  ladder.forEach(([, symbol, file], index) => {
    assert.equal(file, `s${index + 1}`, `${symbol} debe usar s${index + 1}.webp`);
  });

  assert.match(block, /SC: [^\n]*BRAND_LOGO_IMAGE/, 'El scatter es el emblema BONO de s10.webp');
  assert.match(block, /MX: [^\n]*MULTIPLIER_IMAGE/, 'El multiplicador tiene su sello de s11.webp');
  assert.doesNotMatch(block, /candy_/, 'Ninguna casilla del mapa vuelve a los caramelos');
  assert.doesNotMatch(source, /candy_4\.png|BOMB_IMAGE_PATH/, 'format.js ya no sirve el caramelo de la bomba');

  // El arte se sirve `immutable` durante un ano: la unica forma de que un cambio
  // de dibujo llegue al jugador es que cambie la URL, asi que las once piezas
  // pasan por el mismo helper con su sufijo de version.
  assert.match(
    source,
    /const SYMBOL_IMAGE_VERSION = '\?v=\d+';/,
    'El set de simbolos necesita su cache buster (?v=N)'
  );
  assert.match(
    source,
    /const slotImage = \(file\) => `\$\{SYMBOL_IMAGE_PATH\}\$\{file\}\$\{SYMBOL_IMAGE_VERSION\}`;/,
    'Las once piezas deben servirse a traves de slotImage()'
  );
  for (const constant of ['s10.webp', 's11.webp']) {
    assert.match(
      source,
      new RegExp(`= slotImage\\('${constant.replace('.', '\\.')}'\\);`),
      `${constant} debe servirse con la version del set`
    );
  }
});

test('las nueve pelotas comparten bloque y el sello tiene el suyo', () => {
  const css = read(STYLE_PATH);
  const theme = read(THEME_PATH);

  // Ninguna pelota tiene bloque propio: ya no hay regla por simbolo regular, asi
  // que las nueve se pintan con el mismo vidrio.
  assert.doesNotMatch(css, /\.tile\[data-sym="S[1-9]"\]/, 'Ninguna pelota se pinta con bloque propio');
  assert.doesNotMatch(theme, /\.tile\[data-sym="S[1-9]"\]/, 'El tema tampoco pinta pelotas distintas');

  // El bloque del sello (scatter + multiplicador) es el unico con estilo propio:
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
    /html\[data-theme="meridianobet"\] \.tile\[data-sym="SC"\],\r?\nhtml\[data-theme="meridianobet"\] \.tile\[data-sym="MX"\] \{[^}]*border-color:[^}]*rgba\(255, 214, 84/,
    'El tema repinta el bloque del logo (scatter y multiplicador) en oro'
  );

  // Las dos piezas de marca llenan su bloque de borde a borde: el arte llega del
  // `npm run build:slot-art` recortado al bbox y encajado en el lienzo de
  // 335 x 341 px, asi que `object-view-box` no tiene nada que recortar y
  // `contain` lo ajusta por el alto: en la casilla apaisada del movil (52 x 29)
  // el emblema y el sello quedan centrados y enteros.
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

test('las dos piezas de marca viajan como WebP estatico en el lienzo comun', () => {
  const css = read(STYLE_PATH);

  // Las dos piezas de marca viajan con el mismo contrato que el resto del set:
  // WebP estatico con alfa en el lienzo de 335 x 341 px que genera
  // `npm run build:symbols`.
  for (const target of ['s10.webp', 's11.webp']) {
    const file = path.join(SLOT_DIR, target);
    assert.ok(fs.existsSync(file), `Falta public/src/assets/slot/${target}`);
    const binary = fs.readFileSync(file);
    assert.equal(binary.toString('ascii', 0, 4), 'RIFF', `${target} debe ser un contenedor RIFF/WebP`);
    assert.equal(binary.toString('ascii', 8, 12), 'WEBP', `${target} debe ser un WebP real`);

    const chunks = webpChunks(binary);
    assert.equal(chunks[0].fourCC, 'VP8X', `${target} debe declarar caracteristicas extendidas (VP8X)`);
    assert.ok(
      chunks.some((chunk) => chunk.fourCC === 'ALPH'),
      `${target} debe conservar el canal alfa`
    );
    assert.equal(
      chunks.some((chunk) => chunk.fourCC === 'ANMF'),
      false,
      `${target} no debe traer fotogramas ANMF`
    );

    const width = binary.readUIntLE(chunks[0].offset + 12, 3) + 1;
    const height = binary.readUIntLE(chunks[0].offset + 15, 3) + 1;
    assert.equal(width, 335, `${target} mide 335 px de ancho`);
    assert.equal(height, 341, `${target} mide 341 px de alto`);
    assert.ok(
      binary.length < 48 * 1024,
      `${target} pesa ${(binary.length / 1024).toFixed(1)} KB: ejecuta npm run build:symbols`
    );
  }

  // Las dos piezas llenan su lienzo de borde a borde, asi que no necesitan
  // recorte de aire (`object-view-box`) ni sangrado (`--logo-bleed`): el bloque
  // compartido ya los declara neutros y ningun simbolo debe reajustarlos.
  assert.match(
    css,
    /\.tile\[data-sym="SC"\],\r?\n\.tile\[data-sym="MX"\] \{\r?\n  --logo-bleed: 0%;/,
    'La pieza de marca ocupa la casilla entera, sin sangrado'
  );
  assert.deepEqual(
    [...css.matchAll(/--logo-bleed: ([^;]+);/g)].map((match) => match[1]),
    ['0%'],
    'Solo el encaje compartido declara el sangrado, y a cero: MX no reajusta nada'
  );
});

test('el scatter y el multiplicador caen con dibujos propios y alfa limpio', async () => {
  // Las dos piezas de marca se importan del arte del disenador con
  // `npm run build:slot-art` (recorte al bbox + lienzo comun) y se publican con
  // `npm run build:symbols`. Ya no son el mismo sello: el emblema BONO es el
  // scatter y el sello del regalo el multiplicador, y el contrato se mide sobre
  // los pixeles que se sirven.
  const scatter = path.join(SLOT_DIR, 's10.webp');
  const multiplier = path.join(SLOT_DIR, 's11.webp');

  // Dos dibujos distintos: si volvieran a ser el mismo archivo, el jugador no
  // podria distinguir el bono del multiplicador sin leer la etiqueta.
  assert.ok(
    !fs.readFileSync(scatter).equals(fs.readFileSync(multiplier)),
    's10.webp (scatter) y s11.webp (multiplicador) deben ser dos piezas distintas'
  );

  for (const file of [scatter, multiplier]) {
    const fileName = path.basename(file);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const total = info.width * info.height;

    let transparent = 0;
    let flatWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a === 0) transparent += 1;
      // Blanco solido opaco: el parche de lienzo que tapaba la medalla.
      if (a > 240 && r > 245 && g > 245 && b > 245) flatWhite += 1;
    }

    // Las esquinas van limpias: la pieza se recorta contra la medalla dorada de
    // la casilla en vez de traer su propio marco cuadrado.
    for (const [x, y] of [[0, 0], [info.width - 8, 0], [0, info.height - 8], [info.width - 8, info.height - 8]]) {
      let clear = 0;
      for (let yy = y; yy < y + 8; yy += 1) {
        for (let xx = x; xx < x + 8; xx += 1) {
          if (data[(yy * info.width + xx) * 4 + 3] === 0) clear += 1;
        }
      }
      assert.equal(clear, 64, `${fileName} debe dejar transparente la esquina (${x}, ${y})`);
    }

    const clearRatio = transparent / total;
    assert.ok(
      clearRatio > 0.1 && clearRatio < 0.45,
      `${fileName} debe recortarse sobre la medalla (${(clearRatio * 100).toFixed(1)} % transparente)`
    );
    assert.ok(
      flatWhite / total < 0.05,
      `${fileName} llega sobre un fondo blanco opaco: el arte debe traer alfa de origen`
    );
  }

  // El tablero, la tabla de pagos y las animaciones de `MX` leen `SYMBOLS[..].image`,
  // asi que la unica mencion valida de los dos sellos es la declaracion de
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

test('el import de arte mapea las piezas de marca a s10 y s11', async () => {
  // El origen del disenador no numera las dos piezas de marca: llegan nombradas
  // por su contenido. Este mapa es el unico sitio que traduce nombre -> casilla,
  // asi que un cambio de nombre en el arte debe romper el test en vez de publicar
  // el scatter con el dibujo del multiplicador.
  const { BRAND_SOURCES, CANVAS_WIDTH, CANVAS_HEIGHT } = require('../scripts/import-slot-art.js');
  assert.equal(CANVAS_WIDTH, 335, 'Los maestros se normalizan al ancho del tablero');
  assert.equal(CANVAS_HEIGHT, 341, 'Los maestros se normalizan al alto del tablero');

  const byTarget = new Map(BRAND_SOURCES.map((entry) => [entry.target, entry]));
  assert.ok(
    byTarget.get('s10.png').pattern.test('Bono navideño brillante resplandeciente.png'),
    'El emblema BONO es el scatter (s10)'
  );
  assert.ok(
    byTarget.get('s11.png').pattern.test('Regalo navideño brillante con lazo dorado.png'),
    'El sello del regalo es el multiplicador (s11)'
  );
  assert.doesNotMatch(
    's1.png',
    byTarget.get('s10.png').pattern,
    'Una pieza regular no puede caer en el hueco del bono'
  );

  // Los once maestros existen con el lienzo comun: `build:symbols` los convierte
  // tal cual, sin reescalar, asi que un maestro de otro tamano se publicaria con
  // la geometria equivocada.
  const mastersDir = path.join(ROOT_DIR, 'design', 'symbols');
  for (let index = 1; index <= 11; index += 1) {
    const file = path.join(mastersDir, `s${index}.png`);
    assert.ok(fs.existsSync(file), `Falta el maestro design/symbols/s${index}.png`);
    // eslint-disable-next-line no-await-in-loop
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, CANVAS_WIDTH, `s${index}.png debe medir ${CANVAS_WIDTH} px de ancho`);
    assert.equal(meta.height, CANVAS_HEIGHT, `s${index}.png debe medir ${CANVAS_HEIGHT} px de alto`);
    assert.equal(meta.hasAlpha, true, `s${index}.png debe conservar el alfa`);
  }
});

test('el logotipo de MeridianoBet se sirve ligero y con su proporcion 2:1', () => {
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
    /html\[data-theme="meridianobet"\] \.topbar\s*\{/,
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
  assert.match(theme, /html\[data-theme="meridianobet"\] \.topbar \.icon-btn__label \{/);
  assert.match(theme, /html\[data-theme="meridianobet"\] \.paytable__chip \{/);

  // La capa de marca pinta los controles que quedan en la barra; la maqueta
  // (geometria, fondo y alineacion) vive en style.css.
  for (const selector of ['.topbar__audio', '.topbar .btn--demo']) {
    assert.ok(
      theme.includes(`html[data-theme="meridianobet"] ${selector}`),
      `theme.css debe pintar \`${selector}\``
    );
  }
  assert.doesNotMatch(html, /[\u{1F507}-\u{1F50A}]/u, 'La barra usa SVG, no emojis de altavoz');
});

test('la animacion de victoria se sirve en WebP animado y el maestro queda fuera de public/', async () => {
  const html = read(INDEX_PATH);
  const css = read(STYLE_PATH);
  const ui = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'GameView.js'));
  const masters = read(path.join(ROOT_DIR, 'scripts', 'build-santa-masters.js'));
  const winBuild = read(path.join(ROOT_DIR, 'scripts', 'build-win-art.js'));

  // El GIF maestro (494 KB, 3 fotogramas) se archiva en `design/`: no viaja al
  // CDN ni se puede colar como respaldo en `public/src/assets`.
  assert.ok(fs.existsSync(WIN_MASTER_PATH), 'Falta el maestro design/win_celebracion.gif');
  const gif = fs.readFileSync(WIN_MASTER_PATH);
  assert.ok(gif.length > 0, 'El maestro de la animacion esta vacio');
  assert.match(
    gif.toString('ascii', 0, 6),
    /^GIF8[79]a$/,
    'design/win_celebracion.gif debe ser el GIF maestro de la celebracion'
  );
  assert.equal(gif.readUInt16LE(6), 724, 'El maestro mide 724 px de ancho');
  assert.equal(gif.readUInt16LE(8), 724, 'El maestro mide 724 px de alto (lienzo cuadrado)');
  assert.ok(
    !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', 'win_celebracion.gif')),
    'El GIF maestro no debe quedarse en public/src/assets'
  );

  // El cartel anterior (mono + letrero + campanas, 1200 x 918) se retira: el
  // overlay pinta ahora la animacion cuadrada. Ni el WebP ni sus maestros
  // vuelven a publicarse, y el nombre nuevo evita el `immutable` del CDN.
  for (const retired of ['victoria_navidena.webp', 'victoria_dulce.webp', 'victoria_deportiva.webp']) {
    assert.ok(
      !fs.existsSync(path.join(PUBLIC_DIR, 'src', 'assets', retired)),
      `El cartel anterior (${retired}) ya no se sirve`
    );
  }
  for (const retired of ['victoria_navidena.png', 'victoria_deportiva.png']) {
    assert.ok(
      !fs.existsSync(path.join(ROOT_DIR, 'design', retired)),
      `El maestro anterior (design/${retired}) ya no se conserva`
    );
  }

  // `build:santa-masters win` archiva el GIF de diseno y `build:win` lo
  // convierte sin recortar: ni `cover` ni `extract`, el lienzo se publica entero.
  const winMasterSource = masters.slice(
    masters.indexOf("wants('win')"),
    masters.indexOf("wants('fondos')")
  );
  assert.match(
    winMasterSource,
    /Santa WIN Celebration-Animation\.gif/,
    'build-santa-masters debe archivar la entrega `Santa WIN Celebration-Animation.gif`'
  );
  assert.match(
    winMasterSource,
    /win_celebracion\.gif/,
    'El maestro archivado debe ser design/win_celebracion.gif'
  );

  // Los comentarios de cabecera del build explican justo los recortes que NO se
  // hacen, asi que se descartan antes de mirar el codigo.
  const winBuildSource = winBuild.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(
    winBuildSource,
    /fit:\s*'cover'/,
    'build:win no debe recortar la animacion con `cover`: se comeria las letras o los regalos'
  );
  assert.doesNotMatch(
    winBuildSource,
    /\.extract\(/,
    'build:win no debe recortar la animacion con `extract`: el dibujo se publica entero'
  );
  assert.match(winBuild, /const TARGET_WIDTH = 724;/, 'build:win publica la animacion a 724 px nativos');
  assert.match(winBuildSource, /animated: true/, 'build:win lee y escribe el WebP animado');
  assert.match(winBuildSource, /alphaQuality: 100/, 'El alfa se publica sin perdida');

  assert.ok(fs.existsSync(WIN_ART_PATH), 'Falta public/src/assets/win_celebracion.webp');
  const binary = fs.readFileSync(WIN_ART_PATH);
  assert.equal(binary.toString('ascii', 0, 4), 'RIFF', 'La animacion debe ser un contenedor RIFF/WebP');
  assert.equal(binary.toString('ascii', 8, 12), 'WEBP', 'La animacion debe ser un WebP real');

  const chunks = webpChunks(binary);
  assert.equal(chunks[0].fourCC, 'VP8X', 'La animacion debe declarar extensiones (VP8X)');
  assert.ok(
    binary[chunks[0].offset + 8] & 0x02,
    'VP8X debe marcar la animacion (flag ANIM): sin el, el overlay perderia la celebracion'
  );

  // Sin deformar y sin recortar: el maestro es un lienzo cuadrado de 724 x 724 y
  // el WebP conserva esas medidas. El CSS reserva la misma caja 1:1.
  const width = binary.readUIntLE(chunks[0].offset + 12, 3) + 1;
  const height = binary.readUIntLE(chunks[0].offset + 15, 3) + 1;
  assert.equal(width, 724, 'La animacion se sirve a 724 px de ancho (nativo del maestro)');
  assert.equal(height, 724, 'La animacion se sirve a 724 px de alto (lienzo cuadrado)');

  // Bucle infinito y los 3 fotogramas de 350 ms: el overlay dura menos de 5 s y
  // el brillo no debe cortarse a media animacion.
  const anim = chunks.find((chunk) => chunk.fourCC === 'ANIM');
  assert.ok(anim, 'La animacion debe traer el bloque ANIM');
  assert.equal(binary.readUInt16LE(anim.offset + 12), 0, 'El bucle debe ser infinito (loop 0)');
  const frames = chunks.filter((chunk) => chunk.fourCC === 'ANMF');
  assert.equal(frames.length, 3, 'La animacion conserva los 3 fotogramas del maestro');
  for (const frame of frames) {
    // ANMF: X (3) + Y (3) + ancho-1 (3) + alto-1 (3) + duracion (3) + flags (1).
    assert.equal(
      binary.readUIntLE(frame.offset + 20, 3),
      350,
      'Cada fotograma dura 350 ms, como el GIF del diseno'
    );
  }

  const animated = await sharp(WIN_ART_PATH, { animated: true }).metadata();
  assert.equal(animated.format, 'webp');
  assert.equal(animated.pages, 3, 'El WebP debe declarar 3 paginas');
  assert.equal(animated.pageHeight, 724, 'Cada pagina mide 724 px de alto (no es la tira del GIF)');
  assert.deepEqual(animated.delay, [350, 350, 350], 'Los tiempos del GIF se conservan');
  assert.equal(animated.loop, 0, 'El bucle se conserva en infinito');
  assert.equal(
    animated.hasAlpha,
    true,
    'La animacion conserva el canal alfa: sin el, el velo taparia el juego'
  );

  // Peso: a q=76 con el alfa sin perdida la animacion ronda los 282 KB (el
  // cartel estatico anterior pesaba 377 KB). El tope deja aire para subir
  // calidad sin servir un PNG disfrazado.
  assert.ok(
    binary.length < 400 * 1024,
    `La animacion pesa ${(binary.length / 1024).toFixed(1)} KB (objetivo < 400 KB)`
  );

  // Fotograma fijo: mismo lienzo cuadrado y sin bloque ANIM. El CSS lo pinta con
  // `prefers-reduced-motion` porque un WebP animado se reproduce solo.
  assert.ok(
    fs.existsSync(WIN_ART_STILL_PATH),
    'Falta public/src/assets/win_celebracion_still.webp'
  );
  const still = fs.readFileSync(WIN_ART_STILL_PATH);
  assert.equal(still.toString('ascii', 0, 4), 'RIFF', 'El fotograma fijo debe ser RIFF/WebP');
  assert.equal(still.toString('ascii', 8, 12), 'WEBP', 'El fotograma fijo debe ser un WebP real');
  const stillChunks = webpChunks(still);
  assert.equal(stillChunks[0].fourCC, 'VP8X', 'El fotograma fijo debe declarar VP8X');
  assert.equal(
    still[stillChunks[0].offset + 8] & 0x02,
    0,
    'El fotograma fijo no puede ser animado: es el respaldo de `prefers-reduced-motion`'
  );
  assert.equal(
    stillChunks.some((chunk) => chunk.fourCC === 'ANIM'),
    false,
    'El fotograma fijo no debe traer bloque ANIM'
  );
  assert.equal(still.readUIntLE(stillChunks[0].offset + 12, 3) + 1, 724, 'El fijo mide 724 px de ancho');
  assert.equal(still.readUIntLE(stillChunks[0].offset + 15, 3) + 1, 724, 'El fijo mide 724 px de alto');
  assert.ok(
    still.length < 160 * 1024,
    `El fotograma fijo pesa ${(still.length / 1024).toFixed(1)} KB (objetivo < 160 KB)`
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
    /src="\/src\/assets\/win_celebracion\.webp"/,
    'La capa debe usar el WebP animado de la celebracion'
  );
  assert.match(
    html,
    /src="\/src\/assets\/win_celebracion_still\.webp"/,
    'La capa debe incluir el fotograma fijo de `prefers-reduced-motion`'
  );
  assert.match(
    html,
    /class="win__art win__art--anim" id="win-art"/,
    'El `<img>` animado conserva el id `win-art`'
  );
  assert.match(
    html,
    /class="win__art win__art--still"/,
    'El fotograma fijo comparte la clase `win__art` (misma caja) pero no el id'
  );
  // La caja reservada por el HTML tiene que coincidir con el WebP (sin saltos).
  assert.match(
    html,
    /width="724" height="724"/,
    'El HTML debe reservar la caja 724x724 de la animacion'
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

  // La animacion (lienzo 1:1) se centra y se adapta: techo de escritorio
  // (720 px), ancho de movil (92vw) y alto disponible (56vh). El tercer techo es
  // el alto, no el ancho x 1,307 del cartel anterior, porque el dibujo es
  // cuadrado: asi no se recorta ningun borde ni empuja el importe fuera del velo.
  assert.match(
    css,
    /\.win__art\s*\{[^}]*width:\s*min\(720px,\s*92vw,\s*56vh\);/,
    'La animacion debe escalar con sus tres techos (escritorio, movil y alto)'
  );
  assert.match(
    css,
    /\.win__art--still\s*\{\s*display:\s*none;\s*\}/,
    'El fotograma fijo solo se pinta con movimiento reducido'
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.win__art--anim \{ display: none; \}[\s\S]*?\.win__art--still \{ display: block; \}/,
    'Con movimiento reducido se cambia el WebP animado por su fotograma fijo'
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

test('la victoria llueve los balones del tablero en lugar de caramelos', () => {
  const fx = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'fx.js'));
  const css = read(STYLE_PATH);
  const ui = read(path.join(PUBLIC_DIR, 'ui', 'renderers', 'GameView.js'));

  // La municion sale del mapa de simbolos: los nueve balones de `assets/slot`,
  // que son los mismos WebP que el jugador acaba de ver en la rejilla. Los dos
  // sellos de la marca (s10 scatter, s11 multiplicador) no caen: no son pelota.
  assert.match(
    fx,
    /import \{ SYMBOLS \} from '\.\.\/lib\/format\.js';/,
    'fx.js debe reutilizar el mapa SYMBOLS en lugar de duplicar rutas'
  );
  assert.match(fx, /const BALL_FACES = Object\.freeze\(\[/);
  assert.match(
    fx,
    /\['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'\]/,
    'La lluvia debe usar los nueve balones regulares'
  );
  assert.match(fx, /\.map\(\(key\) => SYMBOLS\[key\]\)\);/);

  // Cada particula es una imagen de balon con su glifo como respaldo.
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
    /const WIN_ART_SRC = '\/src\/assets\/win_celebracion\.webp';/,
    'La precarga debe apuntar a la animacion nueva'
  );
  assert.match(
    ui,
    /const WIN_ART_STILL_SRC = '\/src\/assets\/win_celebracion_still\.webp';/,
    'La precarga debe conocer el fotograma fijo de `prefers-reduced-motion`'
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
    'Falta public/src/assets/N-AUDIO-meridiano-con-fade.mp3'
  );
  assert.ok(
    !fs.existsSync(RETIRED_MUSIC_PATH),
    'El bucle anterior (Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3) ya no debe servirse'
  );
  assert.ok(
    !fs.existsSync(
      path.join(PUBLIC_DIR, 'src', 'assets', 'N-AUDIO-meridiano-con-fade.mp3.mpeg')
    ),
    'El bucle nuevo tampoco puede publicarse con la doble extension .mp3.mpeg'
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
    music.length > 0 && music.length < 340 * 1024,
    'El bucle ambiental debe pesar menos de 340 KB (313,9 KB medidos)'
  );

  /* El bucle llega ya normalizado a 128 kbps CBR con el fundido dentro (frente
     a los ~401 KB del VBR a ~164 kbps anterior): misma duracion, frecuencia,
     canales y ganancia, pero menos peso para el jugador. */
  const musicFrames = readMp3Frames(music);
  assert.equal(musicFrames.sampleRate, 44100, 'El bucle debe seguir a 44,1 kHz');
  assert.equal(musicFrames.channels, 2, 'El bucle debe seguir en estereo');
  assert.ok(
    musicFrames.seconds > 19.9 && musicFrames.seconds < 20.3,
    `El bucle debe durar ~20 s (mide ${musicFrames.seconds.toFixed(2)} s)`
  );
  assert.ok(
    musicFrames.avgKbps >= 120 && musicFrames.avgKbps <= 144,
    `El bucle debe rondar los 128 kbps (mide ${musicFrames.avgKbps} kbps)`
  );
  assert.equal(musicFrames.vbr, false, 'El bucle se sirve a 128 kbps CBR');

  const sfx = read(SFX_PATH);
  assert.match(
    sfx,
    /export const WIN_SOUND_SRC = '\/src\/assets\/AUDIO-WIN-NEW-stadium-applause\.MP3';/,
    'sfx.js debe apuntar a la ruta publica de los aplausos nuevos'
  );
  assert.match(
    sfx,
    /export const MUSIC_SOUND_SRC = '\/src\/assets\/N-AUDIO-meridiano-con-fade\.mp3';/,
    'sfx.js debe apuntar a la ruta publica del bucle ambiental de Meridiano'
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

  // Un maestro por dispositivo, archivado en `design/`: todo lo que hay en
  // `public/src/**` se publica en el CDN y cada PNG pesa ~2 MB.
  const fondos = [
    ['fondo_desk_meridino_crush.png', 'fondo_desk_meridino_crush.webp'],
    ['avenida_fantastica_reino_caramelos.png', 'avenida_fantastica_reino_caramelos.webp'],
  ];

  for (const [master, served] of fondos) {
    const file = path.join(PUBLIC_DIR, 'src', 'assets', served);
    assert.ok(fs.existsSync(file), `Falta public/src/assets/${served}`);

    const binary = fs.readFileSync(file);
    assert.equal(binary.toString('ascii', 0, 4), 'RIFF', `${served} debe ser un contenedor RIFF/WebP`);
    assert.equal(binary.toString('ascii', 8, 12), 'WEBP', `${served} debe ser un WebP real`);

    // Sin reescalar ni recortar: el fondo se pinta con `cover` + `center` sobre
    // el mismo eje que el tablero y la consola, asi que el lienzo tiene que
    // medir exactamente lo que el maestro. Se comprueba contra el IHDR del PNG
    // y contra las dimensiones codificadas en el bloque VP8 del WebP.
    const masterFile = path.join(ROOT_DIR, 'design', master);
    assert.ok(fs.existsSync(masterFile), `Falta el maestro design/${master}`);
    const png = fs.readFileSync(masterFile);
    assert.equal(png.toString('ascii', 1, 4), 'PNG', `design/${master} debe ser el PNG maestro`);

    const lossy = webpChunks(binary).find((chunk) => chunk.fourCC === 'VP8 ');
    assert.ok(lossy, `${served} debe ser un WebP lossy (bloque VP8), sin alfa que nadie pinta`);
    assert.equal(
      binary.readUInt16LE(lossy.offset + 14) & 0x3fff,
      png.readUInt32BE(16),
      `${served} debe conservar el ancho del maestro`
    );
    assert.equal(
      binary.readUInt16LE(lossy.offset + 16) & 0x3fff,
      png.readUInt32BE(20),
      `${served} debe conservar el alto del maestro`
    );

    // Peso: el estadio de escritorio se queda en q=86 (~376 KB, con mucha mas
    // textura que la avenida a q=90) y el movil en ~320 KB. El tope de 400 KB
    // cubre a los dos y evita que una subida de calidad cuele un PNG disfrazado
    // de WebP.
    assert.ok(
      binary.length < 400 * 1024,
      `${served} pesa ${(binary.length / 1024).toFixed(1)} KB (objetivo < 400 KB)`
    );

    // Y el maestro no viaja al CDN.
    assert.ok(
      !fs.existsSync(path.join(PUBLIC_DIR, 'src', master)),
      `${master} no debe servirse desde public/src`
    );
  }

  // Escritorio: `body` pinta el estadio de MeridianoBet centrado, escalado con
  // `cover` y anclado al viewport.
  assert.match(
    css,
    /body\s*\{[^}]*background:\s*url\('\.\.\/assets\/fondo_desk_meridino_crush\.webp'\)\s*no-repeat\s*center\s*center\s*\/\s*cover\s*fixed;/,
    'El escritorio debe pintar el estadio con `cover`, centrado y `fixed`'
  );
  // El respaldo inmediato (degradados de `html`) va en la misma gama nocturna,
  // para que el relevo no salte de color mientras baja el WebP.
  assert.match(
    css,
    /html\s*\{\s*background-color:\s*#0a1c4a;/,
    'El respaldo de `html` debe ser el azul marino del estadio'
  );

  // Movil: el case se recorta sobre la avenida, con el mismo encuadre.
  assert.match(
    css,
    /@media \(max-width: 899px\) \{\s*body \{\s*background:\s*url\('\.\.\/assets\/avenida_fantastica_reino_caramelos\.webp'\)\s*no-repeat\s*center\s*center\s*\/\s*cover;\s*\}\s*\}/,
    'Por debajo de 900 px el fondo debe pasar a la avenida fantastica'
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

  // Las placas de la fila inferior (AUTOGIRO · AUTO · GIRAR · APUESTA) vienen
  // vacias en `consola_movil.webp`: los rotulos visibles los pone la hoja de
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
    /\.machine__side \.controls \{[\s\S]*?background: url\('\.\.\/assets\/consola_movil\.webp'\) no-repeat center \/ contain;/,
    'La carcasa movil debe pintar `consola_movil.webp`, que ya trae los rotulos integrados'
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

  // 1) Una sola columna: el logo, el marco (HUD + tablero) y la consola son las
  //    tres filas de la maquina y las dos piezas de arte se ciñen a `--m-w`, así
  //    que su eje X no puede separarse.
  const machineGrid = css.match(
    /\.machine\s*\{[^}]*grid-template-areas:\s*"logo"\s*"frame"\s*"console";[^}]*\}/
  );
  assert.ok(machineGrid, 'La maquina movil debe apilar logo, marco y consola en una columna');
  assert.match(machineGrid[0], /display:\s*grid;/, 'La maquina centra por rejilla');
  assert.match(machineGrid[0], /grid-template-columns:\s*minmax\(0, 1fr\);/, 'Una sola pista de ancho');
  assert.match(machineGrid[0], /justify-items:\s*center;/, 'Las tres filas se centran en la columna');
  assert.match(
    machineGrid[0],
    /padding:\s*0;/,
    'Sin padding propio: el sangrado lateral lo hace `.stage` con `--m-pad-x`'
  );
  // El ancho sale del alto libre menos la separacion y el colchon del balanceo,
  // repartido entre la relacion del logo (0,36: caja 2:1 al 72 % del ancho), la
  // del marco (1216 / 1244 = 0,9775) y la de la consola (883 / 1780 = 0,4961):
  // 1,8336 en total. La fila del logo es imprescindible desde el marco de baston
  // porque su franja superior está ocupada de arte y la chapa ya no puede
  // pegarse encima. La separacion se lee del token de la rejilla (`--row-gap`),
  // que en movil vale 0: la junta va a tope (ver el test de la junta).
  // `cqw`/`cqh` en lugar de `%`: dentro de una custom property un `%` se
  // resuelve contra la propiedad que la usa, y el mismo token medía el ancho en
  // `width` y el alto en `height` (el HUD caía 12 px bajo sus placas).
  assert.match(
    machineGrid[0],
    /--m-w:\s*min\(100cqw,\s*calc\(\(100cqh - var\(--row-gap\) - 20px\) \/ 1\.8336\)\);/,
    'El ancho de la maquina descuenta logo + marco + separacion + consola del alto libre'
  );

  // El escenario devuelve el aire lateral de `.app` con el mismo `--m-pad-x`:
  // como es el que mide la maquina (`100cqw`), al ensancharlo el ancho util pasa
  // a ser el del viewport completo y marco y consola tocan los dos filos. El
  // recorte queda en `.app`, que corta en la caja de padding (el filo de la
  // pantalla).
  const stageRule = css.match(/\.stage\s*\{[^}]*container-type:\s*size;[^}]*\}/);
  assert.ok(stageRule, 'El escenario movil mide la maquina con `container-type: size`');
  assert.match(
    stageRule[0],
    /width:\s*calc\(100% \+ 2 \* var\(--m-pad-x\)\);/,
    'El escenario sangra sobre el padding lateral de `.app`'
  );
  assert.match(
    stageRule[0],
    /margin-inline:\s*calc\(-1 \* var\(--m-pad-x\)\);/,
    'El sangrado es simetrico y no desplaza la maquina'
  );
  assert.match(
    stageRule[0],
    /overflow:\s*visible;/,
    'El escenario deja de recortar para que el sangrado llegue al filo'
  );
  assert.match(
    css,
    /\.app\s*\{[^}]*--m-pad-x:\s*clamp\(4px, 1\.5vw, 10px\);[^}]*var\(--m-pad-x\)[^}]*\}/,
    '`.app` guarda su aire lateral en `--m-pad-x` y lo usa en el padding'
  );

  // 2) Las dos piezas se miden con esa unidad y con la relacion exacta de su
  //    lienzo (`contain` sobre una caja con esa relacion llena el 100%).
  const frameRule = css.match(/\.machine__table\s*\{[^}]*aspect-ratio:\s*1244 \/ 1216;[^}]*\}/);
  assert.ok(frameRule, 'El marco debe declarar la relacion exacta de su recorte, 1244/1216');
  assert.match(frameRule[0], /width:\s*var\(--m-w\);/, 'El marco se mide con `--m-w`');
  // El WebP se publica recortado al alfa (sin aire a los lados), asi que el
  // dibujo entra a sangre con `100% 100%` sobre una caja con su misma relacion.
  // La URL lleva `?v=2` porque `/src/assets/**` se sirve como `immutable`:
  // republicar el marco con el mismo nombre dejaria a los clientes con el arte
  // viejo bajo los anclajes nuevos. El `preload` de `index.html` lleva la misma
  // version.
  assert.match(
    frameRule[0],
    /background:\s*url\('\.\.\/assets\/marco_movil\.webp\?v=2'\)\s*no-repeat\s*center\s*\/\s*100% 100%;/,
    'El marco se pinta a sangre sobre su propio lienzo (sin estiramientos)'
  );

  const caseRule = css.match(
    /\.machine__side \.controls\s*\{[^}]*aspect-ratio:\s*1780 \/ 883;[^}]*\}/
  );
  assert.ok(caseRule, 'La consola debe declarar su relacion 1780/883');
  const rule = caseRule[0];
  assert.match(rule, /grid-area:\s*console;/, 'La consola vive en la fila `console`');
  assert.match(rule, /width:\s*var\(--m-w\);/, 'La consola comparte el ancho exacto del marco');
  assert.match(rule, /justify-self:\s*center;/, 'Centrada por rejilla, no por un margen heredado');
  assert.match(rule, /padding:\s*0;/, 'Sin aire lateral descompensado');
  assert.match(rule, /border:\s*0;/, 'Sin filo que desplace el dibujo');
  assert.match(rule, /align-self:\s*center;/, 'La fila no estira el case');
  assert.match(
    rule,
    /background:\s*url\('\.\.\/assets\/consola_movil\.webp'\)\s*no-repeat\s*center\s*\/\s*contain;/,
    'El dibujo se pinta centrado en su propia caja'
  );

  // 3) El tablero tapa la ventana transparente del marco con % del recorte
  //    (medido: x 8,12-91,72 %, y 32,15-92,85 %), con un pelo de aire por fuera
  //    para que su filo se meta bajo el aro dorado y no asome el fondo.
  //    El selector declara caja en varias capas (maqueta base, tramos y
  //    escritorio); solo una lleva la geometria del marco de baston.
  const boardBodies = [...css.matchAll(/\.machine__table \.board\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const boardRule = boardBodies.find((body) =>
    ['left: 7.94%;', 'top: 31.96%;', 'width: 83.95%;', 'height: 61.07%;'].every((d) => body.includes(d))
  );
  assert.ok(
    boardRule,
    'El tablero debe tapar la ventana del marco nuevo (7,94 % / 31,96 % / 83,95 % / 61,07 %)'
  );
  assert.match(
    boardRule,
    /border-radius:\s*clamp\(3px, calc\(var\(--m-w\) \* 0\.0153\), 9px\);/,
    'El radio del tablero sigue al de las esquinas del hueco del arte (19 px de 1244)'
  );
  // El hueco nuevo es mucho mas alto que el del marco anterior (60,69 % del
  // lienzo frente a 48,50 %): con el mismo ancho, las casillas de la grilla 6 x 5
  // pasan de 2,06:1 a 1,17:1 y los simbolos crecen con ellas.
  assert.match(
    css,
    /\.machine__table \.grid\s*\{[^}]*aspect-ratio:\s*auto;[^}]*\}/,
    'La grilla se reparte el hueco en lugar de imponer su relacion 6/5'
  );

  // 4) La marca y el HUD caen sobre sus huecos del arte nuevo: la franja de las
  //    tres placas rojas va de 27,01 a 89,87 % del ancho y de 18,59 a 25,82 % del
  //    alto del recorte (bbox del aro dorado de las tres placas medido sobre el
  //    WebP de 1244 px). Son mas anchas y mas bajas que las del marco anterior,
  //    asi que el dato sube de cuerpo y el bloque rotulo + dato sigue centrado.
  const hudRule = css.match(
    /\.machine__side \.hud\s*\{[^}]*width:\s*calc\(var\(--m-w\) \* 0\.628617\);[^}]*\}/
  );
  assert.ok(hudRule, 'El HUD debe medir la franja exacta de las tres placas');
  assert.match(
    hudRule[0],
    /height:\s*calc\(var\(--frame-h\) \* 0\.07236\);/,
    'La franja mide el alto interior de las placas del HUD'
  );
  assert.match(
    hudRule[0],
    /margin-left:\s*calc\(\(100% - var\(--m-w\)\) \/ 2 \+ var\(--m-w\) \* 0\.270096\);/,
    'La franja arranca en el aro de la primera placa (27,01 % del recorte)'
  );
  assert.match(
    hudRule[0],
    /margin-top:\s*calc\(var\(--frame-h\) \* 0\.18586\);/,
    'La franja cae sobre sus placas y no sobre la ventana'
  );

  // Las tres celdas dentro de la franja: aros de 336-575, 578-828 y 832-1117 px
  // del WebP de 1244 (30,69 % · 30,95 %+32,10 % · 63,43 %+36,57 %).
  const hudCells = [...css.matchAll(/\.machine__side \.hud__cell:nth-child\((\d)\) \{([^}]*)\}/g)]
    .map((m) => ({ index: m[1], body: m[2] }));
  assert.deepEqual(
    hudCells.map((c) => `${c.index}:${c.body.trim()}`),
    [
      '1:left: 0; width: 30.69%;',
      '2:left: 30.95%; width: 32.10%;',
      '3:left: 63.43%; width: 36.57%;'
    ],
    'Cada lectura se centra en su placa del marco nuevo'
  );

  // 5) La chapa del logo tiene fila propia (`logo`) desde el marco de baston:
  //    el arte ocupa la franja superior entera y ya no hay cielo donde pegarla.
  //    La caja mantiene la proporcion 2:1 del PNG (900 x 450) al 72 % del ancho de
  //    la maquina, y su alto (0,36 de `--m-w`) es uno de los sumandos del divisor
  //    de `--m-w`, asi que entra en el reparto vertical y nunca se sale.
  const heroRule = css.match(/\.machine__side \.machine__hero\s*\{[^}]*--logo-w:[\s\S]*?\n  \}/);
  assert.ok(heroRule, 'La marca debe declarar su caja en la fila del logo');
  assert.match(heroRule[0], /grid-area:\s*logo;/, 'El logo vive en su propia fila de la rejilla');
  assert.match(heroRule[0], /position:\s*relative;/, 'La fila la dimensiona el logo, no una capa absoluta');
  assert.match(heroRule[0], /justify-self:\s*center;/, 'La chapa se centra en la maquina');
  assert.match(
    heroRule[0],
    /--logo-w:\s*calc\(var\(--m-w\) \* 0\.72\);/,
    'El logo ocupa el 72 % del ancho de la maquina'
  );
  assert.match(
    heroRule[0],
    /--logo-h:\s*calc\(var\(--logo-w\) \/ 2\);/,
    'La caja del logo conserva la proporcion 2:1 del PNG (900 x 450)'
  );
  assert.doesNotMatch(heroRule[0], /--logo-sky/, 'Sin cielo de arte, el aire del logo lo reparte la rejilla');
  assert.doesNotMatch(heroRule[0], /bottom:\s*calc\(var\(--frame-h\)/, 'La chapa ya no se ancla sobre el dibujo');
  assert.equal(
    (css.match(/--logo-w:/g) || []).length,
    1,
    'El ancho del logo se declara una sola vez en toda la hoja'
  );
});

test('en movil la junta marco-consola va a tope, sin franja de fondo', () => {
  const css = read(STYLE_PATH);

  // El arte del marco llega con tinta hasta su ultimo pixel, pero el recorte de
  // la consola trae el filo de arriba casi vacio (0,8 % de su alto sin tinta y
  // el aro macizo a partir del 2,3 %). Con un `gap` de 10 px se veian 11 px de
  // fondo entre el bloque del slot y la botonera (medido con capturas y diff de
  // pixeles a 390 x 844). Aqui el hueco se anula y la consola se mete bajo el
  // marco con `--joint-tuck`, 1,2 % de `--m-w` (4,7 px a 390 px de ancho): lo
  // justo para tapar ese aire muerto sin comerse el filo del dibujo.
  const machineGrid = css.match(
    /\.machine\s*\{[^}]*grid-template-areas:\s*"logo"\s*"frame"\s*"console";[^}]*\}/
  );
  assert.ok(machineGrid, 'La maquina movil debe apilar logo, marco y consola en una columna');
  assert.match(machineGrid[0], /--row-gap:\s*0px;/, 'La separacion marco-consola se anula');
  assert.match(machineGrid[0], /row-gap:\s*var\(--row-gap\);/, 'La rejilla consume el token');
  assert.match(
    machineGrid[0],
    /--joint-tuck:\s*calc\(var\(--m-w\) \* 0\.012\);/,
    'El solape se mide con el ancho de la maquina, no con un valor fijo'
  );

  // La caja de la consola sube ese solape con margen negativo: con el `gap` a 0
  // el aire solo puede salir de la propia caja, y el margen no toca el reparto de
  // `--m-w` (las relaciones del arte siguen mandando el alto).
  const caseRule = css.match(
    /\.machine__side \.controls\s*\{[^}]*aspect-ratio:\s*1780 \/ 883;[^}]*\}/
  );
  assert.ok(caseRule, 'La consola debe declarar su relacion 1780/883');
  assert.match(
    caseRule[0],
    /margin:\s*calc\(-1 \* var\(--joint-tuck\)\) 0 0;/,
    'La consola se mete bajo el marco lo justo para no dejar franja'
  );

  // El saldo vive dentro de la consola y se ancla al HUD del marco: si la caja
  // sube, su `top` tiene que descontar el mismo solape o la placa se desplaza.
  // 0,81414 = 1 − 0,18586, el arranque de la franja de placas del marco nuevo
  // (18,59 % del alto); la caja mide lo mismo que el aro (7,24 %).
  assert.match(
    css,
    /top:\s*calc\(-1 \* \(var\(--frame-h\) \* 0\.81414 \+ var\(--row-gap\) - var\(--joint-tuck\)\)\);/,
    'El saldo sigue clavado en la primera placa del HUD'
  );
  assert.match(
    css,
    /left:\s*27\.01%;[^}]*width:\s*19\.29%;[^}]*height:\s*calc\(var\(--frame-h\) \* 0\.07236\);/,
    'La caja del saldo copia la primera placa del marco nuevo'
  );

  // El ajuste es exclusivo del tramo movil: el escritorio monta la consola en su
  // propia columna y no debe recibir ni el token ni la separacion variable.
  const desktopGrid = css.match(/\.machine\s*\{[^}]*grid-template-areas:\s*"side table";[^}]*\}/);
  assert.ok(desktopGrid, 'El escritorio mantiene su rejilla de dos columnas');
  assert.doesNotMatch(desktopGrid[0], /joint-tuck|--row-gap/, 'El escritorio no hereda la junta movil');
});

test('el logo entra en el reparto vertical en todo el rango movil (sin aire reservado)', () => {
  const css = read(STYLE_PATH);

  // Con el marco nuevo la chapa ya no se pega sobre el arte: tiene su propia fila
  // ("logo") y su relacion alto/ancho (0,36) suma en el divisor de `--m-w`. Eso
  // sustituye al `--logo-air` que el tramo 600-899 px necesitaba con el marco
  // anterior, cuando el unico cielo era el que dejaba el dibujo.
  const machineGrid = css.match(
    /\.machine\s*\{[^}]*grid-template-areas:\s*"logo"\s*"frame"\s*"console";[^}]*\}/
  );
  assert.ok(machineGrid, 'La maquina movil apila logo, marco y consola');
  assert.match(
    machineGrid[0],
    /grid-template-rows:\s*auto auto auto;/,
    'Las tres filas se miden por su contenido'
  );

  // El divisor 1,8336 = 0,36 (logo) + 0,9775 (marco) + 0,4961 (consola) es el
  // unico presupuesto vertical: si alguien cambia una relacion del arte o el
  // ancho del logo, este numero tiene que seguirlo o el conjunto se sale.
  const divisor = machineGrid[0].match(/\* 0\.977492\)/);
  assert.ok(divisor, 'El alto del marco se deriva de su lienzo (1216 / 1244)');
  assert.match(
    machineGrid[0],
    /calc\(\(100cqh - var\(--row-gap\) - 20px\) \/ 1\.8336\)/,
    'El alto libre descuenta la fila del logo y el colchon del balanceo'
  );

  // El tramo intermedio (600-899 px) ya no necesita regla propia: el reparto es
  // el mismo en todo el rango movil. Solo queda el modo compacto de paisaje.
  assert.doesNotMatch(css, /--logo-air\s*:/, 'El aire reservado del logo ya no se declara');
  assert.doesNotMatch(
    css,
    /@media \(min-width: 600px\) and \(max-width: 899px\) and \(min-height: 521px\)/,
    'El tramo 600-899 px no duplica el reparto vertical'
  );

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
  // Movil (`build-mobile-art.js`): marco y consola recortados al alfa.
  // Escritorio (`build-desktop-art.js`): d1 (marco del tablero) y d2 (columna
  // lateral entera: corona + placas + consola), a q=90 y con el mismo
  // contrato de lienzo.
  const pieces = [
    { name: 'marco_movil', size: '1244x1216', max: 280 * 1024, build: 'build-mobile-art.js' },
    { name: 'consola_movil', size: '1780x883', max: 512 * 1024, build: 'build-mobile-art.js' },
    { name: 'd1', size: '1033x863', max: 300 * 1024, build: 'build-desktop-art.js' },
    { name: 'd2', size: '655x1091', max: 700 * 1024, build: 'build-desktop-art.js' }
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
  //
  // La URL lleva `?v=N` a proposito: `/src/assets/**` se sirve como
  // `Cache-Control: immutable` (vercel.json), asi que republicar el WebP con el
  // mismo nombre dejaria a los clientes con el lienzo viejo bajo los anclajes
  // nuevos (textos y pulsadores desalineados).
  for (const name of ['d1', 'd2']) {
    assert.match(
      css,
      new RegExp(`url\\('\\.\\.\\/assets\\/${name}\\.webp\\?v=\\d+'\\) no-repeat center \\/ 100% 100%`),
      `El CSS debe pintar ${name}.webp sin aire (100% 100%) y con cache-busting ?v=N`
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
  const spinBodies = bodies('\\.machine__side \\.controls (?:\\.btn--spin|#btn-spin)');
  assert.ok(spinBodies.length, 'La capsula GIRAR debe declarar su caja');
  for (const declaration of ['left: 9.16%;', 'top: 64.89%;', 'width: 80.76%;', 'height: 15.58%;']) {
    assert.ok(
      spinBodies.some((body) => body.includes(declaration)),
      `El GIRAR se ancla al dibujo con \`${declaration}\``
    );
  }
  const windowBodies = bodies('\\.machine__table \\.board');
  assert.ok(windowBodies.length, 'El tablero debe declarar su caja sobre la ventana del marco');
  for (const declaration of ['left: 5.8%;', 'top: 14.63%;', 'width: 88.32%;', 'height: 77.35%;']) {
    assert.ok(
      windowBodies.some((body) => body.includes(declaration)),
      `La ventana de d1 se cubre con \`${declaration}\``
    );
  }

  // Los simbolos llenan su casilla. El aire lateral del tablero se ataca en las
  // tres capas que lo sumaban: el `padding` del panel, el hueco entre casillas y
  // el 12 % de margen interno de cada simbolo. Las dos hojas —movil y
  // escritorio— comparten contrato: el caramelo se dibuja de borde a borde con
  // `contain` (igual que los sellos de marca) y el aire del tablero queda en el
  // filo que necesita el radio de las esquinas del panel.
  const symbolBodies = bodies('\\.machine__table \\.tile__img');
  assert.equal(symbolBodies.length, 2, 'Movil y escritorio declaran la caja del simbolo');
  for (const body of symbolBodies) {
    for (const declaration of ['left: 0;', 'top: 0;', 'width: 100%;', 'height: 100%;']) {
      assert.ok(
        body.includes(declaration),
        'El simbolo ocupa su casilla con `' + declaration + '`'
      );
    }
    assert.match(body, /object-fit:\s*contain;/, 'La proporcion del caramelo se mantiene');
  }
  for (const declaration of [
    'padding: clamp(1px, calc(var(--m-w) * 0.0026), 2px);',
    'padding: clamp(1px, calc(var(--frame-h) * 0.0026), 3px);',
  ]) {
    assert.ok(
      windowBodies.some((body) => body.includes(declaration)),
      'El aire del tablero se queda en el filo: `' + declaration + '`'
    );
  }
  const framedGridBodies = bodies('\\.machine__table \\.grid');
  for (const declaration of [
    'gap: clamp(1px, calc(var(--m-w) * 0.0037), 2.5px);',
    'gap: clamp(2px, calc(var(--frame-h) * 0.0065), 6px);',
  ]) {
    assert.ok(
      framedGridBodies.some((body) => body.includes(declaration)),
      'El hueco entre casillas es una linea de separacion: `' + declaration + '`'
    );
  }

  // Geometria de la columna lateral (d2 · 655 x 1091): la corona y la consola son
  // una sola pieza, asi que el ancho sale del alto comun y no queda ninguna
  // separacion vertical entre ambas mitades.
  assert.match(
    css,
    /--frame-h: min\([\s\S]{0,180}?\/ 1\.79737\)/,
    'El marco descuenta la columna lateral con 1,19700 (d1) + 0,60037 (d2)'
  );
  assert.match(
    css,
    /--frame-w: calc\(var\(--frame-h\) \* 1\.19700\)/,
    'El marco mide 1033/863 de su alto (relacion del dibujo, sin recortar el toldo)'
  );
  assert.match(
    css,
    /--side-w: calc\(var\(--frame-h\) \/ 1\.66565\)/,
    'La columna lateral mide 655/1091 de su alto'
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
    'left: 6.46%;',
    'top: 36.32%;',
    'width: 86.65%;',
    'height: 7.13%;',
    'grid-template-columns: 31.3% 31.3% 31.3%;',
    'column-gap: 3.06%;'
  ]) {
    assert.ok(
      hudBodies.some((body) => body.includes(declaration)),
      `Las placas se anclan al dibujo con \`${declaration}\``
    );
  }

  const logoBodies = bodies('\\.machine__side \\.machine__logo');
  assert.ok(logoBodies.length, 'El logo debe declarar su caja sobre la nube');
  // 70 % es el ancho con el que la chapa se apoya en la banda de nieve de la
  // corona: el lienzo nuevo (655 x 1091) no trae placa para el logo, asi que el
  // lockup se centra en 21,4 % (y 10,9-31,9 %) y deja ~4 px de lienzo sobre la
  // cresta del toldo, que arranca en 32,51 %. Con mas ancho el arte se come la
  // corona de arriba y roza las placas del HUD.
  for (const declaration of ['left: 50%;', 'top: 21.4%;', 'width: 70%;', 'aspect-ratio: 2 / 1;']) {
    assert.ok(
      logoBodies.some((body) => body.includes(declaration)),
      `El logo se apoya en la nube de d2 con \`${declaration}\``
    );
  }
  assert.ok(
    logoBodies.some((body) => body.includes('top: 21.4%;') && body.includes('width: 70%;')),
    'El logo se apoya en la banda de nieve de d2 (70 % del ancho)'
  );
  assert.ok(
    logoBodies.some((body) => body.includes('width: 70%;') && body.includes('top: 21.6%;')),
    'En ventanas bajas el logo mantiene el 70 % y recentra la chapa en 21,6 %'
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

test('la placa roja del GIRAR se compone sobre d2 dentro de la caja tactil', async () => {
  // El maestro de escritorio deja la franja del GIRAR en el verde de la tarjeta:
  // la placa es una capa generada (`scripts/lib/girarPlate.js`) que
  // `build:desktop-art` compone antes de recortar, asi que el WebP publicado
  // siempre la lleva y `design/d2.png` se queda intacto.
  const libPath = path.join(ROOT_DIR, 'scripts', 'lib', 'girarPlate.js');
  assert.ok(fs.existsSync(libPath), 'Falta scripts/lib/girarPlate.js');
  const lib = read(libPath);
  assert.match(
    lib,
    /const BOX = \{ left: 60, top: 708, width: 529, height: 170 \};/,
    'La placa vive en la caja del pulsador sobre el lienzo de d2 (655 x 1091)'
  );
  assert.match(
    lib,
    /module\.exports = \{\s*paintGirarPlate,\s*GIRAR_BOX: BOX,/,
    'El modulo publica el pintado y la caja medida'
  );
  assert.match(
    lib,
    /GIRAR_PLATE: \{/,
    'El modulo publica la geometria de la placa para sincronizarla con el CSS'
  );

  const pipeline = read(path.join(ROOT_DIR, 'scripts', 'build-desktop-art.js'));
  assert.match(pipeline, /require\('\.\/lib\/girarPlate'\)/, 'El build de escritorio importa la placa');
  const d2 = pipeline.slice(pipeline.indexOf("name: 'd2'"));
  assert.match(
    d2.slice(0, 420),
    /paint: paintGirarPlate,/,
    'd2 se completa con la placa antes de recortar y codificar'
  );
  assert.match(
    pipeline,
    /la capa generada mueve el recorte del maestro/,
    'El recorte se mide sobre el maestro: si la capa lo mueve, el build falla'
  );

  // Los px de la caja son exactamente los porcentajes que ancla el CSS.
  const css = read(STYLE_PATH);
  const spinBodies = [
    ...css.matchAll(/\.machine__side \.controls (?:#btn-spin|\.btn--spin)[^{]*\{([^}]*)\}/g)
  ].map((match) => match[1]);
  assert.ok(spinBodies.length, 'La capsula GIRAR debe declarar su caja');
  const anchors = [
    ['left', 60, 655],
    ['top', 708, 1091],
    ['width', 529, 655],
    ['height', 170, 1091]
  ];
  for (const [property, pixels, total] of anchors) {
    const declaration = `${property}: ${((pixels / total) * 100).toFixed(2)}%;`;
    assert.ok(
      spinBodies.some((body) => body.includes(declaration)),
      `La placa y el CSS comparten ${declaration}`
    );
  }

  // La placa va centrada en la caja tactil y su velo de recorte comparte radio
  // con ella: con la capsula antigua (`999px` = 78 px sobre una caja de 156) el
  // `border-radius` del boton recortaba 10 px de cada esquina del aro y el
  // GIRAR acababa en un corte recto.
  const { GIRAR_PLATE } = require(libPath);
  const { box, inset, plate: placa, face, maskRadius, maskCss } = GIRAR_PLATE;
  assert.equal(
    placa.w,
    box.width - inset.x * 2,
    'La placa deja el mismo aire a izquierda y derecha: comparte centro con la caja tactil'
  );
  assert.equal(
    placa.h,
    box.height - inset.y * 2,
    'La placa deja el mismo aire arriba y abajo: comparte centro con la caja tactil'
  );
  assert.ok(inset.x >= 2 && inset.y >= 2, 'La placa no toca el borde de la caja tactil');
  assert.equal(face.r, placa.r - placa.rim, 'La cara es el rectangulo concentrico al aro');
  assert.equal(face.w, placa.w - placa.rim * 2, 'El aro mide lo mismo en los cuatro lados');
  assert.equal(face.h, placa.h - placa.rim * 2, 'El aro mide lo mismo en los cuatro lados');
  assert.ok(
    maskRadius >= placa.r && maskRadius <= placa.r + 4,
    `El velo (${maskRadius} px) sigue la curvatura del aro (${placa.r} px) sin morderlo`
  );
  assert.equal(
    maskCss,
    `${((maskRadius / box.width) * 100).toFixed(2)}% / ${((maskRadius / box.height) * 100).toFixed(2)}%`,
    'El velo se publica en % de la caja para escalar con el panel'
  );
  const girar = spinBodies.find((body) => body.includes('--art-x: 9.16;'));
  assert.ok(girar, 'La capsula GIRAR debe declarar la caja del dibujo');
  assert.ok(
    girar.includes(`border-radius: ${maskCss};`),
    `El velo del GIRAR debe ser \`border-radius: ${maskCss}\` (el de la placa), no una capsula`
  );
  assert.ok(
    !girar.includes('border-radius: 999px;'),
    'La capsula de 999px recortaba las esquinas del aro dorado'
  );
  // La caja del GIRAR va por id: la regla candy `.btn--spin.gbtn` (cuatro
  // clases) gana a cualquier selector de tres y repone su capsula, su borde
  // transparente de 5 px y el `background-clip: padding-box`.
  assert.match(
    css,
    /\.machine__side \.controls #btn-spin \{/,
    'La caja del GIRAR se declara por id para ganar a la regla candy'
  );
  for (const declaration of ['padding: 0;', 'border: 0;', 'background-clip: border-box;', 'background-origin: border-box;']) {
    assert.ok(
      girar.includes(declaration),
      `La copia del lienzo se ancla a la caja del pulsador: falta \`${declaration}\``
    );
  }

  // Y el WebP que se sirve lleva la cara roja en el centro de la placa: si
  // alguien publica el maestro sin la capa, el pulsador vuelve a ser un hueco.
  const asset = path.join(PUBLIC_DIR, 'src', 'assets', 'd2.webp');
  const { data, info } = await sharp(asset).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sample = (x, y) => {
    const index = (y * info.width + x) * info.channels;
    return [data[index], data[index + 1], data[index + 2]];
  };
  const [r, g, b] = sample(324, 793);
  assert.ok(
    r > 150 && g < 80 && b < 80,
    `La cara del GIRAR debe ser roja en (324, 793): rgb(${r}, ${g}, ${b})`
  );
});

test('el maestro de d2 conserva el pie del marco (estrellas, lazo y campanas)', async () => {
  // El generador estiraba el arte al lienzo y luego reasignaba ocho franjas de
  // filas para clavar placas y pulsadores. La ultima franja (827..860 ->
  // 878..928) se comia las 68 filas del pie: la base del marco, con las
  // estrellas, el lazo central, las campanas y los adornos, se publicaba
  // guillotinada. El maestro se encaja ahora con escala uniforme, asi que el
  // pie tiene que coincidir con el del arte de origen reescalado.
  const masters = read(path.join(ROOT_DIR, 'scripts', 'build-santa-masters.js'));
  assert.doesNotMatch(
    masters,
    /rowRemap|srcTop/,
    'El maestro de d2 se encaja con escala uniforme: no se reasignan franjas de filas'
  );

  const source = path.join(ROOT_DIR, 'desk', 'Marco de tragaperras navideño festivo.png');
  assert.ok(fs.existsSync(source), 'El arte de origen de d2 debe seguir en desk/');
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Misma caja de tinta que `inkBox` del generador (alfa >= 16).
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] < 16) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const fitted = await sharp(source)
    .ensureAlpha()
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(655, 1091, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const master = await sharp(path.join(ROOT_DIR, 'design', 'd2.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(`${master.info.width}x${master.info.height}`, '655x1091', 'El maestro de d2 mide 655 x 1091');

  // Banda inferior: el pie del dibujo (lazo, campanas y estrellas).
  const band = 64;
  let diff = 0;
  let samples = 0;
  for (let y = 1091 - band; y < 1091; y += 1) {
    for (let x = 0; x < 655; x += 1) {
      const a = (y * 655 + x) * master.info.channels;
      const b = (y * 655 + x) * fitted.info.channels;
      diff += Math.abs(master.data[a] - fitted.data[b]);
      diff += Math.abs(master.data[a + 1] - fitted.data[b + 1]);
      diff += Math.abs(master.data[a + 2] - fitted.data[b + 2]);
      samples += 3;
    }
  }
  const mean = diff / samples;
  assert.ok(
    mean < 6,
    `El pie de design/d2.png debe ser el del arte de origen (diferencia media ${mean.toFixed(2)})`
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

  // Medido sobre `consola_movil.webp` (1780 x 883) con el analisis de alfa y
  // color: discos x 3,26-18,37 / 19,04-34,04 / 65,00-80,11 / 80,96-96,07 % · y
  // 40,77-70,60 %, aro del GIRAR x 35,8-63,4 % · y 20,4-76,2 % (la caja tactil se
  // queda con el cuadrado que cabe entero sobre el disco y encima de la placa
  // GIRAR: x 37,7-61,4 % · y 21,4-69,2 %) y el tramo MAX de la placa APUESTA
  // x 85,6-92,0 % · y 74,9-81,3 %. La caja tactil es exactamente ese recuadro,
  // asi que el dedo siempre cae sobre el dibujo.
  const boxes = [
    [/\.machine__side \.controls #btn-feature\.gbtn \{([^}]*)\}/, ['left: 3.26%;', 'top: 40.77%;', 'width: 15.11%;', 'height: 29.83%;']],
    [/\.machine__side \.controls #btn-auto\.gbtn \{([^}]*)\}/, ['left: 19.04%;', 'top: 40.77%;', 'width: 15.0%;', 'height: 29.83%;']],
    [/\.machine__side \.controls \.btn--spin\.gbtn \{([^}]*)\}/, ['left: 37.7%;', 'top: 21.4%;', 'width: 23.7%;', 'height: 47.8%;']],
    [/\.machine__side \.controls__bet #btn-bet-down \{([^}]*)\}/, ['left: 65.00%;', 'top: 40.77%;']],
    [/\.machine__side \.controls__bet #btn-bet-up \{([^}]*)\}/, ['left: 80.96%;', 'top: 40.77%;']],
    [/\.machine__side \.controls__bet #btn-bet-max \{([^}]*)\}/, ['left: 85.6%;', 'top: 74.9%;', 'width: 6.4%;', 'height: 6.4%;']]
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
  assert.ok(discPair[1].includes('width: 15.11%;'), 'Los dos discos minus/plus miden 15,11 % de ancho');
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
/*  Capa de marca (Meridianobet)                                              */
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
    withoutComments.includes('html[data-theme="meridianobet"]'),
    'Los overrides deben colgar de html[data-theme="meridianobet"]'
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
    /(^|\n)\s*(html\[data-theme="meridianobet"\]\s*)?\.(machine|topbar|modal__card)\s*\{[^}]*(width|height|display|position)\s*:/.test(
      withoutComments
    ),
    false,
    'La capa de marca solo cambia color, fondo, borde y sombra'
  );
});

test('la capa de marca define la paleta Meridianobet (rojo, blanco, gris)', () => {
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
      /html\[data-theme="meridianobet"\] \.modal__card \{[^}]*linear-gradient\(160deg, #123a86 0%, #0a1c4a 56%, #05102c 100%\)/,
      'La tarjeta del modal se pinta con el panel marino del tablero',
    ],
    [
      /html\[data-theme="meridianobet"\] \.modal__card \{[^}]*color: var\(--brand-panel-ink\);/,
      'La tarjeta hereda la tinta clara del panel',
    ],
    [
      /html\[data-theme="meridianobet"\] \.modal__head h2 \{[^}]*color: var\(--brand-white\);/,
      'El titulo del modal va en blanco puro sobre la banda oscura',
    ],
    [
      /html\[data-theme="meridianobet"\] \.modal__body h3 \{[^}]*color: var\(--brand-panel-gold\);/,
      'Los subtitulos ("COMO SE JUEGA", "PAGOS POR DISPERSION") van en el oro claro del panel',
    ],
    [
      /html\[data-theme="meridianobet"\] \.modal__body p,[\s\S]{0,140}?color: var\(--brand-panel-ink\);/,
      'Los parrafos y las listas van en la tinta clara del panel',
    ],
    [
      /html\[data-theme="meridianobet"\] \.paytable th \{[^}]*color: var\(--brand-panel-dim\);/,
      'La cabecera de la tabla va en el azul claro del panel',
    ],
    [
      /html\[data-theme="meridianobet"\] \.paytable td \{[^}]*color: var\(--brand-panel-ink\);/,
      'Las filas de simbolos van en la tinta clara del panel',
    ],
    [
      /html\[data-theme="meridianobet"\] \.paytable td:last-child \{[^}]*color: var\(--brand-panel-gold\);/,
      'Los multiplicadores destacan en oro claro, no en un tono palido',
    ],
    [
      /html\[data-theme="meridianobet"\] \.auth-form__label \{[^}]*color: var\(--brand-panel-dim\);/,
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
  const themeStart = theme.indexOf('html[data-theme="meridianobet"] .tile__bomb-value {');
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


