# Careerly — Versionado y releases

> Estado: v0.2 · Última actualización: 2026-11-19
> Documentos relacionados: [ARCHITECTURE.md §16.1](ARCHITECTURE.md) (decisión técnica, ADR-19) ·
> [ARCHITECTURE.md §19.6](ARCHITECTURE.md) (despliegue de la telemetría) · [ROADMAP.md](ROADMAP.md)

Esta guía explica **cómo se generan las versiones** y **qué revisar antes de largar una**. El porqué de cada
decisión está en ARCHITECTURE.md; acá está el cómo.

## 1. Qué se versiona

| Componente | Qué incluye | Formato | Tag | Dónde se publica |
|---|---|---|---|---|
| **App de escritorio** | `apps/desktop`, `apps/api`, `apps/web`, `packages/contracts` | SemVer | `vX.Y.Z` | GitHub Releases (instaladores) |
| **Receptor de telemetría** | `apps/telemetry-api` | SemVer | `telemetry-api-vX.Y.Z` | Imagen en GHCR → VPS (Jenkins) |
| **Página pública** | `apps/stats-web` | SemVer | `stats-web-vX.Y.Z` | Imagen en GHCR → VPS (Jenkins) |
| **Formato del reporte** | `TelemetryReportV<N>` en `packages/contracts` | Entero (`schemaVersion`) | — | Va dentro de la app |

Cada componente tiene su propio `CHANGELOG.md` y su propio ritmo: un cambio en la página pública no obliga a
sacar una versión de la app, y al revés.

## 2. Cómo funciona (release-please)

Las versiones **no se editan a mano**. Salen de los mensajes de commit.

```
1. Mergeás PRs a main con Conventional Commits (feat:, fix:, …)
2. release-please (GitHub Action) detecta qué componentes cambiaron, según las rutas de los archivos
3. Abre o actualiza un "PR de release" por componente: versión nueva + CHANGELOG.md
4. Cuando decidís largar la versión, mergeás ese PR
5. release-please crea el tag y la GitHub Release
6. El tag dispara el build:
     vX.Y.Z               → instalador de Windows adjunto a la GitHub Release (macOS/Linux en el 8.9)
     telemetry-api-vX.Y.Z → imagen en GHCR → Jenkins → prod (con aprobación)
     stats-web-vX.Y.Z     → ídem
```

El PR de release se puede dejar abierto todo el tiempo que haga falta: va acumulando los cambios. **Mergearlo
es la decisión de largar la versión.**

**Configuración:** `release-please-config.json`, `.release-please-manifest.json` (última versión de cada
componente) y `.github/workflows/release-please.yml`. El historial empieza en el commit `bootstrap-sha`: lo
anterior no entra al primer CHANGELOG. Requisito del repo: *Settings → Actions → General → Allow GitHub Actions
to create and approve pull requests* activado; si no, la Action no puede abrir el PR de release.

### 2.1 Qué versión resulta de cada commit

**Hasta la 1.0, la versión sigue las fases del roadmap: `0.N.X`.**

- `N` es la **última fase cerrada** del [ROADMAP](ROADMAP.md). Cerrar la Fase 1 larga `v0.1.0`, cerrar la
  Fase 2 larga `v0.2.0`, y así hasta `v0.8.0` (MVP).
- `X` cuenta las **versiones intermedias** mientras se trabaja en la fase siguiente: fixes o pasos ya
  terminados que conviene largar antes del cierre (`v0.1.1`, `v0.1.2`…).

Para lograrlo, la app usa `"versioning": "always-bump-patch"` en release-please:

| Commit | Ejemplo | Efecto en la app (antes de la 1.0) |
|---|---|---|
| `fix:` / `perf:` | `fix: keep page limit after editing a bullet` | **patch** (0.3.1 → 0.3.2) |
| `feat:` | `feat: add kanban view for applications` | **patch** también (0.3.2 → 0.3.3) |
| Cierre de fase: pie `Release-As: 0.N.0` | `chore: close phase 4` + `Release-As: 0.4.0` | **0.N.0** |
| `docs:`, `chore:`, `test:`, `ci:`, `build:`, `refactor:`, `style:` | `docs: update roadmap` | No genera versión |

**Cómo se cierra una fase:**

1. Todos los pasos de la fase están ✅ en el ROADMAP y sus tarjetas en "Hecho".
2. PR `chore: close phase N` que actualiza el ROADMAP (fase marcada como cerrada, con su versión) y cuyo commit
   lleva el pie `Release-As: 0.N.0`.
3. Al mergearlo, release-please actualiza su PR de release a `0.N.0`; se revisan los criterios de §4 y se
   mergea.

Otras reglas:

- Si en un PR de release hay varios commits, sale una sola versión con todos.
- El componente lo deciden **las rutas tocadas**, no el *scope* del commit. Evitá commits que mezclen la app y
  los servicios de telemetría: aparecerían en los dos CHANGELOGs.
- El mensaje del commit **es** la entrada del CHANGELOG: escribilo para alguien que usa la app, no para vos.
- Los PRs se mergean **solo con squash** (configurado en el repo): cada PR queda como un commit con el
  **título del PR**, que es la entrada del CHANGELOG, así que el título tiene que seguir Conventional Commits.
  El cuerpo junta los mensajes de los commits del PR, así que un pie `Release-As:` sigue funcionando. Con
  merge commits cada cambio aparecía dos veces (el commit y el merge, que repetía el título del PR). Con PRs
  encadenados, después de mergear uno hay que rebasar el siguiente sobre `main`.
- `telemetry-api` y `stats-web` **no** siguen las fases: usan SemVer normal (`fix` → patch, `feat` → minor).

### 2.2 Qué es un cambio "que rompe" en una app de escritorio

La app no tiene una API pública, así que "romper" significa algo que afecta al usuario o a sus datos:

- Un backup creado con la versión nueva **no se puede restaurar** en la anterior (o al revés).
- Se quita una funcionalidad o cambia un flujo de forma que el usuario tiene que reaprender algo importante.
- Hace falta una acción manual al actualizar (mover la carpeta de datos, reingresar la API key, etc.).
- Cambia la plataforma mínima soportada (por ejemplo, se deja de soportar Windows 10).

Una migración de base de datos **no** es por sí sola un cambio que rompe: se aplica sola y con backup previo
(RNF-20). Pero, como no hay vuelta atrás sin restaurar ese backup, toda versión con migraciones pasa por beta
(ver §4).

### 2.3 Antes y después de la 1.0

- **`0.N.X`:** etapa de desarrollo, una versión menor por fase (§2.1). `v0.8.0` es el MVP. Un cambio que
  rompe no cambia el número: se anota en el CHANGELOG y pasa por beta.
- **`1.0.0`:** se larga (con `Release-As: 1.0.0`) cuando el modelo de datos y el formato de backup se
  consideren estables y haya al menos un ciclo de betas sin problemas de migración. A partir de ahí rige
  SemVer normal: `fix` → patch, `feat` → minor, `!` → major (se quita `always-bump-patch`).

## 3. Canales: stable y beta

| Canal | Tag | Publicación | Para quién |
|---|---|---|---|
| **stable** | `v0.4.0` | GitHub Release normal | Todos |
| **beta** | `v0.4.0-beta.1`, `-beta.2`… | GitHub Release marcada como *prerelease* | Quien elige recibir betas (RF-CONF-12; hasta que exista, se instalan a mano) |

**Cómo se saca una beta:**

1. Mirá el PR de release abierto: ahí está la versión propuesta (por ejemplo, `0.4.0`).
2. En GitHub Actions, corré a mano el workflow **Beta** (`.github/workflows/beta.yml`, botón *Run workflow*).
   Toma esa versión, le agrega `-beta.N` (uno más que la última beta de esa versión), construye el instalador
   de Windows desde `main` y lo publica como *prerelease* con el tag `v0.4.0-beta.N`. La versión con `-beta.N`
   solo se aplica a ese build: no se commitea nada.
3. Si aparece un problema, se corrige en `main` y se saca `-beta.N+1`.
4. Cuando la beta está bien, se mergea el PR de release y sale la stable `0.4.0`.

Las betas **no cambian** el PR de release ni el CHANGELOG: son fotos de `main` antes de la versión final.

## 4. Criterios para largar una versión de la app

### 4.1 Siempre (cualquier versión stable)

- [ ] La CI de `main` está en verde (Windows + Ubuntu): formato, lint, typecheck, tests y build.
- [ ] No hay bugs abiertos marcados como bloqueantes.
- [ ] El CHANGELOG del PR de release se entiende y no hay entradas engañosas (si hace falta, se corrige el
      texto en el PR de release antes de mergear).
- [ ] El instalador de Windows (plataforma prioritaria) se probó en una máquina limpia, sin Node ni herramientas
      de desarrollo: instala, abre en menos de 3 s (RNF-21) y renderiza un PDF.
- [ ] Actualizar desde la última stable conserva todos los datos (perfil, sesiones, postulaciones, snapshots y
      sus PDFs).
- [ ] Los logs de un flujo completo no tienen contenido del perfil, de JDs ni prompts (RNF-02).

### 4.2 Si la versión incluye migraciones de base de datos

- [ ] Pasó por **al menos una beta** usada durante unos días con datos reales.
- [ ] Se probó actualizar desde la stable anterior con una **copia de datos reales** (tu propio perfil).
- [ ] Se verificó que el backup automático previo a la migración se crea y que restaurarlo deja todo como
      estaba.
- [ ] Si la migración falla a propósito (test), se restaura el backup (RNF-20).

### 4.3 Si cambian prompts, modelos o la lógica de generación

- [ ] El script de evals corre sin regresiones: **0 bullets inventados** y todos los CVs dentro del límite de
      páginas.
- [ ] La extracción de requisitos de las JDs de evals no empeora.

### 4.4 Si cambia la telemetría

- [ ] Si se agregan métricas: se subió `consentVersion` y la ventana aparece **solo** con las nuevas.
- [ ] Si cambia el formato de forma incompatible: se subió `schemaVersion` y **el receptor que la acepta ya está
      en prod** (ver §6). La app nunca sale antes que el receptor.
- [ ] La vista previa del JSON en Configuración → Privacidad coincide con lo que se envía.
- [ ] Ningún campo nuevo puede contener el CV, datos personales, empresas, URLs completas, salarios ni prompts
      (RN-18).

### 4.5 Cuándo hace falta beta

| Tipo de versión | ¿Beta obligatoria? |
|---|---|
| Intermedia (`0.N.X`) sin migraciones | No |
| Intermedia con migraciones | Sí |
| Cierre de fase (`0.N.0`) | Sí |
| `1.0.0` y majors posteriores | Sí, y conviene más de una |

## 5. Criterios para largar `telemetry-api` y `stats-web`

- [ ] La CI está en verde y la imagen se construyó y publicó en GHCR.
- [ ] La misma versión está desplegada en **staging** (sale sola en cada merge a `main`) y su smoke test pasó.
- [ ] El receptor sigue aceptando `schemaVersion` **N y N-1**.
- [ ] Las migraciones de Postgres son **compatibles con la versión anterior de la imagen**: primero se agregan
      columnas o tablas, y se borran recién en una versión posterior. Así el rollback automático de Jenkins
      funciona sin restaurar backups.
- [ ] La página pública respeta el umbral de anonimato (k ≥ 5) con los datos de staging.

Después de mergear el PR de release, Jenkins pide aprobación para prod. Antes de aprobar, revisá que el
backup previo al deploy se haya creado.

## 6. Cambios en el formato del reporte (`schemaVersion`)

| Cambio | ¿Sube `schemaVersion`? |
|---|---|
| Campo opcional nuevo | No |
| Valor nuevo en un enum que el receptor ya acepta como abierto | No |
| Quitar o renombrar un campo, cambiar su tipo o su significado | **Sí** |

Orden obligatorio cuando sube:

```
1. telemetry-api acepta V(N+1) además de V(N)   → release + deploy a prod
2. La app empieza a enviar V(N+1)               → release de la app
3. Cuando aparece V(N+2), el receptor deja de aceptar V(N)
   (las apps que todavía la envían reciben 410 y dejan de enviar sin molestar al usuario)
```

## 7. Hotfixes

No hay ramas de release: todo sale de `main`.

1. Rama `fix/<descripcion>` desde `main`, commit `fix: …`, PR con CI en verde.
2. Al mergear, release-please actualiza el PR de release con un patch.
3. Si el PR de release ya tenía features que no querés largar todavía, hay dos opciones: largarlas igual (si
   cumplen los criterios), o revertirlas en `main` hasta el próximo minor.

## 8. Si una versión sale mal

**App de escritorio:**

- Marcá la GitHub Release como *prerelease* (o borrala) para que electron-updater deje de ofrecerla, y sacá
  un patch lo antes posible.
- No se puede volver atrás automáticamente si hubo migraciones: el usuario tiene que instalar la versión
  anterior **y** restaurar el backup automático previo a la migración. Por eso existe el criterio de §4.2.
- Nunca se reutiliza un número de versión: si `v0.4.0` salió mal, la corrección es `v0.4.1`.

**Telemetría:**

- Jenkins hace rollback solo si falla el smoke test. Para volver atrás a mano, se relanza el job de deploy con
  el tag de imagen anterior (está registrado en `deployed-versions.json` en el VPS).

## 9. Resumen rápido

```
¿Hay que largar?   → mergeá el PR de release del componente
¿Qué número sale?  → 0.<fase cerrada>.<intermedia>; al cerrar la fase N, Release-As: 0.N.0
¿Beta antes?       → sí al cerrar una fase, o si hay migraciones
¿Telemetría?       → receptor primero, app después
¿Salió mal?        → patch nuevo; nunca reutilizar un número
```
