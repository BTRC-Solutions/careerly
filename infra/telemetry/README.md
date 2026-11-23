# Telemetría en el VPS

Un solo entorno (prod) con `telemetry-api`, `stats-web` y su Postgres, publicado por el Caddy que ya tiene el VPS
(el de kleinkauf) en un solo dominio. El diseño está en [ARCHITECTURE.md §19.6](../../ARCHITECTURE.md).

| Archivo | Qué es |
|---|---|
| `compose.yaml` | Proyecto `careerly-telemetry`: Postgres en una red interna sin salida; los dos servicios, además, en la red `edge` de Caddy. No publica puertos. |
| `careerly.caddy` | El sitio para Caddy: `POST /v1/reports` va al receptor y todo lo demás a la página. `/v1/*` y `/internal/*` dan `404`. |
| `postgres/init-roles.sh` | Crea `telemetry_app` (solo `SELECT` e `INSERT`) la primera vez que arranca el volumen. |
| `deploy.sh` | Baja las imágenes, migra, levanta los servicios, publica el sitio en Caddy y prueba `/health` por el dominio. |
| `.env.example` | Variables del `.env` del VPS. |

## Requisitos en el VPS

- Docker con Compose y el usuario en el grupo `docker`.
- La red `edge` y la carpeta `~/caddy-sites`, que vienen del deploy de kleinkauf (su `docs/deployment.md`, "Other
  projects behind Caddy"). La carpeta tiene que ser del usuario, no de root.

## Primera vez

```bash
git clone https://github.com/BTRC-Solutions/careerly.git ~/careerly/repo
mkdir -p ~/careerly
cp ~/careerly/repo/infra/telemetry/.env.example ~/careerly/.env
chmod 600 ~/careerly/.env
# Completar las contraseñas y el secreto con `openssl rand -hex 32` cada uno.
bash ~/careerly/repo/infra/telemetry/deploy.sh
```

Después, `https://careerly-201-32-129-72.sslip.io` muestra la página. Caddy saca el certificado la primera vez.

## Desplegar otra versión

Las imágenes se publican en GHCR con cada push a la rama `deployment` (`sha-<commit>` y `latest`). Hasta que Jenkins
lo haga solo (8.8):

```bash
cd ~/careerly/repo && git pull
IMAGE_TAG=sha-<commit> bash infra/telemetry/deploy.sh
```

## Operación

| Para… | Comando |
|---|---|
| Ver el estado | `docker compose -p careerly-telemetry ps` |
| Ver los logs | `docker logs careerly-telemetry-telemetry-api-1` (o `-stats-web-1`) |
| Entrar a Postgres | `docker exec -it careerly-telemetry-postgres-1 psql -U telemetry_owner telemetry` |
| Ver algo interno desde tu PC | túnel SSH: `ssh -p 5141 -L <puerto>:127.0.0.1:<puerto> <usuario>@<vps>` |

**No hay backups.** `docker compose down -v` (o perder el VPS) borra todos los reportes. Por eso las migraciones
tienen que ser compatibles con la versión anterior de la imagen.
