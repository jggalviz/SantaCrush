# Meridianobet · Front (demo local autonoma)

Clon frontend/backend del slot **TROPICAL_GRID_6X5_95_10K** (rejilla 6x5,
GRID_PAYS, RTP certificado 95,08 %) preparado para funcionar **100 % en local**,
sin Supabase ni motores externos, y para re-brandearse como **Meridianobet**.

- Motor matematico, API y cliente viven en el mismo proceso (`npm start`).
- La capa de marca esta separada del arte del juego: ver
  [`docs/REBRANDING.md`](docs/REBRANDING.md).
- El modo autonomo se explica en [`docs/MODO_AUTONOMO.md`](docs/MODO_AUTONOMO.md).

## Arranque rapido

```bash
npm install
npm start           # prestart compila config, ui y el HTML generado
# http://localhost:3000
```

`.env` ya trae `TG_DEMO_OPERATOR_VIRTUAL=1`, asi que el backend arranca en
**modo autonomo local**:

```
Persistencia: memory  (SOLO DESARROLLO)
Modo operador: AUTONOMO LOCAL (cartera virtual, motor propio)
```

Comprobacion en caliente: `GET /api/health` devuelve
`operator.mode = "LOCAL_VIRTUAL_DEMO"` y `dbDriver = "memory"`.

Para volver al camino estandar (Supabase + motor externo) pon
`TG_DEMO_OPERATOR_VIRTUAL=0` y rellena `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY`. El flag es **incompatible con produccion**: con
`NODE_ENV=production` el arranque falla a proposito.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `public/index.html` | Documento servido (fuente; se compila a `server/generated`) |
| `public/src/css/style.css` | Maqueta base, arte y animaciones |
| `public/src/css/theme.css` | Capa de marca Meridianobet (rojo/blanco/gris) |
| `public/src/js/` | Utilidades del documento (autoplay de sonido, etc.) |
| `ui/` | Cliente modular del juego (fuente) -> espejo en `public/ui/` |
| `server/` | Express: rutas, auth, servicios, motor y configuracion |
| `engine/` | Motor matematico (RTP, reels, cascadas, paytable) |
| `config/gameConfig.js` | Parametros compartidos backend/cliente |
| `scripts/` | Builds (`build:config`, `build:ui`, `build:index`) y simulaciones |
| `test/` | Suite de `node --test` |

## Scripts

```bash
npm start        # servidor (compila antes con prestart)
npm run dev      # servidor con --watch
npm test         # suite completa
npm run simulate # simulacion del motor
npm run build        # paquete completo para produccion -> dist/ (se versiona)
npm run build:index  # obligatorio tras editar public/index.html
npm run build:ui     # obligatorio tras editar ui/
```

`npm run build` encadena config, espejo de la UI, CSS minificado, HTML generado y
el staging final en `dist/`. **`dist/` se versiona** (no esta en `.gitignore`):
el equipo de backend lo descarga con `git pull` de la rama `development` y lo
publica tal cual. Flujo, remotos y checklist en
[`docs/GIT_INTEGRATION.md`](docs/GIT_INTEGRATION.md).

## Rebranding

El tema Meridianobet **ya esta activo**: `public/index.html` abre con
`<html lang="es" data-theme="meridianobet">`.

1. Edita la paleta en `public/src/css/theme.css` (tokens `--brand-*`).
2. Si tocas el HTML, ejecuta `npm run build:index`.
3. Para volver al look candy, quita el atributo `data-theme` de `<html>` y
   reconstruye el HTML: `theme.css` queda inerte y el juego se ve como antes.
4. Sustituye logotipo, marcos y simbolos segun la guia `docs/REBRANDING.md`.

La capa de marca repinta lo que dibuja el CSS (boton de fichas, capsula de audio,
modal, marco interior del tablero y casillas). Las carcasas de la maquina, el
fondo y los simbolos son arte bitmap: para cambiarlos hay que reexportar los
assets, y la tabla de alcance de `docs/REBRANDING.md` indica cuales son.

## Documentacion

- [`docs/MODO_AUTONOMO.md`](docs/MODO_AUTONOMO.md) — operador virtual, verificacion, limites.
- [`docs/REBRANDING.md`](docs/REBRANDING.md) — paleta, logotipo, textos, checklist.
- [`docs/DEMO_MODE.md`](docs/DEMO_MODE.md) — "Fichas de Prueba" (saldo virtual).
- [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md) — despliegue en Vercel.
- [`docs/GIT_INTEGRATION.md`](docs/GIT_INTEGRATION.md) — remotos, rama `development` y entrega de `dist/` al backend.
- [`docs/MATH_MODEL.md`](docs/MATH_MODEL.md) — modelo matematico y RTP.
- [`ui/README.md`](ui/README.md) — arquitectura del cliente.
