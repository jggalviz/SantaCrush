# Despliegue en Vercel

Guía para desplegar **Tropical Grid 6x5** (frontend estático + backend Express
autoritativo) en Vercel. El backend sigue siendo el mismo: el cliente nunca
calcula resultados ni saldos.

## 1. Por qué aparecía "The page could not be found"

Ese 404 es la página de Vercel, no un error de la aplicación. Se producía porque
el repositorio no tenía nada que Vercel supiera ejecutar/servir en `/`:

| Problema | Efecto |
| --- | --- |
| No existía `vercel.json` | Vercel aplicaba la configuración por defecto (o una vieja del panel) |
| No existía una entry que Vercel detecte para Express | `npm start` **no se ejecuta** en Vercel; el backend nunca arrancaba |
| `server/index.js` no está en la lista de entries detectadas | Vercel solo busca `app\|index\|server.{js,cjs,mjs,ts,…}` en la raíz o en `src/` |
| No existía `public/` | Vercel ignora `express.static()`; el HTML/CSS/JS no se publicaba |
| Posible ajuste heredado en el panel (`Root Directory`/`Output Directory`) | Vercel buscaba archivos en una carpeta que no existe |

Vercel **no ejecuta `npm start`**: despliega funciones. Para Express, el modelo
soportado es «una sola función que exporta la app» + estáticos en `public/**`.

## 2. Estructura actual

```
.
├── server.js            # entry que detecta Vercel: exporta la app Express
├── vercel.json          # framework "express" + cabeceras de los estáticos
├── ui/                  # fuente canónica de la capa gráfica (ES Modules)
│   ├── main.js
│   ├── services/        # ApiClient (único HTTP) + SessionManager
│   ├── controllers/     # GameController (apuestas, sin DOM)
│   ├── components/      # GameControls (eventos → acciones)
│   ├── renderers/       # GameView, RoundAnimator, reels, fx
│   ├── lib/             # formato, reelMath, timing, winLevel
│   ├── audio/
│   └── config/          # gameConfig.js GENERADO (npm run build:config)
├── public/              # árbol publicado por el CDN
│   ├── index.html       # fuente única del HTML (genera server/generated/indexHtml.js)
│   ├── ui/              # espejo GENERADO de ui/ (npm run build:ui)
│   └── src/
│       ├── css/style.min.css   # generado por npm run build:css (fuente: style.css)
│       └── assets/
├── server/              # backend (NO se publica como estático)
│   ├── generated/
│   │   └── indexHtml.js # generado desde public/index.html (npm run build:index)
│   ├── index.js         # servidor local (puerto, timeouts, SIGTERM)
│   ├── app.js           # createApp(): API + / + estáticos locales
│   ├── routes/ …
│   └── services/ …
├── scripts/  sql/  test/  docs/
└── .env.example
```

- **Local:** `npm start` → `server/index.js` → sirve `public/` y `/api/*` en
  `http://localhost:3000`. `prestart` regenera el espejo `public/ui/**` y
  `server/generated/indexHtml.js`.
- **Vercel:** el CDN publica `public/**` y `/index.html`; `/` y `/api/*` los
  atiende la función `server.js`. El bundle de la función **excluye** `public/`
  y `.env` (ver §5.1); el HTML de `/` viaja incrustado en
  `server/generated/indexHtml.js`.

> `server.js` debe contener `require('express')` de forma literal: el builder
> oficial `@vercel/express` lo inspecciona para detectar el entrypoint. Si algún
> día se refactoriza, no muevas ese import fuera del archivo.

## 3. Configuración del proyecto en Vercel

Al importar el repositorio (`jggalviz/TROPICAL_GRID_6X5_95_10K`), deja estos
valores en *Project Settings*:

| Ajuste | Valor |
| --- | --- |
| **Root Directory** | *(vacío / raíz del repo)* |
| **Framework Preset** | `Express` (además queda fijado en `vercel.json`) |
| **Build Command** | *(vacío: usa el del preset)* |
| **Output Directory** | *(vacío: el preset sirve `public/`)* |
| **Install Command** | `npm install` (por `package-lock.json`) |
| **Node.js Version** | `22.x` o `20.x` (`engines` exige `>=20`) |

> Si el proyecto ya existía con `Root Directory`, `Build Command` u
> `Output Directory` personalizados, bórralos y vuelve a desplegar. Un
> `Output Directory` apuntando a `dist/` produce exactamente el 404 inicial.

## 4. Variables de entorno

Configúralas en **Production** y **Preview** (*Settings → Environment
Variables*). No subas `.env` al repositorio.

### Obligatorias

| Variable | Valor |
| --- | --- |
| `SESSION_SECRET` | 64 caracteres hex (32 bytes). Generar con el comando de abajo |
| `ALLOW_DEV_SESSION` | `false` (obligatorio en producción) |

```bash
# Generar SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Con `SESSION_SECRET` y el modo "Fichas de Prueba" (activado por defecto) el
juego arranca **sin Supabase**: ver *Demo autónoma* más abajo. Para liquidar
saldo real añade además:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://<proyecto>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role` (solo backend) |

Antes del primer despliegue, ejecuta `sql/schema.sql` en el SQL Editor de
Supabase (crea tablas y la RPC atómica `play_spin`).

### Demo autónoma (sin Supabase)

`server/config.js` detecta un **despliegue demo autónomo** cuando:

```text
DEMO_MODE_ENABLED=true   y   SUPABASE_URL/SERVICE_ROLE_KEY sin definir
```

En ese caso:

- `DB_DRIVER` se fuerza a `memory` (se ignora cualquier `DB_DRIVER` heredado) y
  **`NODE_ENV=production` deja de bloquear** el arranque.
- La interfaz se sirve igual (`/` + `public/src/**` en el CDN) y la API resuelve
  `/api/demo/session`, `/api/spin` y `/api/player` en la cartera virtual
  (`server/services/demoWallet.js`): nunca se escribe en una base de datos.
- `ALLOW_DEV_SESSION` sigue obligatoriamente `false`: el modo demo emite tokens
  con el claim `demo: true`, no sesiones de jugador real.
- En los Runtime Logs aparece un aviso:
  `Despliegue autonomo de DEMOSTRACION en produccion…` y `/api/health` publica
  `dbDriver: "memory"`, `operator.mode: "STANDALONE_DEMO"` y
  `operator.virtualWallet: true`.
- Los saldos viven en RAM por instancia: al reiniciar (o cambiar de instancia en
  serverless) el invitado vuelve a 1.000,00 de saldo virtual.

Para exigir persistencia real basta con definir las credenciales de Supabase (el
modo demo se desactiva solo) o `DEMO_MODE_ENABLED=false`. En ese caso vuelve el
contrato estricto de abajo.

### Opcionales (modo "Fichas de Prueba")

`DEMO_MODE_ENABLED=true`, `DEMO_GUEST_ID`, `DEMO_GUEST_NAME`, `DEMO_CURRENCY`,
`DEMO_START_BALANCE_CENTS`, `DEMO_SESSION_TTL_MS`, `DEMO_TOKEN_TTL_SECONDS`,
`DEMO_MAX_SESSIONS`, `DEMO_MAX_IDEMPOTENT_ROUNDS`. Ver `.env.example`.

### Motor externo opcional (`engine.latingames.net`)

El cliente resuelve el endpoint sin recompilar: `window.__TROPICAL_GRID__.apiBaseUrl`,
`<meta name="game-api-base">` o `API.baseUrl` en `config/gameConfig.js`. Para un
host externo añade `API_CONNECT_ORIGINS=https://engine.latingames.net` (CSP de
Express), actualiza la CSP de `vercel.json`/CDN y permite el origen del frontend
en el CORS del motor. Ver `ui/README.md` § “Endpoint del motor”.

`ALLOWED_ORIGINS` solo es necesario si el frontend se sirve desde **otro**
dominio. Si la web y la API comparten dominio (caso de Vercel), el backend
acepta el mismo host automáticamente.

### Fail-fast

`server/config.js` valida la configuración al importar. Con `NODE_ENV=production`
(**Vercel lo fija solo**) y **fuera del modo demo autónomo**:

- `DB_DRIVER=memory` está **prohibido** (para una demo sin Supabase define
  `DEMO_MODE_ENABLED=true`).
- `ALLOW_DEV_SESSION=true` está **prohibido**.
- `TG_DEMO_OPERATOR_VIRTUAL=1` **con** credenciales de Supabase está
  **prohibido**: es una configuración contradictoria (quita el flag o las
  credenciales).
- `SESSION_SECRET` inválido o Supabase incompleto abortan el arranque.

En ese caso `server.js` responde `503 CONFIG_INVALID` y el cuerpo trae el
diagnóstico sin esperar a los Runtime Logs:

```json
{
  "ok": false,
  "error": {
    "code": "CONFIG_INVALID",
    "message": "El servidor no esta configurado: ...",
    "problems": ["DB_DRIVER=supabase requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (faltan: SUPABASE_SERVICE_ROLE_KEY)"],
    "missing": ["SUPABASE_SERVICE_ROLE_KEY"]
  }
}
```

- `missing`: **nombres** de variables obligatorias (`DB_DRIVER`, `SESSION_SECRET`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOW_DEV_SESSION`) sin definir.
  En un despliegue demo autónomo las dos de Supabase no se nombran: son opcionales
  mientras `DEMO_MODE_ENABLED=true`.
- `problems`: mensajes de la validación (formato inválido, valor prohibido…).
- Nunca se incluyen **valores** de `process.env`; el detalle completo sigue
  apareciendo en **Runtime Logs**.

> `.env` no se usa en Vercel: `server/config.js` carga `dotenv` solo para
> desarrollo local y `vercel.json` excluye `.env*` del bundle de la función. Las
> variables deben existir en *Settings → Environment Variables* del entorno que
> estás desplegando (Production **y** Preview) y hay que **redesplegar** después
> de añadirlas o cambiarlas: una función ya construida no ve las nuevas.

## 5. Cómo se enruta

| Petición | Destino |
| --- | --- |
| `/` | Función Express → HTML generado (`server/generated/indexHtml.js`) |
| `/index.html` | CDN → `public/index.html` |
| `/src/css/*.min.css`, `/src/assets/**` | CDN → `public/src/**` |
| `/ui/*.js` | CDN → `public/ui/**` (espejo generado de `ui/`) |
| `/api/health` | Función Express |
| `/api/game` | Función Express |
| `/api/player` | Función Express |
| `/api/spin` | Función Express |
| `/api/session` | Función Express (403 en producción si `ALLOW_DEV_SESSION=false`) |
| `/api/demo/session` | Función Express |
| Cualquier otra ruta | Función Express → `404 NOT_FOUND` (JSON) |

No hay rewrites: el CDN entrega los archivos que existen en `public/**` y el
resto va a la función, por lo que `req.url` conserva la ruta original
(`/api/spin`) y Express enruta igual que en local. `/` se atiende en la función
porque el CDN no resuelve el directorio raíz; el HTML se genera en build desde
`public/index.html` (una sola fuente de verdad).

### 5.1 Higiene del bundle serverless (`functions.excludeFiles`)

`vercel.json` excluye del bundle de la función lo que el CDN ya sirve:

```json
"functions": {
  "server.js": {
    "excludeFiles": "{public,.env,.env.*}"
  }
}
```

**Por qué.** `@vercel/nft` analiza el grafo de `server.js`; además `dotenv`
arrastra `.env`. Si `createApp` registrara `express.static` con una ruta
constante (`PUBLIC_DIR`), NFT marcaría todo `public/` como *asset* y
`@vercel/node` metería el frontend en la función, recompilándolo de ESM a
CommonJS, con logs como:

```
Compiling "main.js" from ESM to CommonJS...
Compiling "format.js" from ESM to CommonJS...
```

Por eso el reparto es explícito:

- `server.js` llama `createApp({ staticDir: null })`: en Vercel no hay
  middleware estático; el CDN sirve `public/**` e `/index.html`.
- `server/index.js` llama `createApp({ staticDir: PUBLIC_DIR })`: en local sí
  se sirve `public/`.
- `GET /` responde `server/generated/indexHtml.js`, un módulo CommonJS generado
  por `npm run build:index` (`vercel-build` lo ejecuta antes del trazado).
- `vercel-build` ejecuta `build:config` (escribe `ui/config/gameConfig.js`),
  `build:ui` (copia `ui/**` a `public/ui/**`) y `build:index`.
- El cliente carga `/ui/main.js` y este importa `public/ui/config/gameConfig.js`,
  espejo ESM generado desde `config/gameConfig.js`.
- `excludeFiles` excluye `public` igualmente, como cinturón de seguridad.

La exclusión **no** afecta al CDN: `public/**` se sigue publicando con el build
`@vercel/static` y aparece en `.vercel/output/static/`.

**Detalles que no conviene cambiar:**

- La clave debe ser exactamente `server.js`, el entrypoint que resuelve
  `@vercel/express`; `@vercel/node` aplica `config.functions[entrypoint]`.
- Se excluye la **carpeta** `public`, no `public/**`: NFT resuelve cada patrón
  como ruta y en Windows los globs `**` sobre separadores `\` no matchean. Al
  excluir la carpeta, NFT ni siquiera expande su contenido.
- `server/app.js` debe usar `express.static(staticDir)` (parámetro), nunca
  `express.static(PUBLIC_DIR)`, y no debe usar `res.sendFile(...)`: NFT volvería
  a trazar `public/` como asset.
- `server/generated/indexHtml.js` no se edita a mano: `public/index.html` es la
  fuente. Tras cambiarlo, ejecuta `npm run build:index`; el test de despliegue
  falla si quedan desincronizados.
- `ui/config/gameConfig.js` tampoco se edita a mano: la fuente es
  `config/gameConfig.js`. Regenera con `npm run build:config`.
- La fuente de la UI es `ui/`; `public/ui/**` es un espejo generado con
  `npm run build:ui`. No edites el espejo.

Verificación rápida tras `vercel build`:

```bash
vercel build
# El log NO debe contener: Compiling "<archivo>" from ESM to CommonJS...
ls .vercel/output/functions/index.func/server/generated/indexHtml.js
# .vercel/output/functions/index.func/public/ NO debe existir
ls .vercel/output/functions/index.func   # sin public/ ni .env
ls .vercel/output/static                 # index.html + ui/** + src/**
```

## 6. Verificación tras el despliegue

Producción actual de Santa Crush: **https://santacrush.vercel.app**
(proyecto `jggalviz-6791s-projects/santacrush`, dominio servido por el último
deployment `production` con estado `Ready`).

```bash
BASE=https://<proyecto>.vercel.app

# 1) Frontend (funcion: HTML generado; 200 + cache-control: no-cache)
curl -sI "$BASE/" | head -n 1

# 2) Estático (UI publicada desde su espejo)
curl -sI "$BASE/ui/main.js" | head -n 1

# 3) Backend
curl -s "$BASE/api/health"
curl -s "$BASE/api/game" | jq '.game.demo'

# 4) Sesión demo + tirada (1,00 crédito virtual)
TOKEN=$(curl -s -X POST "$BASE/api/demo/session" \
  -H "Content-Type: application/json" -d '{}' | jq -r .token)

curl -s -X POST "$BASE/api/spin" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"betCents":100,"demo":true,"roundRef":"vercel-demo-0001"}' \
  | jq '{demo, replayed, balance, totalWinCents}'
```

Respuestas esperadas: `200` en `/` (HTML con `Cache-Control: no-cache`) y en
`/ui/main.js`, `status: "UP"` en `/api/health`, `enabled: true` en
`game.demo` y `demo: true` con `balance.cents` en la tirada.

> **Deployment Protection.** Si el proyecto tiene *Vercel Authentication*
> activada, las URLs de despliegue responden `401` a `curl` o a un navegador
> sin sesión. Para verificar sin cambiar la configuración:
>
> ```bash
> vercel curl '/' --deployment "$BASE" --yes
> vercel curl '/api/health' --deployment "$BASE" --yes
> ```
>
> Para que la URL sea pública, desactiva la protección en *Settings →
> Deployment Protection* (o usa un dominio/alias asignado al proyecto).

## 7. Limitaciones del entorno serverless

Son inherentes a Vercel (instancias efímeras), no al juego:

| Estado | Comportamiento en Vercel |
| --- | --- |
| Cartera demo (`demoWallet`) | Vive en RAM **por instancia**. Si la petición cae en otra instancia, la cartera se recrea con 1.000,00 (no falla; `ensure()` la reabre) |
| Idempotencia demo (`roundRef`) | Solo dentro de la misma instancia y ventana de vida |
| Rate limiting | Ventana deslizante **por instancia**, no global |
| Saldos reales | Correctos: viven en Supabase (`play_spin` atómica) |

Para un despliegue con dinero real a gran escala, mueve rate limit e
idempotencia a un almacén compartido (Redis/Upstash) y mantén la cartera demo
en un store con TTL si quieres continuidad entre instancias. Para una demo
pública, el comportamiento actual es aceptable.

## 8. Problemas típicos

| Síntoma | Causa / solución |
| --- | --- |
| Sigue el 404 en `/` | El bundle no incluye `server/generated/indexHtml.js` o hay un `Root Directory`/`Output Directory` heredado; revisa el build y *Project Settings* |
| `GET /` devuelve HTML viejo | `server/generated/indexHtml.js` desactualizado: `npm run build:index` y redeploy (Vercel ejecuta `vercel-build`) |
| `503 CONFIG_INVALID` | Falta o es inválida alguna variable de entorno | Lee `error.missing` y `error.problems` del cuerpo del 503, corrige esas variables y haz **Redeploy** |
| `500` en `/api/*` | Credenciales de Supabase inválidas o `sql/schema.sql` sin ejecutar |
| `403 CORS_FORBIDDEN` | Frontend en otro dominio: añádelo a `ALLOWED_ORIGINS` |
| `401 TOKEN_MISSING` | Usa `POST /api/demo/session` (modo demo) o el token del IdP |
| `403 DEMO_DISABLED` | `DEMO_MODE_ENABLED=false` en ese entorno |
| Tras desplegar sigue saliendo "Sesión requerida" | El navegador conserva el JS viejo. `/ui/**` y `/src/**` se sirven con `Cache-Control: no-cache` (Express y `vercel.json`): fuerza recarga (Ctrl+F5) y comprueba que ejecutaste `npm run build:ui` (`git status` limpio antes del push) |
| Logs `Compiling "main.js" from ESM to CommonJS...` | La función volvió a trazar `public/`: usa `createApp({ staticDir: null })` en `server.js`, `express.static(staticDir)` y `excludeFiles` con `public` (§5.1) |
| `.env` dentro de `.vercel/output/functions/…` | Igual: añade `.env` y `.env.*` a `excludeFiles` (§5.1) |
| `503` con `DB_DRIVER=memory esta prohibido con NODE_ENV=production…` | Quedaron credenciales de Supabase en el entorno (desactivan la demo autónoma: `STANDALONE_DEMO = DEMO_MODE_ENABLED && !supabaseConfigured`) o `DEMO_MODE_ENABLED=false`. Borra `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` y/o pon `DEMO_MODE_ENABLED=true` |
| `503` con `ALLOW_DEV_SESSION debe ser false en produccion` | Define `ALLOW_DEV_SESSION=false`. La demo autónoma **no** la necesita: emite su propio token con el claim `demo: true` desde `POST /api/demo/session` |
| Cambio variables y el 503 sigue igual | En Vercel las variables se leen en el build/runtime del deployment: hay que **Redeploy** (`vercel redeploy <dpl_id> --scope <team>` o *Redeploy* en el dashboard) |

Comprobación rápida del estado real de un despliegue (sustituye `<url>`):

```powershell
curl.exe -sS https://<url>/api/health
# esperado en demo: "dbDriver":"memory" y "operator":{"mode":"STANDALONE_DEMO",…,"virtualWallet":true}
curl.exe -sS -o NUL -w "%{http_code}" https://<url>/            # 200
curl.exe -sS -X POST -H "Content-Type: application/json" --data-binary '{}' https://<url>/api/demo/session
```

## 9. Alternativa: servidor propio

El despliegue tradicional sigue disponible sin cambios:

```bash
npm install
npm start          # http://localhost:3000
```

En un VPS/PaaS (Railway, Render, Fly.io) usa `npm start` y configura las mismas
variables de entorno; allí la cartera demo y el rate limit sí son persistentes
mientras el proceso viva.

