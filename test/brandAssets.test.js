'use strict';

/**
 * Contrato de la identidad Santa Crush.
 *
 * La marca vive en tres sitios que tienen que contar la misma historia:
 *
 *   - `config/gameConfig.js`: nombre visible (`GAME.name`), rotulo del bonus
 *     (`FEATURE.label`) y rutas del arte (`ASSETS`). El motor conserva su
 *     `code` (`TROPICAL_GRID_6X5_95_10K`): rebrandear no cambia matematicas.
 *   - `public/assets/santa-crush/**`: el arbol de arte de la marca. La version
 *     de escritorio ya sirve el arte navideño (fondo, marco de caramelos y
 *     consola de mandos) y las piezas restantes siguen en
 *     `public/src/assets/**` hasta que se reexporten.
 *   - `ui/services/SessionManager.js`: prefijo propio en `localStorage`, para
 *     que el navegador de otra maquina del equipo no arrastre su sesion.
 *
 * Ver `docs/ASSETS.md` y `docs/REBRANDING.md`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const THEME_DIR = path.join(PUBLIC_DIR, 'assets', 'santa-crush');
const SESSION_PATH = path.join(ROOT_DIR, 'ui', 'services', 'SessionManager.js');

const { PUBLIC_GAME_CONFIG } = require('../config/gameConfig');

const read = (file) => fs.readFileSync(file, 'utf8');

test('el nombre visible del producto y del bonus es Santa Crush', () => {
  assert.equal(PUBLIC_GAME_CONFIG.game.name, 'Santa Crush');
  assert.equal(PUBLIC_GAME_CONFIG.feature.label, 'Santa Crush');

  // El identificador del motor no se toca: viaja en la API y en sql/.
  assert.equal(PUBLIC_GAME_CONFIG.game.code, 'TROPICAL_GRID_6X5_95_10K');
});

test('el arte de la marca se declara una sola vez en GAME_CONFIG.assets', () => {
  const { assets } = PUBLIC_GAME_CONFIG;
  const base = '/assets/santa-crush/';

  assert.equal(Object.isFrozen(assets), true);
  assert.equal(assets.basePath, base);

  const paths = [
    assets.bg.desktop,
    assets.bg.mobile,
    assets.console.mobileFrame,
    assets.console.mobileConsole,
    assets.console.desktopFrame,
    assets.console.desktopConsole,
    assets.tiles.dir,
    assets.audio.bgm,
    assets.audio.win,
    assets.audio.click
  ];

  for (const entry of paths) {
    assert.ok(
      entry.startsWith(base),
      `${entry} debe colgar de ${base}: el navegador lo resuelve contra el CDN`
    );
  }

  const files = [...assets.tiles.files];
  assert.deepEqual(
    files,
    ['tile-1.webp', 'tile-2.webp', 'tile-3.webp', 'tile-4.webp', 'tile-5.webp', 'tile-6.webp'],
    'las piezas del tablero van numeradas y en orden'
  );

  for (const entry of [...paths.slice(0, 5), files[0], assets.audio.bgm]) {
    assert.match(
      entry,
      /\.(webp|mp3)$/,
      'el arte del CDN se sirve en WebP (imagen) o MP3 (audio), nunca en PNG/WAV'
    );
  }
});

test('public/assets/santa-crush existe con las cuatro carpetas del tema', () => {
  for (const dir of ['bg', 'console', 'tiles', 'audio']) {
    const absolute = path.join(THEME_DIR, dir);
    assert.ok(fs.existsSync(absolute), `Falta la carpeta public/assets/santa-crush/${dir}`);

    // El marcador mantiene la carpeta en git mientras no hay arte; se excluye
    // del paquete de integracion y no se sirve.
    assert.ok(
      fs.existsSync(path.join(absolute, '.gitkeep')),
      `Falta public/assets/santa-crush/${dir}/.gitkeep: sin el, git no versiona la carpeta`
    );
  }

  const { planCopy } = require('../scripts/build-dist.js');
  const themeFiles = planCopy()
    .map((file) => file.relative)
    .filter((relative) => relative.startsWith('assets/santa-crush/'));

  assert.deepEqual(
    themeFiles.filter((relative) => relative.endsWith('.gitkeep')),
    [],
    'dist/ no debe publicar los marcadores de carpeta vacia'
  );

  // El arte del tema viaja con el paquete de integracion (se sirve desde el
  // CDN con cache inmutable, ver `docs/ASSETS.md`).
  for (const relative of [
    'assets/santa-crush/bg/bg-desktop.webp',
    'assets/santa-crush/bg/bg-mobile.webp',
    'assets/santa-crush/console/slot-frame.webp',
    'assets/santa-crush/console/console-desktop.webp',
    'assets/santa-crush/console/slot-frame-mobile.webp',
    'assets/santa-crush/console/console-mobile.webp'
  ]) {
    assert.ok(themeFiles.includes(relative), `planCopy debe publicar ${relative}`);
  }
});

test('la sesion del cliente usa un prefijo propio de Santa Crush', () => {
  const source = read(SESSION_PATH);

  assert.match(source, /'santacrush\.session\.v1'/, 'La clave de localStorage debe ser de la marca');
  assert.doesNotMatch(source, /tg65/, 'No deben quedar restos del prefijo anterior');
});
