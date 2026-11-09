/**
 * Efectos de sonido y musica del cliente.
 *
 * Los efectos cortos se sintetizan con WebAudio. La victoria usa los aplausos
 * `AUDIO-WIN-NEW-stadium-applause.MP3` (MP3 128 kbps, ~40 KB) y la musica
 * ambiental el bucle `Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3` (LAME VBR
 * `-q:a 4`, ~164 kbps y ~401 KB frente a los ~627 KB del maestro a 256 kbps;
 * mismo 44,1 kHz estereo y misma ganancia). Ambos se precargan con `fetch`, se
 * decodifican en el AudioContext desbloqueado por el primer gesto del jugador y
 * se reproducen con un `GainNode` que fija el volumen. Las victorias encadenadas
 * usan voces simultaneas (con un techo) para que ninguna cascada quede muda y el
 * bucle ambiental suena por debajo de los aplausos.
 *
 * El asset y la peticion son del mismo origen, por lo que encajan con la CSP
 * (`default-src 'self'` / `connect-src 'self'`). Todo fallo de audio se ignora
 * en silencio: el juego nunca depende del sonido.
 *
 * La musica ambiental es la politica por defecto: `autostart()` la deja sonando
 * al cargar la pagina y, si el navegador bloquea el autoplay, el primer toque,
 * clic o tecla en cualquier parte del juego la arranca (no hace falta girar).
 */

export const WIN_SOUND_SRC = '/src/assets/AUDIO-WIN-NEW-stadium-applause.MP3';
export const MUSIC_SOUND_SRC = '/src/assets/Sport_Crush_Energy_Gaming_Loop_20s_160k.mp3';

/* Volumen lineal de los aplausos (0-1): presente pero sin tapar los efectos. */
const WIN_SOUND_VOLUME = 0.62;

/* La musica ambiental queda por debajo de la victoria (0.2 < 0.62): es un
   colchon de fondo y los aplausos siempre se oyen por encima de la mezcla. */
const MUSIC_VOLUME = 0.2;

/* Cascadas encadenadas: se permite que varias victorias suenen a la vez, pero
   con un techo para no saturar la salida ni acumular fuentes sin control. */
const MAX_WIN_VOICES = 3;

/* Gestos que desbloquean el audio en cualquier navegador. El primero que ocurra
   arranca la musica ambiental, sin obligar al jugador a girar. */
const FIRST_GESTURES = ['pointerdown', 'touchstart', 'touchend', 'keydown', 'click'];

export function createSfx({ muted = false } = {}) {
  let context = null;
  let isMuted = muted;
  let gestureUnlocked = false;
  let activeWinSources = new Set();
  let musicSource = null;
  let musicGain = null;
  /* Enganche del primer gesto de la pagina; se retira en cuanto se usa. */
  let gestureBound = false;
  let firstGestureHandler = null;

  /* Cache por URL: cada MP3 se descarga y se decodifica una sola vez. */
  const audioData = new Map();
  const audioRequests = new Map();
  const decodedBuffers = new Map();
  const decodingRequests = new Map();

  function ensureContext() {
    if (isMuted || typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      if (!context) context = new Ctor();
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    } catch {
      return null;
    }
  }

  /**
   * Desbloquea el contexto dentro del gesto del jugador. Un buffer silencioso
   * de una muestra cubre iOS/Safari incluso si el primer sonido real llega
   * despues de la respuesta del servidor, ya fuera del gesto.
   */
  function unlockContext(ctx) {
    const resumed = ctx.state === 'suspended' ? ctx.resume() : null;
    if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});

    if (gestureUnlocked) return;
    gestureUnlocked = true;
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
      const source = ctx.createBufferSource();
      source.buffer = silent;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      /* el contexto seguira intentando reproducir con normalidad */
    }
  }

  /** Detiene y libera una voz concreta (o todas si no se pasa ninguna). */
  function stopWinSource(source) {
    if (!source) return;
    activeWinSources.delete(source);
    try {
      source.stop();
    } catch {
      /* la fuente ya habia terminado */
    }
  }

  function stopWinSound() {
    for (const source of [...activeWinSources]) stopWinSource(source);
  }

  /**
   * Descarga el MP3 de una ruta y la cachea. La precarga de red no necesita
   * AudioContext: puede lanzarse en cuanto se crea el reproductor.
   */
  function preloadSound(src) {
    if (audioRequests.has(src)) return audioRequests.get(src);
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      const empty = Promise.resolve(null);
      audioRequests.set(src, empty);
      return empty;
    }

    const request = fetch(src, {
      cache: 'force-cache',
      credentials: 'same-origin'
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => {
        audioData.set(src, data);
        return data;
      })
      .catch(() => {
        /* Un fallo de red no se memoriza: el siguiente gesto puede reintentar. */
        audioRequests.delete(src);
        return null;
      });

    audioRequests.set(src, request);
    return request;
  }

  /** Decodifica un MP3 una sola vez; sin contexto valido devuelve `null`. */
  function decodeSound(ctx, src) {
    if (!ctx) return Promise.resolve(null);
    if (decodedBuffers.has(src)) return Promise.resolve(decodedBuffers.get(src));
    if (decodingRequests.has(src)) return decodingRequests.get(src);

    const cachedData = audioData.get(src);
    const request = (cachedData ? Promise.resolve(cachedData) : preloadSound(src))
      .then((data) => {
        if (!data) return null;
        return new Promise((resolve) => {
          try {
            /* Safari antiguo solo admite callbacks; Chrome devuelve promesa. */
            const decoding = ctx.decodeAudioData(
              data.slice(0),
              (buffer) => resolve(buffer),
              () => resolve(null)
            );
            if (decoding && typeof decoding.then === 'function') {
              decoding.then(resolve).catch(() => resolve(null));
            }
          } catch {
            resolve(null);
          }
        });
      })
      .then((buffer) => {
        if (buffer) {
          decodedBuffers.set(src, buffer);
        } else {
          /* Sin buffer el intento no se memoriza: el proximo gesto reintenta
             (algunos navegadores rechazan decodificar antes del desbloqueo). */
          decodingRequests.delete(src);
        }
        return buffer;
      })
      .catch(() => {
        decodingRequests.delete(src);
        return null;
      });

    decodingRequests.set(src, request);
    return request;
  }

  function playWinSound(ctx, buffer) {
    if (!ctx || !buffer || isMuted) return;

    /* Cada premio inicia su propia voz para que las cascadas encadenadas no se
       corten entre si. Si se supera el techo, sale la victoria mas antigua:
       el premio nuevo siempre se oye de inmediato. */
    while (activeWinSources.size >= MAX_WIN_VOICES) {
      stopWinSource(activeWinSources.values().next().value);
    }

    let source = null;
    try {
      source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(WIN_SOUND_VOLUME, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => activeWinSources.delete(source);
      activeWinSources.add(source);
      source.start(0);
    } catch {
      if (source) activeWinSources.delete(source);
      /* audio no disponible */
    }
  }

  /** Detiene el bucle ambiental y libera su GainNode. */
  function stopMusic() {
    if (!musicSource) return;
    const source = musicSource;
    musicSource = null;
    try {
      source.stop();
    } catch {
      /* la fuente ya habia terminado */
    }
    try {
      if (musicGain) musicGain.disconnect();
    } catch {
      /* el nodo ya estaba desconectado */
    }
    musicGain = null;
  }

  /** Arranca el bucle una sola vez; si ya suena, no duplica la fuente. */
  function startMusic(ctx, buffer) {
    if (!ctx || !buffer || isMuted || musicSource) return;

    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      /* `loop` repite los 20 s sin cortes ni reinicios del contexto. */
      source.loop = true;
      gain.gain.setValueAtTime(MUSIC_VOLUME, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        if (musicSource === source) musicSource = null;
      };
      musicSource = source;
      musicGain = gain;
      source.start(0);
    } catch {
      musicSource = null;
      musicGain = null;
      /* audio no disponible */
    }
  }

  /** Decodifica el bucle y lo deja sonando (idempotente y silencioso al fallar). */
  function ensureMusic(ctx) {
    if (!ctx || isMuted) return Promise.resolve(null);
    return decodeSound(ctx, MUSIC_SOUND_SRC).then((buffer) => {
      startMusic(ctx, buffer);
      return buffer;
    });
  }

  /**
   * Desbloquea el audio y deja lista la musica ambiental.
   *
   * Debe correr dentro de un gesto del jugador: es lo que autoriza al navegador
   * a reproducir. Se reutiliza tanto en el primer gesto de la pagina como en los
   * botones del juego, y es idempotente (no duplica voces ni decodificaciones).
   */
  function startAudio() {
    void preloadSound(WIN_SOUND_SRC);
    void preloadSound(MUSIC_SOUND_SRC);
    const ctx = ensureContext();
    if (!ctx) return;
    unlockContext(ctx);
    /* Deja ambos buffers listos antes de que llegue el resultado del servidor
       y arranca el bucle ambiental dentro del gesto del jugador. */
    void decodeSound(ctx, WIN_SOUND_SRC);
    void ensureMusic(ctx);
  }

  function detachFirstGesture() {
    const handler = firstGestureHandler;
    firstGestureHandler = null;
    if (!handler) return;
    if (typeof document === 'undefined' || !document.removeEventListener) return;
    for (const type of FIRST_GESTURES) {
      document.removeEventListener(type, handler, { capture: true });
    }
  }

  /**
   * La musica es la politica por defecto: si el navegador bloquea el autoplay,
   * el primer toque, clic o tecla en cualquier parte del juego la arranca. El
   * enganche usa captura para adelantarse a los controles de la consola y se
   * retira en cuanto se usa (una sola vez, aunque se pulse rapido).
   */
  function bindFirstGesture() {
    if (gestureBound) return;
    gestureBound = true;
    if (typeof document === 'undefined' || !document.addEventListener) return;

    const onGesture = () => {
      detachFirstGesture();
      startAudio();
    };

    firstGestureHandler = onGesture;
    for (const type of FIRST_GESTURES) {
      document.addEventListener(type, onGesture, { capture: true });
    }
  }

  function tone({ freq = 440, toFreq = null, duration = 0.12, type = 'sine', volume = 0.06, delay = 0 }) {
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      const startAt = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startAt);
      if (toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), startAt + duration);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.02);
    } catch {
      /* audio no disponible */
    }
  }

  /* La red se precarga en cuanto se crea el reproductor: `autostart()` solo
     tiene que decodificar y soltar la musica. La decodificacion espera al
     gesto cuando el navegador no permite crear el AudioContext antes. */
  void preloadSound(WIN_SOUND_SRC);
  void preloadSound(MUSIC_SOUND_SRC);

  return {
    /**
     * Arranque por defecto del audio del juego.
     *
     * Intenta poner la musica en marcha ya (navegadores/PWA que permiten el
     * autoplay) y engancha el primer gesto de la pagina para completar el
     * desbloqueo cuando el navegador lo exige. Es idempotente.
     */
    autostart() {
      bindFirstGesture();
      void preloadSound(WIN_SOUND_SRC);
      void preloadSound(MUSIC_SOUND_SRC);
      const ctx = ensureContext();
      if (!ctx) return;
      void ensureMusic(ctx);
    },
    unlock() {
      startAudio();
    },
    setMuted(value) {
      isMuted = Boolean(value);
      if (isMuted) {
        stopWinSound();
        stopMusic();
        return;
      }
      /* Al reactivar el sonido el bucle vuelve solo, sin esperar a la red. */
      const ctx = ensureContext();
      if (ctx) void ensureMusic(ctx);
    },
    isMuted() {
      return isMuted;
    },
    click() {
      tone({ freq: 520, toFreq: 640, duration: 0.07, type: 'triangle', volume: 0.05 });
    },
    spin() {
      tone({ freq: 180, toFreq: 320, duration: 0.28, type: 'sawtooth', volume: 0.035 });
    },
    drop(index = 0) {
      tone({ freq: 300 + index * 18, toFreq: 190, duration: 0.1, type: 'sine', volume: 0.03 });
    },
    cluster(size = 8) {
      const base = 420 + Math.min(size, 20) * 16;
      tone({ freq: base, toFreq: base * 1.5, duration: 0.16, type: 'triangle', volume: 0.045 });
    },
    bomb() {
      tone({ freq: 150, toFreq: 60, duration: 0.3, type: 'square', volume: 0.04 });
      tone({ freq: 320, toFreq: 120, duration: 0.24, type: 'sawtooth', volume: 0.025, delay: 0.03 });
    },
    win() {
      if (isMuted) return;
      const ctx = ensureContext();
      if (!ctx) return;
      unlockContext(ctx);

      const buffer = decodedBuffers.get(WIN_SOUND_SRC);
      if (buffer) {
        playWinSound(ctx, buffer);
        return;
      }

      /* Si la decodificacion aun no termino, reproduce en cuanto este lista. */
      void decodeSound(ctx, WIN_SOUND_SRC).then((decoded) => playWinSound(ctx, decoded));
    },
    error() {
      tone({ freq: 220, toFreq: 140, duration: 0.22, type: 'sawtooth', volume: 0.045 });
    }
  };
}
