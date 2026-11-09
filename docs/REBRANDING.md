# Rebranding a Meridianobet Crush (rojo / oro / azul de consola)

> **Estado actual: Santa Crush.** Este documento es el registro del primer
> rebranding (Meridianobet Crush) y se conserva como bitacora: donde diga
> `meridianobet` / `MeridianoBet Crush` hay que leer el token y el nombre
> vigentes, `santa-crush` y **Santa Crush**.
>
> | Elemento | Antes | Ahora |
> | --- | --- | --- |
> | Nombre visible (`title`, `h1`, `alt` del logo, `meta description`) | MeridianoBet Crush | Santa Crush |
> | `GAME.name` / `FEATURE.label` (`config/gameConfig.js`) | Tropical Grid 6x5 / Meridiano Crush | Santa Crush |
> | Token de tema (`<html data-theme>`) y prefijo de `theme.css` | `meridianobet` | `santa-crush` |
> | Clave de sesión en `localStorage` (`ui/services/SessionManager.js`) | `tg65.session.v1` | `santacrush.session.v1` |
> | Nombres de símbolos especiales (`ui/lib/format.js`) | Logo/Moneda MeridianoBet | Logo/Moneda Santa Crush |
> | Rutas del arte de marca | `public/src/assets/**` | `public/assets/santa-crush/**` (declaradas en `GAME_CONFIG.assets`, ver [`ASSETS.md`](ASSETS.md)) |
>
> El arte bitmap (fondos, consola, logo, símbolos, MP3) **sigue siendo el
> anterior**: se reexportará al árbol nuevo y hasta entonces la portada sigue
> sirviendo `public/src/assets/**`. Ver [`ASSETS.md`](ASSETS.md).
>
> Lo que **no** cambia: el `code` del motor (`TROPICAL_GRID_6X5_95_10K`), la
> matemática, la API y las claves de `localStorage` del backend. El rebranding es
> identidad + rutas, nunca lógica.

La interfaz esta partida en dos capas para poder cambiar la identidad visual
**sin tocar la logica del juego** ni el pipeline de cache:

| Capa | Archivo | Se edita para |
| --- | --- | --- |
| Maqueta base | `public/src/css/style.css` | Geometria, arte (marcos, consola), animaciones |
| Marca | `public/src/css/theme.css` | Paleta, acentos, superficies, tipografia, relieve |

`theme.css` se carga **despues** de `style.css` (ambos en `public/index.html`,
minificados como `theme.min.css` / `style.min.css` por `npm run build:css`) y
todos sus selectores llevan el prefijo `html[data-theme="meridianobet"]`, asi
que ganan por especificidad sin `!important` y sin duplicar la maqueta.

## Que puede repintar el tema (y que no)

No todo el juego es CSS. La ultima capa de `style.css` viste la maquina con
**arte bitmap** colocado por porcentajes medidos sobre cada dibujo, asi que hay
que distinguir dos grupos antes de tocar nada:

| Superficie | Como se pinta | Editable desde `theme.css` |
| --- | --- | --- |
| Boton "Fichas de Prueba", capsula de audio, modal, anillo de foco | CSS | **Si** |
| Marco interior del tablero (`.board`, `.tile`) | Gradientes CSS | **Si** |
| Carcasa de controles, placas y botones (escritorio) | Recortes de `console/console-desktop.webp` | No: reexportar arte |
| Nube del logo (`.machine__hero`, escritorio) | `console/console-desktop.webp` | No: reexportar arte |
| Marco del tablero (escritorio) | `console/slot-frame.webp` | No: reexportar arte |
| Carcasa movil (`.machine__table`, `.controls`) | `console/slot-frame-mobile.webp`, `console/console-mobile.webp` | No: reexportar arte |
| Fondo de escenario y logotipo | `assets/santa-crush/bg/bg-desktop.webp` (escritorio) / `assets/santa-crush/bg/bg-mobile.webp` (movil), `MERIDIANOBET-CRUSH-LOGO.webp` | No: reexportar arte |
| Simbolos del tablero | `public/src/assets/slot/*.webp` (maestros en `design/symbols/*.png`) | No: reexportar arte |

Las 30 casillas se pintan con el **azul de la consola**: `theme.css` define
`--brand-blue` / `--brand-blue-deep` (los mismos tonos que `--gbtn-blue-*` en
`style.css`) y `--brand-blue-ink` para contornos y sombras. Las casillas son
vidrio claro sobre el **panel marino** del tablero, asi la ventana del `d1`
—azul profundo con filo dorado— queda integrada con el arte en vez de abrir un
hueco claro dentro de una maquina oscura.

La barra superior ya no tiene superficie propia: se retiraron la insignia, el
titulo y el vidrio azul, y en su sitio queda una fila transparente con los
controles del juego (fichas de prueba, sonido y ayuda) alineados a la derecha.
El nombre del producto vive en el logo de la maquina, en la pestaña del
navegador y en un `<h1>` oculto (`.sr-only`) para lectores de pantalla. En los
tres sitios el nombre es exactamente `MeridianoBet Crush`: la pestaña ya no
arrastra sufijos tecnicos (`· 6×5 · RTP 95%`); la grilla, el RTP y el tope de
premio se leen en la tabla de pagos y en la ayuda.

El interior del tablero no lo pinta el arte: el hueco del `d1.webp` es
transparente y lo rellena `.board`. `style.css` deja ahi el panel marino de
partida y `theme.css` lo repite con los tokens de marca (brillo de estadio
arriba, reflejo dorado al pie y filo dorado). Las casillas bajan a vidrio con
alfa para que el panel se siga leyendo por detras y el filo blanco translucido
mantiene separadas las 30 celdas.

El modal de reglas y tabla de pagos no es una hoja blanca: `theme.css` lo pinta
como la **consola del juego**, con las mismas cuatro capas del tablero —reticula
de 1 px, brillo de estadio arriba, reflejo dorado al pie y cuerpo marino— mas el
filo de oro en el borde y en un aro exterior. Asi el documento se lee como una
pestaña de la maquina y no como una ventana pegada sobre el arte (el velo del
fondo tambien pasa a marino, para que el escenario siga leyendose detras).

Consecuencia obligada: la tinta es la del panel, no la del modal morado. La capa
base la escribe en crema al 80-90 %, que sobre el marino tambien se pierde, asi
que `theme.css` fija tres tokens `--brand-panel-*` (tinta, azul claro y oro
claro) para titulo, subtitulos, parrafos, listas, `code`, tabla de pagos y
formulario de sesion. `test/frontendAssets.test.js` lee el tramo **mas claro** del
degradado (el peor caso) y recalcula el contraste WCAG de cada par: los tres
pasan de 7:1 incluso en la luz de arriba, y el test falla si alguien devuelve la
tarjeta blanca, la tinta crema o aclara el panel sin revisar la tinta. Las dos
tablas del documento tambien se comprimen por `clamp()` en `style.css` (cifras
siempre en una linea, nombre del simbolo a dos) para que quepan en 320 px sin
scroll horizontal.

Consecuencia practica: los tokens de caramelo de `style.css`
(`--candy-solid-body`, `--candy-solid-wash`, `--candy-rim`, `--candy-depth`,
`--gbtn-*`) **ya no se ven** en la maqueta final: el arte ocupa su lugar. Por eso
`theme.css` no los reasigna: hacerlo no cambiaria un pixel y confundiria al
siguiente que lo lea. Cuando se reexporte el arte con la paleta de marca, esos
tokens se pueden retirar de `style.css` o reutilizarse para las piezas nuevas.

## Activar / desactivar el tema

El tema **ya esta activo**: `public/index.html` abre con

```html
<html lang="es" data-theme="meridianobet">
```

Para volver al look candy original (comparativa o rollback) borra el atributo:

```html
<html lang="es">
```

Despues de editar el HTML:

```bash
npm run build:index     # public/index.html -> server/generated/indexHtml.js
npm start
```

El test `test/deploymentConfig.test.js` falla si te olvidas del `build:index`.

## Paleta

Todo se define una vez, en el bloque `:root` de `theme.css`:

```css
--brand-red: #c8102e;        /* accion, cifras, acentos */
--brand-red-dark: #8f0a1f;   /* bordes y relieve */
--brand-red-soft: #e04a5f;   /* hover / degradados */
--brand-white: #ffffff;      /* superficies */
--brand-grey-50: #f7f8fa;
--brand-grey-100: #eef0f4;
--brand-grey-200: #dcdfe6;   /* bordes */
--brand-grey-700: #4a505b;   /* texto secundario */
--brand-ink: #1b1e23;        /* texto principal */
```

Los tokens historicos del tema base magenta (`--mint`, `--coral`, `--mango`) se
remapean a la paleta de marca dentro del bloque del tema. `--gold` y `--lime` se
dejan **intactos** a proposito: son el color del premio (saldo, simbolo `S9`,
placa MAX) y siguen leyendose bien sobre las superficies nuevas. Si cambia el
rojo corporativo, basta con editar `--brand-red` y sus dos variantes.

Tipografia: `--brand-font` y `--brand-font-display` ya apuntan a los WOFF2
locales (Fredoka / Lilita One, servidos desde `public/src/assets/fonts`). Para
cambiar de familia hay que anadir los `@font-face` en `style.css` y actualizar
estas dos variables; la CSP (`font-src 'self'`) exige servir las fuentes desde
el propio origen.

## Logotipo

1. Deja el maestro en `design/` (fuera de `public/`, no viaja al CDN).
2. Optimiza el asset servido dentro de `public/src/assets/`.
3. Cambia solo el `src` (y el `alt`) de:

```html
<img class="machine__logo" src="/src/assets/MERIDIANOBET-CRUSH-LOGO.webp"
     alt="MeridianoBet Crush" width="480" height="240" fetchpriority="high" />
```

   El tamano reservado (`width`/`height`) evita saltos de layout y declara la
   proporcion real del arte, **2:1** (900 x 450, sin margen transparente). En
   movil la caja del logo (`--logo-w` / `--logo-h` en `style.css`) usa esa misma
   proporcion y la imagen la rellena entera; si se cambia el arte por otro de
   distinta relacion hay que actualizar ambos sitios o el `object-fit: contain`
   devolvera el aire dentro de la caja.
   La caja movil apunta al **78 % del ancho del marco** con un tope por el cielo
   real (`--logo-sky`): en telefonos altos manda el 78 % y el logo se apoya sobre
   la franja alta del marco (Santa, reno y campanas), justo encima del HUD; en
   320 px manda el tope y la pegatina se queda con el aire justo, sin tocar la
   barra superior ni generar scroll horizontal.
   La caja va **centrada en el marco**: `left` reparte el sobrante con el ancho
   real del logo (`--logo-w`), asi que la separacion a los dos filos es la misma
   en cualquier telefono, tambien cuando manda el tope por alto y la caja es mas
   corta que el 78 %.
   Entre **600 y 899 px** (tablets verticales y escritorios pequenos con alto de
   sobra, `min-height: 521px`) el marco se estira hasta la barra superior y su
   unico cielo es ese 22,50 % del arte, asi que la chapa se quedaba corta. Ese
   tramo reserva un aire vertical propio (`--logo-air`: 8 % del alto del
   escenario, 78 px de techo) que se descuenta del alto libre de la maquina via
   `--m-w`; la mitad de arriba entra en `--logo-sky` y el logo sube por encima
   del 38 % del marco (274 px a 768 x 1024, 321 px a 899 x 1200) manteniendo su
   base, la holgura sobre el HUD y el aire bajo la barra superior. El tablero
   pierde como mucho un 8 % de ancho en ese tramo; por debajo de 600 px y por
   encima de 900 px no cambia nada.
   La barra del navegador movil usa la meta `theme-color`, ya en rojo de marca:
   `<meta name="theme-color" content="#c8102e" />`.

   En escritorio (`min-width: 900px`) el logo no va en una tarjeta: flota sobre
   la franja de Santa y el reno de `console-desktop.webp`, centrado en el
   50 % / 12,8 % de ese lienzo, con el 58 % del ancho del recorte. La animacion
   (`pana-logo-breathe`, sube 7 px y escala un 3 %) no llega a la fila de
   caramelos ni al HUD (33,2 %). En ventanas bajas (`max-height: 660px`) el
   lienzo se queda en ~340 px de ancho y el logo baja al 54 %.

La consola de escritorio mantiene el reparto de Meridianobet: el **GIRAR** rojo
en la capsula inferior derecha (x 51,68-89,34 % · y 79,96-88,51 %), el
**AUTOGIRO** en la inferior izquierda (x 10,18-47,74 %) y el **AUTO** azul en la
banda libre del panel verde (x 24-76 % · y 67,6-77,2 %). El lienzo no dibuja un
septimo pulsador ni los chips del autogiro: los tres paquetes (`x5`, `x10`,
`x25`) son **pulsadores propios** dentro de un recuadro hundido que ocupa la mitad
derecha del caramelo (x 28,70-47,42 %), hermanos del boton y no hijos suyos —un
boton dentro de otro boton no es marcado valido ni enfocable—. Las dos mitades no
se pisan por construccion: la caja del rotulo acaba en el 28,10 % (el aire derecho
de `#btn-feature`) y el selector arranca en el 28,70 %, asi que `AUTOGIRO` se lee
entero a cualquier ancho, con el cuerpo calculado para que la elipsis no llegue a
dispararse. El GIRAR lanza la tirada y, con el bucle en marcha, la detiene; el
amarillo abre la hoja con el coste de cada paquete y el azul juega el elegido. En
movil el selector no cabe en la placa del pie (~48 px): alli la placa muestra fijo
el paquete vigente y los tres paquetes se eligen en la hoja del amarillo.

Pendiente de arte (ver la tabla de alcance): los simbolos del tablero. El arte
navideño del tema ya cubre las dos maquetas: el taller de juguetes de fondo
(`bg-desktop.webp` apaisado y `bg-mobile.webp` vertical), el marco de caramelos
del escritorio (`slot-frame.webp`), el marco de campanas doradas del movil
(`slot-frame-mobile.webp`) y las dos consolas (`console-desktop.webp`, que funde
a Santa y el reno con las tres placas y los mandos, y `console-mobile.webp`, el
panel con Santa y reno del que cuelgan los cinco discos y la fila de capsulas).
Los simbolos siguen siendo los deportivos originales.

Los simbolos del tablero (once WebP en `public/src/assets/slot/`) se mapean en
`ui/lib/format.js` (`SYMBOL_IMAGE_PATH`). `s1.webp` .. `s9.webp` son los nueve
regulares, en el mismo orden que los tramos de la tabla de pagos (s1 = S1, el
mas comun, ... s9 = S9, el mas raro); `s10.webp` cae como scatter (SC) y
`s11.webp` como multiplicador (MX), y los dos son **el mismo sello circular de la
marca**. Si se sustituyen por otra iconografia, hay que conservar los nombres
`s*.webp` o actualizar ese mapeo; `test/frontendAssets.test.js` valida que las 11
imagenes existan.

Los PNG maestros viven en `design/symbols/` y `npm run build:symbols` los
convierte a WebP (alfa sin perdida, mismo lienzo de 335 x 341 px): 1,42 MB de
PNG pasan a 0,31 MB sin tocar el dibujo ni la geometria de las casillas.

Los dos sellos de marca (`s10.png` y `s11.png`) no se editan a mano: los deriva
`npm run build:seals` del unico maestro `design/MBETN-LOGO@3x.png`. Ese PNG trae
**fondo blanco opaco** (el arte se dibujo sobre blanco, no sobre alfa), asi que
el script lo convierte en transparencia con el inverso del alpha blending
(`a = 255 - min(r, g, b)`) en vez de recortarlo: los bordes del aro y de las
letras conservan su antialias. Despues repone el **relleno interior del disco al
90 % de opacidad** (`rgba(255, 255, 255, 0.9)`) componiendo la tinta encima con
un `source-over`, de modo que los rayos dorados de la casilla
(`logo-tile-sheen`) se filtran un 10 % por dentro del aro sin perder
legibilidad; fuera del circulo el lienzo sigue transparente.

* `s10.png` (scatter) y `s11.png` (multiplicador): **el mismo sello circular**,
  con la moneda, la `m`, el `Bet` y el texto interior (`JUEGA | GANA |
  #COBRASEGURO`) dentro del aro rojo, y **sin el planeta del logo anterior**.
  Sale 1:1 en el lienzo de 335 x 341 (335 x 335 de tinta, 3 px de aire arriba y
  abajo), sin sangrado ni recorte de aire: `--logo-bleed: 0%` y
  `object-view-box: inset(0)` en `style.css`. El build escribe el sello una vez y
  copia el mismo PNG a los dos maestros, asi que no pueden divergir; lo que
  distingue a `MX` en el tablero es la etiqueta del valor (2x .. 250x), no el
  arte.

El logotipo del planeta (`s10-planeta.png`) se conserva fuera del flujo del
build en `design/legacy/` (los maestros publicables son los `s*.png` de
`design/symbols`), y `test/frontendAssets.test.js` mide sobre los WebP servidos
que los dos sellos sean identicos, que las esquinas sigan transparentes, que el
disco blanco llegue al 90 % de opacidad, que no quede fondo blanco opaco ni un
solo pixel del globo terraqueo.

El multiplicador (MX) ya no usa el caramelo de `symbols/candy_4.png` ni un arte
propio: cae con el mismo sello de marca (`s11.png`, derivado de
`design/MBETN-LOGO@3x.png`) y se pinta con su valor encima (2x .. 250x). El set
de caramelos se retiro de `public/` para no publicar ~7 MB que el cliente nunca
descargaba.

Ese set **si es deportivo**, igual que el marco (`d1`/`d2`) y los fondos:
balones de beisbol, futbol, tenis, futbol americano, basquet, golf, voley, la
bola 8, la bola de bolos y los dos sellos de la marca (el mismo sello circular). Un test
(`los simbolos del tablero giran con los balones de la carpeta slot`) falla si
el mapa vuelve a los caramelos, si cambia el orden s1..s9 o si apunta a otra
carpeta. `ui/` es la fuente: `npm run build:ui` materializa el espejo byte a
byte de `public/ui/`.

## Textos y componentes

| Zona | Archivo |
| --- | --- |
| Cabecera, HUD, botones, modal | `public/index.html` |
| Renderer del tablero, HUD, modal de reglas, overlay WIN | `ui/renderers/GameView.js` |
| Efectos (chispas, lluvia de monedas, cartel de premio) | `ui/renderers/fx.js` |
| Niveles de premio y umbrales | `ui/lib/winLevel.js` |
| Formato de importes | `ui/lib/format.js` |
| Estilos | `public/src/css/style.css` + `public/src/css/theme.css` |

Reglas de arquitectura que **no** se deben romper (`test/uiArchitecture.test.js`):
`ApiClient` es el unico modulo con red, `GameController` no toca el DOM, y los
renderers solo pintan el payload del servidor (la cifra final siempre viene del
backend).

## Cache y publicacion

- `public/ui/**` es un espejo generado desde `ui/`: tras editar `ui/` ejecuta
  `npm run build:ui` (o `npm start`, que lo hace en `prestart`). El test
  `uiArchitecture.test.js` falla si el espejo queda desactualizado.
- Ningun asset lleva hash en el nombre: Express sirve `public/**` con
  `Cache-Control: no-cache` y `vercel.json` revalida `/src/(.*)` y `/ui/(.*)`.
  Un cambio de CSS o JS se ve al recargar; no hay que tocar versiones.
- `theme.css` vive en `public/src/css/`, cubierto por la regla `/src/(.*)` de
  `vercel.json`, asi que hereda la misma politica sin cambios de configuracion.

## Checklist al terminar el rebranding

1. `html data-theme="meridianobet"` en `public/index.html` (ya puesto).
2. `npm run build:index && npm run build:ui && npm run build:config`.
3. `npm test`: la unica familia de tests que fija la identidad candy es
   `test/frontendAssets.test.js` (respaldo `#0a1c4a`, fondo de escritorio
   `fondo_desk_meridino_crush.webp`, arte `d1/d2` y geometria del marco). Esas
   aserciones describen la maqueta base; si el rebranding tambien cambia el arte,
   hay que actualizar esos valores en el test junto con `style.css`. El mismo test
   comprueba que `theme.css` siga siendo CSS plano, sin `!important`, con prefijo
   de tema y sin medidas.
4. Revisar contraste de texto (WCAG AA) sobre blanco y sobre el rojo. Los pares
   del modal de reglas los recalcula `test/frontendAssets.test.js`.
5. `npm start` + `/api/health` deben seguir mostrando `operator.mode =
   LOCAL_VIRTUAL_DEMO` y una ronda completa debe pagar igual que antes: el
   rebranding es solo presentacion.
6. Si se reexportan los assets, actualizar tambien la tabla de alcance de este
   documento y quitar de `theme.css` las excepciones que dejen de aplicar.
