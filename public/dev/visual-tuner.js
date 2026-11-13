/**
 * Inspector visual de maqueta (`visual-tuner`).
 *
 * Herramienta de DESARROLLO, autocontenida y sin dependencias: se enchufa con
 * una sola etiqueta en el HTML y se desenchufa borrandola. Vive en
 * `public/dev/`, fuera de `ui/` y de `src/`: no forma parte del juego, no viaja
 * en el paquete de integracion (`npm run build:dist`) y no pide datos, no
 * guarda nada y no toca el DOM hasta que se activa.
 *
 *   <script type="module" src="/dev/visual-tuner.js"></script>
 *
 * Activacion (cualquiera de las dos):
 *   - `index.html?edit=1` (tambien `?edit=true`),
 *   - `Alt + E` en cualquier momento.
 *
 * Con el modo activo:
 *   - clic en cualquier elemento: lo resalta con un contorno punteado y lo
 *     selecciona. Si el puntero cae en un trozo (`<span>`, `<svg>`, texto) sube
 *     con `.closest()` hasta el control que lo contiene (boton, chip
 *     `[data-spins]`, `[role="button"]`, `.btn`...), que es lo que se puede
 *     mover sin descolocar el resto. El clic NO llega al juego (en modo edicion
 *     nada se acciona por accidente);
 *   - `Ctrl + clic` (o `Cmd + clic` en Mac): en vez de quedarse con la capa de
 *     arriba (a veces un velo transparente o el contenedor de la placa) pasa a
 *     la siguiente capa apilada en ese punto: padre, hermano o texto que hay
 *     debajo, ya subida a su control y saltando los envoltorios que solo son
 *     estructura. Repitiendo el gesto se recorre la pila y se vuelve al
 *     principio; con `Ctrl + Shift + clic` se retrocede;
 *   - arrastrar con el puntero: mueve el elemento con `transform: translate()`;
 *   - flechas: 1 px; `Shift` + flechas: 10 px;
 *   - el campo del selector del panel es editable: escribe un selector CSS y
 *     pulsa `Enter` para saltar a ese elemento (se resalta y se carga para
 *     moverlo). Un selector invalido o inexistente solo marca el campo en rojo,
 *     nunca rompe la pagina;
 *   - `Escape` deselecciona; `Alt + E` o la ✕ del panel salen del modo;
 *   - "Copiar CSS generado" deja en el portapapeles una regla por elemento
 *     movido, con selectores legibles (`#id`, `tag.clase`, `padre > hijo`).
 *
 * Como funciona: el desplazamiento se escribe inline en `style.transform`
 * (con `!important`, para ganar a la hoja del proyecto) y el panel recuerda el
 * `transform` inline original de cada elemento para que "Reset" lo devuelva a
 * su sitio. El contorno vive en una capa aparte (`pointer-events: none`), asi
 * que el elemento no se mancha con estilos de la herramienta y el CSS copiado
 * solo contiene el `transform`.
 *
 * Modulo ESM puro: sin `fetch`, sin `localStorage` y sin acceso al backend. Al
 * vivir fuera de `ui/`, `test/uiArchitecture.test.js` no lo vigila; lo suyo lo
 * fija `test/visualTuner.test.js`.
 */

/* --- Contrato de la herramienta ------------------------------------------ */

/** Parametro de URL que enciende el modo edicion. */
const EDIT_PARAM = 'edit';

/** Ids del DOM que crea el componente (todo lo demas va con clases `vt-`). */
const PANEL_ID = 'vt-hud';
const OUTLINE_ID = 'vt-outline';
const STYLE_ID = 'vt-style';

/** Paso fino y paso rapido (con `Shift`) del teclado, en px. */
const STEP = 1;
const STEP_FAST = 10;

/** Cuanto tiene que moverse el puntero para considerarlo arrastre y no clic. */
const DRAG_THRESHOLD = 2;

/** Ayuda del pie del panel: vuelve sola despues del aviso de capa. */
const HINT_TEXT = 'Ctrl + clic = capas';

/** Prefijos y nombres de clase que no describen al elemento (estado efimero). */
const UNSTABLE_PREFIX = /^(?:vt-|is-|has-|js-)/i;
const UNSTABLE_CLASSES = new Set([
  'active',
  'current',
  'disabled',
  'dragging',
  'editing',
  'focus',
  'focused',
  'hidden',
  'hover',
  'open',
  'opened',
  'selected',
  'visible'
]);

/**
 * Controles de la interfaz: al pinchar dentro de uno se sube hasta el con
 * `.closest()` y no se queda con el `<span>`, el `<svg>` o el texto suelto que
 * lleva dentro. Los `data-*` de accion estan porque la maqueta tiene controles
 * que no son `<button>` (los chips `x5`/`x10`/`x25` de AUTOGIRO son
 * `span.btn__opt[data-spins]`). Los manejadores de clic no se pueden leer desde
 * CSS, asi que se reconocen por su rol: `button`, `[role="button"]`, `tabindex`.
 */
const CONTROL_SELECTOR = [
  'button',
  'a[href]',
  'label',
  'select',
  'summary',
  'textarea',
  'input:not([type="hidden"])',
  '[role="button"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="link"]',
  '[tabindex]:not([tabindex="-1"])',
  '[data-spins]',
  '[data-fever-spins]',
  '[data-value]',
  '[data-action]',
  '[data-bet]',
  '[data-sym]',
  '.btn',
  '.btn__opt',
  '.btn-spin-option'
].join(', ');

/**
 * Atributos que identifican a un control, por orden de preferencia, al construir
 * el selector: `[data-spins="5"]` sobrevive a un cambio de clases o de
 * contenedor, mientras que `.machine__side .controls > span` no.
 */
const CONTROL_ATTRIBUTES = [
  'data-spins',
  'data-fever-spins',
  'data-value',
  'data-action',
  'data-sym',
  'data-bet',
  'data-index',
  'data-id',
  'data-name',
  'data-key',
  'name'
];

/** Atributos de herramienta de test que nunca sirven para describir la vista. */
const NOISE_ATTRIBUTES = /^(?:data-vt|data-test|data-qa|data-cy)/;

/** Un control que ocupa casi toda la ventana no es el que se quiere mover. */
const CONTROL_MAX_VIEWPORT_RATIO = 0.6;

/** Lados del borde que se miran para saber si una capa pinta algo. */
const BORDER_SIDES = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'];

/** Niveles maximos de ancestro que se prueban al desambiguar un selector. */
const SELECTOR_DEPTH = 4;

/* --- Utilidades puras (testeables sin navegador) ------------------------- */

/**
 * Indica si la URL pide el modo edicion (`?edit=1`, `?edit=true`, `?edit`).
 *
 * @param {string} [search] `location.search` (con o sin `?`)
 * @returns {boolean}
 */
export function isEditRequested(search = '') {
  const query = String(search).replace(/^\?/, '');
  if (!query) return false;
  const value = new URLSearchParams(query).get(EDIT_PARAM);
  if (value === null) return false;
  const flag = value.trim().toLowerCase();
  return flag !== '' && flag !== '0' && flag !== 'false' && flag !== 'off';
}

/**
 * Redondea a entero y descarta valores no numericos (el `NaN` de un input vacio
 * no debe mover nada).
 *
 * @param {unknown} value
 * @param {number} [fallback]
 * @returns {number}
 */
export function toPx(value, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Compone el `transform` del elemento conservando el que ya tuviera.
 *
 * @param {number} x px en horizontal
 * @param {number} y px en vertical
 * @param {string} [base] `transform` inline previo del elemento
 * @returns {string} valor para `style.transform`
 */
export function composeTransform(x, y, base = '') {
  const extra = String(base || '').trim();
  const shift = `translate(${toPx(x)}px, ${toPx(y)}px)`;
  return extra ? `${shift} ${extra}` : shift;
}

/**
 * Serializa los desplazamientos como reglas CSS limpias.
 *
 * @param {{ selector: string, x: number, y: number }[]} entries
 * @param {{ viewport?: string, date?: string }} [meta]
 * @returns {string} CSS listo para pegar en la hoja; vacio si no hay cambios
 */
export function formatCss(entries = [], meta = {}) {
  const rows = entries
    .filter((entry) => entry && entry.selector && (entry.x !== 0 || entry.y !== 0))
    .map((entry) => [entry.selector, toPx(entry.x), toPx(entry.y)]);

  if (!rows.length) return '';

  const stamp = [meta.viewport, meta.date].filter(Boolean).join(' · ');
  const head = stamp ? `/* visual-tuner · ${stamp} */` : '/* visual-tuner */';
  const blocks = rows.map(
    ([selector, x, y]) => `${selector} {\n  transform: translate(${x}px, ${y}px);\n}`
  );

  return `${[head, ...blocks].join('\n\n')}\n`;
}

/** Escapa un identificador para que el selector sea valido (id con `:` etc.). */
function escapeIdent(value) {
  const text = String(value);
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(text);
  return text.replace(/([^\w-]|^\d)/g, '\\$1');
}

/** Clase que describe al elemento y no un estado efimero del momento. */
function isStableClass(name) {
  return !UNSTABLE_PREFIX.test(name) && !UNSTABLE_CLASSES.has(String(name).toLowerCase());
}

/** Tramo `tag#id` / `tag.clase` / `tag` de un nodo, sin ancestros. */
function localStem(node) {
  const tag = node.tagName.toLowerCase();
  if (node.id) return `#${escapeIdent(node.id)}`;
  const classes = Array.from(node.classList || []).filter(isStableClass).slice(0, 2);
  return classes.length ? `${tag}.${classes.map(escapeIdent).join('.')}` : tag;
}

/** Escapa el valor de un atributo para `[nombre="valor"]`. */
function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Cuantos nodos casan con un selector. Devuelve `null` cuando no hay documento
 * contra el que contar (en ese caso se da por unico, igual que hace
 * `buildSelector`) y `0` cuando el selector generado no es valido.
 */
function countMatches(documentRef, selector) {
  if (!documentRef || typeof documentRef.querySelectorAll !== 'function') return null;
  try {
    return documentRef.querySelectorAll(selector).length;
  } catch (error) {
    return 0;
  }
}

/**
 * `true` si el nodo es un control de la interfaz (`<button>`, `[role="button"]`,
 * `[tabindex]`, `[data-spins]`, `.btn`...). Decide hasta donde se sube al
 * pinchar y que capas de la pila no se saltan.
 *
 * @param {Element} element
 * @returns {boolean}
 */
export function isControlElement(element) {
  if (!element || element.nodeType !== 1) return false;
  if (typeof element.matches !== 'function') return false;
  try {
    return element.matches(CONTROL_SELECTOR);
  } catch (error) {
    return false;
  }
}

/**
 * Selector de un atributo de control cuando identifica al nodo el solo:
 * `[data-spins="5"]`, `[data-fever-spins="10"]`, `[name="bet"]`...
 *
 * Se prefieren los `data-*` de la lista de controles y, si ninguno es unico,
 * cualquier otro `data-*` cuyo valor solo aparezca una vez. Los atributos de
 * herramienta de test (`data-test`, `data-qa`...) no se usan nunca: no
 * describen la vista.
 *
 * @param {Element} element
 * @param {Document} [documentRef]
 * @returns {string} selector del atributo, o `''` si no hay ninguno unico
 */
export function uniqueControlSelector(element, documentRef = globalThis.document) {
  if (!element || element.nodeType !== 1) return '';

  const ranked = Array.from(element.attributes || [])
    .map((attribute) => {
      const name = String(attribute.name || '').toLowerCase();
      const value = attribute.value == null ? '' : String(attribute.value);
      if (!value) return null;
      if (name !== 'name' && !name.startsWith('data-')) return null;
      if (NOISE_ATTRIBUTES.test(name)) return null;
      const known = CONTROL_ATTRIBUTES.indexOf(name);
      return { name, value, rank: known === -1 ? CONTROL_ATTRIBUTES.length : known };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);

  for (const attribute of ranked) {
    const selector = `[${attribute.name}="${escapeAttributeValue(attribute.value)}"]`;
    const matches = countMatches(documentRef, selector);
    if (matches === null || matches === 1) return selector;
  }

  return '';
}

/** `true` si un color calculado no pinta nada (transparente o con alfa 0). */
function isTransparentColor(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === 'transparent') return true;
  return /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(text);
}

/** `true` si el estilo calculado dibuja algun borde. */
function hasVisibleBorder(style) {
  return BORDER_SIDES.some((side) => parseFloat(style[side]) > 0);
}

/**
 * `true` si el nodo es solo estructura: ni texto propio, ni fondo, ni borde, ni
 * sombra. Son los envoltorios de flex/grid que `elementsFromPoint` devuelve
 * entre dos piezas visibles y que hacian que `Ctrl + clic` pareciese no
 * responder; con esta prueba se atraviesan de golpe y el ciclo salta de un
 * elemento visual al siguiente.
 *
 * Un control nunca cuenta como estructura, aunque sea transparente: hay botones
 * que solo llevan un icono o un fondo en el `::before`.
 *
 * @param {Element} node
 * @param {CSSStyleDeclaration|null} [style] estilo calculado del nodo
 * @returns {boolean}
 */
export function isStructuralLayer(node, style = null) {
  if (!node || node.nodeType !== 1) return false;
  if (isControlElement(node)) return false;
  if (!style) return false; /* sin estilos calculados no se descarta nada */

  for (const child of Array.from(node.childNodes || [])) {
    if (child && child.nodeType === 3 && String(child.textContent || '').trim()) return false;
  }
  if (style.backgroundImage && style.backgroundImage !== 'none') return false;
  if (!isTransparentColor(style.backgroundColor)) return false;
  if (hasVisibleBorder(style)) return false;
  if (style.boxShadow && style.boxShadow !== 'none') return false;

  return true;
}

/**
 * Selector CSS unico y legible para un elemento. Por orden:
 *
 *   1. `#id`, lo mas corto y estable que hay;
 *   2. `[data-*]` de control con valor unico (`[data-spins="5"]`,
 *      `[data-fever-spins="10"]`, `[name="bet"]`): describen al control y no al
 *      contenedor que lo envuelve;
 *   3. `tag.clase` y, si no basta, `padre > hijo` con los ancestros cercanos
 *      hasta que el documento devuelva un solo nodo.
 *
 * Con el paso 2 los botones de un panel no acaban como
 * `.machine__side .controls > button:nth-of-type(3)`: el atributo sigue al
 * elemento aunque cambie de sitio o de clases.
 *
 * @param {Element} element
 * @param {Document} [documentRef]
 * @returns {string}
 */
export function buildSelector(element, documentRef = globalThis.document) {
  if (!element || element.nodeType !== 1) return '';
  if (element.tagName.toLowerCase() === 'html') return 'html';
  if (element.id) return `#${escapeIdent(element.id)}`;

  const attribute = uniqueControlSelector(element, documentRef);
  if (attribute) return attribute;

  let candidate = localStem(element);
  let scope = element.parentElement;

  for (let depth = 0; depth < SELECTOR_DEPTH && scope; depth += 1) {
    if (scope.tagName.toLowerCase() === 'html') break;
    if (documentRef && documentRef.querySelectorAll(candidate).length === 1) break;
    candidate = `${localStem(scope)} > ${candidate}`;
    scope = scope.parentElement;
  }

  const matches = documentRef ? documentRef.querySelectorAll(candidate).length : 1;
  if (matches === 1 || !element.parentElement) return candidate;

  /* Ultimo recurso: posicion entre hermanos del mismo tipo. */
  const siblings = Array.from(element.parentElement.children).filter(
    (node) => node.tagName === element.tagName
  );
  const index = siblings.indexOf(element) + 1;
  return index > 0 ? `${candidate}:nth-of-type(${index})` : candidate;
}

/**
 * Resuelve un selector CSS escrito a mano contra el documento.
 *
 * `querySelector` lanza `SyntaxError` con un selector invalido (`,`, `#`,
 * `a[`...), y un campo de texto libre no puede tumbar la pagina: aqui el fallo
 * se convierte en `null`.
 *
 * @param {Document|Element} root contenedor donde buscar (`document`)
 * @param {string} selector
 * @returns {Element|null}
 */
export function resolveSelector(root, selector) {
  const text = String(selector == null ? '' : selector).trim();
  if (!text || !root || typeof root.querySelector !== 'function') return null;
  try {
    const element = root.querySelector(text);
    return element && element.nodeType === 1 ? element : null;
  } catch (error) {
    /* Selector invalido: se ignora y el panel avisa. */
    return null;
  }
}

/**
 * Siguiente elemento de una pila de capas (`document.elementsFromPoint`).
 *
 * Con `Ctrl + clic` el elemento de arriba no siempre es el que se quiere mover
 * (un velo transparente, el contenedor de la placa...): esta funcion elige el
 * siguiente de la lista, que normalmente es el padre o el hermano que queda
 * debajo, y al llegar al final vuelve al primero. Si el elemento en curso no
 * esta en la pila (se llego por selector o por teclado) se empieza por la
 * segunda capa, para que el gesto siempre cambie algo.
 *
 * @param {Array} [stack]      candidatos de arriba a abajo, ya filtrados
 * @param {*} [current]        elemento seleccionado ahora mismo
 * @param {number} [direction] `1` siguiente, `-1` anterior
 * @returns {*} elemento a seleccionar, o `null` si no hay pila
 */
export function cycleTarget(stack = [], current = null, direction = 1) {
  const list = Array.isArray(stack) ? stack.filter(Boolean) : [];
  if (!list.length) return null;

  const step = direction < 0 ? -1 : 1;
  const index = current ? list.indexOf(current) : -1;
  const base = index === -1 ? 0 : index;
  return list[(base + step + list.length) % list.length] || null;
}

/* --- Hoja del panel ------------------------------------------------------ */

/**
 * Estilos de la herramienta. Todo va prefijado con `vt-` y se inyecta en un
 * `<style>` propio: `style-src 'self' 'unsafe-inline'` de la CSP lo permite y
 * asi el componente no necesita que el proyecto le reserve hueco en su hoja.
 */
const PANEL_CSS = `
.vt-hud {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 999999;
  box-sizing: border-box;
  width: 276px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 10px 11px 9px;
  border: 1px solid rgba(120, 200, 255, 0.32);
  border-radius: 12px;
  background: rgba(10, 14, 22, 0.93);
  color: #e8eef8;
  font: 11px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace;
  text-align: left;
  letter-spacing: 0;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  -webkit-user-select: none;
  user-select: none;
}
.vt-hud * { box-sizing: border-box; font: inherit; }
.vt-hud__head { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; }
.vt-hud__dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #38bdf8; box-shadow: 0 0 8px #38bdf8;
}
.vt-hud__title {
  flex: 1; font-size: 10px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: #9fd6ff;
}
.vt-hud__close {
  width: 20px; height: 20px; padding: 0; line-height: 1;
  border: 1px solid rgba(148, 197, 255, 0.25); border-radius: 6px;
  background: rgba(30, 44, 64, 0.8); color: #cfe0f2; font-size: 12px;
  cursor: pointer;
}
.vt-hud__close:hover { background: #c0243c; border-color: #ff6b81; color: #fff; }
.vt-hud__sel {
  display: block; width: 100%; margin: 0 0 8px; padding: 6px 7px;
  border: 1px solid rgba(148, 197, 255, 0.22); border-radius: 7px;
  background: rgba(4, 8, 14, 0.75); color: #7ef0c0; font-size: 11px;
  outline: 0; cursor: text; text-align: left;
  text-overflow: ellipsis;
  -webkit-user-select: text; user-select: text;
}
.vt-hud__sel:focus {
  border-color: rgba(56, 189, 248, 0.7);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.16);
}
.vt-hud__sel::placeholder { color: #8896ab; font-style: italic; }
.vt-hud__sel--bad,
.vt-hud__sel--bad:focus {
  border-color: #ff6b81; color: #ffb3bd;
  box-shadow: 0 0 0 2px rgba(255, 107, 129, 0.16);
}
.vt-hud__row { display: flex; gap: 6px; align-items: center; margin: 0 0 7px; }
.vt-hud__field {
  flex: 1; display: flex; align-items: center; gap: 4px; padding: 3px 7px;
  border: 1px solid rgba(148, 197, 255, 0.22); border-radius: 7px;
  background: rgba(4, 8, 14, 0.75); color: #9fb0c6;
}
.vt-hud__field input {
  flex: 1; width: 100%; min-width: 0; padding: 1px 0;
  border: 0; outline: 0; background: transparent; color: #fff;
  font-size: 12px; text-align: right; cursor: text;
  -webkit-appearance: textfield; appearance: textfield;
}
.vt-hud__field input::-webkit-outer-spin-button,
.vt-hud__field input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.vt-hud__field input:focus { color: #7ef0c0; }
.vt-hud__btn {
  flex: 1; padding: 5px 6px; border: 1px solid rgba(148, 197, 255, 0.26);
  border-radius: 7px; background: rgba(30, 44, 64, 0.85); color: #dbe7f5;
  font-size: 11px; cursor: pointer;
}
.vt-hud__btn:hover { background: rgba(46, 66, 94, 0.95); border-color: rgba(56, 189, 248, 0.55); }
.vt-hud__btn--primary {
  flex: 1.6; font-weight: 600; color: #fff;
  background: linear-gradient(#1e7ad1, #14538f); border-color: #2b8fe0;
}
.vt-hud__btn--primary:hover { background: linear-gradient(#2a8ce5, #1a5f9f); }
.vt-hud__btn--done { background: linear-gradient(#1f9d63, #127a4a); border-color: #2bd08a; }
.vt-hud__foot { display: flex; justify-content: space-between; gap: 6px; color: #7c8ba1; font-size: 10px; }
.vt-hud__foot--hint { margin-top: 4px; }
.vt-hud__foot--hint span { color: #9fd6ff; }
.vt-hud__foot--hint span.vt-hud__hint--flash { color: #7ef0c0; }
.vt-hud__out {
  margin: 8px 0 0; padding: 7px; max-height: 130px; overflow: auto;
  border: 1px solid rgba(126, 240, 192, 0.25); border-radius: 7px;
  background: rgba(2, 6, 12, 0.88); color: #a8f0cf;
  font-size: 10px; white-space: pre; -webkit-user-select: text; user-select: text;
}
.vt-hud[hidden], .vt-outline[hidden] { display: none !important; }
.vt-outline {
  position: fixed; left: 0; top: 0; z-index: 999998; pointer-events: none;
  border: 1px dashed #38bdf8; border-radius: 3px;
  background: rgba(56, 189, 248, 0.07);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.35), 0 0 16px 2px rgba(56, 189, 248, 0.5);
  will-change: left, top, width, height;
}
.vt-outline__tag {
  position: absolute; left: -1px; bottom: 100%; margin-bottom: 3px; padding: 1px 5px;
  border-radius: 4px; background: #38bdf8; color: #03121f;
  font: 700 9px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.02em; white-space: nowrap;
}
body.vt-editing, body.vt-editing * { cursor: crosshair !important; }
body.vt-editing.vt-dragging, body.vt-editing.vt-dragging * { cursor: grabbing !important; }
body.vt-editing .vt-hud, body.vt-editing .vt-hud * { cursor: default !important; }
body.vt-editing .vt-hud__close,
body.vt-editing .vt-hud__btn { cursor: pointer !important; }
body.vt-editing .vt-hud__sel { cursor: text !important; }
body.vt-editing .vt-hud__field input { cursor: text !important; }
`;

/* --- Componente ---------------------------------------------------------- */

/**
 * Esqueleto del HUD. Sin interpolacion: el selector va a `value` y los textos a
 * `textContent`, asi que un selector con comillas o `<` no puede inyectar HTML.
 */
const PANEL_HTML = `
  <header class="vt-hud__head">
    <span class="vt-hud__dot" aria-hidden="true"></span>
    <strong class="vt-hud__title">Visual tuner</strong>
    <button class="vt-hud__close" type="button" data-vt="close" aria-label="Desactivar (Alt+E)">\u2715</button>
  </header>
  <input class="vt-hud__sel" type="text" data-vt="selector" spellcheck="false"
         autocomplete="off" autocapitalize="off" autocorrect="off"
         aria-label="Selector del elemento (Enter para aplicarlo)"
         title="Escribe un selector CSS y pulsa Enter"
         placeholder="Selecciona o escribe un selector" />
  <div class="vt-hud__row">
    <label class="vt-hud__field">X
      <input type="number" step="1" value="0" data-vt="x" aria-label="Desplazamiento X en px" disabled>
    </label>
    <label class="vt-hud__field">Y
      <input type="number" step="1" value="0" data-vt="y" aria-label="Desplazamiento Y en px" disabled>
    </label>
  </div>
  <div class="vt-hud__row">
    <button class="vt-hud__btn" type="button" data-vt="reset">Reset</button>
    <button class="vt-hud__btn vt-hud__btn--primary" type="button" data-vt="copy">Copiar CSS generado</button>
  </div>
  <div class="vt-hud__foot">
    <span data-vt="count">0 cambios</span>
    <span>Shift + flechas = 10px</span>
  </div>
  <div class="vt-hud__foot vt-hud__foot--hint">
    <span data-vt="hint">Ctrl + clic = capas</span>
    <span>Ctrl + Shift = atras</span>
  </div>
  <pre class="vt-hud__out" data-vt="out" hidden></pre>
`;

export class VisualTuner {
  /**
   * @param {object} [options]
   * @param {Document} [options.documentRef]
   * @param {Window} [options.windowRef]
   * @param {boolean} [options.hotkey]    `false` desactiva el atajo `Alt + E`
   * @param {number} [options.step]       paso fino del teclado (px)
   * @param {number} [options.stepFast]   paso con `Shift` (px)
   */
  constructor({
    documentRef = globalThis.document,
    windowRef = globalThis.window,
    hotkey = true,
    step = STEP,
    stepFast = STEP_FAST
  } = {}) {
    this.doc = documentRef || null;
    this.win = windowRef || null;
    this.hotkey = hotkey;
    this.step = step;
    this.stepFast = stepFast;

    /** Elemento bajo el contorno. @type {Element|null} */
    this.selected = null;
    /** Desplazamientos por elemento, en orden de primera seleccion. @type {Map<Element,{x:number,y:number}>} */
    this.offsets = new Map();
    /** `transform` inline original de cada elemento tocado. @type {WeakMap<Element,string>} */
    this.baseTransforms = new WeakMap();

    this.active = false;
    this.root = null;
    this.outline = null;
    this.styleEl = null;
    this.refs = {};
    this.drag = null;
    this.frame = 0;
    this.copyTimer = 0;
    this.copyLabel = '';
    this.selTimer = 0;
    this.hintTimer = 0;

    /* Listeners fijos: se guardan para poder desengancharlos en `destroy()`. */
    this.onKeyDown = (event) => this.handleKeyDown_(event);
    this.onPointerDown = (event) => this.handlePointerDown_(event);
    this.onPointerMove = (event) => this.handlePointerMove_(event);
    this.onPointerUp = (event) => this.handlePointerUp_(event);
    this.onClick = (event) => this.handleClick_(event);
    this.onContextMenu = (event) => this.handleContextMenu_(event);
    this.onViewportChange = () => this.paintOutline_();
  }

  /* --- Ciclo de vida ----------------------------------------------------- */

  /**
   * Engancha el atajo de teclado y, si la URL lo pide, entra en modo edicion.
   * Es lo que se ejecuta al importar el modulo: no toca el DOM si no hay
   * `?edit=1`, solo deja un `keydown` a la espera de `Alt + E`.
   *
   * @returns {this}
   */
  autoMount() {
    if (!this.doc || !this.win) return this;
    if (this.hotkey) this.win.addEventListener('keydown', this.onKeyDown, true);
    const search = this.win.location ? this.win.location.search : '';
    if (isEditRequested(search)) this.mount();
    return this;
  }

  /**
   * Activa el inspector: inyecta estilos, pinta el HUD y empieza a capturar
   * puntero y teclado (en fase de captura, para que el juego no se entere).
   *
   * @returns {this}
   */
  mount() {
    if (this.active || !this.doc) return this;

    this.active = true;
    this.injectStyle_();
    this.buildPanel_();
    if (this.doc.body) this.doc.body.classList.add('vt-editing');

    this.doc.addEventListener('pointerdown', this.onPointerDown, true);
    this.doc.addEventListener('pointermove', this.onPointerMove, true);
    this.doc.addEventListener('pointerup', this.onPointerUp, true);
    this.doc.addEventListener('pointercancel', this.onPointerUp, true);
    this.doc.addEventListener('click', this.onClick, true);
    this.doc.addEventListener('contextmenu', this.onContextMenu, true);
    this.win.addEventListener('resize', this.onViewportChange, true);
    this.win.addEventListener('scroll', this.onViewportChange, true);

    this.syncPanel_();
    return this;
  }

  /**
   * Sale del modo edicion: retira HUD, contorno y listeners. Los `translate`
   * aplicados se quedan como estan (para seguir viendo el ajuste); `Reset` y
   * `resetAll()` los devuelven a su sitio.
   *
   * @returns {this}
   */
  unmount() {
    if (!this.active) return this;

    this.active = false;
    this.drag = null;
    this.selected = null;

    this.doc.removeEventListener('pointerdown', this.onPointerDown, true);
    this.doc.removeEventListener('pointermove', this.onPointerMove, true);
    this.doc.removeEventListener('pointerup', this.onPointerUp, true);
    this.doc.removeEventListener('pointercancel', this.onPointerUp, true);
    this.doc.removeEventListener('click', this.onClick, true);
    this.doc.removeEventListener('contextmenu', this.onContextMenu, true);
    this.win.removeEventListener('resize', this.onViewportChange, true);
    this.win.removeEventListener('scroll', this.onViewportChange, true);

    if (this.doc.body) {
      this.doc.body.classList.remove('vt-editing');
      this.doc.body.classList.remove('vt-dragging');
    }
    if (this.frame && this.win.cancelAnimationFrame) this.win.cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.selTimer && this.win.clearTimeout) this.win.clearTimeout(this.selTimer);
    this.selTimer = 0;
    if (this.hintTimer && this.win.clearTimeout) this.win.clearTimeout(this.hintTimer);
    this.hintTimer = 0;

    for (const node of [this.root, this.outline, this.styleEl]) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }
    this.root = null;
    this.outline = null;
    this.styleEl = null;
    this.refs = {};
    return this;
  }

  /**
   * Desmonta del todo: ademas de salir del modo, devuelve cada elemento a su
   * `transform` original y quita el atajo. Es "quitar la etiqueta `<script>`"
   * en caliente.
   *
   * @returns {this}
   */
  destroy() {
    this.unmount();
    this.resetAll();
    if (this.hotkey && this.win) this.win.removeEventListener('keydown', this.onKeyDown, true);
    return this;
  }

  /** Alterna el modo edicion. @returns {this} */
  toggle() {
    return this.active ? this.unmount() : this.mount();
  }

  /* --- HUD --------------------------------------------------------------- */

  /** Inyecta la hoja del panel una sola vez. */
  injectStyle_() {
    if (this.doc.getElementById(STYLE_ID)) return;
    const style = this.doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = PANEL_CSS;
    (this.doc.head || this.doc.documentElement).appendChild(style);
    this.styleEl = style;
  }

  /** Crea el panel flotante y su contorno. */
  buildPanel_() {
    if (this.root) return;

    const panel = this.doc.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'vt-hud';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Inspector visual de maqueta');
    panel.innerHTML = PANEL_HTML;

    const outline = this.doc.createElement('div');
    outline.id = OUTLINE_ID;
    outline.className = 'vt-outline';
    outline.setAttribute('aria-hidden', 'true');
    outline.hidden = true;

    this.doc.body.appendChild(outline);
    this.doc.body.appendChild(panel);

    this.root = panel;
    this.outline = outline;
    this.refs = {
      selector: panel.querySelector('[data-vt="selector"]'),
      x: panel.querySelector('[data-vt="x"]'),
      y: panel.querySelector('[data-vt="y"]'),
      reset: panel.querySelector('[data-vt="reset"]'),
      copy: panel.querySelector('[data-vt="copy"]'),
      close: panel.querySelector('[data-vt="close"]'),
      count: panel.querySelector('[data-vt="count"]'),
      hint: panel.querySelector('[data-vt="hint"]'),
      out: panel.querySelector('[data-vt="out"]')
    };

    this.refs.close.addEventListener('click', () => this.unmount());
    this.refs.reset.addEventListener('click', () => this.resetSelected());
    this.refs.copy.addEventListener('click', () => void this.copyCss());
    /* El campo es editable: un clic lo enfoca (y selecciona el texto para
       sobrescribirlo o copiarlo); `Enter` y `Escape` se atienden en el teclado
       global, que va en captura y llega antes que el propio input. */
    this.refs.selector.addEventListener('click', () => this.refs.selector.select());
    this.refs.selector.addEventListener('input', () => this.setSelectorError_(false));
    this.refs.x.addEventListener('input', () => this.handleInput_('x'));
    this.refs.y.addEventListener('input', () => this.handleInput_('y'));
  }

  /* --- Seleccion y desplazamiento ---------------------------------------- */

  /**
   * Marca un elemento como seleccionado y refresca contorno y HUD.
   *
   * @param {Element} element
   * @returns {this}
   */
  select(element) {
    if (!this.active || !element || element.nodeType !== 1) return this;
    if (element === this.doc.documentElement) return this;

    this.selected = element;
    this.ensureOffset_(element);
    this.syncPanel_();
    this.paintOutline_();
    return this;
  }

  /**
   * Selecciona el elemento que case con un selector escrito a mano (campo del
   * panel o consola). Un selector invalido o inexistente no lanza nada: deja la
   * seleccion como estaba y marca el campo en rojo un instante.
   *
   * @param {string} selector
   * @returns {Element|null} el elemento cargado, o `null` si no se pudo
   */
  selectBySelector(selector) {
    if (!this.active) return null;
    const element = resolveSelector(this.doc, selector);
    if (!element || element === this.doc.documentElement || this.isOwnNode_(element)) {
      this.setSelectorError_(true);
      return null;
    }
    this.setSelectorError_(false);
    this.select(element);
    return element;
  }

  /** `true` si el nodo pertenece a la propia herramienta (panel o contorno). */
  isOwnNode_(element) {
    if (!element) return false;
    if (element === this.root || element === this.outline || element === this.styleEl) return true;
    if (this.root && this.root.contains(element)) return true;
    return Boolean(this.outline && this.outline.contains(element));
  }

  /** Aplica el selector escrito en el campo (se dispara con `Enter`). */
  applyTypedSelector_() {
    const field = this.refs.selector;
    if (!field) return;
    const element = this.selectBySelector(field.value);
    /* Sin foco en el campo, las flechas vuelven a mover el elemento. */
    if (element) field.blur();
  }

  /** Devuelve al campo el selector canonico del elemento en curso (`Escape`). */
  restoreSelectorField_() {
    const field = this.refs.selector;
    if (!field) return;
    this.setSelectorError_(false);
    field.value = this.selected ? buildSelector(this.selected, this.doc) : '';
    field.focus();
    field.select();
  }

  /** Marca el campo del selector como invalido durante un instante. */
  setSelectorError_(isError) {
    const field = this.refs.selector;
    if (!field) return;
    if (this.selTimer && this.win.clearTimeout) this.win.clearTimeout(this.selTimer);
    this.selTimer = 0;
    if (!isError) {
      field.classList.remove('vt-hud__sel--bad');
      return;
    }
    field.classList.add('vt-hud__sel--bad');
    this.selTimer = this.win.setTimeout(() => {
      this.selTimer = 0;
      if (this.refs.selector) this.refs.selector.classList.remove('vt-hud__sel--bad');
    }, 1400);
  }

  /** Quita la seleccion (el `translate` aplicado se conserva). @returns {this} */
  clearSelection() {
    this.selected = null;
    this.syncPanel_();
    this.paintOutline_();
    return this;
  }

  /** Desplazamiento guardado de un elemento. @returns {{x:number,y:number}} */
  getOffset(element = this.selected) {
    return this.ensureOffset_(element);
  }

  /**
   * Aplica un desplazamiento absoluto al elemento seleccionado.
   *
   * @param {number} x
   * @param {number} y
   * @returns {this}
   */
  setOffset(x, y) {
    if (!this.selected) return this;
    const state = this.ensureOffset_(this.selected);
    state.x = toPx(x);
    state.y = toPx(y);
    this.applyOffset_(this.selected, state);
    this.syncInputs_();
    this.syncCount_();
    this.paintOutline_();
    return this;
  }

  /**
   * Suma un delta al desplazamiento actual (teclado: 1 px, `Shift`: 10 px).
   *
   * @param {number} dx
   * @param {number} dy
   * @returns {this}
   */
  nudge(dx, dy) {
    if (!this.selected) return this;
    const state = this.getOffset();
    return this.setOffset(state.x + dx, state.y + dy);
  }

  /** Devuelve el elemento seleccionado a su sitio. @returns {this} */
  resetSelected() {
    if (!this.selected) return this;
    const state = this.ensureOffset_(this.selected);
    state.x = 0;
    state.y = 0;
    this.applyOffset_(this.selected, state);
    this.syncInputs_();
    this.syncCount_();
    this.paintOutline_();
    return this;
  }

  /** Deshace todos los desplazamientos aplicados. @returns {this} */
  resetAll() {
    for (const [element, state] of this.offsets) {
      state.x = 0;
      state.y = 0;
      this.applyOffset_(element, state);
    }
    this.offsets.clear();
    this.baseTransforms = new WeakMap();
    this.syncInputs_();
    this.syncCount_();
    this.paintOutline_();
    return this;
  }

  /** Estado (y `transform` original) de un elemento, creandolo si es nuevo. */
  ensureOffset_(element) {
    if (!element || element.nodeType !== 1) return { x: 0, y: 0 };
    let state = this.offsets.get(element);
    if (!state) {
      state = { x: 0, y: 0 };
      this.offsets.set(element, state);
      this.baseTransforms.set(element, element.style.getPropertyValue('transform') || '');
    }
    return state;
  }

  /**
   * Escribe el `translate` inline (con `!important`, para ganar a la hoja del
   * proyecto) o restaura el `transform` original cuando el desplazamiento es 0.
   */
  applyOffset_(element, state) {
    if (!element || !element.style) return;
    if (state.x === 0 && state.y === 0) {
      const base = this.baseTransforms.get(element) || '';
      if (base) element.style.setProperty('transform', base, 'important');
      else element.style.removeProperty('transform');
      return;
    }
    element.style.setProperty(
      'transform',
      composeTransform(state.x, state.y, this.baseTransforms.get(element) || ''),
      'important'
    );
  }

  /* --- Sincronizacion del HUD -------------------------------------------- */

  /** Refresca selector, inputs y contador con la seleccion actual. */
  syncPanel_() {
    const { selector, x, y } = this.refs;
    if (!selector) return;

    const element = this.selected;
    /* El campo es un input: la seleccion lo reescribe con el selector canonico
       (al hacer clic en la pagina, al montar o al aplicar un selector escrito a
       mano). Mientras se teclea no se toca, para no borrar lo que se escribe. */
    selector.value = element ? buildSelector(element, this.doc) : '';
    this.setSelectorError_(false);

    if (x && y) {
      x.disabled = !element;
      y.disabled = !element;
      const state = element ? this.getOffset() : { x: 0, y: 0 };
      x.value = String(state.x);
      y.value = String(state.y);
    }
    this.syncCount_();
  }

  /** Mantiene los inputs al dia sin pelear con el que tiene el foco. */
  syncInputs_() {
    const { x, y } = this.refs;
    if (!x || !y) return;
    const state = this.selected ? this.getOffset() : { x: 0, y: 0 };
    const focused = this.doc.activeElement;
    if (focused !== x) x.value = String(state.x);
    if (focused !== y) y.value = String(state.y);
  }

  /** Numero de elementos con desplazamiento distinto de cero. */
  syncCount_() {
    if (!this.refs.count) return;
    let total = 0;
    for (const state of this.offsets.values()) {
      if (state.x !== 0 || state.y !== 0) total += 1;
    }
    this.refs.count.textContent = `${total} cambio${total === 1 ? '' : 's'}`;
  }

  /**
   * Aviso corto en el pie del panel (por ejemplo, por que capa va el
   * `Ctrl + clic`). A los 1,6 s vuelve el texto de ayuda.
   *
   * @param {string} text
   */
  flashHint_(text) {
    const hint = this.refs.hint;
    if (!hint) return;
    if (this.hintTimer && this.win.clearTimeout) this.win.clearTimeout(this.hintTimer);
    hint.textContent = text;
    hint.classList.add('vt-hud__hint--flash');
    this.hintTimer = this.win.setTimeout(() => {
      this.hintTimer = 0;
      const node = this.refs.hint;
      if (!node) return;
      node.textContent = HINT_TEXT;
      node.classList.remove('vt-hud__hint--flash');
    }, 1600);
  }

  /** Lee un input del HUD y lo lleva al elemento (edicion en tiempo real). */
  handleInput_(axis) {
    if (!this.selected) return;
    const input = this.refs[axis];
    if (!input) return;
    const raw = input.value.trim();
    if (raw === '' || raw === '-') return;
    const state = this.getOffset();
    const next = toPx(raw, state[axis]);
    if (axis === 'x') this.setOffset(next, state.y);
    else this.setOffset(state.x, next);
  }

  /** Dibuja el contorno punteado sobre el elemento (recalculo por frame). */
  paintOutline_() {
    if (!this.outline) return;

    const element = this.selected;
    if (!this.active || !element) {
      this.outline.hidden = true;
      return;
    }

    this.outline.hidden = false;
    const paint = () => {
      this.frame = 0;
      if (!this.outline || !this.selected || !this.active) return;
      const box = this.selected.getBoundingClientRect();
      this.outline.style.left = `${Math.round(box.left)}px`;
      this.outline.style.top = `${Math.round(box.top)}px`;
      this.outline.style.width = `${Math.round(box.width)}px`;
      this.outline.style.height = `${Math.round(box.height)}px`;

      let tag = this.outline.querySelector('.vt-outline__tag');
      if (!tag) {
        tag = this.doc.createElement('span');
        tag.className = 'vt-outline__tag';
        this.outline.appendChild(tag);
      }
      tag.textContent = `${Math.round(box.width)} x ${Math.round(box.height)}`;
    };

    if (this.win.requestAnimationFrame) {
      if (this.frame) return;
      this.frame = this.win.requestAnimationFrame(paint);
    } else {
      paint();
    }
  }

  /* --- Eventos ----------------------------------------------------------- */

  /** `pointerdown`: selecciona y arranca el arrastre. */
  handlePointerDown_(event) {
    if (!this.active) return;

    const hit = event.target;
    if (!hit || hit.nodeType !== 1) return;
    if (this.root && this.root.contains(hit)) return;
    if (hit === this.doc.documentElement) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    /* El juego no debe enterarse del clic: aqui se selecciona, no se acciona. */
    event.preventDefault();
    event.stopPropagation();

    /* `Ctrl + clic` (`Cmd` en Mac): en vez de quedarse con la capa de arriba,
       que muchas veces es un velo transparente o el contenedor de la placa,
       pasa a la siguiente capa apilada en ese punto. `Ctrl + Shift` va al reves.
       Sin modificador se sube al control del punto (`controlFor_`): pinchar en
       el texto o el icono de un boton selecciona el boton, no el trozo. */
    const clicked =
      event.ctrlKey || event.metaKey
        ? this.cycleAtPoint_(event.clientX, event.clientY, event.shiftKey ? -1 : 1)
        : this.controlFor_(hit) || hit;
    if (!clicked) return;

    this.select(clicked);
    this.startDrag_(event, clicked);
  }

  /**
   * Arranca el arrastre del elemento recien seleccionado.
   *
   * @param {PointerEvent} event
   * @param {Element} element
   */
  startDrag_(event, element) {
    const state = this.getOffset(element);
    this.drag = {
      id: event.pointerId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      baseX: state.x,
      baseY: state.y,
      moved: false
    };

    try {
      element.setPointerCapture(event.pointerId);
    } catch (error) {
      /* La captura es una mejora: sin ella el arrastre sigue funcionando. */
    }
  }

  /**
   * Capa que toca al hacer `Ctrl + clic`: la siguiente de la pila del punto (o
   * la anterior si `direction` es `-1`). El pie del panel dice por cual va.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} direction
   * @returns {Element|null}
   */
  cycleAtPoint_(x, y, direction) {
    const stack = this.stackAtPoint_(x, y);
    const element = cycleTarget(stack, this.selected, direction);
    if (!element) return null;
    const depth = stack.indexOf(element) + 1;
    this.flashHint_(`capa ${depth}/${stack.length}`);
    return element;
  }

  /**
   * Elementos apilados bajo un punto, de arriba a abajo y ya listos para el
   * ciclo de `Ctrl + clic`:
   *
   *   - fuera la propia herramienta, `<html>`, `<body>` (desplazarlo arrastraria
   *     la pagina entera), los nodos sin area y los que no se ven (`opacity:
   *     0`, `visibility: hidden`);
   *   - cada capa se sube a su control (`controlFor_`): si el puntero cae en el
   *     texto de un boton, en la pila entra el boton, no el `<span>`;
   *   - las capas que solo son estructura (`isStructuralLayer`) se atraviesan,
   *     asi el ciclo salta de un elemento visual al siguiente en vez de pararse
   *     en envoltorios transparentes.
   *
   * @param {number} x
   * @param {number} y
   * @returns {Element[]}
   */
  stackAtPoint_(x, y) {
    const doc = this.doc;
    if (!doc) return [];

    let raw = [];
    try {
      if (typeof doc.elementsFromPoint === 'function') raw = doc.elementsFromPoint(x, y) || [];
      else if (typeof doc.elementFromPoint === 'function') raw = [doc.elementFromPoint(x, y)];
    } catch (error) {
      /* Un punto fuera del viewport puede lanzar: se queda sin pila. */
      return [];
    }

    const stack = [];
    for (const node of raw) {
      if (!this.isStackCandidate_(node)) continue;
      const control = this.controlFor_(node) || node;
      if (stack.indexOf(control) !== -1) continue;
      if (control !== node && !this.isStackCandidate_(control)) continue;
      stack.push(control);
    }
    return stack;
  }

  /** `true` si el nodo puede entrar en la pila de `Ctrl + clic`. */
  isStackCandidate_(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node === this.doc.documentElement || node === this.doc.body) return false;
    if (this.isOwnNode_(node)) return false;
    if (typeof node.getBoundingClientRect !== 'function') return false;

    const box = node.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return false;

    const style = this.styleOf_(node);
    if (style) {
      if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (Number(style.opacity) === 0) return false;
    }

    return !isStructuralLayer(node, style);
  }

  /**
   * Sube desde el nodo pinchado hasta el control que lo contiene: el `<button>`
   * del texto o del icono, el chip `[data-spins]` del `x10`... Es lo que evita
   * seleccionar "trozos" sueltos (`<span>`, `<svg>`, `<path>`) que no se pueden
   * mover sin descolocar el control.
   *
   * Se queda con el nodo tal cual cuando no hay ningun control arriba, cuando el
   * candidato es la propia herramienta o cuando el control ocupa casi toda la
   * ventana (un `<button>` que envuelve la pagina no es el componente que se
   * busca).
   *
   * @param {Element} node
   * @returns {Element|null}
   */
  controlFor_(node) {
    if (!node || node.nodeType !== 1) return null;
    if (isControlElement(node)) return node;

    let control = null;
    try {
      control = typeof node.closest === 'function' ? node.closest(CONTROL_SELECTOR) : null;
    } catch (error) {
      control = null;
    }

    if (!control || control.nodeType !== 1) return node;
    if (control === this.doc.documentElement || control === this.doc.body) return node;
    if (this.isOwnNode_(control)) return node;
    if (this.isOversized_(control)) return node;
    return control;
  }

  /** Estilo calculado del nodo; `null` si el navegador no puede darlo. */
  styleOf_(node) {
    try {
      if (this.win && typeof this.win.getComputedStyle === 'function') {
        return this.win.getComputedStyle(node);
      }
    } catch (error) {
      /* Nodo huerfano (fuera del documento): se sigue sin estilos. */
    }
    return null;
  }

  /**
   * `true` si el nodo ocupa casi toda la ventana (`CONTROL_MAX_VIEWPORT_RATIO`):
   * un control asi no es el que se quiere mover al pinchar dentro.
   *
   * @param {Element} node
   * @returns {boolean}
   */
  isOversized_(node) {
    if (typeof node.getBoundingClientRect !== 'function') return false;
    const width = this.win ? this.win.innerWidth : 0;
    const height = this.win ? this.win.innerHeight : 0;
    if (!width || !height) return false;

    const box = node.getBoundingClientRect();
    return (box.width * box.height) / (width * height) >= CONTROL_MAX_VIEWPORT_RATIO;
  }

  /** `pointermove`: desplaza el elemento siguiendo al puntero. */
  handlePointerMove_(event) {
    const drag = this.drag;
    if (!this.active || !drag) return;

    event.preventDefault();
    event.stopPropagation();

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;

    if (!drag.moved) {
      drag.moved = true;
      if (this.doc.body) this.doc.body.classList.add('vt-dragging');
    }
    this.setOffset(drag.baseX + dx, drag.baseY + dy);
  }

  /** `pointerup`/`pointercancel`: cierra el arrastre. */
  handlePointerUp_(event) {
    const drag = this.drag;
    if (!drag) return;

    this.drag = null;
    if (this.doc.body) this.doc.body.classList.remove('vt-dragging');
    try {
      drag.element.releasePointerCapture(drag.id);
    } catch (error) {
      /* Si el puntero ya se libero, no hay nada que hacer. */
    }
    if (drag.moved) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /** `click`: se lo come para que los botones del juego no se disparen. */
  handleClick_(event) {
    if (!this.active) return;
    if (this.root && this.root.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** `contextmenu`: sin menu nativo mientras se edita (se puede arrastrar). */
  handleContextMenu_(event) {
    if (!this.active) return;
    if (this.root && this.root.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** Teclado: `Alt + E` (modo), flechas (ajuste fino) y `Escape` (salir). */
  handleKeyDown_(event) {
    const key = String(event.key || '');

    if (this.hotkey && event.altKey && (key === 'e' || key === 'E')) {
      event.preventDefault();
      event.stopPropagation();
      this.toggle();
      return;
    }

    if (!this.active) return;

    /* El campo del selector es editable: `Enter` lo aplica y `Escape` devuelve
       el selector del elemento en curso sin salir del modo. */
    const target = event.target;
    const field = this.refs.selector;
    if (field && target === field) {
      if (key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        this.applyTypedSelector_();
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.restoreSelectorField_();
        return;
      }
    }

    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.selected) this.clearSelection();
      else this.unmount();
      return;
    }

    /* Si el foco esta en un input del HUD, las flechas son del input. */
    if (target && target.tagName === 'INPUT' && this.root && this.root.contains(target)) return;

    const deltas = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0]
    };
    const delta = deltas[key];
    if (!delta || !this.selected) return;

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? this.stepFast : this.step;
    this.nudge(delta[0] * step, delta[1] * step);
  }

  /* --- Exportacion ------------------------------------------------------- */

  /**
   * CSS con todos los desplazamientos aplicados, agrupados por selector.
   *
   * @returns {string} vacio si no hay nada movido
   */
  exportCss() {
    const entries = [];
    for (const [element, state] of this.offsets) {
      if (state.x === 0 && state.y === 0) continue;
      entries.push({ selector: buildSelector(element, this.doc), x: state.x, y: state.y });
    }
    const viewport = this.win ? `${this.win.innerWidth}x${this.win.innerHeight}` : '';
    return formatCss(entries, { viewport });
  }

  /**
   * Copia el CSS generado al portapapeles y lo muestra en el panel.
   *
   * @returns {Promise<boolean>} `true` si el portapapeles acepto el texto
   */
  async copyCss() {
    const css = this.exportCss();
    if (this.refs.out) {
      this.refs.out.textContent = css || 'Sin cambios: mueve algun elemento para generar CSS.';
      this.refs.out.hidden = false;
    }
    if (!css) {
      this.flashCopy_('Nada que copiar');
      return false;
    }

    const copied = await this.writeClipboard_(css);
    this.flashCopy_(copied ? 'Copiado' : 'Revisa el portapapeles');
    return copied;
  }

  /** Copia solo el selector del elemento en foco. @returns {Promise<boolean>} */
  async copySelector() {
    if (!this.selected) return false;
    const selector = buildSelector(this.selected, this.doc);
    const copied = await this.writeClipboard_(selector);
    this.flashCopy_(copied ? 'Selector copiado' : 'Revisa el portapapeles');
    return copied;
  }

  /** Escribe en el portapapeles con plan B para navegadores sin permiso. */
  async writeClipboard_(text) {
    const navigatorRef = this.win && this.win.navigator;
    try {
      if (navigatorRef && navigatorRef.clipboard && navigatorRef.clipboard.writeText) {
        await navigatorRef.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* Sin permiso de portapapeles: se intenta el metodo clasico. */
    }

    const doc = this.doc;
    if (!doc || !doc.body) return false;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
    doc.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = doc.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    if (area.parentNode) area.parentNode.removeChild(area);
    return copied;
  }

  /** Feedback temporal en el boton de copiar. */
  flashCopy_(message) {
    const button = this.refs.copy;
    if (!button) return;
    if (!this.copyLabel) this.copyLabel = button.textContent;
    button.textContent = message;
    button.classList.add('vt-hud__btn--done');
    if (this.copyTimer && this.win.clearTimeout) this.win.clearTimeout(this.copyTimer);
    this.copyTimer = this.win.setTimeout(() => {
      this.copyTimer = 0;
      if (!this.refs.copy) return;
      this.refs.copy.textContent = this.copyLabel;
      this.refs.copy.classList.remove('vt-hud__btn--done');
    }, 1400);
  }
}

/* --- Arranque ------------------------------------------------------------ */

/**
 * Instancia lista para la consola del navegador:
 *   - `visualTuner.exportCss()` -> CSS de todo lo movido,
 *   - `visualTuner.destroy()`   -> desmonta y restaura los `transform`,
 *   - `visualTuner.mount()`     -> vuelve a abrir el panel.
 *
 * En Node (`npm test`) no hay `document`, asi que queda en `null` y el modulo
 * se puede importar sin efectos.
 */
export const visualTuner =
  typeof document === 'undefined' ? null : new VisualTuner().autoMount();

if (visualTuner && typeof window !== 'undefined') {
  window.visualTuner = visualTuner;
}

