# AGENTS.md

Guía rápida para agentes (Claude Code, Codex, etc.) que trabajan en este repo. Es un **punto de entrada**: el
detalle vive en los documentos enlazados. Leé este archivo primero y abrí los otros solo cuando la tarea lo pida.

## Qué es Careerly

App de **escritorio, local-first y de un solo usuario** para:

1. Mantener un **perfil maestro** con todo lo que la persona hizo (experiencias, logros, proyectos, herramientas).
2. Analizar una **job description** con IA, detectar **gaps** y preguntarle al usuario por ellos.
3. Generar un **CV adaptado de 1–2 páginas** (Typst → PDF, compatible con ATS), fiel al perfil.
4. Congelarlo como **snapshot inmutable** y asociarlo a una **postulación** con seguimiento (kanban, timeline).

Proyecto personal, sin cuentas ni nube. La IA usa la API key del propio usuario, con varios proveedores: Gemini primero, Claude después (ADR-23).

## Dónde está cada cosa

| Necesito… | Leer |
|---|---|
| Qué hay que construir, IDs `RF-*`, `RN-*`, `RNF-*` | [REQUIREMENTS.md](REQUIREMENTS.md) |
| Cómo está diseñado: procesos, módulos, datos, pipeline, ADRs | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Qué paso toca ahora y su criterio de terminado | [ROADMAP.md](ROADMAP.md) |
| Contrato de las plantillas de CV (Typst) | [apps/api/templates/README.md](apps/api/templates/README.md) |
| Logo, íconos de la app y favicon (colores y reglas de uso) | [assets/brand/README.md](assets/brand/README.md) |
| Colores, tipografía, componentes de UI | [STYLES.md](STYLES.md) (tokens ya volcados en `apps/web/src/styles.css`) |
| Comandos para correr, testear y generar migraciones | [README.md](README.md) |
| Cómo se versiona y qué revisar antes de largar una versión | [VERSIONING.md](VERSIONING.md) |
| Tablero de tareas | [Trello](https://trello.com/b/ifdBf9SV/careerly) (workspace "RCBT solutions"), vía el conector de claude.ai (ver [Flujo de trabajo](#flujo-de-trabajo)) |

## Estado actual

- **Fases 0 a 7** cerradas (`v0.7.0`): configuración, API key por proveedor, backups, instalador de Windows,
  telemetría base (sin envío) y versionado con release-please;
  perfil maestro completo con origen y registro de cambios por sesión, importación de CVs y sugerencias de
  redacción de logros; CV en PDF con Typst (plantilla `classic` y plantillas propias, ajuste determinístico
  a 1–2 páginas); módulo de IA (Gemini y Claude, elección de modelos, pantalla de consumo), cola de tareas en
  segundo plano, JDs con análisis por IA corregible y evals; sesiones de adaptación con match (catálogo + IA),
  preguntas de gaps sin IA, respuestas que se agregan al perfil y se pueden deshacer; generación del CV
  adaptado (opciones de la sesión, relevancia, redacción por idioma con guardia de veracidad, ajuste de
  páginas, pantalla de revisión, regeneración con indicaciones, sesiones retomables); snapshots inmutables
  del CV enviado y postulaciones (kanban y tabla, línea de tiempo inalterable, contactos, canal, prioridad y
  salarios, métricas de postulaciones en la telemetría). Sigue la **Fase 8** (dashboard, pulido y primer release).
- Versión de la app: `0.N.X`, con N = última fase cerrada ([VERSIONING.md §2.1](VERSIONING.md)). Cerrar la
  Fase 8 larga `v0.8.0` (MVP).
- La fuente de verdad del avance es la columna "Estado" de [ROADMAP.md](ROADMAP.md): se actualiza **en cada PR
  mergeado**, junto con la tarjeta de Trello ("En proceso" al abrir el PR, "Hecho" al mergear).

## Stack y estructura

```
apps/
  desktop/    Electron: main (lanza la API con utilityProcess.fork, safeStorage) + preload (contextBridge)
  web/        Vite + React 19 + TanStack Query + React Router (hash) + Tailwind + react-i18next (ES/EN)
  api/        NestJS local en 127.0.0.1 con token; SQLite (node:sqlite) + Drizzle (sqlite-proxy); pino
packages/
  contracts/  Esquemas Zod + tipos compartidos entre web y api
```

Telemetría (ARCHITECTURE.md §19), fuera de la app y con imagen propia cada uno: `apps/telemetry-api` (receptor
en el VPS, NestJS + Postgres) y `apps/stats-web` (página pública). Se compilan con `npm run build:telemetry`.
Planificado: `infra/telemetry/` (docker-compose).

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
npm run package:win  # build + instalador NSIS en apps/desktop/release/installer/
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
- Despliegue de la telemetría: un solo entorno (prod) en el VPS, detrás de un solo dominio. Con cada push a la
  rama `deployment`, Actions publica las imágenes en GHCR y Jenkins (solo accesible por túnel SSH) las despliega.
  Ver ARCHITECTURE.md §19.6.
- Ramas `feat/<fase-o-paso>-<descripcion>` → PR a `main`. CI (Windows + Ubuntu) debe quedar en verde. Se
  mergea solo con squash: el título del PR, en Conventional Commits, es la entrada del CHANGELOG.
- Textos de UI siempre por i18n (`apps/web/src/shared/i18n/locales/{es,en}.json`), nunca hardcodeados.
- Tests: dominio y casos de uso con fakes en memoria; integración con SQLite temporal
  (`apps/api/src/test-support/temp-dir.ts`). En la web, la lógica pura corre en Node; las pantallas, con
  `// @vitest-environment jsdom` al principio del archivo, `renderScreen` y la API simulada con MSW
  (`apps/web/src/test-support/`; ejemplo: `TemplatesPage.test.tsx`). Cada test de pantalla corre además axe
  sobre el estado en que termina y falla con violaciones `critical` o `serious` (`test-support/accessibility.ts`;
  el contraste no se mide en jsdom).

## Flujo de trabajo

1. Se trabaja **un paso del roadmap por vez, en orden**, sin adelantar pasos.
2. Cada paso cierra con su criterio de terminado cumplido + lint, typecheck, tests y build en verde + commit/PR.
3. Al cerrar un paso: actualizar su estado en ROADMAP.md y mover la tarjeta en Trello.
4. Las tarjetas de Trello se nombran `[F<paso>] título` (p. ej. `[F1.1] Asistente de primer inicio`; un rango
   como `[F2.2–2.5]` si cubre varios pasos). La descripción empieza con `Roadmap <paso> · <RF-*/RNF-*/ADR-*>`,
   sigue con el detalle y termina con `**Terminado cuando:** …`. Las listas son por área (Backend, Frontend,
   IA y prompts, Desktop/Typst/releases, QA y docs, Post-MVP) más "En proceso" y "Hecho"; un paso con parte de
   backend y de frontend lleva una tarjeta en cada lista.
