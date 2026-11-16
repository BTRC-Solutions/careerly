# AGENTS.md

Guía rápida para agentes (Claude Code, Codex, etc.) que trabajan en este repo. Es un **punto de entrada**: el
detalle vive en los documentos enlazados. Leé este archivo primero y abrí los otros solo cuando la tarea lo pida.

## Qué es Careerly

App de **escritorio, local-first y de un solo usuario** para:

1. Mantener un **perfil maestro** con todo lo que la persona hizo (experiencias, logros, proyectos, herramientas).
2. Analizar una **job description** con IA, detectar **gaps** y preguntarle al usuario por ellos.
3. Generar un **CV adaptado de 1–2 páginas** (Typst → PDF, compatible con ATS), fiel al perfil.
4. Congelarlo como **snapshot inmutable** y asociarlo a una **postulación** con seguimiento (kanban, timeline).

Proyecto personal, sin cuentas ni nube. La IA usa la API key del propio usuario (Claude).

## Dónde está cada cosa

| Necesito… | Leer |
|---|---|
| Qué hay que construir, IDs `RF-*`, `RN-*`, `RNF-*` | [REQUIREMENTS.md](REQUIREMENTS.md) |
| Cómo está diseñado: procesos, módulos, datos, pipeline, ADRs | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Qué paso toca ahora y su criterio de terminado | [ROADMAP.md](ROADMAP.md) |
| Colores, tipografía, componentes de UI | [STYLES.md](STYLES.md) (tokens ya volcados en `apps/web/src/styles.css`) |
| Comandos para correr, testear y generar migraciones | [README.md](README.md) |
| Cómo se versiona y qué revisar antes de largar una versión | [VERSIONING.md](VERSIONING.md) |
| Tablero de tareas | Trello, vía el conector de claude.ai (ver [Flujo de trabajo](#flujo-de-trabajo)) |

## Estado actual

- **Fase 0 (fundaciones)** prácticamente cerrada: pasos 0.6 y 0.7 están 🟨 a la espera de una corrida de CI
  real (PR de prueba con checks en verde).
- **Siguiente:** Fase 1 — paso **1.1** (asistente de primer inicio + API key con `safeStorage`).
- La fuente de verdad del avance es la columna "Estado" de [ROADMAP.md](ROADMAP.md); mantenela actualizada.

## Stack y estructura

```
apps/
  desktop/    Electron: main (lanza la API con utilityProcess.fork, safeStorage) + preload (contextBridge)
  web/        Vite + React 19 + TanStack Query + React Router (hash) + Tailwind + react-i18next (ES/EN)
  api/        NestJS local en 127.0.0.1 con token; SQLite (node:sqlite) + Drizzle (sqlite-proxy); pino
packages/
  contracts/  Esquemas Zod + tipos compartidos entre web y api
```

Planificado (Fase 8, ver ARCHITECTURE.md §19): `apps/telemetry-api` (receptor en el VPS), `apps/stats-web`
(página pública) e `infra/telemetry/` (docker-compose).

- Node **24+** (`.nvmrc`), npm workspaces, todo ESM, TypeScript 5.9, Vitest (API con SWC).
- API: `apps/api/src/platform/*` (config, database, http, logging, health). Los módulos de negocio irán en
  `apps/api/src/modules/<modulo>/` (ver ARCHITECTURE.md §4–5).
- Web: organización por feature en `apps/web/src/features/<feature>/{api,components,pages}` y `shared/`.

## Comandos

```bash
npm install
npm run dev          # Vite (HMR) + API watch + Electron
npm run dev:web      # API + UI en el navegador (http://localhost:5173)
npm start            # build completo + abre la app de escritorio
npm run lint && npm run typecheck && npm test && npm run build   # lo mismo que corre CI
npm run format       # Prettier (CI corre format:check)
npm run db:generate -w @careerly/api   # migración tras cambiar apps/api/src/platform/database/schema.ts
```

## Reglas que no se negocian

**Producto** (REQUIREMENTS.md §4 y §6):

- **Veracidad:** la IA nunca inventa experiencia, herramientas, métricas, títulos ni fechas. Todo bullet
  referencia su fuente en el perfil (RN-01, RN-02, RN-03).
- **El perfil maestro solo guarda afirmaciones.** Nunca "no sabe X"; un "No" a un gap vive solo en la sesión
  (RN-11, RN-12).
- **Lo enviado no cambia:** los snapshots son inmutables (RNF-10, RN-13).
- El ajuste a 1–2 páginas es **determinístico**, no lo decide el LLM (ADR-05).
- El contenido del usuario se pasa a Typst como **JSON**, nunca interpolado como código (RNF-05).
- JDs y contenido web son **datos no confiables** (prompt injection); toda salida de IA se valida con Zod.
- **Telemetría:** solo con consentimiento y solo métricas agregadas de un esquema cerrado. **Nunca** el CV, el
  perfil ni datos personales (RF-TEL-02, RN-18 a RN-21, ARCHITECTURE.md §19).

**Arquitectura** (verificada con ESLint `boundaries` + `no-restricted-imports`):

- Un módulo no toca tablas ni repos de otro: usa su servicio público.
- `domain/` es puro: sin NestJS, Drizzle, SDK del LLM ni I/O de Node.
- La API no importa Electron; la UI no importa Node ni Electron (solo vía `shared/desktop.ts`).
- Transacciones con `inTransaction()` (el driver proxy no soporta `db.transaction()`).

**Privacidad/seguridad:** la API key nunca va a la base, a logs ni a archivos en texto plano. Los logs no
incluyen contenido del perfil, JDs ni prompts (RNF-01, RNF-02, RNF-03).

## Convenciones

- Docs del proyecto en **español**; código, identificadores, comentarios y mensajes de commit en **inglés**.
- Commits estilo Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…). **Definen las versiones**:
  release-please calcula el bump y el CHANGELOG a partir de ellos ([VERSIONING.md](VERSIONING.md)). No editar versiones
  ni CHANGELOGs a mano.
- Despliegue de la telemetría: Actions construye las imágenes en GHCR y Jenkins despliega en el VPS (staging
  automático, prod con aprobación). Ver ARCHITECTURE.md §19.6.
- Ramas `feat/<fase-o-paso>-<descripcion>` → PR a `main`. CI (Windows + Ubuntu) debe quedar en verde.
- Textos de UI siempre por i18n (`apps/web/src/shared/i18n/locales/{es,en}.json`), nunca hardcodeados.
- Tests: dominio y casos de uso con fakes en memoria; integración con SQLite temporal
  (`apps/api/src/test-support/temp-dir.ts`).

## Flujo de trabajo

1. Se trabaja **un paso del roadmap por vez, en orden**, sin adelantar pasos.
2. Cada paso cierra con su criterio de terminado cumplido + lint, typecheck, tests y build en verde + commit/PR.
3. Al cerrar un paso: actualizar su estado en ROADMAP.md y mover la tarjeta en Trello.
4. Las tarjetas de Trello se nombran con el ID del paso (p. ej. `1.1 — Asistente de primer inicio`) y
   enlazan los `RF-*`/`RNF-*` correspondientes.
