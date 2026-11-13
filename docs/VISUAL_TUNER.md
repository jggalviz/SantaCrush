# Inspector visual de maqueta (`visual-tuner`)

Herramienta de **desarrollo** para ajustar a ojo la posición de cualquier
elemento de la interfaz (botones, placas, textos) sin tocar la hoja de estilos a
ciegas: se selecciona, se arrastra y, al final, se copia el CSS generado.

No forma parte del juego: no se carga en producción, no pide datos y no pesa en
el presupuesto de `public/ui` (`test/assetBudget.test.js`). Vive aislada en
`public/dev/visual-tuner.js` y `npm run build:dist` la deja fuera del paquete de
integración.

## Enchufarla

Una línea antes de cerrar `</body>`, **después** de `/ui/main.js`:

```html
<script type="module" src="/dev/visual-tuner.js"></script>
```

En este repo la etiqueta ya está escrita y comentada al final de
`public/index.html`: se descomenta para trabajar y se vuelve a comentar antes de
publicar (`npm run build:index` refresca `server/generated/indexHtml.js`).
Mientras esté comentada, el jugador no descarga ni un byte.

## Usarla

| Acción | Efecto |
| --- | --- |
| `index.html?edit=1` | Entra en modo edición al cargar |
| `Alt + E` | Enciende / apaga el inspector |
| Clic en un elemento | Lo selecciona; si cae en un texto o un icono, sube al control que lo contiene |
| `Ctrl` + clic | Pasa a la siguiente capa apilada en ese punto |
| `Ctrl` + `Shift` + clic | Vuelve a la capa anterior de la pila |
| Escribir un selector + `Enter` | Salta a ese elemento y lo carga en el panel |
| Escribir un selector + `Escape` | Devuelve el selector del elemento en curso |
| Arrastrar con el puntero | Mueve el elemento con `translate` |
| Flechas / `Shift` + flechas | Ajuste de 1 px / 10 px |
| `Escape` | Suelta la selección; si no hay, sale del modo |
| Reset | Devuelve el elemento seleccionado a su sitio |
| Copiar CSS generado | Portapapeles + vista previa en el panel |

El campo del selector es un `<input>` de verdad: al seleccionar con el ratón se
rellena solo, y si escribes otro selector (vale cualquiera de CSS: `#id`,
`.clase`, `main .board > button`, `[data-sym="BO"]`…) y pulsas `Enter`, el panel
salta a ese elemento, lo resalta y lo carga para moverlo. Si el selector no
existe o es inválido, el campo se marca en rojo un instante y no pasa nada más
(ni excepción ni página rota); `Escape` en el campo recupera el selector del
elemento en curso sin cerrar el modo. Un clic sobre el campo selecciona su texto
para copiarlo o sobrescribirlo.

### El control, no el trozo

Pinchar el texto `AUTOGIRO` de un botón o el icono de una flecha no selecciona
ese `<span>` ni ese `<svg>`: el inspector sube por el árbol con `.closest()`
hasta el control más cercano y carga **ese**. La lista de lo que cuenta como
control está en `CONTROL_SELECTOR` (`public/dev/visual-tuner.js`):

- etiquetas de acción y de formulario: `button`, `a[href]`, `input`, `select`,
  `textarea`, `summary`, `label`;
- roles accesibles: `[role="button"]`, `[role="tab"]`, `[role="switch"]`,
  `[role="option"]`… y cualquier `[tabindex]` distinto de `-1`;
- atributos de control de la maqueta: `[data-spins]` (los chips `x5`/`x10`/`x25`
  de AUTOGIRO), `[data-fever-spins]` (los paquetes de la hoja de giros),
  `[data-value]`, `[data-action]`, `[data-sym]`, `.btn`, `.btn__opt`,
  `.btn-spin-option` (la clase común de los chips del autogiro).

Los manejadores de clic no se pueden leer desde CSS, así que se reconocen por su
rol: un `<div onclick>` sin `role` ni `tabindex` no se detecta y se selecciona
tal cual. Para no acabar moviendo media pantalla se descartan dos casos: un
control que ocupe casi toda la ventana (`CONTROL_MAX_VIEWPORT_RATIO`) y
`<html>`/`<body>`, que arrastrarían la página entera.

Al exportar, el selector sale del rasgo más estable del nodo, en este orden:
`#id`, un `data-*` de control con valor único (`[data-spins="10"]`,
`[data-fever-spins="20"]`, `[name="bet"]`), `tag.clase` y, solo si hace falta,
`padre > hijo`. Así se evitan cadenas largas del tipo
`.machine__side .controls > span:nth-of-type(2)`, que se rompen al mover el
bloque de sitio o al añadir un botón.

Cada pieza se mueve por separado: el chip `x10` se selecciona con su propio
`[data-spins="10"]` y el botón amarillo con `#btn-feature`. Si se quiere el
contenedor de arriba, `Ctrl` + clic.

### Capas solapadas: `Ctrl` + clic

En una maqueta casi nunca se quiere el nodo de arriba: sobre una placa suele
haber un velo transparente, un `::before` convertido en `div` o el contenedor
que lo envuelve todo. `Ctrl` + clic (en Mac, `⌘` + clic) no se queda con la capa
más superficial: recorre **la pila de ese punto** (`document.elementsFromPoint`)
y salta a la siguiente, que normalmente es el padre inmediato, el hermano o el
texto que hay debajo. Repitiendo el gesto se sube por la pila y, al llegar
arriba, se vuelve al principio; con `Ctrl` + `Shift` + clic se retrocede.

El pie del panel lo va diciendo: al ciclar cambia un instante de
`Ctrl + clic = capas` a `capa 2/5`, así se sabe en qué punto de la pila se está.
Quedan fuera de la pila la propia herramienta, `<html>`, `<body>` (desplazarlo
arrastraría la página entera), los nodos sin área visible (0×0,
`display: none`) y las capas que solo son estructura. Ninguna se puede resaltar
ni mover: un envoltorio transparente (sin texto propio, fondo, borde ni sombra)
se atraviesa de golpe, así el ciclo salta de un botón al siguiente y no se para
en `.controls` o en `.machine__side` cuando no pintan nada.

Truco: no hace falta acertar a la primera. Si el contenedor que se busca está
debajo de tres capas, tres `Ctrl` + clic seguidos lo dejan seleccionado; y si al
final era un hijo, se vuelve a él escribiendo su selector en el campo del panel.
El gesto se puede combinar con el arrastre: `Ctrl` + arrastrar mueve la capa a la
que se acaba de saltar, no la de arriba.

## Exportar el resultado

El botón deja en el portapapeles una regla por elemento movido, con el selector
más corto que identifique al nodo:

```css
/* visual-tuner · 390x844 */

#btn-spin {
  transform: translate(4px, -8px);
}
```

Se pega en `public/src/css/style.css` (o `theme.css` si es una pieza de marca) y
se reconstruye con `npm run build:css`. Los elementos sin desplazamiento no se
exportan, así que se puede mover media interfaz y pegar solo lo que cambió.

## Afinar el texto, no el botón

El inspector mueve controles (`#btn-auto`, `.btn__opt`…), que es lo correcto
para colocar la placa o el chip. Para el **rótulo de dentro** —la tinta que
debe quedar ópticamente centrada en una cápsula ya colocada— no hace falta
tocar el CSS a ciegas: los pulsadores leen el token `--btn-text-dy`
(`0px` por defecto), que solo desplaza el texto y nunca la caja.

```css
#btn-auto { --btn-text-dy: -1px; }   /* sube el rótulo 1 px */
.btn__opt { --btn-text-dy: 0.5px; }  /* baja los chips medio píxel */
```

El rótulo de `AUTO` de la consola móvil lo pinta su `::after` y hereda el mismo
token, así que un solo valor afina las dos maquetas. Los nodos son
`.btn__title` (botones) y `.btn__text` (chips); el texto nunca va suelto.

## Desenchufarla

- Volver a comentar la etiqueta del HTML: no se descarga nada.
- `visualTuner.destroy()` desde la consola: desmonta el panel, quita el atajo y
  devuelve cada `transform` a su valor original.
- `npm run build:dist` no la copia; si tampoco se quiere en el CDN, basta con
  borrar `public/dev/`.

## Detalles de diseño

- Cero dependencias y ESM puro: `test/visualTuner.test.js` vigila que no entren
  `import`, `require`, `fetch`, `localStorage` ni rutas de API.
- La CSP `script-src 'self'` obliga a cargarlo como archivo (nunca inline); los
  estilos del panel entran por `style-src 'unsafe-inline'`.
- El desplazamiento se escribe inline con `!important` para ganar a la hoja del
  proyecto, y el panel recuerda el `transform` original de cada elemento para
  poder deshacerlo.
- Los selectores priorizan `#id` y esquivan clases de estado (`is-*`, `active`,
  `hidden`...), de modo que el CSS exportado siga valiendo sin la herramienta.
- `Alt + E` se escucha siempre (un único `keydown`); el resto de listeners solo
  existen mientras el modo está activo.
