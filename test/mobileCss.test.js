'use strict';

/**
 * Presupuesto grafico del movil.
 *
 * La seccion final de `style.css` cambia sombras y filtros caros por filos de
 * 1 px cuando la pantalla no pasa de 1023.98 px, y solo entonces: de 1024 px en
 * adelante el juego tiene que verse exactamente como antes, sombra por sombra.
 * Ese es el contrato que fijan estos tests:
 *
 *   1. el recorte es un UNICO bloque condicional (`max-width: 1023.98px`), sin
 *      reglas sueltas fuera de el;
 *   2. dentro del bloque estan apagados los efectos que de verdad pesan en un
 *      telefono (los `backdrop-filter` y los `drop-shadow` de las casillas, las
 *      sombras del marco, los velos a pantalla completa y las animaciones en
 *      bucle del tablero quieto, que se paran con `animation: none`);
 *   3. fuera del bloque no queda ningun recorte marcado como `!important`, asi
 *      que escritorio conserva sus sombras y sus filtros originales;
 *   4. la hoja publicada (`style.min.css`) lleva la seccion: nadie puede editar
 *      la fuente y olvidar `npm run build:css`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS_DIR = path.join(__dirname, '..', 'public', 'src', 'css');
const MOBILE_MEDIA = '@media (max-width: 1023.98px)';

const read = (file) => fs.readFileSync(file, 'utf8');
const css = read(path.join(CSS_DIR, 'style.css'));
const minified = read(path.join(CSS_DIR, 'style.min.css'));
const html = read(path.join(__dirname, '..', 'public', 'index.html'));

/* El bloque movil empieza en la ultima `@media` de la hoja: es la seccion que
   cierra el archivo. */
const mediaStart = css.lastIndexOf(MOBILE_MEDIA);
const mobileBlock = mediaStart === -1 ? '' : css.slice(mediaStart);
const desktopCss = mediaStart === -1 ? css : css.slice(0, mediaStart);
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '');

test('la seccion movil es un unico bloque condicional y cierra la hoja', () => {
  assert.ok(mediaStart > 0, `Falta la seccion ${MOBILE_MEDIA} en style.css`);
  assert.equal(
    desktopCss.includes(MOBILE_MEDIA),
    false,
    'El corte movil solo puede declararse una vez, y al final de la hoja'
  );

  const body = withoutComments(mobileBlock);
  let depth = 0;
  let maxDepth = 0;
  let closedEarly = -1;

  for (const [index, char] of [...body].entries()) {
    if (char === '{') {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) closedEarly = index;
    }
  }

  assert.equal(depth, 0, 'El bloque movil tiene llaves desbalanceadas');
  assert.equal(maxDepth, 2, 'Solo puede haber un nivel de anidamiento: la @media y sus reglas');
  assert.equal(
    body.slice(closedEarly + 1).trim(),
    '',
    'La @media movil debe cerrar al final del archivo: hay reglas fuera del condicional'
  );
});

test('el movil apaga los efectos caros del tablero', () => {
  const block = withoutComments(mobileBlock);
  const has = (pattern, message) => assert.match(block, pattern, message);

  /* 30 casillas: sin muestrear el fondo y sin el `inset` de 16 px. */
  has(
    /\.tile\s*\{[^}]*backdrop-filter:\s*none\s*!important;/,
    'Las casillas deben soltar el backdrop-filter en movil'
  );
  has(
    /\.tile\s*\{[^}]*box-shadow:\s*inset 0 1px 0 [^;]*!important;/,
    'La casilla movil se queda con un filo de 1 px, sin blur'
  );

  /* 30 simbolos: el drop-shadow se cae en reposo y los estados de premio quedan
     fuera del selector, asi que su brillo se mantiene. */
  has(
    /\.tile:not\(\.tile--win\):not\(\.tile--pop\):not\(\.tile--scatter\):not\(\.tile--drop\)\s*:is\(\.tile__img, \.tile__glyph\)\s*\{[^}]*filter:\s*none\s*!important;/,
    'Los simbolos en reposo no deben llevar drop-shadow en movil'
  );

  /* El bloque del logo y las casillas que ganan conservan un halo unico. */
  has(
    /\.tile\[data-sym="SC"\],\s*\.tile\[data-sym="MX"\]\s*\{[^}]*0 0 12px/,
    'El bloque del logo debe quedarse con un solo halo'
  );
  has(
    /\.tile\.tile--win,\s*\.tile\.tile--scatter\s*\{[^}]*0 0 12px/,
    'Las casillas que ganan deben conservar su halo (uno, no tres)'
  );

  /* Marco, tablero y panel. */
  has(
    /\.machine,\s*\.machine__table,\s*\.panel__block\s*\{[^}]*backdrop-filter:\s*none\s*!important;[^}]*box-shadow:\s*none\s*!important;/,
    'El marco y el panel no deben llevar velo ni sombra en movil'
  );
  has(
    /\.board\s*\{[^}]*box-shadow:\s*inset 0 1px 0[^;]*!important;/,
    'El tablero movil se queda con el filo de cristal'
  );
  has(
    /\.board::after\s*\{[^}]*mix-blend-mode:\s*normal\s*!important;/,
    'La reticula del tablero no debe mezclarse con el fondo'
  );
});

test('el movil aplana el chrome tactil y los velos', () => {
  const block = withoutComments(mobileBlock);
  const has = (pattern, message) => assert.match(block, pattern, message);

  for (const selector of [
    '.machine__side .controls .gbtn',
    '.machine__side .controls__bet .chip',
    '.topbar .btn--demo',
    '.topbar__audio',
    '.modal__head .icon-btn',
    '.fever__option'
  ]) {
    assert.ok(block.includes(selector), `El presupuesto movil debe cubrir el pulsador ${selector}`);
  }

  has(
    /\.machine__side \.controls \.gbtn:active:not\(:disabled\),[\s\S]{0,400}box-shadow:\s*inset 0 2px 6px[^;]*!important;/,
    'El pulsado tactil debe dibujarse con un filo interior sin blur'
  );
  has(
    /\.machine__side \.controls \.gbtn:hover:not\(:disabled\),[\s\S]{0,400}filter:\s*none\s*!important;/,
    'El hover con brightness() no debe quedarse pegado tras el toque'
  );

  for (const overlay of ['.modal__backdrop', '.fever__backdrop', '.win', '.toast']) {
    assert.ok(
      block.includes(overlay),
      `Los velos a pantalla completa deben apagarse en movil (${overlay})`
    );
  }
  has(
    /\.modal__card,\s*\.fever__card\s*\{\s*box-shadow:\s*none\s*!important;/,
    'Las tarjetas se separan con su filo, sin blur de 70-90 px'
  );
});

test('el escritorio conserva el diseno original', () => {
  /* Fuera del condicional, las declaraciones caras siguen intactas: si alguien
     recorta en la regla base, este test lo detecta. */
  const base = withoutComments(desktopCss);

  const originals = [
    [
      /\.tile\s*\{[^}]*backdrop-filter:\s*blur\(3px\);/,
      'La casilla de escritorio conserva su cristal (backdrop-filter)'
    ],
    [
      /\.tile\s*\{[^}]*0 6px 14px rgba\(93, 11, 91, 0\.14\);/,
      'La casilla de escritorio conserva su sombra de contacto'
    ],
    [
      /\.tile__img\s*\{[^}]*filter:\s*drop-shadow\(0 6px 5px rgba\(73, 6, 69, 0\.32\)\);/,
      'El simbolo de escritorio conserva su drop-shadow'
    ],
    [
      /\.board\s*\{[^}]*0 24px 52px rgba\(91, 8, 87, 0\.30\);/,
      'El tablero de escritorio conserva su sombra de profundidad'
    ],
    [
      /\.modal__backdrop\s*\{[^}]*backdrop-filter:\s*blur\(7px\);/,
      'El velo del modal de escritorio conserva su desenfoque'
    ],
    [
      /\.modal__card\s*\{[^}]*box-shadow:\s*0 30px 80px rgba\(31, 1, 39, 0\.62\);/,
      'La tarjeta del modal de escritorio conserva su sombra'
    ]
  ];

  for (const [pattern, message] of originals) {
    assert.match(base, pattern, message);
  }

  /* Y ningun recorte con `!important` se escapa del condicional: el escritorio
     no hereda ni un `backdrop-filter: none`. */
  assert.equal(
    /backdrop-filter:\s*none\s*!important/.test(base),
    false,
    'Fuera del bloque movil no puede haber recortes con !important'
  );
});

test('la hoja publicada lleva la seccion movil', () => {
  assert.ok(
    minified.includes(MOBILE_MEDIA),
    'style.min.css quedo sin la seccion movil: ejecuta npm run build:css'
  );
  assert.match(
    minified,
    /@media \(max-width: 1023\.98px\)\{\.tile\{[^}]*backdrop-filter:\s*none\s*!important/,
    'El minificado debe conservar el recorte de las casillas'
  );
});

test('el logo de la cabecera no flota ni proyecta sombra en movil', () => {
  const block = withoutComments(mobileBlock);

  /* Sin `drop-shadow` y sin `pana-logo-*`: el logo queda clavado. La flotacion
     tiene cuatro variantes (base, lado de escritorio, case y marco movil), asi
     que el corte se aplica a las dos formas del selector. */
  assert.match(
    block,
    /\.machine__logo,\s*\.machine__side \.machine__logo \{\s*filter:\s*none\s*!important;\s*animation:\s*none\s*!important;\s*will-change:\s*auto\s*!important;\s*\}/,
    'El logo movil debe quedarse sin filtro, sin animacion y sin capa promovida'
  );
  assert.match(
    block,
    /\.machine__hero::before \{\s*display:\s*none\s*!important;\s*\}/,
    'El halo con blur(18px) que respiraba detras del logo no se pinta en movil'
  );
  assert.match(
    block,
    /\.machine__spark \{\s*animation:\s*none\s*!important;\s*\}/,
    'Las estrellas de la cabecera se quedan quietas en movil'
  );

  /* Escritorio: el logo sigue flotando en todas sus variantes. */
  const base = withoutComments(desktopCss);
  assert.match(
    base,
    /\.machine__logo \{[^}]*animation:\s*pana-logo-float 4\.6s ease-in-out infinite;/,
    'El logo de escritorio conserva su flotacion'
  );
  for (const keyframes of [
    'animation: pana-logo-breathe 6.4s ease-in-out infinite',
    'animation: pana-logo-sheen 6.4s ease-in-out infinite',
    'animation: pana-logo-sticker 7.6s ease-in-out infinite',
    'animation: pana-logo-breathe-side 6.4s ease-in-out infinite'
  ]) {
    assert.ok(base.includes(keyframes), `El escritorio conserva \`${keyframes}\``);
  }
  assert.match(
    base,
    /\.machine__spark \{[^}]*animation:\s*pana-sparkle 2\.8s ease-in-out infinite;/,
    'Las estrellas de escritorio siguen parpadeando'
  );
  assert.match(
    base,
    /\.machine__hero::before \{[^}]*filter:\s*blur\(18px\);/,
    'El halo de escritorio conserva su desenfoque'
  );
});

test('el multiplicador del tablero se queda quieto y legible en movil', () => {
  const block = withoutComments(mobileBlock);

  assert.match(
    block,
    /\.tile\[data-sym="MX"\]::before,\s*\.tile\[data-sym="MX"\] \.tile__img,\s*\.tile\[data-sym="MX"\] \.tile__bomb-value,\s*\.tile\[data-sym="MX"\]\.tile--win \{\s*animation:\s*none\s*!important;\s*will-change:\s*auto\s*!important;\s*\}/,
    'La casilla del multiplicador no debe animarse (barrido, flotacion ni latido del numero)'
  );
  assert.match(
    block,
    /\.tile\[data-sym="MX"\] \.tile__bomb-value \{\s*text-shadow:\s*0 1px 0 rgba\(72, 0, 24, 0\.55\)\s*!important;\s*\}/,
    'La cifra del multiplicador se separa del oro con un relieve de 1 px'
  );

  /* Escritorio: las animaciones del multiplicador siguen declaradas. */
  const base = withoutComments(desktopCss);
  assert.ok(
    base.includes('animation: logo-tile-sheen 3.6s linear infinite'),
    'La medalla de escritorio sigue barriendo la banda de luz'
  );
  assert.match(
    base,
    /animation: logo-tile-lift 3\.2s ease-in-out infinite/,
    'El logo de la medalla sigue flotando en escritorio'
  );
  assert.match(
    base,
    /\.tile\[data-sym="MX"\] \.tile__bomb-value \{\s*z-index: 2;\s*will-change: transform;\s*animation: logo-tile-badge 1\.9s ease-in-out infinite;\s*\}/,
    'La etiqueta del multiplicador sigue latiendo en escritorio'
  );
  assert.match(
    base,
    /\.tile\[data-sym="MX"\]\.tile--win \{\s*animation: logo-tile-win 0\.46s ease-in-out infinite alternate;\s*\}/,
    'El multiplicador premiado sigue latiendo en escritorio'
  );
});

test('el GIRAR no anima en bucle en movil y solo responde al toque', () => {
  const block = withoutComments(mobileBlock);

  assert.match(
    block,
    /\.machine__side \.controls \.btn--spin,\s*\.machine__side \.controls \.btn--spin\.gbtn,\s*\.machine__side \.controls \.btn--spin \.spin-spark,\s*\.machine__side \.controls #btn-spin \.spin-spark,\s*\.machine__side \.controls \.btn--spin \.btn__spin-icon::after \{\s*animation:\s*none\s*!important;\s*\}/,
    'El GIRAR movil no debe latir, parpadear ni expandir el aro'
  );
  assert.match(
    block,
    /\.machine__side \.controls \.gbtn \.shine \{\s*display:\s*none\s*!important;\s*\}/,
    'El barrido de brillo del pulsador se retira en movil'
  );
  assert.match(
    block,
    /\.machine__side \.controls \.btn--spin \.spin-spark,\s*\.machine__side \.controls #btn-spin \.spin-spark \{\s*opacity:\s*0\.9\s*!important;\s*transform:\s*none\s*!important;\s*\}/,
    'Las estrellas del GIRAR se quedan encendidas y sin escalar'
  );
  assert.match(
    block,
    /\.machine__side \.controls \.btn--spin \.btn__spin-icon::after \{\s*display:\s*none\s*!important;\s*\}/,
    'El aro que se expandia detras del disco no debe crear caja'
  );

  /* El boton del DOM lleva `gbtn`, asi que el unico feedback que queda (el
     hundido del `:active` de la seccion 3) le alcanza: no hay animacion
     automatica, pero el toque sigue respondiendo. */
  assert.match(
    html,
    /<button class="btn btn--spin gbtn[^"]*" id="btn-spin"/,
    'El GIRAR tiene que ser un `.gbtn` para heredar el pulsado tactil del movil'
  );
  assert.match(
    block,
    /\.machine__side \.controls \.gbtn:active:not\(:disabled\),[\s\S]{0,400}?box-shadow:\s*inset 0 2px 6px[^;]*!important;/,
    'El unico cambio de estado del GIRAR es el hundido del :active'
  );

  /* Escritorio: los bucles siguen declarados. */
  const base = withoutComments(desktopCss);
  assert.match(
    base,
    /\.machine__side \.controls \.btn--spin\.gbtn,\s*\.machine__side \.controls \.btn--spin \{[^}]*animation:\s*spinPulse 2\.2s ease-in-out infinite;/,
    'El GIRAR de escritorio sigue latiendo'
  );
  assert.match(
    base,
    /\.machine__side \.controls \.btn--spin \.spin-spark \{[^}]*animation:\s*sparkTwinkle 2\.6s ease-in-out infinite;/,
    'Las estrellas de escritorio siguen parpadeando'
  );
  assert.match(
    base,
    /\.machine__side \.controls #btn-spin \.spin-spark \{[^}]*animation:\s*twinkle 2\.6s ease-in-out infinite;/,
    'Las estrellas del case movil siguen parpadeando en escritorio'
  );
  assert.match(
    base,
    /\.machine__side \.controls \.btn--spin \.btn__spin-icon::after \{[^}]*animation:\s*pana-console-halo 2\.6s ease-out infinite;/,
    'El aro del disco sigue expandiendose en escritorio'
  );
  assert.match(
    base,
    /\.machine__side \.controls \.gbtn \.shine \{[^}]*animation:\s*sweep 3\.4s infinite;/,
    'El barrido de brillo sigue vivo en escritorio'
  );
});

test('el tablero detenido no anima ni reserva capas en movil', () => {
  const block = withoutComments(mobileBlock);
  const base = withoutComments(desktopCss);

  /* Reposo son los simbolos sin premio, sin `pop`, sin `scatter` y sin caida:
     ese es el estado en el que el jugador mira el tablero sin que pase nada. */
  assert.match(
    block,
    /\.tile:not\(\.tile--win\):not\(\.tile--pop\):not\(\.tile--scatter\):not\(\.tile--drop\)\s*:is\(\.tile__img, \.tile__glyph, \.tile__bomb-value\)\s*\{\s*animation:\s*none\s*!important;\s*will-change:\s*auto\s*!important;\s*\}/,
    'La onda `softWave` de los simbolos debe pararse con el tablero quieto'
  );
  assert.match(
    block,
    /\.tile:not\(\.tile--win\):not\(\.tile--pop\):not\(\.tile--scatter\):not\(\.tile--drop\)\s*\{\s*will-change:\s*auto\s*!important;\s*\}/,
    'La casilla en reposo no debe reservar capa de composicion'
  );
  assert.match(
    block,
    /\.tile:not\(\.tile--win\)::after\s*\{\s*will-change:\s*auto\s*!important;\s*\}/,
    'El resplandor apagado no debe prometer una capa por casilla'
  );
  assert.match(
    block,
    /\.tile\[data-sym="SC"\]::before\s*\{\s*animation:\s*none\s*!important;\s*\}/,
    'El barrido de la medalla del scatter tambien se para en movil'
  );

  /* Y la onda no se vuelve a declarar dentro del condicional: si alguien anade
     un `animation: softWave` aqui, el ahorro desaparece sin que se note. */
  assert.equal(
    block.includes('softWave'),
    false,
    'El bloque movil no puede re-declarar la onda del tablero'
  );

  /* Escritorio: las animaciones siguen declaradas en la hoja base, tal cual. */
  assert.match(
    base,
    /\.tile__img,\s*\.tile__glyph,\s*\.tile__bomb-value \{[^}]*animation: softWave var\(--wave-duration, 2\.8s\) ease-in-out infinite;/,
    'La onda del tablero sigue viva en escritorio'
  );
  assert.match(
    base,
    /\.tile--win \{\s*animation: tile-win 0\.46s ease-in-out infinite alternate;/,
    'Las casillas premiadas siguen latiendo en escritorio'
  );
  assert.match(
    base,
    /\.tile--scatter \{\s*animation: tile-scatter 0\.8s ease-in-out infinite alternate;\s*\}/,
    'El scatter sigue latiendo en escritorio'
  );
  assert.match(
    base,
    /\.tile::after \{[^}]*will-change: opacity;/,
    'El resplandor de escritorio conserva su capa reservada'
  );
  assert.match(
    base,
    /\.tile\[data-sym="SC"\]::before,\s*\.tile\[data-sym="MX"\]::before \{[^}]*animation: logo-tile-sheen 3\.6s linear infinite;/,
    'La medalla de escritorio sigue barriendo la banda de luz'
  );
});

