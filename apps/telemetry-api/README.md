# telemetry-api

Receptor de la telemetría de Careerly (ARCHITECTURE.md §19.4, roadmap 8.5): recibe los lotes diarios firmados
de cada instalación en `POST /v1/reports` y entrega los agregados, ya filtrados por el umbral de anonimato
(k ≥ 5), en `GET /internal/stats` para `stats-web`. NestJS + Drizzle sobre Postgres.

## Rutas

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `POST /v1/reports` | La app (vía Caddy, única ruta pública) | Ingesta: forma, rate limit, firma Ed25519, prueba de trabajo de una instalación nueva, un envío por día, esquema con rangos e inserción (`202`) |
| `GET /internal/stats?from=&to=` | `stats-web`, por la red interna | Agregados del período (por defecto, los últimos 30 días). Exige el header `x-internal-secret` |
| `GET /health` | Docker y `stats-web` | `200 { "status": "ok" }` o `503`, sin más datos |

## Configuración (variables de entorno)

| Variable | Por defecto | Qué es |
|---|---|---|
| `DATABASE_URL` | (obligatoria) | Conexión a Postgres |
| `TELEMETRY_INTERNAL_SECRET` | (obligatoria, ≥ 32 caracteres) | Secreto compartido con `stats-web` |
| `TELEMETRY_HOST` / `TELEMETRY_PORT` | `0.0.0.0` / `3000` | Dónde escucha |
| `TELEMETRY_POW_DIFFICULTY` | `20` | Bits en cero de la prueba de trabajo (~1–2 s); se puede subir sin actualizar la app |
| `TELEMETRY_RATE_LIMIT_PER_HOUR` | `20` | Solicitudes por hora de una IP |
| `TELEMETRY_NEW_INSTALLS_PER_HOUR` | `50` | Instalaciones nuevas por hora entre todas las IPs (al llegar, alerta en el log) |
| `TELEMETRY_TRUST_PROXY_HOPS` | `1` | Proxies delante (Caddy), para leer la IP de `X-Forwarded-For` |

Las IPs solo se usan en memoria, hasheadas con una sal que cambia cada día UTC, y nunca se guardan ni se
registran (RNF-23).

## Comandos

```bash
npm run build:telemetry                         # contratos + telemetry-api + stats-web
npm run migrate -w @careerly/telemetry-api      # aplica las migraciones (el deploy lo corre antes de cada versión)
npm start -w @careerly/telemetry-api
npm run db:generate -w @careerly/telemetry-api  # migración nueva tras cambiar src/database/schema.ts
```

## Imagen

Se construye y despliega sola, sin nada de la app de escritorio (solo `packages/contracts` y este servicio):

```bash
docker build -f apps/telemetry-api/Dockerfile -t telemetry-api .     # desde la raíz del repo
docker run --rm -e DATABASE_URL=… telemetry-api node dist/migrate.js  # migraciones, antes de cada versión
docker run -e DATABASE_URL=… -e TELEMETRY_INTERNAL_SECRET=… -p 3000:3000 telemetry-api
```

Los tests (`npm test` desde la raíz) usan PGlite, un Postgres en memoria, con las mismas migraciones: corren en
Windows y Ubuntu sin Docker. La publicación de la imagen y el deploy son del paso 8.8.
