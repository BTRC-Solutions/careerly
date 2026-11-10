# Careerly — Roadmap

> Estado: borrador v0.2 · Última actualización: 2026-11-10
> Documentos relacionados: [REQUIREMENTS.md](REQUIREMENTS.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Cómo usar este roadmap

- Se trabaja **un paso por vez**, en orden. No se adelantan pasos.
- Cada paso termina con su **criterio de terminado** cumplido, build y lint en verde, tests pasando y un commit.
- Los IDs entre corchetes (p. ej. `[RF-PROF-03]`) remiten a [REQUIREMENTS.md](REQUIREMENTS.md).
- El orden prioriza **reducir riesgo pronto**: el empaquetado de escritorio se prueba en la Fase 1, Typst y el
  ajuste de páginas antes de la IA, y la IA antes de la interfaz pulida.

Estados: ⬜ pendiente · 🟨 en curso · ✅ hecho

---

## Fase 0 — Fundaciones

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 0.1 | Monorepo con npm workspaces: `apps/desktop`, `apps/web`, `apps/api`, `packages/contracts`, configs compartidas de TS, ESLint y Prettier. | `npm install`, `npm run build` y `npm run lint` funcionan desde la raíz. | ✅ |
| 0.2 | Esqueleto de NestJS: config validada con Zod (carpeta de datos, token, puerto), logger a archivo (pino), manejo global de errores, middleware de token + verificación de `Host`/`Origin`. `[RNF-19]` | `GET /health` responde solo con el token correcto. | ✅ |
| 0.3 | SQLite con `node:sqlite` + Drizzle: primera migración, modo WAL, migraciones aplicadas al iniciar con backup automático previo. `[RNF-20]` | Test: una migración que falla restaura el backup. | ✅ |
| 0.4 | Esqueleto de Vite + React: router (modo hash), TanStack Query, tokens de STYLES.md en Tailwind + componentes base propios, i18n (ES/EN), layout base, módulo puente con Electron. | La interfaz muestra el resultado de `/health`. | ✅ |
| 0.5 | Shell de Electron: main lanza el backend con `utilityProcess.fork`, puerto libre, token aleatorio, preload con `contextBridge`, una sola instancia, endurecimiento (`contextIsolation`, `sandbox`, CSP, enlaces externos al navegador). Comandos `npm run dev`, `npm run dev:web` y `npm start`. `[RNF-18]` | La app de escritorio abre y muestra `/health`; `npm run dev:web` funciona en el navegador. | ✅ |
| 0.6 | Reglas de límites entre módulos (ESLint) y setup de tests (unitarios + integración con SQLite temporal). | Un test de ejemplo de cada tipo corre en CI. | 🟨 (pasa localmente; falta la corrida en CI) |
| 0.7 | CI en GitHub Actions: formato, lint, typecheck, tests y build en cada PR (Windows + Ubuntu). | PR de prueba con checks en verde. | 🟨 (workflow listo; falta el PR de prueba) |

## Fase 1 — Configuración y datos locales

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 1.1 | Asistente de primer inicio: API key guardada con `safeStorage` por main, enviada al backend en memoria y verificada con una llamada de prueba. `[RF-CONF-01, RF-CONF-02, RNF-03]` | La key no aparece en la base, en logs ni en archivos en texto plano; una key inválida muestra un error claro. | ⬜ |
| 1.2 | Pantalla de configuración: idioma de la interfaz y carpeta de datos (ver y abrir). `[RF-CONF-03, RF-CONF-08]` | Cambiar el idioma se aplica sin reiniciar. | ⬜ |
| 1.3 | Backup y restauración (base + PDFs en un único archivo) y borrado de todos los datos. `[RF-CONF-04, RF-CONF-05]` | Restaurar un backup en una instalación limpia deja todo igual. | ⬜ |
| 1.4 | **Primer instalador** de Windows con electron-builder (API, migraciones y UI incluidas como recursos; resolver rutas desde `process.resourcesPath`). | El instalador funciona en una máquina sin Node ni herramientas de desarrollo. | ⬜ |

## Fase 2 — Perfil maestro

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 2.1 | Catálogo de herramientas con alias y *seed* incluido en la app (lenguajes, frameworks, cloud, bases de datos, herramientas comunes). Búsqueda con autocompletado. `[RF-PROF-06]` | `GET /tools?query=postgres` devuelve PostgreSQL. | ⬜ |
| 2.2 | Datos personales. `[RF-PROF-01]` | Se editan y persisten. | ⬜ |
| 2.3 | Experiencias con logros (texto, métricas, herramientas), con orden editable. `[RF-PROF-02, RF-PROF-03]` | Se puede cargar una experiencia con 20+ logros sin problemas de UX. | ⬜ |
| 2.4 | Proyectos (personales, open source, cursos, freelance) con logros. `[RF-PROF-04]` | Ídem 2.3. | ⬜ |
| 2.5 | Educación, certificaciones e idiomas. `[RF-PROF-05]` | CRUD completo. | ⬜ |
| 2.6 | Origen de cada elemento (`MANUAL`, `IMPORT`, `GAP_ANSWER` + sesión) y registro de cambios mínimo para poder revertir. `[RF-PROF-07]` | Test de dominio: crear desde gap y revertir deja el perfil como estaba. | ⬜ |
| 2.7 | Cargar el propio perfil maestro real como dato de prueba. | Un perfil completo y realista disponible para las fases siguientes. | ⬜ |

> RF-PROF-10 (sugerencias de redacción con IA) es MVP pero depende del módulo de IA: se implementa al final de
> la Fase 4 (paso 4.8).

## Fase 3 — Render con Typst (reducir riesgo)

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 3.1 | Plantilla `classic` en Typst que lee los datos desde JSON, con títulos en ES y EN, compatible con ATS. `[RNF-09]` | Un JSON de ejemplo genera un PDF correcto en ambos idiomas. | ⬜ |
| 3.2 | Decidir CLI empaquetado vs. módulo nativo (ADR-14). Script `fetch-typst` (versión fija + checksum) e inclusión del binario en el instalador. | El instalador de Windows renderiza PDFs sin tener Typst instalado. | ⬜ |
| 3.3 | Puerto `ResumeRenderer` + adaptador Typst (proceso hijo, directorio temporal, `--root`, fuentes empaquetadas, timeout). `[RNF-05]` | Test de integración renderiza un PDF real. | ⬜ |
| 3.4 | Conteo de páginas (decidir ADR-07). | Test: un CV largo devuelve 2 páginas, uno corto devuelve 1. | ⬜ |
| 3.5 | `page-fitter` puro: reglas iniciales por sección + recorte por score + relleno. Tests con medidor falso. `[RN-04, RN-06, RN-07]` | Tests unitarios cubren: entra justo, sobra, falta y mínimo por puesto. | ⬜ |
| 3.6 | Prueba manual: con el perfil real y scores asignados a mano, generar CVs de 1 y 2 páginas. | El resultado es un CV presentable. **Validar la plantilla antes de seguir.** | ⬜ |

## Fase 4 — Job descriptions + módulo de IA

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 4.1 | Módulo `ai`: puerto `LlmClient`, adaptador de Claude con la API key del usuario, salida estructurada + validación con Zod, reintento ante salida inválida, registro en `AiGeneration`. `[RNF-06]` | Tests con *fake* + test manual con la key real. | ⬜ |
| 4.2 | Pantalla de consumo de IA (tokens y costo por día, mes y tarea). Acciones de IA deshabilitadas sin conexión o sin key válida. `[RF-CONF-06, RNF-13]` | Sin red, la app sigue funcionando y las acciones de IA muestran por qué no están disponibles. | ⬜ |
| 4.3 | Módulo `jobs`: cola persistida en SQLite, ejecutor con concurrencia y reintentos, reanudación al iniciar, progreso por SSE. | Cerrar la app a mitad de una tarea y volver a abrirla la completa. | ⬜ |
| 4.4 | CRUD de JDs. `[RF-JD-01]` | Se crean y listan desde la app. | ⬜ |
| 4.5 | Análisis de JD (prompt v1, versionado) con normalización al catálogo de herramientas. Los requisitos se guardan también en la tabla `JobRequirement` (ADR-09), para poder agregarlos más adelante. `[RF-JD-02]` | Con 5 JDs reales, los requisitos extraídos son correctos. | ⬜ |
| 4.6 | Vista y corrección del análisis. `[RF-JD-03]` | El usuario puede agregar o quitar requisitos. | ⬜ |
| 4.7 | Primer set de evals: 5–10 JDs con requisitos esperados. | Script de evals corre y reporta precisión de extracción. | ⬜ |
| 4.8 | Sugerencias de redacción de logros con IA. `[RF-PROF-10]` | El usuario acepta o descarta cada sugerencia; nada cambia sin su confirmación. | ⬜ |

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
| 6.8 | Retomar sesiones en curso. `[RF-TAIL-15]` | Cerrar la app a mitad del flujo y volver deja todo donde estaba. | ⬜ |

## Fase 7 — Snapshots y postulaciones

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 7.1 | Finalizar sesión → `ResumeVersion` inmutable por idioma + PDF en `files/snapshots/`. `[RF-TAIL-14, RNF-10]` | Test: editar el perfil después de finalizar no cambia el snapshot ni su PDF. | ⬜ |
| 7.2 | Agregado `Application` con su máquina de estados (dominio puro + tests). `[RN-08, RN-09, RN-10]` | Todas las transiciones cubiertas por tests. | ⬜ |
| 7.3 | Crear postulación desde una JD o desde una sesión finalizada; asociar uno o más snapshots enviados. `[RF-APP-01, RF-APP-02, RF-APP-08]` | Desde la postulación se abre y guarda exactamente el PDF enviado. | ⬜ |
| 7.4 | Vista kanban con arrastrar para cambiar de estado + vista tabla con filtros y búsqueda. `[RF-APP-03, RF-APP-06]` | Usable con teclado (accesibilidad). | ⬜ |
| 7.5 | Línea de tiempo: eventos automáticos de estado, notas y entrevistas. `[RF-APP-04]` | Los eventos aparecen en orden y no se pueden alterar. | ⬜ |
| 7.6 | Contactos y datos adicionales (canal, prioridad, salarios). `[RF-APP-05, RF-APP-07]` | CRUD completo. | ⬜ |

## Fase 8 — Dashboard, pulido y primer release

| # | Paso | Criterio de terminado | Estado |
|---|---|---|---|
| 8.1 | Dashboard: postulaciones por estado, tasa de respuesta, tiempo medio a la primera respuesta. `[RF-DASH-01, RF-DASH-02]` | Los números coinciden con los datos de prueba. | ⬜ |
| 8.2 | Revisión de accesibilidad y de la ventana en distintos tamaños. `[RNF-11]` | axe sin errores críticos; la app es usable desde 1024 px de ancho. | ⬜ |
| 8.3 | E2E con Playwright para Electron del flujo completo (LLM *fake*). | Corre en CI. | ⬜ |
| 8.4 | Pantalla de "Privacidad" (qué datos salen hacia el proveedor de IA) y revisión de logs sin contenido sensible. `[RNF-01, RNF-02]` | Un flujo completo no deja datos del perfil en los logs. | ⬜ |
| 8.5 | Releases: workflow de GitHub Actions con matriz Windows/macOS/Linux que publica en GitHub Releases al crear un tag. `[RNF-17, RNF-18]` | El tag `v0.1.0` produce instaladores que funcionan en las tres plataformas. | ⬜ |
| 8.6 | README con instrucciones para instalar desde releases y para ejecutar desde el código (`npm start`). | Una instalación limpia siguiendo el README funciona. | ⬜ |

**🎯 Hito: MVP (v0.1.0)** — la app de escritorio permite cargar el perfil maestro, generar CVs adaptados de
1–2 páginas respondiendo gaps, finalizarlos y seguir las postulaciones, con todos los datos locales.

---

## Post-MVP (orden tentativo, a repriorizar)

| Prioridad | Funcionalidad | Requerimiento |
|---|---|---|
| 1 | Importar un CV existente (PDF/DOCX) al perfil maestro. Es clave para que cargar un perfil de 5–6 páginas no sea una barrera. | RF-PROF-09 |
| 2 | Actualizaciones automáticas desde GitHub Releases. | RF-CONF-10 |
| 3 | Carta de presentación desde la sesión de adaptación. | RF-TAIL-16 |
| 4 | Recordatorios de seguimiento y "requiere acción" en el dashboard. | RF-APP-09, RF-DASH-03 |
| 5 | Presupuesto mensual de IA y elección de modelos por tarea. | RF-CONF-07, RF-CONF-09 |
| 6 | Más plantillas de CV. | RF-TAIL-09 |
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
