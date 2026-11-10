# Careerly — Requerimientos

> Estado: borrador v0.1 · Última actualización: 2026-11-10
> Documentos relacionados: [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md)

## 1. Visión

Careerly ayuda a una persona que busca trabajo a **generar, con IA, un CV adaptado a cada búsqueda** a partir
de toda su información profesional, y a **llevar el seguimiento de cada postulación**: qué CV exacto se envió,
en qué estado está el proceso y qué pasó en cada etapa.

El valor central es este ciclo:

```
Perfil maestro (todo lo que hice) + Job description
        → preguntas sobre lo que falta → CV de 1–2 páginas, fiel y relevante
        → postulación con su CV enviado → seguimiento del proceso
```

## 2. Glosario

| Término | Definición |
|---|---|
| **Perfil maestro** | Conjunto de toda la información profesional del usuario: datos personales, experiencias, logros, herramientas, proyectos, cursos, certificaciones, idiomas, educación. Puede equivaler a un CV de 5–6 páginas o más. Es la **única fuente de verdad** para generar CVs. Coloquialmente, "CV maestro". |
| **Logro (Achievement)** | Unidad mínima del perfil maestro: una descripción concreta de algo que el usuario hizo, con métricas y herramientas asociadas. Pertenece a una experiencia o proyecto. |
| **Job description (JD)** | Texto de la oferta laboral a la que el usuario quiere postularse. |
| **Sesión de adaptación** | Proceso guiado que toma el perfil maestro y una JD, detecta lo que falta, pregunta al usuario y genera uno o más CVs adaptados. |
| **Gap** | Requisito de la JD (herramienta, tecnología, skill) que no aparece en el perfil maestro. |
| **CV adaptado** | CV de 1–2 páginas generado en una sesión de adaptación, editable hasta que se finaliza. |
| **Snapshot (versión de CV)** | Copia **inmutable** de un CV adaptado finalizado: datos, plantilla, idioma y PDF. Es lo que se asocia a una postulación. |
| **Postulación** | Registro del proceso con una empresa para un puesto: estado, CVs enviados, eventos, contactos y notas. |

## 3. Actores

- **Usuario:** persona que busca trabajo. Es el único actor del MVP.
- **Proveedor de IA:** servicio externo de LLM (ver ARCHITECTURE.md).
- *(Futuro)* **Administrador:** gestión de cuotas, plantillas y usuarios.

## 4. Principios del producto (no negociables)

1. **Veracidad.** La IA nunca inventa experiencia, herramientas, métricas, títulos ni fechas. Solo puede
   seleccionar, priorizar, reformular y traducir lo que está en el perfil maestro.
2. **El perfil maestro solo contiene afirmaciones.** Guarda únicamente lo que el usuario hizo o sabe hacer.
   **Nunca se almacenan negaciones** del tipo "no sé usar X". Si una JD vuelve a pedir X, se vuelve a preguntar,
   porque el usuario puede haberlo aprendido.
3. **Lo enviado no cambia.** Un CV asociado a una postulación es un snapshot inmutable. Editar el perfil maestro
   o regenerar CVs nunca altera lo que ya se envió.
4. **El usuario tiene la última palabra.** Todo CV generado se puede revisar y editar antes de finalizarlo.
5. **Estándar de la industria.** Los CVs generados ocupan 1 o 2 páginas y son compatibles con ATS.

## 5. Requerimientos funcionales

Prioridad: **MVP** = necesario para la primera versión usable · **Post** = después del MVP.

### 5.1 Cuenta (AUTH)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-AUTH-01 | Registro e inicio de sesión con email y contraseña. | MVP |
| RF-AUTH-02 | Recuperación de contraseña por email. | MVP |
| RF-AUTH-03 | Inicio de sesión con Google (OAuth). | Post |
| RF-AUTH-04 | Eliminar la cuenta y **todos** sus datos (perfil, CVs, PDFs, postulaciones, registros de IA). | MVP |
| RF-AUTH-05 | Exportar todos los datos del usuario en JSON. | Post |

### 5.2 Perfil maestro (PROF)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-PROF-01 | Cargar y editar datos personales: nombre, titular profesional, ubicación, email, teléfono, links (LinkedIn, GitHub, portfolio). | MVP |
| RF-PROF-02 | Cargar experiencias laborales: empresa, rol, fechas, ubicación/modalidad, descripción del contexto (producto, equipo, industria). | MVP |
| RF-PROF-03 | Cargar **logros** dentro de cada experiencia, sin límite de cantidad: texto detallado, métricas opcionales y herramientas usadas. | MVP |
| RF-PROF-04 | Cargar proyectos personales u open source, con logros y herramientas (misma estructura que las experiencias). | MVP |
| RF-PROF-05 | Cargar educación, cursos, certificaciones e idiomas (con nivel). | MVP |
| RF-PROF-06 | Las herramientas se eligen de un **catálogo normalizado con sinónimos** (p. ej. "Postgres" = "PostgreSQL", "K8s" = "Kubernetes"), con la posibilidad de crear nuevas. | MVP |
| RF-PROF-07 | Cada elemento del perfil registra su **origen** (manual, importado, respuesta a un gap en la sesión X) y fecha de creación/modificación. | MVP |
| RF-PROF-08 | Ver el perfil maestro completo y exportarlo a PDF ("documento maestro", sin límite de páginas). | Post |
| RF-PROF-09 | Importar un CV existente (PDF/DOCX) y convertirlo, con IA, en un borrador de perfil maestro que el usuario revisa antes de guardar. | Post (prioridad alta) |
| RF-PROF-10 | Sugerencias de IA para mejorar la redacción de un logro (más concreto, con métricas). El usuario acepta o descarta. | Post |
| RF-PROF-11 | El contenido del perfil puede estar en cualquier idioma; no es necesario cargarlo en varios idiomas. | MVP |

### 5.3 Job descriptions (JD)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-JD-01 | Crear una JD pegando el texto, con empresa, puesto, URL, ubicación, modalidad y rango salarial opcionales. | MVP |
| RF-JD-02 | Analizar la JD con IA y extraer requisitos estructurados: obligatorios, deseables, herramientas, seniority, años de experiencia, idioma de la JD y keywords. | MVP |
| RF-JD-03 | Ver y corregir el análisis (agregar/quitar requisitos) antes de continuar. | MVP |
| RF-JD-04 | Importar la JD desde una URL. | Post |
| RF-JD-05 | Extensión de navegador para guardar JDs desde portales de empleo. | Post |

### 5.4 Sesión de adaptación (TAIL) — núcleo del producto

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-TAIL-01 | Iniciar una sesión de adaptación a partir de una JD y el perfil maestro. | MVP |
| RF-TAIL-02 | Calcular el **match** entre los requisitos de la JD y el perfil: cada requisito queda como *cubierto* (con la evidencia: experiencia y logro), *parcial* o *faltante*. | MVP |
| RF-TAIL-03 | Mostrar un resumen del match: requisitos cubiertos con su evidencia, gaps y un puntaje orientativo. | MVP |
| RF-TAIL-04 | Generar **preguntas de gaps** por cada requisito faltante o parcial (ver flujo en 5.5). | MVP |
| RF-TAIL-05 | Las respuestas afirmativas se agregan al perfil maestro **automáticamente** y quedan marcadas con la sesión que las originó. | MVP |
| RF-TAIL-06 | Deshacer los cambios que una sesión hizo en el perfil maestro (individualmente o todos). | MVP |
| RF-TAIL-07 | Elegir uno o más **idiomas de salida** para la sesión. Se genera un CV por idioma. Por defecto, el idioma de la JD. | MVP |
| RF-TAIL-08 | Elegir el **límite de páginas** (1 o 2). Por defecto: 1 página con menos de 8 años de experiencia, 2 con 8 o más. | MVP |
| RF-TAIL-09 | Elegir la plantilla visual del CV. | MVP (1 plantilla) / Post (varias) |
| RF-TAIL-10 | Generar el CV adaptado: seleccionar y priorizar experiencias, logros, proyectos y herramientas relevantes, reformular con la terminología de la JD sin alterar los hechos, y escribir un resumen profesional orientado al puesto. | MVP |
| RF-TAIL-11 | Cada bullet del CV generado muestra de qué logro(s) del perfil maestro proviene. | MVP |
| RF-TAIL-12 | Vista previa del PDF y edición del CV adaptado: texto de bullets, orden, incluir/excluir elementos y resumen. Tras cada cambio se vuelve a ajustar el largo y se avisa si se excede el límite de páginas. | MVP |
| RF-TAIL-13 | Regenerar el CV (completo o una sección) con indicaciones del usuario (p. ej. "más foco en liderazgo"). | MVP |
| RF-TAIL-14 | **Finalizar** el CV: crea un snapshot inmutable por idioma, con su PDF descargable. | MVP |
| RF-TAIL-15 | Retomar una sesión en curso desde donde quedó. | MVP |
| RF-TAIL-16 | Generar una carta de presentación a partir de la misma sesión. | Post |
| RF-TAIL-17 | Comparar dos snapshots (diff de contenido). | Post |

### 5.5 Flujo de preguntas de gaps (GAP)

Para cada requisito **faltante** o **parcial** de la JD:

```
¿Usaste <herramienta>?
 ├─ Sí, en un trabajo
 │    → ¿En qué experiencia(s)?  (selección de las del perfil)
 │    → Contame en 1–2 líneas qué hiciste con <herramienta>  (texto libre; la IA puede ayudar a redactarlo)
 │    → Se agrega al perfil maestro como logro (o herramienta) de esa experiencia
 │    → Entra al CV adaptado
 │
 ├─ Sí, en un proyecto personal, curso o certificación
 │    → ¿Dónde? (proyecto/curso existente o uno nuevo) + contexto breve
 │    → Se agrega al perfil maestro
 │    → ¿Es relevante incluirlo en ESTE CV?  [Sí → sección Proyectos o Skills] [No]
 │
 └─ No
      → No se guarda NADA en el perfil maestro
      → Se registra solo en el historial de la sesión
      → En la próxima JD que lo pida, se vuelve a preguntar
```

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-GAP-01 | Las preguntas se presentan todas juntas (lista), se pueden responder en cualquier orden y se pueden saltear. Un gap salteado se trata como "No" para ese CV. | MVP |
| RF-GAP-02 | Antes de preguntar, se resuelven sinónimos y equivalencias del catálogo de herramientas, para no preguntar por algo que ya está con otro nombre. | MVP |
| RF-GAP-03 | Para requisitos *parciales* (p. ej. la JD pide AWS y el perfil tiene GCP), la pregunta muestra la evidencia relacionada que ya existe. | MVP |
| RF-GAP-04 | Los requisitos que no son herramientas (p. ej. "experiencia liderando equipos", "inglés C1") también generan preguntas, con el mismo flujo. | MVP |
| RF-GAP-05 | Si el usuario agrega información, el match se recalcula. | MVP |

### 5.6 Postulaciones (APP)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-APP-01 | Crear una postulación a partir de una JD (con o sin sesión de adaptación). | MVP |
| RF-APP-02 | Asociar a la postulación uno o más snapshots enviados (p. ej. versión EN y ES), con la fecha de envío. | MVP |
| RF-APP-03 | Gestionar el estado de la postulación según la máquina de estados de la sección 6.2. | MVP |
| RF-APP-04 | Línea de tiempo de eventos: cambios de estado (automáticos), notas, entrevistas (fecha, tipo, entrevistadores, resultado) y mensajes recibidos. | MVP |
| RF-APP-05 | Contactos por postulación: nombre, rol (recruiter, hiring manager, referido), email y LinkedIn. | MVP |
| RF-APP-06 | Vista **kanban** por estado (arrastrar para cambiar de estado) y vista **tabla** con filtros (estado, empresa, fecha) y búsqueda. | MVP |
| RF-APP-07 | Datos adicionales: canal de postulación (portal, referido, contacto directo), prioridad, salario pretendido y salario ofrecido. | MVP |
| RF-APP-08 | Desde una postulación, abrir el snapshot enviado y descargar exactamente el mismo PDF. | MVP |
| RF-APP-09 | Recordatorios de seguimiento (p. ej. "sin respuesta en 10 días"). | Post |
| RF-APP-10 | Integración con email para detectar respuestas automáticamente. | Post (a evaluar) |
| RF-APP-11 | Preparación de entrevistas con IA según la JD y el CV enviado. | Post |

### 5.7 Dashboard (DASH)

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-DASH-01 | Cantidad de postulaciones por estado. | MVP |
| RF-DASH-02 | Tasa de respuesta (postulaciones que pasaron de "Postulado") y tiempo medio hasta la primera respuesta. | MVP |
| RF-DASH-03 | Postulaciones activas que requieren acción (entrevista próxima, sin novedades hace N días). | Post |
| RF-DASH-04 | Herramientas más pedidas en las JDs del usuario vs. presentes en su perfil. | Post |

## 6. Reglas de negocio

### 6.1 Generación de CVs

- **RN-01 — Trazabilidad.** Todo bullet generado por la IA debe referenciar al menos un logro, proyecto o
  certificación del perfil maestro. Un bullet sin fuente se descarta.
- **RN-02 — Sin herramientas inventadas.** Toda herramienta mencionada en el CV generado debe existir en el
  perfil maestro (o haberse agregado en la sesión vía gaps).
- **RN-03 — Fechas, empresas y títulos.** Se copian del perfil maestro sin modificar. Solo se traducen las
  partes traducibles (p. ej. nombres de meses, ubicaciones).
- **RN-04 — Límite de páginas.** El ajuste al límite es determinístico (ver ARCHITECTURE.md §8). Un CV que
  excede el límite no se puede finalizar sin una confirmación explícita del usuario.
- **RN-05 — Ediciones del usuario.** El usuario puede editar libremente el texto de un CV adaptado. Los
  bullets editados se marcan como "editado por el usuario" y RN-01/RN-02 dejan de validarse sobre ellos.
- **RN-06 — Orden.** Experiencias en orden cronológico inverso. Dentro de cada experiencia, los bullets se
  ordenan por relevancia para la JD.
- **RN-07 — Experiencias antiguas o irrelevantes.** Pueden mostrarse solo con empresa, rol y fechas (sin
  bullets) u omitirse, pero no se deben dejar huecos temporales sin avisar al usuario.

### 6.2 Estados de una postulación

```
SAVED ──→ APPLIED ──→ SCREENING ──→ INTERVIEWING ──→ OFFER ──→ ACCEPTED
             │             │               │            │
             └─────────────┴───────────────┴────────────┴──→ REJECTED | WITHDRAWN | GHOSTED
```

| Estado | Significado |
|---|---|
| `SAVED` | Guardada, todavía no enviada. |
| `APPLIED` | Enviada. Requiere al menos un snapshot asociado (o confirmar que se envió sin CV de Careerly). |
| `SCREENING` | Primer contacto / filtro de recruiter. |
| `INTERVIEWING` | En entrevistas (técnicas, culturales, etc.). |
| `OFFER` | Oferta recibida. |
| `ACCEPTED` | Oferta aceptada (terminal). |
| `REJECTED` | Rechazada por la empresa (terminal). |
| `WITHDRAWN` | El usuario se retiró del proceso (terminal). |
| `GHOSTED` | Sin respuesta. Puede volver a un estado activo si la empresa responde. |

- **RN-08** Se puede saltar estados hacia adelante (p. ej. `APPLIED → INTERVIEWING`).
- **RN-09** Volver a un estado anterior requiere confirmación y queda registrado en la línea de tiempo.
- **RN-10** Desde un estado terminal solo se puede salir reabriendo la postulación explícitamente.

### 6.3 Perfil maestro

- **RN-11** Solo contiene afirmaciones (ver principio 2). No existe ningún campo, tabla ni bandera del tipo
  "no sabe X".
- **RN-12** Las respuestas "No" a gaps se guardan únicamente en el historial de la sesión de adaptación, para
  auditoría, y no influyen en sesiones futuras.
- **RN-13** Eliminar un elemento del perfil maestro no afecta a los snapshots existentes.

## 7. Requerimientos no funcionales

| ID | Categoría | Requerimiento |
|---|---|---|
| RNF-01 | Privacidad | Los datos de un usuario solo son accesibles por ese usuario. Todo acceso a datos se filtra por usuario. |
| RNF-02 | Privacidad | No se registra en logs el contenido del perfil, de las JDs ni de los prompts completos en producción. |
| RNF-03 | Privacidad | Datos cifrados en tránsito (TLS) y en reposo (base de datos y almacenamiento de archivos). |
| RNF-04 | Seguridad | El texto de una JD se trata como datos no confiables (riesgo de *prompt injection*). Las salidas de la IA se validan contra un esquema antes de usarse. |
| RNF-05 | Seguridad | El contenido del usuario nunca se interpola como código Typst; se pasa como datos (JSON). |
| RNF-06 | Costos | Cuota de generaciones de IA por usuario y por día, configurable. Se registra el uso de tokens y el costo estimado de cada llamada. |
| RNF-07 | Rendimiento | El análisis de la JD responde en menos de 15 s (p95). La generación de un CV muestra progreso en tiempo real y termina en menos de 60 s (p95). |
| RNF-08 | Rendimiento | Re-renderizar el PDF tras una edición tarda menos de 2 s (p95). |
| RNF-09 | Calidad del CV | Los PDF tienen texto seleccionable, una sola columna, títulos estándar y fuentes embebidas (compatibles con ATS). |
| RNF-10 | Reproducibilidad | Un snapshot se puede volver a renderizar idéntico: se guardan los datos, el id y la versión de la plantilla y el PDF. |
| RNF-11 | Accesibilidad | La aplicación web cumple WCAG 2.1 AA: navegación por teclado, foco visible, contraste y `prefers-reduced-motion`. |
| RNF-12 | Internacionalización | La interfaz está preparada para varios idiomas (inicialmente ES y EN). Los CVs se generan en el idioma que pida el usuario. |
| RNF-13 | Disponibilidad | Si el proveedor de IA falla, la app sigue funcionando para todo lo que no requiere IA (perfil, edición, postulaciones). Las tareas de IA se reintentan. |
| RNF-14 | Mantenibilidad | La lógica de dominio (adaptación, gaps, ajuste de páginas, estados) es independiente del framework, de la base de datos y del proveedor de IA, y tiene tests unitarios. |

## 8. Fuera de alcance (por ahora)

- Postularse automáticamente en portales de empleo.
- Funciones para reclutadores o empresas.
- Aplicaciones móviles nativas (la web debe ser responsive).
- Colaboración entre usuarios (compartir o comentar CVs).
- Facturación y planes pagos.

## 9. Decisiones abiertas

| # | Pregunta | Supuesto actual |
|---|---|---|
| D-01 | ¿Proyecto personal/portfolio o producto con usuarios reales? | Multiusuario desde el inicio, sin facturación. |
| D-02 | ¿Planes pagos? | No en el MVP; las cuotas de IA (RNF-06) dejan la puerta abierta. |
| D-03 | ¿Integración con email (RF-APP-10)? | Fuera del MVP. Requiere permisos OAuth sensibles; evaluar más adelante. |
| D-04 | ¿Umbral de años para el límite por defecto de 1 vs. 2 páginas? | 8 años. |
| D-05 | ¿El usuario puede subir una foto para el CV? | No (práctica habitual en mercados anglosajones y mejor para ATS). Revisar si se apunta a mercados donde es común. |
