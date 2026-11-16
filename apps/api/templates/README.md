# Plantillas de CV

Plantillas Typst para el render de CVs (ARCHITECTURE.md §9, ADR-03 y ADR-24). Hay dos tipos: las **incluidas**
en la app (por ahora `classic`, la que se usa por defecto) y las **propias**, que el usuario sube como un archivo
`.typ` (Roadmap 3.7 y 3.8). Todas siguen el mismo contrato.

```
templates/
  classic/
    template.typ      # la plantilla
    template.json     # { id, name, version }; cada cambio de la plantilla sube `version`
  examples/           # datos de ejemplo, uno por idioma; sirven para probar cualquier plantilla
  fonts/              # fuentes disponibles para todas las plantillas (licencia OFL)
```

## Contrato

- **Entrada:** un único JSON, `TemplateData` de `@careerly/contracts` (`packages/contracts/src/resume.ts`). Se
  lee con `json(sys.inputs.at("data", default: "data.json"))`: el adaptador lo escribe como `data.json` al lado de
  la plantilla.
- **Textos fijos:** `data.labels` trae, en el idioma del CV, los títulos de sección, los meses abreviados,
  "actualidad" y los niveles de idioma. Una plantilla no necesita traducciones propias.
- **Datos, no código:** los valores se muestran como texto (`#value`, `[#value]`). Nunca se pasan a `eval` ni se
  arma código Typst con ellos (RNF-05).
- **Fuentes:** solo las de `fonts/` (Source Sans 3) y las que trae Typst (Libertinus Serif, New Computer Modern,
  DejaVu Sans Mono). Las fuentes del sistema se ignoran, para que el resultado sea igual en cualquier equipo.
- **Archivos:** la plantilla solo puede leer dentro de su directorio (`--root`). No hay red ni acceso a otros
  archivos.
- **ATS (RNF-09):** una columna, títulos de sección estándar (los de `labels`), texto seleccionable, sin texto en
  imágenes y sin tablas para maquetar.
- **Páginas:** el ajuste a 1–2 páginas lo hace la app (ARCHITECTURE.md §8); la plantilla solo dibuja lo que
  recibe y no recorta contenido.

## Probar una plantilla

Con el CLI de Typst (`npm run typst:fetch` baja la versión fija a `vendor/typst/`), desde `apps/api/templates/`:

```bash
typst compile classic/template.typ cv-es.pdf --root . --input data=/examples/example.es.json --font-path fonts --ignore-system-fonts
```

En Git Bash, anteponé `MSYS_NO_PATHCONV=1` para que `/examples/...` no se convierta en una ruta de Windows.
`npm test` renderiza todas las plantillas incluidas con cada ejemplo si encuentra Typst (`TYPST_BIN`, el de
`vendor/typst/` o el del PATH); CI siempre lo baja.
