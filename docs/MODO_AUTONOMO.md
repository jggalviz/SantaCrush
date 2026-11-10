# Modo autonomo local (`TG_DEMO_OPERATOR_VIRTUAL`)

Entorno **100 % local** para el clon de Meridianobet: el backend no consulta
ninguna API externa, no necesita Supabase y liquida todas las rondas contra una
**billetera virtual** en memoria del proceso.

## Que cambia la variable

`TG_DEMO_OPERATOR_VIRTUAL=1` (definida en `.env`) se aplica en
`server/config.js` y fuerza, al arrancar:

| Efecto | Valor resultante |
| --- | --- |
| `DB_DRIVER` | `memory` (se ignoran `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`) |
| `DEMO_MODE_ENABLED` | `true` (billetera virtual siempre disponible) |
| `ALLOW_DEV_SESSION` | `true` fuera de produccion (`POST /api/session` local) |
| `config.api.connectOrigins` | `[]` -> la CSP solo permite `'self'` |
| `config.operator.mode` | `LOCAL_VIRTUAL_DEMO` |

El cliente ya apunta al motor local: `<meta name="game-api-base" content="" />`
en `public/index.html` + `API.baseUrl = ''` significan **mismo origen**. No hay
que compilar nada para cambiar de motor; el endpoint se sobreescribe en runtime
con `window.__TROPICAL_GRID__ = { apiBaseUrl: ... }` (ver `ui/README.md`).

Con `NODE_ENV=production` el arranque **falla a proposito**
(`Configuracion invalida: TG_DEMO_OPERATOR_VIRTUAL=1 es solo para desarrollo
local`). Para un despliegue real: `TG_DEMO_OPERATOR_VIRTUAL=0` + Supabase.

## Arranque

```bash
npm install        # solo la primera vez
npm start          # prestart -> build:config + build:ui + build:index
# http://localhost:3000
```

El banner de arranque debe mostrar:

```
Persistencia: memory  (SOLO DESARROLLO)
Modo operador: AUTONOMO LOCAL (cartera virtual, motor propio)
```

## Verificacion rapida

```bash
# 1. Estado del backend y del modo
curl http://localhost:3000/api/health
#   ok: true, dbDriver: "memory",
#   operator: { mode: "LOCAL_VIRTUAL_DEMO", virtualDemo: true,
#               localEngineOnly: true, virtualWallet: true }

# 2. Parametros publicos del modo demo
curl http://localhost:3000/api/game

# 3. Sesion con fichas virtuales (1.000,00 VES por defecto)
curl -X POST http://localhost:3000/api/demo/session \
     -H "Content-Type: application/json" -d "{\"playerId\":\"invitado_demo\"}"

# 4. Ronda resuelta por el motor local (usa el token del paso 3)
curl -X POST http://localhost:3000/api/spin \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d "{\"betCents\":100,\"clientSeed\":\"prueba-1\",\"roundRef\":\"ref-1\"}"
```

La cabecera `Content-Security-Policy` de `GET /` debe contener
`connect-src 'self'` **sin** `engine.latingames.net`: es la prueba de que el
navegador no puede llamar a un motor externo.

## Propiedades del saldo virtual

- Vive solo en RAM: reiniciar el servidor devuelve a todos los invitados a
  `DEMO_START_BALANCE_CENTS` (100000 = 1.000,00).
- Es autoritativo del servidor: el cliente no envia ni puede fijar su saldo.
- Idempotente por `roundRef` (un reintento no cobra dos veces) y nunca negativo.
- Caduca por inactividad (`DEMO_SESSION_TTL_MS`, 30 min) y hay tope de sesiones
  (`DEMO_MAX_SESSIONS`).

## Ajustes utiles para probar la UI

```env
DEMO_START_BALANCE_CENTS=100000000   # 1.000.000,00 para probar el bonus
DEMO_CURRENCY=VES
DEMO_MODE_ENABLED=true               # innecesario con el flag, pero explicito
```

## Tests

`npm test` corre con `DB_DRIVER=memory` y sin la variable, de modo que la suite
valida el comportamiento estandar. Para verificar el modo autonomo de punta a
punta: arranca el servidor y repite los `curl` de arriba (o usa el navegador con
la consola abierta: no debe aparecer ningun intento a un host externo).
