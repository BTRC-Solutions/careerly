# Careerly — Roadmap

> Estado: borrador v0.1 · Última actualización: 2026-11-10
> Documentos relacionados: [REQUIREMENTS.md](REQUIREMENTS.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Cómo usar este roadmap

- Se trabaja **un paso por vez**, en orden. No se adelantan pasos.
- Cada paso termina con su **criterio de terminado** cumplido, build y lint en verde, tests pasando y un commit.
- Los IDs entre corchetes (p. ej. `[RF-PROF-03]`) remiten a [REQUIREMENTS.md](REQUIREMENTS.md).
- El orden prioriza **reducir riesgo pronto**: Typst y el ajuste de páginas se prueban antes de la IA, y la IA
  antes de la interfaz pulida.

Estados: ⬜ pendiente · 🟨 en curso · ✅ hecho

---

## Fase 0 — Fundaciones

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 0.1 | Monorepo con pnpm workspaces: `apps/web`, `apps/api`, `packages/contracts`, configs compartidas de TS y ESLint. | `pnpm install`, `pnpm build` y `pnpm lint` funcionan desde la raíz. | ⬜ |
| 0.2 | `docker-compose.yml` con PostgreSQL, Redis y MinIO. | `docker compose up` levanta los tres servicios con datos persistentes. | ⬜ |
| 0.3 | Esqueleto de NestJS: config validada con Zod, logger (pino), health check, manejo global de errores. Decidir ORM (ADR-06) y configurarlo con la primera migración. | `GET /health` responde OK conectado a Postgres y Redis. | ⬜ |
| 0.4 | Esqueleto de Vite + React: router, TanStack Query, librería de UI, i18n (ES/EN), layout base. | La app abre y llama a `/health` a través del proxy de Vite. | ⬜ |
| 0.5 | Reglas de límites entre módulos (ESLint) y setup de tests (unitarios + Testcontainers). | Un test de ejemplo de cada tipo corre en CI. | ⬜ |
| 0.6 | CI en GitHub Actions: lint, typecheck, tests y build en cada PR. | PR de prueba con checks en verde. | ⬜ |

## Fase 1 — Identidad

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 1.1 | Registro, login y logout con sesiones en cookie `httpOnly` y argon2id. `[RF-AUTH-01]` | Flujo completo desde la web; rutas privadas protegidas. | ⬜ |
| 1.2 | Recuperación de contraseña por email (en local, con un servidor SMTP de prueba como Mailpit). `[RF-AUTH-02]` | Se puede restablecer la contraseña de punta a punta. | ⬜ |
| 1.3 | Rate limiting en endpoints de auth. Test de aislamiento entre usuarios como plantilla para los demás módulos. `[RNF-01]` | Tests de integración en verde. | ⬜ |

## Fase 2 — Perfil maestro

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 2.1 | Catálogo de herramientas con alias y *seed* inicial (lenguajes, frameworks, cloud, bases de datos, herramientas comunes). Búsqueda con autocompletado. `[RF-PROF-06]` | `GET /tools?query=postgres` devuelve PostgreSQL. | ⬜ |
| 2.2 | Datos personales. `[RF-PROF-01]` | Se editan y persisten desde la web. | ⬜ |
| 2.3 | Experiencias con logros (texto, métricas, herramientas), con orden editable. `[RF-PROF-02, RF-PROF-03]` | Se puede cargar una experiencia con 20+ logros sin problemas de UX. | ⬜ |
| 2.4 | Proyectos (personales, open source, cursos, freelance) con logros. `[RF-PROF-04]` | Ídem 2.3. | ⬜ |
| 2.5 | Educación, certificaciones e idiomas. `[RF-PROF-05]` | CRUD completo desde la web. | ⬜ |
| 2.6 | Origen de cada elemento (`MANUAL`, `IMPORT`, `GAP_ANSWER` + sesión) y registro de cambios mínimo para poder revertir. `[RF-PROF-07]` | Test de dominio: crear desde gap y revertir deja el perfil como estaba. | ⬜ |
| 2.7 | Cargar el propio perfil maestro real como dato de prueba. | Un perfil completo y realista disponible para las fases siguientes. | ⬜ |

## Fase 3 — Render con Typst (reducir riesgo)

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 3.1 | Plantilla `classic` en Typst que lee los datos desde JSON, con títulos en ES y EN, compatible con ATS. `[RNF-09]` | Un JSON de ejemplo genera un PDF correcto en ambos idiomas. | ⬜ |
| 3.2 | Puerto `ResumeRenderer` + adaptador `TypstRenderer` (directorio temporal, `--root`, fuentes empaquetadas, timeout). Binario de `typst` en la imagen Docker. `[RNF-05]` | Test de integración renderiza un PDF real. | ⬜ |
| 3.3 | Conteo de páginas (decidir ADR-07). | Test: un CV largo devuelve 2 páginas, uno corto devuelve 1. | ⬜ |
| 3.4 | `page-fitter` puro: reglas iniciales por sección + recorte por score + relleno. Tests con medidor falso. `[RN-04, RN-06, RN-07]` | Tests unitarios cubren: entra justo, sobra, falta y mínimo por puesto. | ⬜ |
| 3.5 | Prueba manual: con el perfil real y scores asignados a mano, generar CVs de 1 y 2 páginas. | El resultado es un CV presentable. **Validar la plantilla antes de seguir.** | ⬜ |

## Fase 4 — Job descriptions + módulo de IA

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 4.1 | Módulo `ai`: puerto `LlmClient`, adaptador de Claude, salida estructurada + validación con Zod, reintento ante salida inválida, registro en `AiGeneration`, modelo configurable por entorno. | Test de integración (opcional, con API key) y tests con *fake*. | ⬜ |
| 4.2 | Cuotas diarias por usuario y rate limiting de IA. `[RNF-06]` | Exceder la cuota devuelve un error claro en la UI. | ⬜ |
| 4.3 | Worker + colas BullMQ + progreso por SSE (infra genérica). | Un *job* de ejemplo muestra el progreso en la web en tiempo real. | ⬜ |
| 4.4 | CRUD de JDs. `[RF-JD-01]` | Se crean y listan desde la web. | ⬜ |
| 4.5 | Análisis de JD (prompt v1, versionado) con normalización al catálogo de herramientas. `[RF-JD-02]` | Con 5 JDs reales, los requisitos extraídos son correctos. | ⬜ |
| 4.6 | Vista y corrección del análisis. `[RF-JD-03]` | El usuario puede agregar o quitar requisitos. | ⬜ |
| 4.7 | Primer set de evals: 5–10 JDs con requisitos esperados. | Script de evals corre y reporta precisión de extracción. | ⬜ |

## Fase 5 — Match y gaps

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 5.1 | Agregado `TailoringSession` con su máquina de estados (dominio puro + tests). | Todas las transiciones válidas e inválidas cubiertas por tests. | ⬜ |
| 5.2 | Match determinístico de herramientas (con alias) + match semántico de requisitos no-herramienta con evidencia por id. `[RF-TAIL-02, RF-GAP-02]` | Con el perfil real y las JDs de evals, el match es razonable y toda la evidencia apunta a ids existentes. | ⬜ |
| 5.3 | Pantalla de resumen del match. `[RF-TAIL-03]` | Muestra cubiertos (con evidencia), parciales y faltantes. | ⬜ |
| 5.4 | Generación de preguntas de gaps (faltantes, parciales, no-herramienta). `[RF-TAIL-04, RF-GAP-03, RF-GAP-04]` | Las preguntas se generan sin LLM, desde plantillas. | ⬜ |
| 5.5 | UI de respuestas con los tres caminos (trabajo / proyecto-curso / no) y "relevante para este CV". `[RF-GAP-01]` | Se puede responder en cualquier orden y saltear. | ⬜ |
| 5.6 | Aplicar respuestas afirmativas al perfil maestro (origen `GAP_ANSWER`); "No" solo en el historial de la sesión. Recalcular el match. `[RF-TAIL-05, RF-GAP-05, RN-11, RN-12]` | Test: una respuesta "No" no crea nada en el perfil, y la misma herramienta se vuelve a preguntar en otra sesión. | ⬜ |
| 5.7 | Deshacer cambios de una sesión en el perfil. `[RF-TAIL-06]` | Revertir individualmente y en bloque funciona desde la UI. | ⬜ |

## Fase 6 — Generación del CV adaptado

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 6.1 | Opciones de la sesión: idiomas de salida, límite de páginas (con valor por defecto por años de experiencia) y plantilla. `[RF-TAIL-07, RF-TAIL-08, RF-TAIL-09]` | Se persisten y se respetan en la generación. | ⬜ |
| 6.2 | Puntuación de relevancia de logros y proyectos. | Scores guardados por candidato. | ⬜ |
| 6.3 | Redacción de bullets y resumen por idioma con `sourceIds`. `[RF-TAIL-10, RF-TAIL-11]` | CVs generados en ES y EN desde el mismo perfil. | ⬜ |
| 6.4 | Guardia de veracidad (RN-01, RN-02, RN-03) con regeneración de bullets inválidos. | Test: un bullet con una herramienta que no está en el perfil se descarta. Evals: 0 bullets inventados. | ⬜ |
| 6.5 | Ajuste de páginas integrado al pipeline + `fitLog`. `[RN-04]` | Todos los CVs de las evals respetan el límite de páginas. | ⬜ |
| 6.6 | Pantalla de revisión: vista previa del PDF, fuente de cada bullet, edición, incluir/excluir, reordenar y re-ajuste automático. `[RF-TAIL-12, RN-05]` | Editar un bullet actualiza la vista previa en < 2 s. `[RNF-08]` | ⬜ |
| 6.7 | Regenerar el CV completo o una sección con indicaciones. `[RF-TAIL-13]` | Funciona sin perder las ediciones del usuario en otras secciones. | ⬜ |
| 6.8 | Retomar sesiones en curso. `[RF-TAIL-15]` | Cerrar el navegador a mitad del flujo y volver deja todo donde estaba. | ⬜ |

## Fase 7 — Snapshots y postulaciones

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 7.1 | Finalizar sesión → `ResumeVersion` inmutable por idioma + PDF en el bucket + descarga por URL firmada. `[RF-TAIL-14, RNF-10]` | Test: editar el perfil después de finalizar no cambia el snapshot ni su PDF. | ⬜ |
| 7.2 | Agregado `Application` con su máquina de estados (dominio puro + tests). `[RN-08, RN-09, RN-10]` | Todas las transiciones cubiertas por tests. | ⬜ |
| 7.3 | Crear postulación desde una JD o desde una sesión finalizada; asociar uno o más snapshots enviados. `[RF-APP-01, RF-APP-02, RF-APP-08]` | Desde la postulación se descarga exactamente el PDF enviado. | ⬜ |
| 7.4 | Vista kanban con arrastrar para cambiar de estado + vista tabla con filtros y búsqueda. `[RF-APP-03, RF-APP-06]` | Usable con teclado (accesibilidad). | ⬜ |
| 7.5 | Línea de tiempo: eventos automáticos de estado, notas y entrevistas. `[RF-APP-04]` | Los eventos aparecen en orden y no se pueden alterar. | ⬜ |
| 7.6 | Contactos y datos adicionales (canal, prioridad, salarios). `[RF-APP-05, RF-APP-07]` | CRUD completo desde la web. | ⬜ |

## Fase 8 — Dashboard, pulido y lanzamiento del MVP

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 8.1 | Dashboard: postulaciones por estado, tasa de respuesta, tiempo medio a la primera respuesta. `[RF-DASH-01, RF-DASH-02]` | Los números coinciden con los datos de prueba. | ⬜ |
| 8.2 | Borrado de cuenta completo. `[RF-AUTH-04]` | Test: no queda ningún dato del usuario en Postgres ni en el bucket. | ⬜ |
| 8.3 | Revisión de accesibilidad y responsive. `[RNF-11]` | Lighthouse/axe sin errores críticos; flujo completo usable en móvil. | ⬜ |
| 8.4 | E2E con Playwright del flujo completo (LLM *fake*). | Corre en CI. | ⬜ |
| 8.5 | Observabilidad: Sentry, logs estructurados sin PII, panel de uso y costo de IA. `[RNF-02]` | Un error forzado aparece en Sentry sin datos personales. | ⬜ |
| 8.6 | Deploy: imágenes Docker, base de datos y Redis gestionados, bucket R2/S3, dominio, HTTPS. | La app de producción completa el flujo de punta a punta. | ⬜ |
| 8.7 | Política de privacidad y términos básicos. | Publicados y enlazados desde el registro. | ⬜ |

**🎯 Hito: MVP** — un usuario puede cargar su perfil maestro, generar CVs adaptados de 1–2 páginas respondiendo
gaps, finalizarlos y seguir sus postulaciones.

---

## Post-MVP (orden tentativo, a repriorizar)

| Prioridad | Funcionalidad | Requerimiento |
|---|---|---|
| 1 | Importar un CV existente (PDF/DOCX) al perfil maestro. Es clave para que cargar un perfil de 5–6 páginas no sea una barrera. | RF-PROF-09 |
| 2 | Carta de presentación desde la sesión de adaptación. | RF-TAIL-16 |
| 3 | Recordatorios de seguimiento y "requiere acción" en el dashboard. | RF-APP-09, RF-DASH-03 |
| 4 | Más plantillas de CV. | RF-TAIL-09 |
| 5 | Importar JD desde URL / extensión de navegador. | RF-JD-04, RF-JD-05 |
| 6 | Vista previa en el navegador con `typst.ts` (WASM). | — |
| 7 | Login con Google y exportación de datos. | RF-AUTH-03, RF-AUTH-05 |
| 8 | Mejoras de redacción de logros con IA. | RF-PROF-10 |
| 9 | Diff entre snapshots. | RF-TAIL-17 |
| 10 | Preparación de entrevistas con IA. | RF-APP-11 |
| 11 | Estadísticas de herramientas pedidas vs. presentes en el perfil. | RF-DASH-04 |
| 12 | Relevancia con embeddings (`pgvector`). | ADR-08 |
| — | Integración con email (a evaluar). | RF-APP-10 |
