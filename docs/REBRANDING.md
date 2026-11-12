# Rebranding a Meridianobet Crush (rojo / oro / azul de consola)

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
| Carcasa de controles, placas y botones (escritorio) | Recortes de `d2.webp` | No: reexportar arte |
| Nube del logo (`.machine__hero`, escritorio) | `d2.webp` | No: reexportar arte |
| Marco del tablero (escritorio) | `d1.webp` | No: reexportar arte |
| Carcasa movil (`.machine__table`, `.controls`) | `marco_movil.webp`, `consola_movil.webp` | No: reexportar arte |
| Fondo de escenario y logotipo | `fondo_desk_meridino_crush.webp` / `avenida_fantastica_reino_caramelos.webp`, `SANTA-CRUSH-LOGO-ANIMADO.webp` | No: reexportar arte |
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

Los once simbolos se dibujan **a sangre** dentro de su casilla (`100 %` de ancho
y alto con `object-fit: contain`, igual que los sellos de marca `SC`/`MX`): el
panel solo reserva el filo que pide el radio de sus esquinas y el hueco entre
casillas es la linea de separacion, no aire. Asi no queda margen lateral muerto
dentro de la ventana del marco y cada caramelo ocupa el mayor alto que le deja la
casilla (el alto manda porque el dibujo es casi cuadrado y la casilla apaisada).

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

1. Deja el maestro en `design/` (fuera de `public/`, no viaja al CDN): hoy es
   `design/SANTA-CRUSH-LOGO-ANIMADO.gif`, un GIF de 959 x 587 px por fotograma y
   12 fotogramas (2,4 MB).
2. Optimiza el asset servido dentro de `public/src/assets/` con `npm run
   build:logo`, que lo publica como **WebP animado** de 480 x 294 px (~267 KB):
   conserva los 12 fotogramas, sus retardos y el bucle infinito, y se reproduce
   solo dentro del `<img>` (no hace falta JS ni un sprite CSS con `steps()`).
3. Cambia solo el `src` (y el `alt`) de:

```html
<img class="machine__logo" src="/src/assets/SANTA-CRUSH-LOGO-ANIMADO.webp"
     alt="Santa Crush" width="480" height="294" fetchpriority="high" />
```

   El tamano reservado (`width`/`height`) evita saltos de layout y declara la
   proporcion real del arte, **959:587** (1,6337, sin recortar el alfa). En
   movil la caja del logo (`--logo-w` / `--logo-h` en `style.css`) usa esa misma
   proporcion y la imagen la rellena entera; si se cambia el arte por otro de
   distinta relacion hay que actualizar ambos sitios o el `object-fit: contain`
   devolvera el aire dentro de la caja.
   La caja movil apunta al **84 % del ancho de la maquina** y vive en su propia
   fila de la rejilla (`grid-template-areas: "logo" "frame" "console"`). Desde el
   marco de baston de caramelo (`marco_movil.webp`, 1244 x 1216) el arte ocupa la
   franja superior de tapa a tapa —Santa, reno, campanas, tren y casa de
   jengibre—, asi que ya no queda cielo donde pegar la chapa: el logo entra en el
   reparto vertical con su relacion alto/ancho (0,4407, caja 959:587 al 84 %).
   El ancho de la maquina ya no se recorta para que quepa todo: `--m-w` es
   siempre `100cqw`, y lo que cede cuando el viewport es bajo es el chrome. En
   los escalones `1bis` de `style.css` bajan `--logo-k` (escala la chapa) y
   `--console-k` (escala la consola entera) y `--logo-max` pone un techo en `cqh`
   al alto de la caja del logo, de modo que el marco y la consola siguen tocando
   los dos filos y la grilla 6 x 5 no se deforma.
   La chapa se **apoya sobre el adorno superior del marco**: `.machine__hero`
   lleva `align-self: end` y un margen inferior negativo de `--logo-drop` (1,6 %
   de `--m-w`, 6 px a 390 px de ancho), asi que la base de la pegatina toca el
   dibujo en vez de flotar sobre una franja de fondo. Ese solape devuelve alto al
   reparto y es lo que paga el salto del 72 % al 84 % de ancho.
   La caja va **centrada** por la rejilla (`justify-self: center`), asi que la
   separacion a los dos filos es la misma en cualquier telefono.
   La barra del navegador movil usa la meta `theme-color`, ya en rojo de marca:
   `<meta name="theme-color" content="#c8102e" />`.

   El marco y la consola **sangran hasta los dos filos del viewport** en movil.
   `.app` deja `--m-pad-x` en **0** (solo la cabecera conserva su respiro) y
   `.stage` sigue leyendo el token: con 0 su ensanche y su margen negativo quedan
   inertes, y si algun dia se quiere devolver un pelo de aire basta con cambiar
   ese valor. Como `--m-w` se mide con `100cqw`, marco, tablero y consola
   comparten el ancho de la pantalla. El lienzo
   de `marco_movil.webp` (1244 x 1216) llega **recortado al alfa**, sin aire a los
   lados, y se pinta a sangre con `background-size: 100% 100%` sobre una caja con
   su misma relacion: cada % medido sobre el recorte vale tal cual, sin
   estiramientos. (El marco anterior, 1392 x 1038, traia 23 px transparentes por
   lado y necesitaba pintarse al 103,4175 %; ese apaño ya no existe.)
   La ventana del tablero ocupa **7,94 % / 31,96 % / 83,95 % / 61,07 %** y la
   franja del HUD 0,628617 de ancho con arranque 0,270096 y alto 0,07236 del
   marco. El hueco interior mide 83,60 x 60,69 % del lienzo (frente a 83,80 x
   48,50 % del anterior), asi que las casillas de la grilla 6 x 5 pasan de 2,06:1
   a **1,17:1** —casi el 1,14:1 del tablero de escritorio— y los simbolos crecen
   con ellas (44 px de alto a 390 px de ancho, frente a 27 px).
   La **junta marco-consola** tambien va a tope. El dibujo del marco llega con
   tinta hasta su ultimo pixel, pero el recorte de `consola_movil.webp` trae el
   filo de arriba casi vacio (0,8 % de su alto sin tinta y el aro macizo a partir
   del 2,3 %), asi que el `row-gap` de la rejilla se leia como una franja de fondo
   de 11 px entre el bloque del slot y la botonera. Ahora `--row-gap` vale 0 y la
   caja de la consola sube `--joint-tuck` (1,2 % de `--m-w`, 4,7 px a 390 px de
   ancho) con `margin-top` negativo: el solape solo acorta la fila, no toca el
   reparto de `--m-w`, y el saldo descuenta el mismo solape en su `top` para
   seguir clavado en la primera placa del HUD. Medido a 320, 360, 390, 430 y
   768 x 1024: cero franja de fondo y ningun scroll vertical.

Pendiente de arte (ver la tabla de alcance): las carcasas moviles

   En escritorio (`min-width: 900px`) el logo no va en una tarjeta: se pega en el
   hueco azul de la nube que dibuja `d2.webp`, centrado en el 50 % / 21,6 % de ese
   lienzo. La caja mide el **43,2 % del ancho** del lienzo (283 x 141,5 px sobre
   655 x 928), que es el 120 % del 36 % anterior: el interior azul liso de la nube
   mide 397 x 179 px, asi que quedan ~20 px de aire arriba y abajo y la animacion
   (`pana-logo-breathe`, sube 7 px y escala un 3 %) no toca el borde dorado. En
   ventanas bajas (`max-height: 660px`) el lienzo se queda en ~340 px de ancho y el
   logo baja al 39,6 % (120 % del 33 % anterior) con el centro en 21,8 %.

Pendiente de arte (ver la tabla de alcance): las carcasas moviles
(`marco_movil.webp`, `consola_movil.webp`) y los simbolos del tablero. El arte de
escritorio ya es el del tema: el marco (`d1.webp`) y la columna lateral entera
(`d2.webp`, que funde la nube del logo, las placas y la consola en una pieza).
Mientras el movil siga con el arte original, esa vista se lee como "interfaz de
marca dentro del marco candy".

Los simbolos del tablero (once WebP en `public/src/assets/slot/`) se mapean en
`ui/lib/format.js` (`SYMBOL_IMAGE_PATH`). `s1.webp` .. `s9.webp` son los nueve
regulares, en el mismo orden que los tramos de la tabla de pagos (s1 = S1, el
mas comun, ... s9 = S9, el mas raro); `s10.webp` cae como scatter (SC) con el
emblema **BONO** y `s11.webp` como multiplicador (MX) con el **sello del
regalo**. Son dos dibujos distintos a proposito: el bono no se confunde con el
valor que lo multiplica. Si se sustituyen por otra iconografia, hay que conservar
los nombres `s*.webp` o actualizar ese mapeo; `test/frontendAssets.test.js`
valida que las 11 imagenes existan y que cada simbolo apunte a la suya.

La URL de cada pieza lleva un sufijo de version (`?v=2`, `SYMBOL_IMAGE_VERSION`
en `ui/lib/format.js`) porque `/src/assets/**` se sirve `immutable` durante un
ano: al repintar el tablero hay que subir ese numero para que el jugador no siga
viendo el arte cacheado.

Los PNG maestros viven en `design/symbols/` y `npm run build:symbols` los
convierte a WebP (alfa sin perdida, mismo lienzo de 335 x 341 px): ~1,8 MB de
PNG pasan a ~0,44 MB sin tocar el dibujo ni la geometria de las casillas.

Los maestros tampoco se editan a mano: `npm run build:slot-art -- --source="<carpeta>"`
importa el arte del disenador, recorta cada pieza al bbox de sus pixeles visibles
y la encaja en el lienzo comun sin deformarla. El mapa nombre -> casilla vive en
`scripts/import-slot-art.js`: `Bono ...png` -> `s10.png` (scatter, SC) y
`Regalo ...png` -> `s11.png` (multiplicador, MX), y los nueve regulares llegan ya
numerados `s1.png` .. `s9.png`. El emblema BONO es la pieza mas densa del set y
a q=82 se pasaba del tope de 48 KB, asi que `build-symbols.js` le baja la calidad
a 76 (unica excepcion por pieza); el resto del set sigue a q=82.

`scripts/build-brand-seals.js` queda como herramienta historica del sello
anterior (derivaba los dos maestros del unico `design/MBETN-LOGO@3x.png`
convirtiendo su fondo blanco en alfa): **ya no alimenta el tablero** y ejecutarlo
sobrescribe `s10`/`s11` con el sello viejo, asi que despues habria que repetir
`build:slot-art` y `build:symbols`. `test/frontendAssets.test.js` mide sobre los
WebP servidos el lienzo comun, el alfa real (esquinas transparentes) y que `s10`
y `s11` sean dos piezas distintas.

El multiplicador (MX) ya no usa el caramelo de `symbols/candy_4.png`: cae con el
sello del regalo (`s11.png`) y se pinta con su valor encima (2x .. 250x). El set
de caramelos se retiro de `public/` para no publicar ~7 MB que el cliente nunca
descargaba.

Ese set **si es deportivo**, igual que el marco (`d1`/`d2`) y los fondos:
balones de beisbol, futbol, tenis, futbol americano, basquet, golf, voley, la
bola 8, la bola de bolos y las dos piezas de marca (el emblema BONO del scatter
y el sello del regalo del multiplicador). Un test
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
- Las dos hojas se enlazan versionadas: `build:css` sella `index.html` con
  `?v=<10 hex del SHA-256 del .min.css>` (p. ej. `style.min.css?v=e24a5d1c3b`).
  `Cache-Control` sigue siendo `no-cache`/`must-revalidate` (`vercel.json`
  revalida `/src/(.*)` y `/ui/(.*)`), pero el sello cambia la URL en cada
  edicion, asi que ni una pestaña abierta, ni el `bfcache` de iOS, ni el proxy
  del operador, ni el CDN pueden devolver el diseño anterior. Lo escribe
  `npm run build:css` (o cualquier `npm run build`) y `cssBuild.test.js` falla
  si no coincide con el hash del archivo: no hay que tocarlo a mano.
- El resto de assets no lleva hash en el nombre (`main.js`, el arte): Express
  sirve `public/**` con `Cache-Control: no-cache` y `vercel.json` revalida
  `/src/(.*)` y `/ui/(.*)`. `src/assets/**` va con un año e `immutable`, asi que
  reemplazar un archivo de arte exige cambiarle el nombre.
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
