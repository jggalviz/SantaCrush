# Assets de Santa Crush

Estructura temática del arte de **Santa Crush**. Las rutas oficiales viven en
`config/gameConfig.js` → `ASSETS` (bloque `2b. RUTAS BASE DE ASSETS DEL TEMA`),
que se publica al navegador como `GAME_CONFIG.assets`; nada más debe repetir la
cadena `/assets/santa-crush/`.

```
public/assets/santa-crush/
├── bg/
│   ├── bg-desktop.webp        fondo de escritorio (body, >= 900 px)
│   └── bg-mobile.webp         fondo de móvil (<= 899 px)
├── console/
│   └── mobile-frame.webp      marco de la consola móvil
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

Las carpetas existen y están versionadas (`.gitkeep`), pero **todavía no hay
archivos**: el arte que se sirve hoy es el vigente de `public/src/assets/**`
(`fondo_desk_meridino_crush.webp`, `avenida_fantastica_reino_caramelos.webp`,
`consola_movil.webp`, `marco_movil.webp`, `MERIDIANOBET-CRUSH-LOGO.webp`,
`slot/s1..s11.webp`, los MP3) y se mantiene hasta que llegue la versión Santa
Crush, para no romper la portada.

## Cómo cambiar el arte

1. Dejar los maestros (PNG/JPG grandes) en `design/`, **nunca** en `public/`:
   todo lo que entra en `public/**` se publica en el CDN.
2. Optimizar con los scripts de arte (`npm run build:bg`, `build:logo`,
   `build:symbols`, `build:seals`, `build:win`, `build:art`, `build:desktop-art`)
   y escribir el WebP final en la carpeta correspondiente de este árbol,
   respetando el nombre exacto que declara `ASSETS`.
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
