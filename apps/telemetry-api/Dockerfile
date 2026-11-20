# syntax=docker/dockerfile:1
# telemetry-api on its own (ARCHITECTURE §19.6): only the shared contracts and the receiver, nothing of the desktop
# app. Built from the repository root:
#   docker build -f apps/telemetry-api/Dockerfile -t telemetry-api .
# Migrations, before each deploy:  docker run --rm -e DATABASE_URL=… telemetry-api node dist/migrate.js

FROM node:24-alpine AS manifests
WORKDIR /repo
COPY package.json package-lock.json ./
# Every workspace manifest, so the lockfile matches; only the two below get installed.
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/stats-web/package.json apps/stats-web/
COPY apps/telemetry-api/package.json apps/telemetry-api/

FROM manifests AS build
RUN npm ci --ignore-scripts --include-workspace-root -w @careerly/contracts -w @careerly/telemetry-api
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/telemetry-api apps/telemetry-api
RUN npm run build -w @careerly/contracts && npm run build -w @careerly/telemetry-api

FROM manifests AS deps
RUN npm ci --ignore-scripts --omit=dev -w @careerly/contracts -w @careerly/telemetry-api

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/packages/contracts packages/contracts
COPY --from=deps /repo/apps/telemetry-api apps/telemetry-api
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/telemetry-api/dist apps/telemetry-api/dist
COPY --from=build /repo/apps/telemetry-api/drizzle apps/telemetry-api/drizzle
WORKDIR /app/apps/telemetry-api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
