# syntax=docker/dockerfile:1
# stats-web on its own (ARCHITECTURE §19.5–19.6): the built page and its small server, with only the shared
# contracts. Built from the repository root:
#   docker build -f apps/stats-web/Dockerfile -t stats-web .

FROM node:24-alpine AS manifests
WORKDIR /repo
COPY package.json package-lock.json ./
# Every workspace manifest, so the lockfile matches; only the two below get installed.
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/telemetry-api/package.json apps/telemetry-api/
COPY apps/stats-web/package.json apps/stats-web/

FROM manifests AS build
RUN npm ci --ignore-scripts --include-workspace-root -w @careerly/contracts -w @careerly/stats-web
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/stats-web apps/stats-web
RUN npm run build -w @careerly/contracts && npm run build -w @careerly/stats-web

FROM manifests AS deps
RUN npm ci --ignore-scripts --omit=dev -w @careerly/contracts -w @careerly/stats-web

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /repo/node_modules node_modules
COPY --from=deps /repo/packages/contracts packages/contracts
COPY --from=deps /repo/apps/stats-web apps/stats-web
COPY --from=build /repo/packages/contracts/dist packages/contracts/dist
COPY --from=build /repo/apps/stats-web/dist apps/stats-web/dist
WORKDIR /app/apps/stats-web
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/server/main.js"]
