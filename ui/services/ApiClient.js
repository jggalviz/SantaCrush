/**
 * Servicio HTTP del juego (capa de red exclusiva).
 *
 * Reglas:
 *  - Este modulo SOLO habla con el backend. No conoce el DOM, ni el tablero,
 *    ni el estado de apuestas: recibe datos y devuelve JSON.
 *  - Todas las acciones de juego son POST (nunca GET) para que no puedan
 *    cachearse ni dispararse desde un enlace.
 *  - El token viaja en `Authorization: Bearer ...`; jamas en la URL.
 *  - Cada peticion tiene timeout y una clasificacion de error comun.
 *  - El endpoint es configurable en runtime: mismo origen por defecto,
 *    `https://engine.latingames.net` u otro motor sin recompilar la UI.
 */

import { API, DEMO } from '../config/gameConfig.js';

/* Rutas relativas al backend. Si `baseUrl` es externo, se antepone tal cual. */
export const API_PATHS = Object.freeze({
  health: '/api/health',
  gameInfo: '/api/game',
  player: '/api/player',
  session: '/api/session',
  demoSession: '/api/demo/session',
  spin: '/api/spin'
});

export const RUNTIME_CONFIG_KEY = '__TROPICAL_GRID__';

export class ApiError extends Error {
  constructor({ code = 'NETWORK_ERROR', message = 'Error de red.', status = 0, details = null, requestId = null, kind = 'http' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
    this.kind = kind; // 'http' | 'network' | 'timeout' | 'parse'
  }

  get isAuth() {
    return this.status === 401;
  }

  get isRetryable() {
    return this.kind === 'network' || this.kind === 'timeout' || this.status === 429 || this.status >= 500;
  }
}

/**
 * Normaliza el endpoint configurado.
 *
 * Acepta `''` (mismo origen), rutas absolutas (`/gateway`), URLs `http(s)` y
 * hosts sin esquema (`engine.latingames.net` -> `https://...`). Cualquier valor
 * invalido degrada a mismo origen para no romper el arranque del cliente.
 *
 * @param {*} value
 * @returns {string}
 */
export function normalizeApiBaseUrl(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const withoutTrailingSlash = raw.replace(/\/+$/, '');
  if (!withoutTrailingSlash) return '';

  if (/^https?:\/\//i.test(withoutTrailingSlash)) return withoutTrailingSlash;
  if (withoutTrailingSlash.startsWith('//')) return `https:${withoutTrailingSlash}`;
  if (withoutTrailingSlash.startsWith('/')) return withoutTrailingSlash;

  /* Host sin esquema: el caso habitual al configurar el motor externo. */
  if (/^[a-z0-9.-]+(?::\d+)?(?:\/[^\s]*)?$/i.test(withoutTrailingSlash)) {
    return `https://${withoutTrailingSlash}`;
  }

  return '';
}

/**
 * Resuelve el endpoint por prioridad:
 *   1. `window.__TROPICAL_GRID__.apiBaseUrl` (inyectado por el operador).
 *   2. `<meta name="game-api-base" content="...">`.
 *   3. `API.baseUrl` de `config/gameConfig.js` (mismo origen por defecto).
 *
 * @param {{ windowRef?: object, documentRef?: object }} [refs]
 * @returns {string}
 */
export function resolveApiBaseUrl({ windowRef = globalThis.window, documentRef = globalThis.document } = {}) {
  const runtime = windowRef && windowRef[RUNTIME_CONFIG_KEY];
  if (runtime && typeof runtime.apiBaseUrl === 'string' && runtime.apiBaseUrl.trim()) {
    return normalizeApiBaseUrl(runtime.apiBaseUrl);
  }

  if (documentRef && typeof documentRef.querySelector === 'function') {
    const meta = documentRef.querySelector('meta[name="game-api-base"]');
    if (meta && typeof meta.content === 'string' && meta.content.trim()) {
      return normalizeApiBaseUrl(meta.content);
    }
  }

  return normalizeApiBaseUrl(API.baseUrl);
}

/** Une base y ruta sin duplicar ni perder la barra inicial. */
export function joinApiUrl(baseUrl, path) {
  const base = normalizeApiBaseUrl(baseUrl);
  const route = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${route}` : route;
}

export class ApiClient {
  /**
   * @param {object} options
   * @param {string} [options.baseUrl] endpoint ('' = mismo origen)
   * @param {() => (string|null)} [options.getToken]
   * @param {number} [options.timeoutMs]
   * @param {object} [options.windowRef]
   * @param {object} [options.documentRef]
   */
  constructor({
    baseUrl,
    getToken = () => null,
    timeoutMs = API.timeoutMs,
    windowRef = globalThis.window,
    documentRef = globalThis.document
  } = {}) {
    this.baseUrl = normalizeApiBaseUrl(
      baseUrl === undefined ? resolveApiBaseUrl({ windowRef, documentRef }) : baseUrl
    );
    this.getToken = getToken;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : API.timeoutMs;
  }

  /** Endpoint efectivo (util para diagnostico y tests). */
  url(path) {
    return joinApiUrl(this.baseUrl, path);
  }

  async request(method, path, { body, timeoutMs, headers = {} } = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || this.timeoutMs);

    const finalHeaders = { Accept: 'application/json', ...headers };
    const token = this.getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
    if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';

    let response;
    try {
      response = await fetch(this.url(path), {
        method,
        headers: finalHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ApiError({ code: 'TIMEOUT', message: 'El servidor tardó demasiado en responder.', kind: 'timeout' });
      }
      throw new ApiError({ code: 'NETWORK_ERROR', message: 'No hay conexión con el servidor.', kind: 'network' });
    } finally {
      clearTimeout(timeout);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const info = (payload && payload.error) || {};
      throw new ApiError({
        code: info.code || `HTTP_${response.status}`,
        message: info.message || `Error HTTP ${response.status}.`,
        status: response.status,
        requestId: info.requestId || response.headers.get('X-Request-Id'),
        details: info.details || null,
        kind: 'http'
      });
    }

    if (!payload) {
      throw new ApiError({ code: 'INVALID_RESPONSE', message: 'Respuesta no válida del servidor.', status: response.status, kind: 'parse' });
    }

    return payload;
  }

  health() {
    return this.request('GET', API_PATHS.health);
  }

  gameInfo() {
    return this.request('GET', API_PATHS.gameInfo);
  }

  player() {
    return this.request('GET', API_PATHS.player);
  }

  createSession(playerId) {
    const body = {};
    if (playerId) body.playerId = playerId;
    return this.request('POST', API_PATHS.session, { body });
  }

  /**
   * Sesion de "Fichas de Prueba": el backend emite un token con `demo: true`
   * y una cartera virtual (1.000,00 VES por defecto). No requiere token previo.
   */
  createDemoSession(playerId = DEMO.guestId) {
    return this.request('POST', API_PATHS.demoSession, { body: { playerId } });
  }

  /**
   * Resuelve una ronda. `roundRef` es obligatorio para que un reintento no
   * pueda cobrar dos veces.
   */
  spin({ betCents, buyFeature = false, roundRef, clientSeed }) {
    const body = { betCents, buyFeature };
    if (roundRef) body.roundRef = roundRef;
    if (clientSeed) body.clientSeed = clientSeed;
    return this.request('POST', API_PATHS.spin, { body });
  }
}
