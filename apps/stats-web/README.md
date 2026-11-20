# stats-web

Página pública con las estadísticas anónimas de Careerly (ARCHITECTURE.md §19.5, roadmap 8.6): React + Vite,
servida por un servidor Node chico que es lo único que habla con `telemetry-api`.

## Qué expone

| Ruta | Qué hace |
|---|---|
| `GET /` (y cualquier otra ruta) | La página ya construida (`dist/client`) |
| `GET /api/stats?range=30\|90\|365` | Los agregados de ese período, pedidos a `GET /internal/stats` de `telemetry-api` con el secreto compartido y guardados unos minutos. Otro período da `400` |
| `GET /health` | `200` si `telemetry-api` responde, `503` si no |

No agrega ni recalcula nada: muestra solo lo que `telemetry-api` ya filtró por el umbral de anonimato (k ≥ 5).
El navegador nunca habla con `telemetry-api` y el secreto nunca sale del servidor.

## Configuración (variables de entorno)

| Variable | Por defecto | Qué es |
|---|---|---|
| `TELEMETRY_API_URL` | (obligatoria) | `telemetry-api` en la red interna de Docker, p. ej. `http://telemetry-api:3000` |
| `TELEMETRY_INTERNAL_SECRET` | (obligatoria) | El mismo secreto que tiene `telemetry-api` |
| `STATS_HOST` / `STATS_PORT` | `0.0.0.0` / `3001` | Dónde escucha |
| `STATS_CACHE_SECONDS` | `300` | Cuánto se guarda cada respuesta |

## Comandos

```bash
npm run build -w @careerly/stats-web   # la página (dist/client) y el servidor (dist/server)
npm start -w @careerly/stats-web       # sirve la página construida
npm run dev -w @careerly/stats-web     # Vite en http://localhost:5174, con /api hacia un servidor en :3001
```

## Imagen

Se construye y despliega sola, sin nada de la app de escritorio (solo `packages/contracts` y este servicio). No
necesita a `telemetry-api` para arrancar: mientras no esté, `/api/stats` da `502` y `/health`, `503`.

```bash
docker build -f apps/stats-web/Dockerfile -t stats-web .   # desde la raíz del repo
docker run -e TELEMETRY_API_URL=… -e TELEMETRY_INTERNAL_SECRET=… -p 3001:3001 stats-web
```
