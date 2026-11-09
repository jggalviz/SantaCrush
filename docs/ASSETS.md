# Assets de Santa Crush

Estructura temática del arte de **Santa Crush**. Las rutas oficiales viven en
`config/gameConfig.js` → `ASSETS` (bloque `2b. RUTAS BASE DE ASSETS DEL TEMA`),
que se publica al navegador como `GAME_CONFIG.assets`; nada más debe repetir la
cadena `/assets/santa-crush/`.

```
public/assets/santa-crush/
├── bg/
│   ├── bg-desktop.webp        fondo de escritorio (body, >= 900 px)
│   └── bg-mobile.webp         fondo de móvil, vertical (<= 899 px)
├── console/
│   ├── slot-frame.webp        marco de caramelos del tablero (escritorio)
│   ├── console-desktop.webp   marco y decoración de la consola (escritorio)
│   ├── slot-frame-mobile.webp marco de campanas doradas del tablero (móvil)
│   └── console-mobile.webp    panel de mandos móvil (Santa y reno, discos y cápsulas)
├── tiles/
│   ├── tile-1.webp            símbolos del tablero (orden = s1..s6 del motor)
│   ├── …
│   └── tile-6.webp
└── audio/
    ├── bgm-holiday.mp3        bucle ambiental
    ├── win-applause.mp3       aplausos de victoria
    └── click.mp3              clic de interfaz
```

## Estado

La **versión de escritorio ya sirve el arte navideño** de este árbol:
`bg/bg-desktop.webp` (taller de juguetes, 1672 x 941), `console/slot-frame.webp`
(marco de caramelos del tablero, 1305 x 1090) y `console/console-desktop.webp`
(consola de mandos: Santa y el reno, tres placas del HUD, fila −/lectura/+/MAX y
los dos pulsadores grandes, 1041 x 1497). Los genera
`npm run build:theme-art` desde los maestros `design/bg_desktop_toy_workshop.png`,
`design/frame_desktop_candy.png` y `design/console_desktop_buttons.png`.

La **versión móvil (< 900 px) también sirve el arte navideño** del árbol:
`bg/bg-mobile.webp` (taller de juguetes vertical, 941 x 1672, q=76),
`console/slot-frame-mobile.webp` (marco de campanas doradas con las tres placas
del HUD y la ventana del tablero, 1447 x 1076, q=86) y `console/console-mobile.webp`
(panel con Santa y reno: discos CRUSH · AUTO · GIRAR · − · + y la fila de cápsulas
del pie, 1775 x 879, q=86), que es la carcasa de la consola móvil: los mandos son
áreas táctiles transparentes sobre sus discos y sus cápsulas. Los genera el mismo
`npm run build:theme-art` desde `design/bg_mobile_toy_workshop.png`,
`design/frame_mobile_gold_bells.png` y `design/console_mobile_santa_reindeer.png`.

La consola es arte en los dos viewports: cada pulsador del DOM es una ventana al
recorte del lienzo (`--art-x/--art-y/--art-w/--art-h`), de modo que la tecla se ve
exactamente como el dibujo y no se pinta ninguna cápsula encima. El único mando
que ninguno de los dos lienzos dibuja es el **GIRAR grande de escritorio**, que se
pinta con CSS en la banda verde libre del panel: x 12–88 % · y 67,4–77,6 % del
recorte de `console-desktop.webp`.

El CSS pinta las piezas en uso a sangre sobre cajas con su relación exacta y ancla
las capas en % del recorte medido (bloques *ESCRITORIO (≥900 px) · ARTE NAVIDEÑO
DEL TEMA* y *MARCO Y CONSOLA · la máquina móvil…* de `public/src/css/style.css`).

El resto de piezas siguen siendo las de `public/src/assets/**`
(`MERIDIANOBET-CRUSH-LOGO.webp`, `slot/s1..s11.webp` y los MP3); las corazas
anteriores del móvil (`marco_movil.webp`, `consola_movil.webp` y
`avenida_fantastica_reino_caramelos.webp`) ya no las pinta ninguna regla y sus
maestros quedan archivados en `design/`.

## Cómo cambiar el arte

1. Dejar los maestros (PNG/JPG grandes) en `design/`, **nunca** en `public/`:
   todo lo que entra en `public/**` se publica en el CDN.
2. Optimizar con los scripts de arte (`npm run build:bg`, `build:logo`,
   `build:symbols`, `build:seals`, `build:win`, `build:art`, `build:desktop-art`,
   `build:theme-art`) y escribir el WebP final en la carpeta correspondiente de
   este árbol, respetando el nombre exacto que declara `ASSETS`.
3. Apuntar los consumidores a `GAME_CONFIG.assets`:
   - `ui/lib/format.js` (imágenes del tablero y símbolos especiales),
   - `ui/audio/sfx.js` (bucle y efectos),
   - `public/index.html` / `public/src/css/style.css` (fondos y consola; el CSS
     no puede leer JS, así que ahí las rutas son literales y el test
     `test/frontendAssets.test.js` las fija).
4. Regenerar y validar:

```bash
npm run build:config   # ui/config + public/ui/config desde config/gameConfig.js
npm run build:ui
npm run build:index    # public/index.html -> server/generated/indexHtml.js
npm run build:css
npm test
```

## Reglas

- **Nombres = contrato.** `ASSETS` es la fuente de verdad; si un archivo cambia
  de nombre, se actualiza ahí y se corren los tests.
- **WebP con alfa** para todo lo que se pinta sobre el fondo; los fondos van
  opacos y sin recortes (el CSS los pinta con `cover` + `center`).
- **Presupuesto**: `public/src/assets/**` no pasa de 3 MB y cada símbolo de
  48 KB (`test/assetBudget.test.js`). El árbol nuevo hereda esos topes.
- **Caché**: `/assets/(.*)` y `/src/assets/(.*)` se sirven un año con
  `immutable` (CDN y servidor local); por eso el nombre de un asset no puede
  cambiar de contenido sin cambiar de nombre.
