# `config/` — Configuración compartida

`gameConfig.js` es la **fuente única** de:

- Identidad del juego (`code`, `name`, versiones).
- Dimensiones del grid, símbolos y tiras.
- Escalera de apuestas y tiradas automáticas.
- Límites de exposición, cascadas y bonus.
- Compra de feature y RTP certificado.
- Valores por defecto del modo demo y de las variables de entorno
  (`DEMO_MODE_ENABLED`, TTLs, saldo inicial, rate limit, etc.).

## Consumidores

| Consumidor | Cómo lo carga |
| --- | --- |
| `core/` | `core/constants.js` reexporta `require('../config/gameConfig').constants`. |
| `server/` | `server/config.js` usa `GAME_CONFIG.env`, `.demo` y `.limits` como fallback de `process.env`. |
| Navegador | `ui/config/gameConfig.js` (espejo ESM generado) y `public/ui/config/gameConfig.js` (copia publicada). |

## Espejo ESM

El navegador no puede ejecutar CommonJS. Después de cambiar `gameConfig.js`
hay que regenerar el espejo:

```bash
npm run build:config
```

`npm run build:config` escribe `ui/config/gameConfig.js` y refresca el espejo
publicado en `public/ui/**`. `npm start`, `npm run dev`, `vercel-build` y la
suite de tests verifican que ambos estén sincronizados. **No edites**
`ui/config/gameConfig.js` ni `public/ui/**` a mano.

El contrato HTTP del cliente (`api.baseUrl`, `api.externalBaseUrl`,
`api.timeoutMs`, `api.connectOrigins`) también vive aquí.

## Reglas

- Sin `process.env`, DOM, Express, base de datos ni filesystem.
- Sin lógica de juego: solo datos inmutables.
- Los secretos (`SESSION_SECRET`, claves de Supabase) **no** viven aquí; siguen
  en `server/config.js` y en las variables de entorno.
