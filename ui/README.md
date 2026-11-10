# `ui/` — Capa gráfica y de interfaz

Fuente canónica de la SPA. Todo el código de presentación vive aquí; `core/`
permanece como motor autoritativo en el servidor y **no se importa desde el
navegador**.

## Estructura

| Ruta | Responsabilidad |
| --- | --- |
| `main.js` | Composición: crea servicios, controlador, vista y controles. |
| `services/ApiClient.js` | **Único** cliente HTTP del backend. Sin DOM ni apuestas. |
| `services/SessionManager.js` | Token, storage, sesión demo y renovación. |
| `controllers/GameController.js` | Estado de apuesta, auto-spin y flujo de ronda. |
| `components/GameControls.js` | Eventos de usuario → acciones del controlador. |
| `renderers/GameView.js` | Renderer del tablero, HUD, modales y overlay. |
| `renderers/RoundAnimator.js` | Reproduce una ronda ya resuelta por el servidor. |
| `renderers/reels.js`, `renderers/fx.js` | Rodillos y efectos visuales. |
| `lib/*` | Formato, matemática de rodillos, tiempos y niveles de premio. |
| `audio/sfx.js` | Efectos de interfaz (WebAudio), MP3 de victoria y del botón GIRAR, y música de fondo en bucle que arranca por defecto. |
| `config/gameConfig.js` | Espejo ESM **generado** desde `config/gameConfig.js`. |

## Límites de responsabilidad

- `ApiClient` es el único que conoce `/api/health`, `/api/game`, `/api/player`,
  `/api/session`, `/api/demo/session` y `/api/spin`.
- `GameController` decide apuesta, compra de bonus, reintentos y auto-spin, pero
  **no toca el DOM**.
- `GameView` y `RoundAnimator` solo pintan el payload: no piden datos, no
  calculan premios ni modifican saldo. La cifra final siempre es la del servidor.
- `GameControls` no hace red ni aritmética de apuestas; traduce clics/teclas a
  métodos del controlador.

## Endpoint del motor

El cliente usa **mismo origen** (`''`) por defecto. Para apuntar a un motor
externo no hay que recompilar; se resuelve por prioridad:

1. `window.__TROPICAL_GRID__ = { apiBaseUrl: 'https://engine.latingames.net' }`
   (inyectado por el operador antes de cargar `/ui/main.js`).
2. `<meta name="game-api-base" content="https://engine.latingames.net" />` en
   `public/index.html`.
3. `API.baseUrl` de `config/gameConfig.js` (vacío = mismo origen).

Con el modo autónomo local (`TG_DEMO_OPERATOR_VIRTUAL=1`) la CSP solo permite
`'self'`, así que el cliente siempre habla con el motor de este mismo proceso.
Ver `docs/MODO_AUTONOMO.md`.

## Tema visual (rebranding)

La identidad se cambia en `public/src/css/theme.css` (paleta `--brand-*`,
acentos, superficies y tipografía), nunca en la lógica de `ui/`. `style.css`
conserva la maqueta y el arte; `theme.css` se carga después y está aislado bajo
`html[data-theme="santa-crush"]`. Guía completa: `docs/REBRANDING.md`.

Con un endpoint externo hay que:

- Añadir el origen del frontend a `ALLOWED_ORIGINS` del backend.
- Mantener el host del motor en `connectOrigins` (`config/gameConfig.js`) para
  la CSP de Express y en `vercel.json` para el CDN.
- Servir el motor por HTTPS y permitir `Authorization` y `Content-Type` en CORS.

## Build y publicación

`public/ui/**` es un **espejo generado**. No se edita a mano:

```bash
npm run build:config   # genera ui/config/gameConfig.js y refresca public/ui
npm run build:ui       # copia ui/**/*.js -> public/ui/**/*.js
npm run build:index    # public/index.html -> server/generated/indexHtml.js
```

`npm start`, `npm run dev` y `vercel-build` ejecutan los tres pasos. El test
`test/uiArchitecture.test.js` falla si el espejo queda desincronizado o si un
renderer/componente vuelve a mezclar red, apuestas y dibujado.
