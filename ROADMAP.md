# Careerly — Roadmap

> Estado: borrador v0.4 · Última actualización: 2026-11-18
> Documentos relacionados: [REQUIREMENTS.md](REQUIREMENTS.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Cómo usar este roadmap

- Se trabaja **un paso por vez**, en orden. No se adelantan pasos.
- Cada paso termina con su **criterio de terminado** cumplido, build y lint en verde, tests pasando y un commit.
- Los IDs entre corchetes (p. ej. `[RF-PROF-03]`) remiten a [REQUIREMENTS.md](REQUIREMENTS.md).
- El orden prioriza **reducir riesgo pronto**: el empaquetado de escritorio se prueba en la Fase 1, Typst y el
  ajuste de páginas antes de la IA, y la IA antes de la interfaz pulida.

- **Al mergear cada PR** se actualiza el estado del paso acá y se mueve su tarjeta en Trello ("En proceso" al
  abrir el PR, "Hecho" al mergearlo).
- **Versión por fase:** cerrar la Fase N larga la versión **`0.N.0`** de la app; las versiones intermedias
  mientras se trabaja en la fase siguiente son `0.N.X` (fixes o pasos ya terminados). `v0.8.0` es el MVP.
  Detalle en [VERSIONING.md §2.1](VERSIONING.md).

Estados: ⬜ pendiente · 🟨 en curso · ✅ hecho

---

## Fase 0 — Fundaciones · sin release

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 0.1 | Monorepo con npm workspaces: `apps/desktop`, `apps/web`, `apps/api`, `packages/contracts`, configs compartidas de TS, ESLint y Prettier. | `npm install`, `npm run build` y `npm run lint` funcionan desde la raíz. | ✅ |
| 0.2 | Esqueleto de NestJS: config validada con Zod (carpeta de datos, token, puerto), logger a archivo (pino), manejo global de errores, middleware de token + verificación de `Host`/`Origin`. `[RNF-19]` | `GET /health` responde solo con el token correcto. | ✅ |
| 0.3 | SQLite con `node:sqlite` + Drizzle: primera migración, modo WAL, migraciones aplicadas al iniciar con backup automático previo. `[RNF-20]` | Test: una migración que falla restaura el backup. | ✅ |
| 0.4 | Esqueleto de Vite + React: router (modo hash), TanStack Query, tokens de STYLES.md en Tailwind + componentes base propios, i18n (ES/EN), layout base, módulo puente con Electron. | La interfaz muestra el resultado de `/health`. | ✅ |
| 0.5 | Shell de Electron: main lanza el backend con `utilityProcess.fork`, puerto libre, token aleatorio, preload con `contextBridge`, una sola instancia, endurecimiento (`contextIsolation`, `sandbox`, CSP, enlaces externos al navegador). Comandos `npm run dev`, `npm run dev:web` y `npm start`. `[RNF-18]` | La app de escritorio abre y muestra `/health`; `npm run dev:web` funciona en el navegador. | ✅ |
| 0.6 | Reglas de límites entre módulos (ESLint) y setup de tests (unitarios + integración con SQLite temporal). | Un test de ejemplo de cada tipo corre en CI. | ✅ |
| 0.7 | CI en GitHub Actions: formato, lint, typecheck, tests y build en cada PR (Windows + Ubuntu). | PR de prueba con checks en verde. | ✅ |

## Fase 1 — Configuración y datos locales · `v0.1.0` · ✅ cerrada (2026-11-16)

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 1.1 | Asistente de primer inicio: elección del proveedor de IA y su API key, guardada con `safeStorage` por main (una por proveedor, una activa), enviada al backend en memoria y verificada con una llamada de prueba. `[RF-CONF-01, RF-CONF-02, RNF-03]` | La key no aparece en la base, en logs ni en archivos en texto plano; una key inválida muestra un error claro. | ✅ |
| 1.2 | Pantalla de configuración: idioma de la interfaz y carpeta de datos (ver y abrir). `[RF-CONF-03, RF-CONF-08]` | Cambiar el idioma se aplica sin reiniciar. | ✅ |
| 1.3 | Backup y restauración (base + PDFs en un único archivo) y borrado de todos los datos. `[RF-CONF-04, RF-CONF-05]` | Restaurar un backup en una instalación limpia deja todo igual. | ✅ |
| 1.4 | **Primer instalador** de Windows con electron-builder (API, migraciones y UI incluidas como recursos; resolver rutas desde `process.resourcesPath`). | El instalador funciona en una máquina sin Node ni herramientas de desarrollo. | ✅ (instalador publicado automáticamente desde `v0.0.1`; la prueba en una máquina sin Node es parte del checklist de la release `0.1.0`) |
| 1.5 | **Telemetría (base):** módulo `telemetry`, esquema `TelemetryReportV1` estricto en `contracts`, ventana de consentimiento dentro del asistente de primer inicio (casillas activadas, "Aceptar" / "Rechazar todo" al mismo nivel, lista explícita de lo que nunca se envía), Configuración → Privacidad (métricas, vista previa del JSON, historial, regenerar ID) y la métrica "uso activo". Todavía **sin envío**: los reportes quedan en `PENDING`. `[RF-TEL-01 a 07, RN-18, RN-19]` | Tests: con "Rechazar todo" o sin elegir no se genera ID ni reporte; un campo fuera del esquema hace fallar el armado; la vista previa coincide con lo que se guardaría. | ✅ |
| 1.6 | **Versionado:** release-please (componente raíz para la app con `exclude-paths`, `extra-files` para los `package.json`), `CHANGELOG.md`, versión visible en Configuración y como `appVersion`. Al crearse la release, el instalador de Windows se construye y se adjunta solo (adelantado del 8.9). `[RF-CONF-13, ADR-19]` | Mergear el PR de release de prueba crea el tag `v0.0.1`, la Release tiene el instalador y la versión aparece en la app. | ✅ |

## Fase 2 — Perfil maestro · `v0.2.0` · ✅ cerrada (2026-11-16)

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 2.1 | Catálogo de herramientas con alias y *seed* incluido en la app (lenguajes, frameworks, cloud, bases de datos, herramientas comunes). Búsqueda con autocompletado. `[RF-PROF-06]` | `GET /tools?query=postgres` devuelve PostgreSQL. | ✅ |
| 2.2 | Datos personales. `[RF-PROF-01]` | Se editan y persisten. | ✅ |
| 2.3 | Experiencias con logros (texto, métricas, herramientas), con orden editable. `[RF-PROF-02, RF-PROF-03]` | Se puede cargar una experiencia con 20+ logros sin problemas de UX. | ✅ |
| 2.4 | Proyectos (personales, open source, cursos, freelance) con logros. `[RF-PROF-04]` | Ídem 2.3. | ✅ |
| 2.5 | Educación, certificaciones e idiomas. `[RF-PROF-05]` | CRUD completo. | ✅ |
| 2.6 | Origen de cada elemento (`MANUAL`, `IMPORT`, `GAP_ANSWER` + sesión) y registro de cambios mínimo para poder revertir. `[RF-PROF-07]` | Test de dominio: crear desde gap y revertir deja el perfil como estaba. | ✅ (tabla `profile_changes` + `ProfileChangesService`; la API HTTP para deshacer llega con la sesión, F5) |
| 2.7 | **Importar un CV** (PDF o DOCX) al perfil maestro: la IA arma un borrador (datos personales, experiencias con logros y herramientas, proyectos, educación, certificaciones e idiomas) que el usuario revisa y corrige en pantalla antes de guardar; todo se guarda con origen `IMPORT`. Las herramientas se resuelven contra el catálogo. El CV es un dato no confiable (prompt injection) y la salida se valida con Zod. Requiere el paso 4.1, que se adelanta. `[RF-PROF-09]` | Con 3 CVs reales (incluido el propio), el borrador trae todas las experiencias, fechas y títulos correctos, sin datos inventados; nada se guarda sin confirmación. | ✅ (PR #30; validado con 3 CVs reales, incluido el propio) |
| 2.8 | Cargar el propio perfil maestro real como dato de prueba (importando el CV y completando a mano). | Un perfil completo y realista disponible para las fases siguientes. | ✅ (perfil real importado y completado a mano) |

> **Orden:** el paso 4.10 (elegir los modelos de IA) también se adelanta y va justo después de 2.7.
>
> **Orden:** el paso 4.1 (módulo `ai` con el adaptador de Gemini) se adelanta y se hace antes de 2.7: la
> importación de CV lo necesita, y 2.8 (cargar el perfil real) es lo que destraba la Fase 3 y los evals.
>
> RF-PROF-10 (sugerencias de redacción con IA) es MVP pero depende del módulo de IA: se implementa al final de
> la Fase 4 (paso 4.8).

## Fase 3 — Render con Typst (reducir riesgo) · `v0.3.0` · ✅ cerrada (2026-11-16)

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 3.1 | Contrato de plantillas (`TemplateData`: datos en JSON + textos fijos por idioma que agrega la app) y plantilla `classic` en Typst, compatible con ATS. `[RNF-09, ADR-24]` | Un JSON de ejemplo genera un PDF correcto en ambos idiomas. | ✅ (PR #35) |
| 3.2 | Decidir CLI empaquetado vs. módulo nativo (ADR-14). Script `fetch-typst` (versión fija + checksum) e inclusión del binario en el instalador. | El instalador de Windows renderiza PDFs sin tener Typst instalado. | ✅ (PR #38; CLI empaquetado, ADR-14) |
| 3.3 | Puerto `ResumeRenderer` + adaptador Typst (proceso hijo, directorio temporal, `--root`, fuentes empaquetadas, timeout). `[RNF-05]` | Test de integración renderiza un PDF real. | ✅ (PR #39) |
| 3.4 | Conteo de páginas (decidir ADR-07). | Test: un CV largo devuelve 2 páginas, uno corto devuelve 1. | ✅ (PR #40; ADR-07: se cuenta en el PDF) |
| 3.5 | `page-fitter` puro: reglas iniciales por sección + recorte por score + relleno. Tests con medidor falso. `[RN-04, RN-06, RN-07]` | Tests unitarios cubren: entra justo, sobra, falta y mínimo por puesto. | ✅ (PR #42) |
| 3.6 | Prueba manual: con el perfil real y scores asignados a mano, generar CVs de 1 y 2 páginas. | El resultado es un CV presentable. **Validar la plantilla antes de seguir.** | ✅ (PR #43: `npm run fit:tryout` con el perfil real, ES y EN; CVs presentables) |

## Fase 4 — Job descriptions + módulo de IA · `v0.4.0` · ✅ cerrada (2026-11-17)

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 4.1 | *(Se adelanta: va antes de 2.7.)* Módulo `ai`: puerto `LlmClient`, adaptador de Gemini (ADR-23; Claude como segundo adaptador) con la API key del usuario, salida estructurada + validación con Zod, reintento ante salida inválida, registro en `AiGeneration`. `[RNF-06]` | Tests con *fake* + test manual con la key real. | ✅ (PR #25: smoke con la key real de Gemini; modelos por nivel con alternativas) |
| 4.2 | Pantalla de consumo de IA (tokens y costo por día, mes y tarea). Acciones de IA deshabilitadas sin conexión o sin key válida. `[RF-CONF-06, RNF-13]` | Sin red, la app sigue funcionando y las acciones de IA muestran por qué no están disponibles. | ✅ (PR #47; probado sin conexión y con key rechazada) |
| 4.3 | Módulo `jobs`: cola persistida en SQLite, ejecutor con concurrencia y reintentos, reanudación al iniciar, progreso por SSE. | Cerrar la app a mitad de una tarea y volver a abrirla la completa. | ✅ (PR #48; cerrar y reabrir la app completa la tarea) |
| 4.4 | CRUD de JDs. `[RF-JD-01]` | Se crean y listan desde la app. | ✅ (PR #49; probado desde la app) |
| 4.5 | Análisis de JD (prompt v1, versionado) con normalización al catálogo de herramientas. Incluye categoría del rol, modalidad y país (ISO), que usa la telemetría. Los requisitos se guardan también en la tabla `JobRequirement` (ADR-09), para poder agregarlos más adelante. `[RF-JD-02]` | Con 5 JDs reales, los requisitos extraídos son correctos. | ✅ (PR #53) |
| 4.6 | Vista y corrección del análisis. `[RF-JD-03]` | El usuario puede agregar o quitar requisitos. | ✅ (PR #56) |
| 4.7 | Primer set de evals: 5–10 JDs con requisitos esperados. | Script de evals corre y reporta precisión de extracción. | ✅ (PR #57) |
| 4.8 | Sugerencias de redacción de logros con IA. `[RF-PROF-10]` | El usuario acepta o descarta cada sugerencia; nada cambia sin su confirmación. | ✅ (PR #58) |
| 4.9 | Telemetría: métrica "uso de funciones" (tokens de IA por día). `[RF-TEL-03h]` | Test: los tokens del reporte coinciden con `AiGeneration` del día. | ✅ (PR #59) |
| 4.10 | *(Se adelanta: va después de 2.7.)* **Elegir los modelos de IA** por nivel (chico y grande). La lista sale de la API del proveedor (los modelos que la key puede usar para generar) y se completa con un catálogo en código: precio, nivel recomendado y si fue probado con salida estructurada. La elección se guarda en `settings`, se prueba con una llamada mínima antes de guardarla y, si el modelo deja de existir, se vuelve a las alternativas por defecto. Un modelo fuera del catálogo se puede elegir con el aviso "sin precio conocido, no probado". `[RF-CONF-09, ADR-23]` | Con la key real se elige otro modelo para cada nivel, se guarda, sobrevive a un reinicio y las llamadas lo usan; un modelo retirado no rompe la app. | ✅ (PR #33; probado con la key real de Gemini) |
| 4.11 | **Claude como proveedor** (ADR-23), con API key (adaptador con el SDK oficial: salida estructurada, PDF, fallbacks por rechazo) o, opcional y experimental, **con la suscripción** a través del Claude Code instalado y logueado (`claude -p`), sin API key: aislado en una carpeta temporal, sin herramientas salvo leer el archivo que se le pasa, sin MCP ni configuración del usuario; se activa en Configuración solo si `claude` está instalado y logueado. `[RF-CONF-14, ADR-25]` | Con Claude Code logueado se importa un CV usando el plan, sin API key; sin `claude` la opción aparece deshabilitada con el motivo; un CV con instrucciones no logra que el proceso use otras herramientas. | ✅ (PR #41; CVs de prueba importados con la suscripción real) |
| 4.12 | *(Viene de la 3.7: se pasa para cerrar la Fase 3.)* Plantillas propias (backend): subir un `.typ`, validarlo renderizando los ejemplos de ES y EN, guardarlo versionado en `files/templates/`, listar, renombrar y borrar (las usadas por un snapshot se conservan). `[RF-TAIL-09, ADR-24, RNF-10]` | Test de integración: una plantilla válida queda disponible; una que no compila o tarda más del timeout se rechaza con el error de Typst. | ✅ (PR #54; tests de integración con Typst; el "usado por un snapshot" queda como puerto hasta la Fase 7) |
| 4.13 | *(Viene de la 3.8.)* Plantillas propias (UI): pantalla de plantillas con `classic` y las propias, subida con vista previa del ejemplo y descarga de `classic` + ejemplos como punto de partida. `[RF-TAIL-09]` | Subir una plantilla desde la app y ver su vista previa en ambos idiomas. | ✅ (subida, vista previa ES/EN, renombrar y borrar probados en la UI; visor de PDF verificado en Electron) |

## Fase 5 — Match y gaps · `v0.5.0`

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 5.1 | Agregado `TailoringSession` con su máquina de estados (dominio puro + tests). | Todas las transiciones válidas e inválidas cubiertas por tests. | ✅ (tabla estado × evento en `tailoring-session.test.ts`) |
| 5.2 | Match determinístico de herramientas (con alias) + match semántico de requisitos no-herramienta con evidencia por id. `[RF-TAIL-02, RF-GAP-02]` | Con el perfil real y las JDs de evals, el match es razonable y toda la evidencia apunta a ids existentes. | 🟨 (implementado y con tests; falta correr `npm run evals:match -- --profile-db <careerly.db>` con una key real y revisar el resultado) |
| 5.3 | Pantalla de resumen del match. `[RF-TAIL-03]` | Muestra cubiertos (con evidencia), parciales y faltantes. | ✅ (pantalla probada con la API simulada; se abre con "Adaptar mi CV" desde la oferta) |
| 5.4 | Generación de preguntas de gaps (faltantes, parciales, no-herramienta). `[RF-TAIL-04, RF-GAP-03, RF-GAP-04]` | Las preguntas se generan sin LLM, desde plantillas. | ⬜ |
| 5.5 | UI de respuestas con los tres caminos (trabajo / proyecto-curso / no) y "relevante para este CV". `[RF-GAP-01]` | Se puede responder en cualquier orden y saltear. | ⬜ |
| 5.6 | Aplicar respuestas afirmativas al perfil maestro (origen `GAP_ANSWER`); "No" solo en el historial de la sesión. Recalcular el match. `[RF-TAIL-05, RF-GAP-05, RN-11, RN-12]` | Test: una respuesta "No" no crea nada en el perfil, y la misma herramienta se vuelve a preguntar en otra sesión. | ⬜ |
| 5.7 | Deshacer cambios de una sesión en el perfil. `[RF-TAIL-06]` | Revertir individualmente y en bloque funciona desde la UI. | ⬜ |

## Fase 6 — Generación del CV adaptado · `v0.6.0`

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 6.1 | Opciones de la sesión: idiomas de salida, límite de páginas (con valor por defecto por años de experiencia) y plantilla. `[RF-TAIL-07, RF-TAIL-08, RF-TAIL-09]` | Se persisten y se respetan en la generación. | ⬜ |
| 6.2 | Puntuación de relevancia de logros y proyectos. | Scores guardados por candidato. | ⬜ |
| 6.3 | Redacción de bullets y resumen por idioma con `sourceIds`. `[RF-TAIL-10, RF-TAIL-11]` | CVs generados en ES y EN desde el mismo perfil. | 🟨 (adelantado a 5.4–6.2, en PR draft: implementado y con tests; falta correr `npm run evals:resume` con una key real y revisar los CVs) |
| 6.4 | Guardia de veracidad (RN-01, RN-02, RN-03) con regeneración de bullets inválidos. | Test: un bullet con una herramienta que no está en el perfil se descarta. Evals: 0 bullets inventados. | 🟨 (adelantado, en PR draft sobre el de 6.3: guardia de herramientas y cifras con una reescritura, probada con tests; falta correr `npm run evals:resume` con una key real) |
| 6.5 | Ajuste de páginas integrado al pipeline + `fitLog`. `[RN-04]` | Todos los CVs de las evals respetan el límite de páginas. | 🟨 (adelantado, en PR draft sobre el de 6.4: el ajuste corre al generar y se guarda con su `fitLog`, probado con Typst; falta correr `npm run evals:resume` con una key real) |
| 6.6 | Pantalla de revisión: vista previa del PDF, fuente de cada bullet, edición, incluir/excluir, reordenar y re-ajuste automático. `[RF-TAIL-12, RN-05]` | Editar un bullet actualiza la vista previa en < 2 s. `[RNF-08]` | 🟨 (adelantado, en PR draft sobre el de 6.5: pantalla y API probadas; editar + vista previa tarda ~200 ms en el navegador y el test de integración exige < 2 s) |
| 6.7 | Regenerar el CV completo o una sección con indicaciones. `[RF-TAIL-13]` | Funciona sin perder las ediciones del usuario en otras secciones. | 🟨 (adelantado, en PR draft sobre el de 6.6: probado con tests y en el navegador, incluido un reintento tras un fallo; falta probarlo con una key real) |
| 6.8 | Retomar sesiones en curso. `[RF-TAIL-15]` | Cerrar la app a mitad del flujo y volver deja todo donde estaba. | 🟨 (en PR draft sobre el de 6.7: sesiones en curso en el inicio, continuar desde la oferta y abandonar; test de integración que cierra la API con el match a medias y al volver termina solo) |
| 6.9 | Telemetría: completar "uso de funciones" (CVs generados, idiomas de salida, gaps respondidos). `[RF-TEL-03h]` | Test: el reporte refleja una sesión completa sin incluir texto del CV. | ⬜ |

## Fase 7 — Snapshots y postulaciones · `v0.7.0`

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 7.1 | Finalizar sesión → `ResumeVersion` inmutable por idioma + PDF en `files/snapshots/`. `[RF-TAIL-14, RNF-10]` | Test: editar el perfil después de finalizar no cambia el snapshot ni su PDF. | ⬜ |
| 7.2 | Agregado `Application` con su máquina de estados (dominio puro + tests). `[RN-08, RN-09, RN-10]` | Todas las transiciones cubiertas por tests. | ⬜ |
| 7.3 | Crear postulación desde una JD o desde una sesión finalizada; asociar uno o más snapshots enviados. `[RF-APP-01, RF-APP-02, RF-APP-08]` | Desde la postulación se abre y guarda exactamente el PDF enviado. | ⬜ |
| 7.4 | Vista kanban con arrastrar para cambiar de estado + vista tabla con filtros y búsqueda. `[RF-APP-03, RF-APP-06]` | Usable con teclado (accesibilidad). | ⬜ |
| 7.5 | Línea de tiempo: eventos automáticos de estado, notas y entrevistas. `[RF-APP-04]` | Los eventos aparecen en orden y no se pueden alterar. | ⬜ |
| 7.6 | Contactos y datos adicionales (canal, prioridad, salarios). `[RF-APP-05, RF-APP-07]` | CRUD completo. | ⬜ |
| 7.7 | Telemetría: métricas de postulaciones (cantidad, plataforma de origen con lista de portales, categoría y seniority, título recortado, embudo, modalidad y país). `[RF-TEL-03b–g]` | Test: ningún nombre de empresa, URL completa, contacto, nota ni salario llega al reporte. | ⬜ |

## Fase 8 — Dashboard, pulido y primer release · `v0.8.0 · MVP`

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 8.1 | Dashboard: postulaciones por estado, tasa de respuesta, tiempo medio a la primera respuesta. `[RF-DASH-01, RF-DASH-02]` | Los números coinciden con los datos de prueba. | ⬜ |
| 8.2 | Revisión de accesibilidad y de la ventana en distintos tamaños. `[RNF-11]` | axe sin errores críticos; la app es usable desde 1024 px de ancho. | ⬜ |
| 8.3 | E2E con Playwright para Electron del flujo completo (LLM *fake*). | Corre en CI. | ⬜ |
| 8.4 | Pantalla de "Privacidad" (qué datos salen hacia el proveedor de IA y hacia la telemetría, retención sin límite) y revisión de logs sin contenido sensible. `[RNF-01, RNF-02, RF-TEL-02]` | Un flujo completo no deja datos del perfil en los logs. | ⬜ |
| 8.5 | **Receptor de telemetría** `apps/telemetry-api`: NestJS + Drizzle + Postgres, `POST /v1/reports` con validación, idempotencia, topes y rate limit; API de lectura interna con umbral k ≥ 5. Envío firmado, un envío por día, prueba de trabajo y rangos por campo (ADR-26). `[RF-TEL-09, RN-20, RNF-22, RNF-23, ADR-26]` | Tests de integración: un segundo envío del día da `409` sin escribir, una firma inválida da `401`, un id nuevo sin prueba de trabajo da `428`, un valor fuera de rango rechaza el lote, un campo extra se rechaza y una categoría con < 5 instalaciones no aparece. | ⬜ |
| 8.6 | **Página pública** `apps/stats-web`: React + Vite con servidor Node intermediario hacia la API interna. `[RF-TEL-10, ADR-18]` | La página muestra los agregados y la API de lectura no responde desde fuera de la red interna. | ⬜ |
| 8.7 | **Infraestructura del VPS:** dominio, Caddy compartido, docker-compose de staging y prod (Postgres separados), backups diarios, Jenkins en Docker configurado como código (`infra/jenkins/`: plugins, JCasC, usuario `deploy` por SSH) y observabilidad liviana (uptime check externo, `/health`, rotación de logs, alertas de backup, deploy y recursos). `[ADR-21, ADR-22, D-10]` | Recrear Jenkins desde cero con `docker compose up` deja todo configurado; los dos entornos responden en sus subdominios; apagar `telemetry-api` de prod dispara una alerta. | ⬜ |
| 8.8 | **Pipeline de deploy:** Actions construye y publica las imágenes en GHCR y dispara a Jenkins; Jenkins despliega staging en cada merge y prod con aprobación al crear un tag (backup, migraciones, smoke test, rollback). Activación del envío en la app: clave por instalación, un lote firmado por día, reintentos con *backoff* y *jitter* y hasta 30 días atrás (ADR-26). `[RF-TEL-08, RN-21, ADR-20]` | Un deploy con smoke test fallido vuelve solo a la versión anterior; un reporte real enviado desde la app aparece en la página pública de prod. | ⬜ |
| 8.9 | Releases: sumar macOS y Linux al job de instaladores de release-please (Windows ya sale desde el 1.6); workflow manual para betas (`vX.Y.Z-beta.N`, *prerelease*). `[RNF-17, RNF-18]` | El tag `v0.1.0` produce instaladores que funcionan en las tres plataformas. | ⬜ |
| 8.10 | README con instrucciones para instalar desde releases y para ejecutar desde el código (`npm start`). | Una instalación limpia siguiendo el README funciona. | ⬜ |

**🎯 Hito: MVP (v0.1.0)** — la app de escritorio permite cargar el perfil maestro, generar CVs adaptados de
1–2 páginas respondiendo gaps, finalizarlos y seguir las postulaciones, con todos los datos locales.

---

## Post-MVP (orden tentativo, a repriorizar)

| Prioridad | Funcionalidad | Requerimiento |
|---|---|---|
| 1 | ~~Importar un CV existente (PDF/DOCX) al perfil maestro.~~ Pasó al MVP: es el paso 2.7. | RF-PROF-09 |
| 2 | Actualizaciones automáticas desde GitHub Releases, con elección de canal estable o beta. | RF-CONF-10, RF-CONF-12 |
| 3 | Carta de presentación desde la sesión de adaptación. | RF-TAIL-16 |
| 4 | Recordatorios de seguimiento y "requiere acción" en el dashboard. | RF-APP-09, RF-DASH-03 |
| 5 | Presupuesto mensual de IA. (La elección de modelos pasó al MVP: paso 4.10.) | RF-CONF-07 |
| 6 | Más plantillas de CV incluidas en la app (además de `classic` y las propias). | RF-TAIL-09 |
| 7 | Importar JD desde URL / extensión de navegador. | RF-JD-04, RF-JD-05 |
| 8 | Ver el perfil maestro completo y exportarlo a PDF. | RF-PROF-08 |
| 9 | Exportación de datos en JSON y backups cifrados con contraseña. | RF-CONF-11 |
| 10 | Diff entre snapshots. | RF-TAIL-17 |
| 11 | Preparación de entrevistas: research de empresa y guías por etapa (ver Fase P2). | RF-PREP-01 a 13, RF-APP-11 |
| 12 | Gaps recurrentes y recomendaciones de capacitación (ver Fase P1). | RF-LEARN-01 a 09, RF-DASH-04 |
| 13 | Relevancia con embeddings (`sqlite-vec`). | ADR-08 |

### Fase P1 — Gaps recurrentes y recomendaciones de capacitación

Ver [REQUIREMENTS.md §5.8](REQUIREMENTS.md) y [ARCHITECTURE.md §18.1](ARCHITECTURE.md).

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| P1.1 | Módulo `insights`: cálculo de gaps recurrentes en SQL + dominio (agrupación por catálogo, resta contra el perfil actual, ranking, mínimo de JDs). `[RF-LEARN-01, 02, 04, 09, RN-14]` | Tests: una herramienta agregada al perfil deja de aparecer como gap; con menos de N JDs no hay conclusiones. | ⬜ |
| P1.2 | Pantalla de gaps recurrentes con filtros (período, estado, seniority, rol) y enlace a las JDs de origen. `[RF-LEARN-03]` | Los números coinciden con los datos de prueba. | ⬜ |
| P1.3 | Recomendaciones con LLM (prioridad, motivo, esfuerzo, tipos de recurso) + validación de enlaces. `[RF-LEARN-05, 06]` | Ningún enlace inválido llega a la UI; las recomendaciones citan la frecuencia real del gap. | ⬜ |
| P1.4 | Estados de recomendación y paso a "aprendida" → carga en el perfil maestro con el flujo habitual. `[RF-LEARN-07, RN-15]` | Marcar "aprendida" no modifica el perfil hasta que el usuario carga el dato. | ⬜ |
| P1.5 | Recalcular como tarea en segundo plano (debounce al analizar JDs o cambiar el perfil) + serie temporal del match promedio. `[RF-LEARN-08]` | Gráfico de evolución con datos reales. | ⬜ |
| P1.6 | Widget en el dashboard: herramientas más pedidas vs. presentes en el perfil. `[RF-DASH-04]` | Visible en el dashboard. | ⬜ |

### Fase P2 — Preparación de entrevistas

Ver [REQUIREMENTS.md §5.9](REQUIREMENTS.md) y [ARCHITECTURE.md §18.2](ARCHITECTURE.md).

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| P2.1 | Puerto `CompanyResearcher` + adaptador con la búsqueda web del proveedor de LLM: research por secciones con fuente y fecha en cada dato, "desconocido" si no hay fuente, cache local de 7 días. `[RF-PREP-02, 03, RNF-15, RNF-16, RN-17]` | Con 5 empresas reales: 0 afirmaciones sin fuente; las consultas no incluyen datos del usuario. | ⬜ |
| P2.2 | Puerto `InterviewGuideWriter`: preguntas técnicas, conductuales STAR (con logros citados), gaps, preguntas a la empresa y pitch. `[RF-PREP-04 a 08, RN-16]` | Guardia de veracidad: toda respuesta STAR referencia logros existentes. | ⬜ |
| P2.3 | Guía por etapa de entrevista + checklist basada en el snapshot enviado. `[RF-PREP-09, 10]` | La guía de una etapa técnica difiere de la de screening; la checklist coincide con el CV enviado. | ⬜ |
| P2.4 | Debrief posterior a cada entrevista que alimenta la guía de la etapa siguiente. `[RF-PREP-11]` | Una pregunta registrada en el debrief aparece considerada en la guía siguiente. | ⬜ |
| P2.5 | Pantalla de la guía dentro de la postulación, versiones, regenerar y exportar a PDF (con Typst). `[RF-PREP-01, 13]` | Exportación correcta de una guía completa. | ⬜ |
| P2.6 | *(A evaluar)* Entrevista simulada por chat con devolución y costo estimado previo. `[RF-PREP-12]` | Decisión documentada de hacerla o no. | ⬜ |
