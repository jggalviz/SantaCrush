'use strict';

/**
 * Contrato de reproduccion del audio del juego.
 *
 * `sfx.js` es ESM dentro de un package CommonJS, asi que se carga por `data:`
 * URL. Se sustituyen `window` y `fetch` por dobles minimos para comprobar el
 * flujo real sin navegador: precarga de los tres MP3 (victoria, boton GIRAR y
 * bucle ambiental), decodificacion unica, volumenes de los GainNode, loop del
 * fondo, arranque por defecto de la musica, desbloqueo dentro del gesto y
 * respeto del mute.
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
        /* Ultimo volumen fijado: los tests lo usan para saber que MP3 suena. */
        value: null,
        gain: {
          setValueAtTime(value, time) {
            node.value = value;
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

test('la victoria, el boton GIRAR y el fondo suenan con los MP3 del tema', async () => {
  const { calls, FakeAudioContext, decodedBuffer } = createAudioHarness();
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);

  /* Los tres MP3 comparten el mismo buffer falso: se distinguen por el volumen
     que fija su GainNode (0.62 victoria, 0.5 giro, 0.2 musica). */
  const volumeOf = (source) => (source.connectedTo ? source.connectedTo.value : undefined);
  const isWinSource = (source) => volumeOf(source) === 0.62;
  const isSpinSource = (source) => volumeOf(source) === 0.5;

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
    const { createSfx, WIN_SOUND_SRC, SPIN_SOUND_SRC, MUSIC_SOUND_SRC } = await import(SFX_URL);
    assert.equal(WIN_SOUND_SRC, '/src/assets/AUDIO-WIN-santa-crush.mp3');
    assert.equal(SPIN_SOUND_SRC, '/src/assets/AUDIO-SPIN-santa-crush.mp3');
    assert.equal(MUSIC_SOUND_SRC, '/src/assets/Santa_Crush_Holiday_Loop_19s_256k.mp3');

    const sfx = createSfx();
    await wait();

    assert.deepEqual(
      calls.fetch.map((call) => call.url),
      [WIN_SOUND_SRC, SPIN_SOUND_SRC, MUSIC_SOUND_SRC],
      'createSfx debe precargar la victoria, el giro y el bucle una sola vez'
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

    assert.equal(calls.decoded, 3, 'Cada MP3 debe decodificarse una sola vez');
    assert.equal(calls.silentBuffers, 1, 'El gesto debe desbloquear una sola vez');
    assert.equal(
      calls.starts.filter((source) => source.buffer && source.buffer.silent).length,
      1,
      'El desbloqueo debe arrancar un unico buffer silencioso'
    );

    /* Musica de fondo: una sola voz, en bucle y mas suave que los efectos. */
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
    const winGains = calls.gains.filter((entry) => entry.value === 0.62);
    assert.deepEqual(
      winGains,
      [
        { value: 0.62, time: 1.25 },
        { value: 0.62, time: 1.25 }
      ],
      'La victoria debe fijar su propio volumen'
    );
    assert.ok(
      winGains.every((entry) => entry.value > musicVolume),
      `La victoria (${winGains[0].value}) debe oirse por encima de la musica (${musicVolume})`
    );
    assert.ok(
      winStarts.every((source) => source.stopped !== true),
      'Dos victorias seguidas deben solaparse sin cortarse'
    );

    /* El boton GIRAR suena con su MP3 y no acumula voces. */
    sfx.spin();
    sfx.spin();

    const spinStarts = calls.starts.filter(isSpinSource);
    assert.equal(spinStarts.length, 2, 'Cada giro inicia su propia voz');
    assert.equal(spinStarts[0].stopped, true, 'El techo del giro corta el barrido anterior');
    assert.ok(spinStarts[1].stopped !== true, 'El giro nuevo debe quedar sonando');
    assert.ok(
      spinStarts[0].connectedTo.value === 0.5,
      'El efecto del giro fija su propio volumen'
    );
    assert.ok(
      spinStarts[0].connectedTo.value > musicVolume &&
        spinStarts[0].connectedTo.value < winGains[0].value,
      'El giro debe quedar entre el fondo y la victoria'
    );

    sfx.setMuted(true);
    assert.ok(winStarts.every((source) => source.stopped === true), 'El mute debe detener todas las voces');
    assert.ok(spinStarts.every((source) => source.stopped === true), 'El mute tambien corta el giro');
    assert.equal(musicStarts[0].stopped, true, 'El mute debe detener el bucle ambiental');
    sfx.win();
    sfx.spin();
    assert.equal(
      calls.starts.filter(isWinSource).length,
      2,
      'El mute no debe reproducir la victoria'
    );
    assert.equal(
      calls.starts.filter(isSpinSource).length,
      2,
      'El mute no debe reproducir el giro'
    );

    /* Al reactivar el sonido el bucle ambiental vuelve solo y de forma
       sincrona: el buffer ya esta decodificado y iOS/Safari exige que la
       reproduccion ocurra dentro del propio gesto. */
    sfx.setMuted(false);
    const musicAfterUnmute = calls.starts.filter((source) => source.loop === true);
    assert.equal(
      musicAfterUnmute.length,
      2,
      'Con el buffer en cache el bucle debe volver sin esperar a una promesa'
    );
    await wait();
    assert.equal(musicAfterUnmute.length, 2, 'El mute no debe encadenar una segunda voz');
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
      ['click', 'keydown', 'keyup', 'mousedown', 'pointerdown', 'pointerup', 'touchend', 'touchstart'],
      'autostart debe enganchar los gestos que liberan el audio una sola vez'
    );
    assert.ok(
      listeners.every((entry) => entry.options && entry.options.capture === true),
      'El enganche debe escuchar en captura'
    );

    const gesture = listeners.find((entry) => entry.type === 'pointerdown');
    gesture.handler({ type: 'pointerdown' });
    await wait();

    assert.equal(calls.silentBuffers, 1, 'El primer gesto desbloquea el contexto');
    assert.equal(calls.decoded, 3, 'El primer gesto decodifica tambien la victoria y el giro');
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

test('la musica se reintenta sola al recargar o volver a la pestana, sin gesto', async () => {
  const { calls, FakeAudioContext, decodedBuffer } = createAudioHarness({ failDecodes: 1 });
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const windowListeners = [];
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
  const musicStarts = () => calls.starts.filter((source) => source.loop === true);

  globalThis.document = {
    hidden: false,
    addEventListener() {},
    removeEventListener() {}
  };
  globalThis.window = {
    AudioContext: FakeAudioContext,
    addEventListener(type, handler) {
      windowListeners.push({ type, handler });
    },
    removeEventListener() {}
  };
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer
  });

  try {
    const { createSfx } = await import(SFX_URL);
    const sfx = createSfx();

    sfx.autostart();
    sfx.autostart();
    await wait();

    /* Un unico enganche, en `window`, para los avisos del ciclo de vida. */
    assert.deepEqual(
      windowListeners.map((entry) => entry.type).sort(),
      ['focus', 'pageshow', 'visibilitychange'],
      'autostart debe escuchar recarga, foco y visibilidad una sola vez'
    );

    /* El primer intento no encontro audio utilizable: el navegador aun no lo
       libera sin interaccion (es el caso normal de una primera visita). */
    assert.equal(calls.decoded, 1, 'El arranque intenta decodificar el bucle');
    assert.equal(musicStarts().length, 0, 'Sin audio liberado no debe quedar una voz muda');

    /* Al recargar o volver a la pestana el navegador ya permite el autoplay. */
    const lifecycle = windowListeners.find((entry) => entry.type === 'pageshow');
    lifecycle.handler({ type: 'pageshow' });
    await wait();

    assert.equal(calls.decoded, 2, 'El aviso del ciclo de vida reintenta la decodificacion');
    assert.equal(musicStarts().length, 1, 'La musica debe arrancar sin ningun gesto del jugador');
    assert.equal(musicStarts()[0].buffer, decodedBuffer, 'El bucle debe sonar con su buffer');

    /* En segundo plano no se gasta trabajo: se reintenta al volver. */
    globalThis.document.hidden = true;
    lifecycle.handler({ type: 'visibilitychange' });
    await wait();
    assert.equal(calls.decoded, 2, 'Con el documento oculto no se reintenta');
    assert.deepEqual(
      windowListeners.map((entry) => entry.type).sort(),
      ['focus', 'pageshow', 'visibilitychange'],
      'autostart no debe duplicar los enganches del ciclo de vida'
    );

    /* Con el sonido silenciado los reintentos no deben sonar. */
    globalThis.document.hidden = false;
    sfx.setMuted(true);
    lifecycle.handler({ type: 'focus' });
    await wait();
    assert.equal(musicStarts().length, 1, 'En mute el reintento no debe arrancar el bucle');
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

    assert.equal(calls.decoded, 4, 'El reintento decodifica la victoria, el giro y el bucle');
    assert.equal(musicStarts().length, 1, 'La musica debe arrancar en el reintento');
    assert.equal(musicStarts()[0].buffer, decodedBuffer, 'El bucle reintentado debe sonar');
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
