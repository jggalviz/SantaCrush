# Integración con el repositorio del backend (GitLab · rama `developer`)

- **Remoto de entrega:** `origin` → `https://git.latinongroup.com/renier/santa-crush`
- **Espejo de despliegue:** `github` → `https://github.com/jggalviz/SantaCrush` (lo consume la integración Git de Vercel).
- **Rama de entrega:** `developer` en GitLab. `development` es la línea de trabajo del frontend: se fusiona en `developer` con `--no-ff` antes de publicar. `main` es la rama que despliega Vercel.
- **Artefacto que consume backend:** `dist/`, **versionado en git**.
- **Comando de build:** `npm run build`.

---

## Índice

1. [Remotos y ramas](#1-remotos-y-ramas)
2. [Build y paquete `dist/`](#2-build-y-paquete-dist)
3. [Qué hace backend tras el merge](#3-qué-hace-backend-tras-el-merge)
4. [Requisitos del hosting del paquete](#4-requisitos-del-hosting-del-paquete)
5. [Checklist antes de cada push a `developer`](#5-checklist-antes-de-cada-push-a-developer)

---

## 1. Remotos y ramas

| Remoto | URL | Uso |
| --- | --- | --- |
| `origin` | `https://git.latinongroup.com/renier/santa-crush` | Repositorio compartido con backend (GitLab del cliente). Es a donde se sube `developer`. |
| `github` | `https://github.com/jggalviz/SantaCrush` | Espejo del frontend; la integración Git de Vercel despliega desde aquí (`main`). |

```bash
git remote -v
git fetch origin
git checkout developer        # rama de entrega en GitLab
git pull origin developer
```

`origin` es el remoto por defecto: `git push origin developer` publica la entrega
en el GitLab del cliente. Para mantener sincronizado el espejo que despliega Vercel:

```bash
git push github main           # despliegue automatico en Vercel
git push github development    # opcional: respaldo de la rama de trabajo
```

El trabajo diario se hace en `development` (local y espejo `github/development`).
GitLab tiene `developer`, no `development`: cada entrega se fusiona antes de subir.

```bash
git checkout developer
git merge --no-ff development
git push origin developer
```

## 2. Build y paquete `dist/`

`npm run build` encadena los cinco pasos del frontend y termina con el staging:

| Paso | Script | Salida |
| --- | --- | --- |
| 1 | `scripts/build-game-config.js` | `config/gameConfig.js` compartido con el servidor |
| 2 | `scripts/build-ui.js` | espejo `ui/` → `public/ui/` |
| 3 | `scripts/build-minify.js` | `public/src/css/*.min.css` |
| 4 | `scripts/build-index-html.js` | `server/generated/indexHtml.js` |
| 5 | `scripts/build-dist.js` | **`dist/`** (paquete estático + `asset-manifest.json`) |

```bash
npm install        # solo la primera vez (sharp es devDependency para el arte)
npm run build
npm test           # incluye test/gitIntegration.test.js: dist/ debe estar al dia
git add -A
git commit -m "chore: build para produccion"
git push origin developer
```

`dist/` **se versiona** (no está en `.gitignore`) para que el backend haga `pull`
del artefacto y lo publique sin instalar Node, sin `npm install` y sin ejecutar la
build. `test/gitIntegration.test.js` compara byte a byte `dist/` contra `public/`,
así que un cambio en el frontend sin reconstruir rompe la suite antes del push.

Qué contiene y qué se queda fuera (`scripts/build-dist.js`):

- **Incluye:** `index.html`, `ui/**`, `src/css/*.min.css`, `src/assets/**` (arte, fuentes, audio) y `asset-manifest.json` con el peso de cada archivo.
- **Excluye:** `src/css/style.css` y `src/css/theme.css` (fuentes legibles), `.preview-*.html`, `*.map`, `*.log`, `.DS_Store`, y todo lo que no esté en `public/` (`.env`, `sql/`, `test/`, `docs/`, arte fuente de `desk/`, `movil/`, `slot/`, `sonidos/`).
- **Tamaño:** ~3,5 MB (tope vigilado por `test/assetBudget.test.js`).

`asset-manifest.json` lleva `generatedAt`: cada build cambia el archivo aunque el
resto del paquete sea idéntico. Es esperado; commitea `dist/` junto al cambio que
lo provocó.

## 3. Qué hace backend tras el merge

```bash
git fetch origin
git checkout developer
git pull origin developer

# El paquete es autocontenido: se sirve tal cual.
rsync -a --delete dist/ /var/www/santa-crush/     # nginx / Apache
# o bien
aws s3 sync dist/ "s3://<bucket>/" --delete       # CloudFront / S3
```

- El paquete **no incluye `.env`**: las variables del servidor se definen fuera del
  repositorio (ver [`.env.example`](../.env.example) y
  [`README-DEPLOY.md`](../README-DEPLOY.md) §2).
- El cliente llama a la API con **rutas relativas** (`/api/game`, `/api/spin`,
  `/api/health`…, ver `ui/net/ApiClient.js`), así que `dist/` y el backend Express
  tienen que compartir origen: publica los estáticos en la raíz del dominio y
  enruta `/api/*` al proceso Node.
- La CSP del hosting debe permitir el origen de assets (`'self'`) y el motor
  externo si se usa (`https://engine.latingames.net`). Copia la cabecera de
  `vercel.json` o de `server/app.js` para no dejar el juego sin estilos ni audio.

## 4. Requisitos del hosting del paquete

| Ruta | Cache recomendada | Motivo |
| --- | --- | --- |
| `/index.html` | `no-cache` | Debe revalidar para que el cambio llegue al jugador. |
| `/src/assets/**` | `public, max-age=31536000, immutable` | Arte con nombre estable. |
| `/src/css/**`, `/ui/**` | `public, max-age=0, must-revalidate` | Código sin hash en el nombre. |

- Servir en la **raíz** del dominio o subdominio: el HTML referencia `/src/…` y
  `/ui/…` con ruta absoluta.
- MIME correctos: `.webp`, `.woff2`, `.mp3` (los tres los sirve `express.static`
  sin configuración adicional; en nginx conviene declararlos en `types`).

## 5. Checklist antes de cada push a `developer`

1. `npm run build` sin errores.
2. `npm test` en verde (251+ tests, incluidos `assetBudget` y `gitIntegration`).
3. `git status` muestra `dist/` actualizado en el mismo commit que el cambio de
   `public/` o `ui/`.
4. Sin `.env` ni arte fuente en el stage (`git status --short | Select-String .env`).
5. `git push origin developer` y avisar al equipo de backend del commit publicado.
