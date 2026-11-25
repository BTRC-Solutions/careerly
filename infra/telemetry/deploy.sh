#!/usr/bin/env bash
# Deploys Careerly's telemetry on the VPS (ARCHITECTURE §19.6): pulls the images, applies the migrations, starts
# the services, publishes the site on the shared Caddy and deletes the images no container runs. Jenkins runs it
# over SSH from 8.8; by hand, from a checkout of the repository on the VPS:
#   IMAGE_TAG=sha-<commit> bash infra/telemetry/deploy.sh
# Reads ~/careerly/.env (or CAREERLY_ENV), made from infra/telemetry/.env.example.
set -euo pipefail

ENV_FILE=${CAREERLY_ENV:-$HOME/careerly/.env}
SITES_DIR=${CADDY_SITES_DIR:-$HOME/caddy-sites}
CADDY_CONTAINER=${CADDY_CONTAINER:-kleinkauf-caddy-1}

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy infra/telemetry/.env.example and fill it in)" >&2; exit 1; }
[ -d "$SITES_DIR" ] || { echo "Missing $SITES_DIR (the folder kleinkauf's Caddy imports sites from)" >&2; exit 1; }
CAREERLY_DOMAIN=$(sed -n 's/^CAREERLY_DOMAIN=//p' "$ENV_FILE")
[ -n "$CAREERLY_DOMAIN" ] || { echo "CAREERLY_DOMAIN is missing from $ENV_FILE" >&2; exit 1; }

cd "$(dirname "$0")"
compose() { docker compose --env-file "$ENV_FILE" -f compose.yaml "$@"; }

echo "== pull (${IMAGE_TAG:-from the .env})"
compose --profile migrate pull --quiet migrate telemetry-api stats-web

echo "== migrations"
compose --profile migrate run --rm migrate

echo "== up"
compose up -d --wait --wait-timeout 300 telemetry-api stats-web

# Caddy keeps its previous configuration when a reload fails, so a broken site never takes kleinkauf down. The
# file is put back as it was so the next reload (kleinkauf's deploys) does not fail either.
echo "== caddy site"
site="$SITES_DIR/careerly.caddy"
sed "s/__CAREERLY_DOMAIN__/$CAREERLY_DOMAIN/" careerly.caddy > "$site.new"
if cmp -s "$site.new" "$site"; then
  rm "$site.new"
  echo "unchanged"
else
  [ -f "$site" ] && cp "$site" "$site.previous"
  mv "$site.new" "$site"
  if ! docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile; then
    if [ -f "$site.previous" ]; then mv "$site.previous" "$site"; else rm "$site"; fi
    echo "Caddy rejected the site; it was put back as it was" >&2
    exit 1
  fi
  rm -f "$site.previous"
fi

echo "== smoke test"
for attempt in $(seq 30); do
  curl -fsS -o /dev/null "https://$CAREERLY_DOMAIN/health" && break
  [ "$attempt" = 30 ] && { echo "https://$CAREERLY_DOMAIN/health does not answer" >&2; exit 1; }
  sleep 2
done
# What Jenkins rolls back to if the next deploy fails: "<commit> <image tag>".
echo "$(git rev-parse HEAD) ${IMAGE_TAG:-latest}" > "${CAREERLY_DEPLOYED:-$HOME/careerly/deployed}"
# Only the images the containers run stay on the disk: a rollback pulls the previous tag again.
echo "== prune"
docker image prune --all --force --filter "label=org.opencontainers.image.source=https://github.com/BTRC-Solutions/careerly"
echo "Deployed on https://$CAREERLY_DOMAIN"
