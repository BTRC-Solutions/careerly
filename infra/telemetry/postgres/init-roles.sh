#!/bin/sh
# Runs once, when the Postgres volume is created (docker-entrypoint-initdb.d), as the owner (POSTGRES_USER).
# The receiver connects as telemetry_app, which can only read and insert in the tables the owner's migrations
# create (ARCHITECTURE §19.4 and §19.6). No `set -e` here: the entrypoint may source this file, and it already
# stops on errors; ON_ERROR_STOP makes psql fail on the first one.
psql -v ON_ERROR_STOP=1 -v app_password="$TELEMETRY_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE telemetry_app LOGIN PASSWORD :'app_password';
GRANT USAGE ON SCHEMA public TO telemetry_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO telemetry_app;
SQL
