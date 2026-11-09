'use strict';

/**
 * Contrato de reproduccion del audio del juego.
 *
 * `sfx.js` es ESM dentro de un package CommonJS, asi que se carga por `data:`
 * URL. Se sustituyen `window` y `fetch` por dobles minimos para comprobar el
 * flujo real sin navegador: precarga de los MP3 (aplausos y bucle ambiental),
 * decodificacion unica, volumenes de los GainNode, loop del fondo, arranque por
 * defecto de la musica, desbloqueo dentro del gesto y respeto del mute.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SFX_PATH = path.join(__dirname, '..', 'ui', 'audio', 'sfx.js');
const SOURCE = fs.readFileSync(SFX_PATH, 'utf8');
const SFX_URL = `data:text/javascript;base64,${Buffer.from(SOURCE, 'utf8').toString('base64')}`;
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function createAudioHarness({ failDecodes = 0 } = {}) {
  const calls = {
    fetch: [],
    decoded: 0,
    starts: [],
    gains: [],
    silentBuffers: 0,
    resumes: 0
  };
  const decodedBuffer = { duration: 1.8, sampleRate: 44100 };

  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 1.25;
      this.sampleRate = 44100;
      this.destination = { kind: 'destination' };
    }

    resume() {
      calls.resumes += 1;
      this.state = 'running';
      return Promise.resolve();
    }

    createBuffer() {
      calls.silentBuffers += 1;
      return { silent: true };
    }

    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        onended: null,
        connectedTo: null,
        started: false,
        connect(node) {
          this.connectedTo = node;
        },
        start() {
          this.started = true;
          calls.starts.push(source);
        },
        stop() {
          this.stopped = true;
        }
      };
      return source;
    }

    createGain() {
      const node = {
        gain: {
          setValueAtTime(value, time) {
            calls.gains.push({ value, time });
          }
        },
        connect() {},
        disconnect() {
          this.disconnected = true;
        }
      };
      return node;
    }

    decodeAudioData(data, success, failure) {
      calls.decoded += 1;
      assert.ok(data instanceof ArrayBuffer, 'decodeAudioData debe recibir el MP3');
      /* Los primeros intentos fallan: simula un navegador que exige gesto. */
      if (calls.decoded <= failDecodes) {
        if (typeof failure === 'function') failure(new Error('audio bloqueado'));
        return Promise.reject(new Error('audio bloqueado'));
      }
      success(decodedBuffer);
      return Promise.resolve(decodedBuffer);
    }
  }

  return { calls, FakeAudioContext, decodedBuffer };
}

test('la victoria usa los aplausos nuevos y la musica ambiental suena en bucle por debajo', async () => {
  const { calls, FakeAudioContext, decodedBuffer } = createAudioHarness();
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);

  /* Voz de victoria: cualquier MP3 decodificado que no sea el bucle ambiental. */
  const isWinSource = (source) => source.buffer === decodedBuffer && source.loop !== true;

  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.fetch = async (url, options) => {
    calls.fetch.push({ url, options });
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => bytes.buffer
    };
  };

  try {
    const { createSfx, WIN_SOUND_SRC, MUSIC_SOUND_SRC } = await import(SFX_URL);
    assert.equal(WIN_SOUND_SRC, '/src/assets/AUDIO-WIN-NEW-stadium-applause.MP3');
    assert.equal(MUSIC_SOUND_SRC, '/src/assets/Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3');

    const sfx = createSfx();
    await wait();

    assert.deepEqual(
      calls.fetch.map((call) => call.url),
      [WIN_SOUND_SRC, MUSIC_SOUND_SRC],
      'createSfx debe precargar los aplausos y el bucle ambiental una sola vez'
    );
    for (const call of calls.fetch) {
      assert.deepEqual(call.options, {
        cache: 'force-cache',
        credentials: 'same-origin'
      });
    }

    /* Aun sin gesto no debe existir AudioContext ni decodificacion. */
    assert.equal(calls.decoded, 0, 'La precarga de red no debe decodificar antes del gesto');

    sfx.unlock();
    sfx.unlock();
    await wait();

    assert.equal(calls.decoded, 2, 'Cada MP3 debe decodificarse una sola vez');
    assert.equal(calls.silentBuffers, 1, 'El gesto debe desbloquear una sola vez');
    assert.equal(
      calls.starts.filter((source) => source.buffer && source.buffer.silent).length,
      1,
      'El desbloqueo debe arrancar un unico buffer silencioso'
    );

    /* Musica de fondo: una sola voz, en bucle y mas suave que los aplausos. */
    const musicStarts = calls.starts.filter((source) => source.loop === true);
    assert.equal(musicStarts.length, 1, 'El gesto debe arrancar el bucle ambiental');
    assert.equal(musicStarts[0].buffer, decodedBuffer);
    assert.deepEqual(calls.gains, [{ value: 0.2, time: 1.25 }], 'La musica usa su propio volumen');
    const musicVolume = calls.gains[0].value;

    sfx.win();
    sfx.win();

    const winStarts = calls.starts.filter(isWinSource);
    assert.equal(winStarts.length, 2, 'Cada victoria inicia su propia fuente');
    assert.equal(winStarts[0].connectedTo.gain !== undefined, true);
    const winGains = calls.gains.filter((entry) => entry.value !== musicVolume);
    assert.deepEqual(
      winGains,
      [
        { value: 0.62, time: 1.25 },
        { value: 0.62, time: 1.25 }
      ],
      'Los aplausos deben fijar su propio volumen'
    );
    assert.ok(
      winGains.every((entry) => entry.value > musicVolume),
      `Los aplausos (${winGains[0].value}) deben oirse por encima de la musica (${musicVolume})`
    );
    assert.ok(
      winStarts.every((source) => source.stopped !== true),
      'Dos victorias seguidas deben solaparse sin cortarse'
    );

    sfx.setMuted(true);
    assert.ok(winStarts.every((source) => source.stopped === true), 'El mute debe detener todas las voces');
    assert.equal(musicStarts[0].stopped, true, 'El mute debe detener el bucle ambiental');
    sfx.win();
    assert.equal(
      calls.starts.filter(isWinSource).length,
      2,
      'El mute no debe reproducir los aplausos'
    );

    /* Al reactivar el sonido el bucle ambiental vuelve solo. */
    sfx.setMuted(false);
    await wait();
    const musicAfterUnmute = calls.starts.filter((source) => source.loop === true);
    assert.equal(musicAfterUnmute.length, 2, 'Al quitar el mute debe volver el bucle ambiental');
    assert.ok(musicAfterUnmute[1].stopped !== true, 'La nueva voz del bucle debe quedar sonando');

    /* El techo de voces protege la salida sin bloquear los premios nuevos. */
    for (let index = 0; index < 4; index += 1) sfx.win();

    const burst = calls.starts.filter(isWinSource).slice(-4);
    assert.equal(burst.length, 4, 'Cada victoria debe arrancar aunque ya haya voces activas');
    assert.equal(burst[0].stopped, true, 'La voz mas antigua sale al superar el techo');
    assert.ok(
      burst.slice(1).every((source) => source.stopped !== true),
      'Las tres voces mas recientes deben seguir sonando'
    );
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('la musica arranca por defecto y el primer gesto de la pagina la desbloquea', async () => {
  const { calls, FakeAudioContext } = createAudioHarness();
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const listeners = [];
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);

  globalThis.document = {
    addEventListener(type, handler, options) {
      listeners.push({ type, handler, options });
    },
    removeEventListener(type, handler) {
      const index = listeners.findIndex(
        (entry) => entry.type === type && entry.handler === handler
      );
      if (index >= 0) listeners.splice(index, 1);
    }
  };

  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer
  });

  const musicStarts = () => calls.starts.filter((source) => source.loop === true);

  try {
    const { createSfx } = await import(SFX_URL);
    const sfx = createSfx();

    /* El juego llama a `autostart()` al arrancar, no al girar. */
    sfx.autostart();
    sfx.autostart();
    await wait();

    assert.equal(musicStarts().length, 1, 'autostart debe dejar la musica sonando sin gesto previo');
    assert.deepEqual(
      calls.gains,
      [{ value: 0.2, time: 1.25 }],
      'La musica debe arrancar con su volumen de fondo'
    );
    assert.equal(calls.silentBuffers, 0, 'Sin gesto no hace falta el buffer silencioso');

    /* Enganche unico del primer gesto, en captura para adelantarse a los controles. */
    assert.deepEqual(
      listeners.map((entry) => entry.type).sort(),
      ['click', 'keydown', 'pointerdown', 'touchend', 'touchstart'],
      'autostart debe enganchar los gestos habituales una sola vez'
    );
    assert.ok(
      listeners.every((entry) => entry.options && entry.options.capture === true),
      'El enganche debe escuchar en captura'
    );

    const gesture = listeners.find((entry) => entry.type === 'pointerdown');
    gesture.handler({ type: 'pointerdown' });
    await wait();

    assert.equal(calls.silentBuffers, 1, 'El primer gesto desbloquea el contexto');
    assert.equal(calls.decoded, 2, 'El primer gesto decodifica tambien los aplausos');
    assert.equal(musicStarts().length, 1, 'El gesto no debe duplicar la voz del bucle');
    assert.deepEqual(listeners, [], 'El enganche se retira tras el primer gesto');
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
  }
});

test('si el arranque no puede decodificar, el primer gesto reintenta la musica', async () => {
  const { calls, FakeAudioContext, decodedBuffer } = createAudioHarness({ failDecodes: 1 });
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);

  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer
  });

  const musicStarts = () => calls.starts.filter((source) => source.loop === true);

  try {
    const { createSfx } = await import(SFX_URL);
    const sfx = createSfx();

    sfx.autostart();
    await wait();

    assert.equal(calls.decoded, 1, 'El arranque intenta decodificar el bucle');
    assert.equal(musicStarts().length, 0, 'Sin buffer no debe quedar una voz muda');

    /* El fallo no queda memorizado: el primer gesto vuelve a decodificar. */
    sfx.unlock();
    await wait();

    assert.equal(calls.decoded, 3, 'El reintento decodifica aplausos y bucle');
    assert.equal(musicStarts().length, 1, 'La musica debe arrancar en el reintento');
    assert.equal(musicStarts()[0].buffer, decodedBuffer, 'El bucle reintentado debe sonar');
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
