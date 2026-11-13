'use strict';

/**
 * Contrato del inspector visual de maqueta (`public/dev/visual-tuner.js`).
 *
 * La herramienta vive fuera de `ui/` y fuera de `public/src`: es material de
 * desarrollo, no del juego. Estas pruebas fijan lo que la hace enchufable:
 *
 *   - cero dependencias (`import`/`require`), red, `fetch` y almacenamiento;
 *   - activacion por `?edit=1` (con sus variantes) y por `Alt + E`;
 *   - `transform` componible, para no perder el que ya tuviera el elemento;
 *   - CSS de salida limpio, sin elementos que no se movieron;
 *   - selectores legibles (`#id`, `[data-*]` de control, `tag.clase`,
 *     `padre > hijo`) sin clases de estado;
 *   - el clic sube al control mas cercano (`.closest()` + `CONTROL_SELECTOR`) en
 *     vez de quedarse con el `<span>` o el `<svg>` de dentro del boton;
 *   - `Ctrl + clic` recorre la pila del punto sin pararse en envoltorios vacios;
 *   - el HUD no se cuela en el HTML publicado ni en `dist/`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const TUNER_PATH = path.join(ROOT_DIR, 'public', 'dev', 'visual-tuner.js');
const INDEX_PATH = path.join(ROOT_DIR, 'public', 'index.html');

const read = (file) => fs.readFileSync(file, 'utf8');

/** Quita comentarios: las prohibiciones se miran sobre el codigo que se ejecuta. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* Cargador ESM por data URL: importa el archivo tal cual, sin transpilar. */
let modulePromise = null;
const loadTuner = () => {
  if (!modulePromise) {
    const source = read(TUNER_PATH);
    const url = `data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`;
    modulePromise = import(url);
  }
  return modulePromise;
};

/** Nodo minimo para probar `buildSelector` sin DOM real. */
const fakeNode = (
  tagName,
  { id = '', classes = [], parentElement = null, attributes = [], childNodes = [] } = {}
) => ({
  nodeType: 1,
  tagName,
  id,
  classList: classes,
  parentElement,
  children: [],
  attributes,
  childNodes
});

test('el inspector no depende de librerias, no hace red y no guarda nada', () => {
  const code = stripComments(read(TUNER_PATH));

  assert.doesNotMatch(code, /\bfrom\s+['"]/, 'cero imports: se enchufa con una etiqueta <script>');
  assert.doesNotMatch(code, /\brequire\s*\(/, 'el navegador no tiene `require`');
  assert.doesNotMatch(code, /\bfetch\s*\(/, 'la herramienta no pide nada');
  assert.doesNotMatch(code, /\/api\//, 'no conoce el backend');
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB/, 'no persiste estado');
});

test('en Node el modulo se importa sin efectos secundarios', async () => {
  const { visualTuner, VisualTuner } = await loadTuner();

  assert.equal(visualTuner, null, 'sin `document` no se crea la instancia');
  assert.equal(typeof VisualTuner, 'function', 'la clase se puede instanciar a mano');
});

test('la activacion acepta ?edit=1 y descarta lo que no es un flag', async () => {
  const { isEditRequested } = await loadTuner();

  for (const search of ['?edit=1', 'edit=1', '?edit=true', '?edit=si', '?foo=1&edit=1']) {
    assert.equal(isEditRequested(search), true, `${search} debe activar el modo`);
  }
  for (const search of ['', '?edit=0', '?edit=false', '?edit=off', '?editing=1', '?mode=edit']) {
    assert.equal(isEditRequested(search), false, `${search} no debe activar el modo`);
  }
});

test('el transform compone y el px se normaliza a entero', async () => {
  const { composeTransform, toPx } = await loadTuner();

  assert.equal(composeTransform(4, -9), 'translate(4px, -9px)');
  assert.equal(composeTransform(4.4, -9.6), 'translate(4px, -10px)', 'redondea como el HUD');
  assert.equal(
    composeTransform(4, 0, 'rotate(2deg)'),
    'translate(4px, 0px) rotate(2deg)',
    'el transform que ya tenia el elemento se conserva'
  );

  assert.equal(toPx('12'), 12);
  assert.equal(toPx('  -3  '), -3);
  assert.equal(toPx('', 7), 7, 'un input vacio no mueve nada');
  assert.equal(toPx('abc', 3), 3);
});

test('el CSS exportado solo incluye reglas limpias de lo que se movio', async () => {
  const { formatCss } = await loadTuner();

  const css = formatCss(
    [
      { selector: '#btn-spin', x: 0, y: 0 },
      { selector: '.machine__side .controls > button', x: 6, y: -12 }
    ],
    { viewport: '390x844' }
  );

  const expected = [
    '/* visual-tuner · 390x844 */',
    '',
    '.machine__side .controls > button {',
    '  transform: translate(6px, -12px);',
    '}',
    ''
  ].join('\n');

  assert.equal(css, expected, 'una regla por elemento movido, sin clases internas');
  assert.equal(formatCss([]), '', 'sin cambios no hay CSS');
  assert.equal(formatCss([{ selector: '#x', x: 0, y: 0 }]), '', 'un reset no se exporta');
});

test('los selectores son legibles y esquivan las clases de estado', async () => {
  const { buildSelector } = await loadTuner();

  const withId = fakeNode('BUTTON', { id: 'btn-spin' });
  assert.equal(buildSelector(withId), '#btn-spin', 'el id manda');

  const button = fakeNode('BUTTON', { classes: ['btn', 'btn--demo', 'is-active', 'vt-x'] });
  const uniqueDoc = { querySelectorAll: () => ({ length: 1 }) };
  assert.equal(
    buildSelector(button, uniqueDoc),
    'button.btn.btn--demo',
    'se queda con las clases que describen al elemento, no con su estado'
  );

  const app = fakeNode('DIV', { id: 'app' });
  const card = fakeNode('DIV', { classes: ['card'], parentElement: app });
  const sibling = fakeNode('DIV', { classes: ['card'], parentElement: app });
  app.children = [card, sibling];

  const ambiguous = {
    querySelectorAll: (selector) => ({ length: selector === '#app > div.card' ? 1 : 2 })
  };
  assert.equal(
    buildSelector(card, ambiguous),
    '#app > div.card',
    'cuando `div.card` no es unico se prefija el ancestro'
  );
});

test('el selector prefiere el atributo de control unico a las clases del contenedor', async () => {
  const { buildSelector, uniqueControlSelector } = await loadTuner();

  const chip = fakeNode('SPAN', {
    classes: ['btn__opt'],
    attributes: [
      { name: 'class', value: 'btn__opt' },
      { name: 'data-spins', value: '5' },
      { name: 'aria-hidden', value: 'true' }
    ]
  });

  const chipDoc = {
    querySelectorAll: (selector) => ({ length: selector === '[data-spins="5"]' ? 1 : 7 })
  };

  assert.equal(uniqueControlSelector(chip, chipDoc), '[data-spins="5"]', 'el chip x5 se aisla por su atributo');
  assert.equal(
    buildSelector(chip, chipDoc),
    '[data-spins="5"]',
    'nada de `.machine__side .controls > span`: el atributo sigue al elemento'
  );

  const crowded = { querySelectorAll: () => ({ length: 3 }) };
  assert.equal(uniqueControlSelector(chip, crowded), '', 'un valor repetido no aisla el nodo');
  assert.equal(buildSelector(chip, crowded), 'span.btn__opt', 'sin atributo unico vuelve a las clases');

  const spin = fakeNode('BUTTON', { id: 'btn-spin', attributes: [{ name: 'data-action', value: 'spin' }] });
  assert.equal(buildSelector(spin, chipDoc), '#btn-spin', 'el id sigue mandando sobre el atributo');

  const fever = fakeNode('BUTTON', { attributes: [{ name: 'data-fever-spins', value: '10' }] });
  const feverDoc = { querySelectorAll: (selector) => ({ length: selector === '[data-fever-spins="10"]' ? 1 : 5 }) };
  assert.equal(
    buildSelector(fever, feverDoc),
    '[data-fever-spins="10"]',
    'los paquetes de tiradas se aislan por su atributo'
  );

  const generic = fakeNode('DIV', { attributes: [{ name: 'data-whatever', value: 'hero' }] });
  const genericDoc = {
    querySelectorAll: (selector) => ({ length: selector === '[data-whatever="hero"]' ? 1 : 4 })
  };
  assert.equal(uniqueControlSelector(generic, genericDoc), '[data-whatever="hero"]', 'cualquier `data-*` unico vale');

  const noisy = fakeNode('DIV', { attributes: [{ name: 'data-test', value: 'hero' }] });
  assert.equal(
    uniqueControlSelector(noisy, { querySelectorAll: () => ({ length: 1 }) }),
    '',
    'los atributos de test no describen la vista'
  );

  assert.equal(
    uniqueControlSelector(chip),
    '[data-spins="5"]',
    'sin documento contra el que contar se da por unico, igual que `buildSelector`'
  );
  assert.equal(uniqueControlSelector(fakeNode('SPAN', { classes: ['x'] })), '', 'sin atributos no hay nada que usar');
  assert.equal(buildSelector(null), '');

  const source = read(TUNER_PATH);
  assert.match(
    source,
    /const attribute = uniqueControlSelector\(element, documentRef\)/,
    '`buildSelector` consulta los atributos antes que las clases'
  );
  assert.match(source, /CONTROL_ATTRIBUTES/, 'la lista de atributos de control esta declarada');
});

test('el clic sube al control mas cercano y atraviesa los envoltorios vacios', async () => {
  const { isControlElement, isStructuralLayer } = await loadTuner();

  const button = { nodeType: 1, matches: (selector) => selector.includes('button') };
  assert.equal(isControlElement(button), true, 'un <button> es control');
  assert.equal(isControlElement({ nodeType: 1, matches: () => false }), false, 'un <span> suelto no lo es');
  assert.equal(isControlElement(null), false);
  assert.equal(isControlElement({ nodeType: 3, matches: () => true }), false, 'solo elementos');
  assert.equal(isControlElement({ nodeType: 1 }), false, 'sin `matches` no se puede saber');
  assert.equal(
    isControlElement({
      nodeType: 1,
      matches: () => {
        throw new Error('selector roto');
      }
    }),
    false,
    'un `matches` que lanza no rompe el clic'
  );

  const plain = { nodeType: 1, matches: () => false, childNodes: [] };
  const emptyStyle = {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    backgroundImage: 'none',
    boxShadow: 'none',
    borderTopWidth: '0px',
    borderRightWidth: '0px',
    borderBottomWidth: '0px',
    borderLeftWidth: '0px'
  };
  assert.equal(isStructuralLayer(plain, emptyStyle), true, 'el envoltorio transparente se atraviesa');

  const painted = { ...emptyStyle, backgroundImage: 'url("fondo.png")' };
  assert.equal(isStructuralLayer(plain, painted), false, 'con fondo propio es una capa visible');

  const bordered = { ...emptyStyle, borderBottomWidth: '2px' };
  assert.equal(isStructuralLayer(plain, bordered), false, 'un borde ya se ve');

  const veil = { ...emptyStyle, backgroundColor: 'rgba(15, 23, 42, 0.65)' };
  assert.equal(isStructuralLayer(plain, veil), false, 'un velo con color sigue en la pila');

  const withText = { nodeType: 1, matches: () => false, childNodes: [{ nodeType: 3, textContent: ' x5 ' }] };
  assert.equal(isStructuralLayer(withText, emptyStyle), false, 'el texto propio lo hace visible');

  assert.equal(isStructuralLayer(plain, null), false, 'sin estilos calculados no se descarta nada');
  assert.equal(isStructuralLayer(button, emptyStyle), false, 'un control nunca es estructura');
  assert.equal(isStructuralLayer(null, emptyStyle), false);

  const source = read(TUNER_PATH);
  assert.match(source, /node\.closest\(CONTROL_SELECTOR\)/, 'sube con `.closest()` hasta el control');
  assert.match(source, /'\[data-spins\]'/, 'los chips x5/x10/x25 cuentan como control');
  assert.match(source, /: this\.controlFor_\(hit\) \|\| hit;/, 'el clic normal pasa por `controlFor_`');
  assert.match(source, /isStackCandidate_\(control\)/, 'la pila se normaliza a controles');
  assert.match(source, /CONTROL_MAX_VIEWPORT_RATIO/, 'un control que ocupa la ventana entera no se acepta');
  assert.match(source, /return !isStructuralLayer\(node, style\)/, 'la pila salta los envoltorios vacios');
});

test('el campo del selector es editable y Enter salta al elemento', async () => {
  const { resolveSelector } = await loadTuner();

  const node = { nodeType: 1, id: 'target' };
  const root = {
    querySelector: (selector) => {
      if (selector === 'a[') throw new SyntaxError('selector invalido');
      if (selector === '#target') return node;
      return null;
    }
  };

  assert.equal(resolveSelector(root, '  #target  '), node, 'recorta los espacios y resuelve');
  assert.equal(resolveSelector(root, '#no-existe'), null, 'un selector que no existe devuelve null');
  assert.equal(resolveSelector(root, 'a['), null, 'un selector invalido no lanza: el panel no rompe la app');
  assert.equal(resolveSelector(root, ''), null);
  assert.equal(resolveSelector(null, '#target'), null, 'sin documento no hay nada que buscar');

  const source = read(TUNER_PATH);
  assert.match(
    source,
    /<input class="vt-hud__sel" type="text" data-vt="selector"/,
    'el selector se muestra en un input de texto, no en un <p>'
  );
  assert.match(source, /root\.querySelector\(text\)/, 'busca con `document.querySelector`');
  assert.match(source, /key === 'Enter'[\s\S]{0,120}?applyTypedSelector_/, 'Enter aplica el selector escrito');
  assert.match(source, /selector\.value = element \? buildSelector/, 'la seleccion escribe el selector en el campo');
  assert.match(source, /vt-hud__sel--bad/, 'un selector invalido se avisa en el panel');
});

test('Ctrl + clic cicla las capas apiladas del punto', async () => {
  const { cycleTarget } = await loadTuner();

  const top = { nodeType: 1, id: 'velo' };
  const mid = { nodeType: 1, id: 'placa' };
  const low = { nodeType: 1, id: 'texto' };
  const stack = [top, mid, low];

  assert.equal(cycleTarget(stack, top), mid, 'con un velo arriba, Ctrl + clic baja a la placa');
  assert.equal(cycleTarget(stack, mid, 1), low, 'repetir el gesto sigue bajando por la pila');
  assert.equal(cycleTarget(stack, low, 1), top, 'al final de la pila vuelve arriba');
  assert.equal(cycleTarget(stack, top, -1), low, 'Ctrl + Shift + clic retrocede');
  assert.equal(cycleTarget(stack, null), mid, 'sin seleccion se empieza por la segunda capa');
  assert.equal(cycleTarget(stack, { nodeType: 1, id: 'otro' }), mid, 'si el actual no esta en la pila, igual');
  assert.equal(cycleTarget([top]), top, 'con una sola capa se queda en ella');
  assert.equal(cycleTarget([], top), null, 'sin pila no hay nada que seleccionar');

  const source = read(TUNER_PATH);
  assert.match(source, /doc\.elementsFromPoint\(x, y\)/, 'la pila sale de `document.elementsFromPoint`');
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/, 'el gesto es Ctrl (o Cmd en Mac) + clic');
  assert.match(
    source,
    /cycleAtPoint_\(event\.clientX, event\.clientY, event\.shiftKey \? -1 : 1\)/,
    'Ctrl + Shift invierte el ciclo'
  );
  assert.match(source, /node === this\.doc\.documentElement \|\| node === this\.doc\.body/, '<html> y <body> no entran');
  assert.match(source, /Ctrl \+ clic = capas/, 'el panel lo explica en su pie');
});

test('el HUD respeta el contrato visual y no pesa en la pagina publicada', () => {
  const source = read(TUNER_PATH);

  assert.match(source, /z-index:\s*999999/, 'el panel flota por encima del juego');
  assert.match(source, /z-index:\s*999998/, 'el contorno va justo debajo del panel');
  assert.match(source, /border:\s*1px dashed #38bdf8/, 'el resaltado es punteado y brillante');
  assert.match(source, /event\.altKey/, 'el atajo es Alt + E');
  assert.match(source, /Shift \+ flechas = 10px/, 'el HUD recuerda el paso rapido');

  const html = read(INDEX_PATH);
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(
    withoutComments,
    /visual-tuner/,
    'index.html no debe cargar la herramienta: el jugador no la descarga'
  );
  assert.match(
    html,
    /<!--\s*<script type="module" src="\/dev\/visual-tuner\.js"><\/script>\s*-->/,
    'la etiqueta lista para descomentar sigue documentada en el HTML'
  );
});

test('la herramienta no viaja en el paquete de integracion (dist/)', () => {
  const { planCopy } = require('../scripts/build-dist.js');
  const names = planCopy().map((file) => file.relative);

  assert.ok(fs.existsSync(TUNER_PATH), 'Falta public/dev/visual-tuner.js');
  assert.equal(
    names.some((name) => name.startsWith('dev/')),
    false,
    'public/dev/** es material de desarrollo y no debe publicarse'
  );
});
