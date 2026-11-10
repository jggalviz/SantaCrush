/**
 * Efectos de sonido y musica del cliente.
 *
 * Los efectos de interfaz (clic, caida, racimo, bomba, error) se sintetizan con
 * WebAudio; los tres sonidos del tema son MP3 entregados por el disenador y se
 * sirven tal cual, sin reencodear:
 *
 *   - `AUDIO-WIN-santa-crush.mp3`   victoria: 2,0 s, VBR ~114 kbps, 28 KB
 *   - `AUDIO-SPIN-santa-crush.mp3`  boton GIRAR: 2,4 s, 256 kbps, 76 KB
 *   - `Santa_Crush_Holiday_Loop_19s_256k.mp3`  fondo en bucle: 19,25 s,
 *     44,1 kHz estereo, 256 kbps CBR, 602 KB
 *
 * Los tres se precargan con `fetch`, se decodifican en el AudioContext
 * desbloqueado por el primer gesto del jugador y se reproducen con un
 * `GainNode` que fija el volumen. La victoria y el giro usan voces simultaneas
 * (con un techo) para que ninguna cascada quede muda, y el bucle ambiental
 * suena por debajo de los efectos.
 *
 * El asset y la peticion son del mismo origen, por lo que encajan con la CSP
 * (`default-src 'self'` / `connect-src 'self'`). Todo fallo de audio se ignora
 * en silencio: el juego nunca depende del sonido.
 *
 * La musica ambiental es la politica por defecto: `autostart()` la deja sonando
 * al cargar la pagina y, si el navegador bloquea el autoplay, el primer toque,
 * clic o tecla en cualquier parte del juego la arranca (no hace falta girar).
 */

export const WIN_SOUND_SRC = '/src/assets/AUDIO-WIN-santa-crush.mp3';
export const SPIN_SOUND_SRC = '/src/assets/AUDIO-SPIN-santa-crush.mp3';
export const MUSIC_SOUND_SRC = '/src/assets/Santa_Crush_Holiday_Loop_19s_256k.mp3';

/* Volumen lineal de la victoria (0-1): presente pero sin tapar la musica. */
const WIN_SOUND_VOLUME = 0.62;

/* El efecto del boton GIRAR abre la tirada: por encima del fondo y por debajo
   de la victoria, que es el remate de la ronda. */
const SPIN_SOUND_VOLUME = 0.5;

/* La musica ambiental queda por debajo de los dos efectos (0.2 < 0.5 < 0.62):
   es un colchon de fondo y nunca tapa el remate de una ronda. */
const MUSIC_VOLUME = 0.2;

/* Cascadas encadenadas: se permite que varias victorias suenen a la vez, pero
   con un techo para no saturar la salida ni acumular fuentes sin control. */
const MAX_WIN_VOICES = 3;

/* El giro no encadena: una sola voz, para que pulsar GIRAR otra vez no sume un
   segundo barrido sobre el que ya esta sonando. */
const MAX_SPIN_VOICES = 1;

/* Gestos que desbloquean el audio en cualquier navegador. El primero que ocurra
   arranca la musica ambiental, sin obligar al jugador a girar. */
const FIRST_GESTURES = ['pointerdown', 'touchstart', 'touchend', 'keydown', 'click'];

export function createSfx({ muted = false } = {}) {
  let context = null;
  let isMuted = muted;
  let gestureUnlocked = false;
  /* Voces de un solo disparo (victoria y giro) agrupadas por MP3: cada entrada
     guarda las fuentes vivas de ese audio para cortarlas al silenciar o al
     superar su techo. La musica tiene su propio canal (`musicSource`). */
  const activeVoices = new Map();
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

  /** Voces registradas para un MP3 concreto (se crean al primer disparo). */
  function voicesFor(src) {
    let voices = activeVoices.get(src);
    if (!voices) {
      voices = new Set();
      activeVoices.set(src, voices);
    }
    return voices;
  }

  /** Detiene y libera una voz concreta del MP3 indicado. */
  function stopVoice(src, source) {
    if (!source) return;
    const voices = activeVoices.get(src);
    if (voices) voices.delete(source);
    try {
      source.stop();
    } catch {
      /* la fuente ya habia terminado */
    }
  }

  /** Detiene todas las voces de un mismo MP3. */
  function stopSound(src) {
    const voices = activeVoices.get(src);
    if (!voices) return;
    for (const source of [...voices]) stopVoice(src, source);
  }

  /** Corta los efectos de un solo disparo (la musica tiene su propio canal). */
  function stopOneShots() {
    for (const src of [...activeVoices.keys()]) stopSound(src);
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

  /**
   * Reproduce un MP3 ya decodificado con su volumen y su techo de voces.
   *
   * Cada disparo inicia su propia voz para que las cascadas encadenadas no se
   * corten entre si. Si se supera el techo, sale la voz mas antigua de ese
   * mismo audio: el remate nuevo siempre se oye de inmediato.
   */
  function playBuffer(ctx, src, buffer, { volume, maxVoices }) {
    if (!ctx || !buffer || isMuted) return;

    const voices = voicesFor(src);
    while (voices.size >= maxVoices) {
      stopVoice(src, voices.values().next().value);
    }

    let source = null;
    try {
      source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => {
        const alive = activeVoices.get(src);
        if (alive) alive.delete(source);
      };
      voices.add(source);
      source.start(0);
    } catch {
      if (source) voices.delete(source);
      /* audio no disponible */
    }
  }

  /**
   * Suena un MP3 de un solo disparo (victoria o giro). Si el buffer aun no esta
   * decodificado se reproduce en cuanto lo este: el primer giro puede llegar
   * antes de que la red termine.
   */
  function playSound(src, options) {
    if (isMuted) return;
    const ctx = ensureContext();
    if (!ctx) return;
    unlockContext(ctx);

    const buffer = decodedBuffers.get(src);
    if (buffer) {
      playBuffer(ctx, src, buffer, options);
      return;
    }

    void decodeSound(ctx, src).then((decoded) => playBuffer(ctx, src, decoded, options));
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
      /* `loop` repite los 19 s del bucle sin cortes ni reinicios del contexto. */
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
    void preloadSound(SPIN_SOUND_SRC);
    void preloadSound(MUSIC_SOUND_SRC);
    const ctx = ensureContext();
    if (!ctx) return;
    unlockContext(ctx);
    /* Deja los tres buffers listos antes de que llegue el resultado del
       servidor y arranca el bucle ambiental dentro del gesto del jugador. */
    void decodeSound(ctx, WIN_SOUND_SRC);
    void decodeSound(ctx, SPIN_SOUND_SRC);
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
     tiene que decodificar y soltar los tres audios. La decodificacion espera al
     gesto cuando el navegador no permite crear el AudioContext antes. */
  void preloadSound(WIN_SOUND_SRC);
  void preloadSound(SPIN_SOUND_SRC);
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
      void preloadSound(SPIN_SOUND_SRC);
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
        stopOneShots();
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
    /**
     * Arranque de la tirada: el efecto del boton GIRAR. Una sola voz, para que
     * un segundo giro no sume un barrido encima del que ya esta sonando.
     */
    spin() {
      playSound(SPIN_SOUND_SRC, {
        volume: SPIN_SOUND_VOLUME,
        maxVoices: MAX_SPIN_VOICES
      });
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
    /** Remate de ronda: el MP3 de victoria, con voces simultaneas por cascada. */
    win() {
      playSound(WIN_SOUND_SRC, {
        volume: WIN_SOUND_VOLUME,
        maxVoices: MAX_WIN_VOICES
      });
    },
    error() {
      tone({ freq: 220, toFreq: 140, duration: 0.22, type: 'sawtooth', volume: 0.045 });
    }
  };
}
