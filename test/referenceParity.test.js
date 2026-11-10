'use strict';

/**
 * Paridad funcional con el juego de referencia (`MeridianoBetCrush`).
 *
 * El rebranding de Santa Crush solo puede tocar la capa visual. La logica de
 * eventos, el estado de autogiro, los temporizadores y el manejo de saldo viven
 * en `ui/components/GameControls.js`, `ui/controllers/GameController.js` y
 * `core/**`, y esos ficheros tienen que ser identicos a los del juego base.
 * `ui/renderers/GameView.js` si cambia (textos de marca, arte, tabla de pagos),
 * pero nunca su superficie: mismos metodos, con los mismos nombres.
 *
 * La ruta de la referencia se resuelve con `SANTA_CRUSH_REFERENCE` y, si no
 * existe (CI, otra maquina), el fichero se salta: nunca rompe la suite.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const REFERENCE_DIR = process.env.SANTA_CRUSH_REFERENCE || 'C:\\latinongroup_dev\\MeridianoBetCrush';

const LOGIC_FILES = ['ui/components/GameControls.js', 'ui/controllers/GameController.js'];

function referenceAvailable() {
  return fs.existsSync(path.join(REFERENCE_DIR, 'ui')) && fs.existsSync(path.join(REFERENCE_DIR, 'core'));
}

function readNormalized(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, base, out);
    } else {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

/* Nombres de metodo de una clase, en orden de aparicion. */
function methodNames(file) {
  const source = readNormalized(file);
  const names = [];
  const pattern = /^ {2}(?:async )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/;
  for (const line of source.split('\n')) {
    const match = pattern.exec(line);
    if (match && !names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

test('los controles de la botonera son los del juego de referencia', (t) => {
  if (!referenceAvailable()) {
    t.skip(`sin referencia en ${REFERENCE_DIR}`);
    return;
  }

  for (const relative of LOGIC_FILES) {
    const expected = readNormalized(path.join(REFERENCE_DIR, relative));
    const actual = readNormalized(path.join(ROOT_DIR, relative));
    assert.equal(actual, expected, `${relative} se separo de la referencia: la logica debe ser identica`);
  }
});

test('el motor y las reglas de juego no se tocan', (t) => {
  if (!referenceAvailable()) {
    t.skip(`sin referencia en ${REFERENCE_DIR}`);
    return;
  }

  const referenceRoot = path.join(REFERENCE_DIR, 'core');
  const localRoot = path.join(ROOT_DIR, 'core');
  const referenceFiles = walk(referenceRoot).sort();
  const localFiles = walk(localRoot).sort();

  assert.deepEqual(localFiles, referenceFiles, 'core/ debe tener exactamente los ficheros de la referencia');

  for (const relative of referenceFiles) {
    const expected = readNormalized(path.join(referenceRoot, relative));
    const actual = readNormalized(path.join(localRoot, relative));
    assert.equal(actual, expected, `core/${relative} cambio respecto al juego base`);
  }
});

test('GameView conserva la superficie de metodos de la referencia', (t) => {
  if (!referenceAvailable()) {
    t.skip(`sin referencia en ${REFERENCE_DIR}`);
    return;
  }

  const relative = 'ui/renderers/GameView.js';
  const expected = methodNames(path.join(REFERENCE_DIR, relative));
  const actual = methodNames(path.join(ROOT_DIR, relative));

  assert.ok(expected.length > 50, 'la referencia deberia exponer la clase completa');

  const missing = expected.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !expected.includes(name));

  assert.deepEqual(missing, [], `GameView perdio metodos de la referencia: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `GameView anadio metodos que el juego base no tiene: ${extra.join(', ')}`);
});
