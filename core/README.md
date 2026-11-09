# `core/` — Motor matemático puro

Este directorio contiene **toda** la lógica matemática y autoritativa de
`TROPICAL_GRID_6X5_95_10K`. Es la única fuente de verdad para pagos, cascadas,
multiplicadores, tiras y aleatoriedad.

## Reglas de aislamiento

- Solo se permite `require('node:crypto')`, `require('./...')` dentro de `core/`
  y la reexportación de `config/gameConfig.js` desde `core/constants.js`.
- **Prohibido** importar DOM, canvas, audio, `public/`, Express, base de datos,
  filesystem o cualquier módulo de `server/`.
- Las operaciones reciben el estado por parámetro (`model`, `grid`, `rng`, ...)
  y devuelven un resultado serializable. No leen variables globales de la UI.
- El dinero se calcula con enteros: centimos y micro-unidades de apuesta.
- La aleatoriedad de producción es el CSPRNG HMAC-DRBG de `rng.js`. `fastRng.js`
  es un PRNG determinista exclusivo para simulación y pruebas offline.

## Módulos

| Archivo | Responsabilidad |
| --- | --- |
| `constants.js` | Reexporta la configuración central de `config/gameConfig.js` (identidad, límites, símbolos, escalera, tiras, bonus y RTP). |
| `paytables.js` | Paytables de dispersión y scatter, pesos de símbolos y tabla de bombas. |
| `money.js` | Conversión unidades/micro/centimos, tramos de pago y utilidades enteras. |
| `rng.js` | CSPRNG HMAC-SHA256 con muestreo por rechazo, semillas y PRNG de construcción de tiras. |
| `fastRng.js` | sfc32 determinista para Monte Carlo offline. |
| `pickers.js` | Compilación y selección ponderada de símbolos/bombas. |
| `reels.js` | Tiras físicas, celdas, tirada inicial, gravedad y recarga. |
| `grid.js` | Evaluación de la matriz 6x5, pagos por dispersión, bombas y serialización. |
| `spin.js` | Resolución de una tirada con scatter, cascadas, tope y multiplicador. |
| `model.js` | Construcción inmutable del modelo y descripción pública `/api/game`. |
| `round.js` | Resolución de una ronda base o `BUY_FEATURE` con presupuesto máximo. |
| `index.js` | Fachada pública compatible con el contrato histórico del motor. |

## API pública

```js
const engine = require('./core');

const result = engine.playRound({
  betCents: 100,
  buyFeature: false,
  clientSeed: 'auditoria'
});
```

También se mantienen las exportaciones históricas (`createEngine`, `model`,
`gameInfo`, constantes, paytables, `isValidBetCredits`, `creditsToCents`, ...).
`server/engine/gridEngine.js` y `scripts/lib/fastRng.js` son únicamente alias de
compatibilidad y no contienen lógica.

## Configuración compartida

`config/gameConfig.js` es la fuente única de dimensiones, escalera de apuestas,
límites, bonus y defaults de entorno. El navegador no puede cargar CommonJS:
`scripts/build-game-config.js` genera `ui/config/gameConfig.js` como espejo ESM.
Ejecuta `npm run build:config` después de cambiar la configuración; el
build también se encadena en `npm start`, `npm run dev` y `vercel-build`.
