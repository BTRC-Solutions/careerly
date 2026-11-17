# Careerly — paquete de logo

Concepto B, «Perfil maestro»: tu perfil completo atrás y el CV adaptado adelante, con el tilde.

## Qué hay en cada carpeta

| Carpeta | Contenido | Para qué |
|---|---|---|
| `logo/svg/` | Horizontal, apilado e isotipo en 4 variantes (color, negativo, mono, blanco) + isotipo simplificado | Web, diseño, impresión (vectorial, textos ya convertidos a trazos) |
| `logo/png/` | Los mismos en PNG con fondo transparente (horizontal 2400 px, apilado 1600 px, isotipo 1024 px) | Presentaciones, documentos, redes |
| `app-icon/macos/` | `careerly.icns` (16–1024 px, incluye @2x) + PNG sueltos + SVG maestro | Ícono de la app en macOS |
| `app-icon/windows/` | `careerly.ico` (16, 20, 24, 32, 40, 48, 64, 128, 256 px) + PNG sueltos + SVG maestro | Ícono de la app en Windows |
| `favicon/` | `favicon.ico`, `favicon.svg` (se adapta a modo oscuro), `icon-180/192/512.png` | Sitio web, pestañas, PWA |

**Electron:** `build/icon.icns`, `build/icon.ico` y `app-icon/macos/png/careerly-macos-1024.png` como `icon.png`.
**Tauri:** usá `careerly-macos-1024.png` con `tauri icon`, o copiá el `.icns`, el `.ico` y los PNG de 32, 128 y 256 px.

## Variantes

- **color**: tarjeta de atrás en tinta, la de adelante en violeta. Fondos claros.
- **negativo**: tarjeta de atrás y texto en blanco, la de adelante en violeta. Fondos oscuros.
- **mono**: todo en tinta. Impresión a un color.
- **blanco**: todo en blanco. Sobre el violeta o sobre fotos.

## Colores

| Nombre | HEX | RGB |
|---|---|---|
| Tinta | `#13182B` | 19, 24, 43 |
| Violeta (acento) | `#5B4BFF` | 91, 75, 255 |
| Niebla | `#F1F2F5` | 241, 242, 245 |
| Blanco | `#FFFFFF` | 255, 255, 255 |

## Tipografía

- Logo y títulos: **Bricolage Grotesque** Bold (Google Fonts, licencia OFL).
- Interfaz y textos de la app: **Inter** (Google Fonts, licencia OFL).

## Reglas de uso

- **Área de resguardo:** dejá libre alrededor del logo al menos ¼ de la altura del isotipo.
- **Tamaño mínimo:** logo horizontal de 100 px de ancho (25 mm impreso); isotipo de 16 px.
- **Versión simplificada:** cuando el isotipo mide menos de ~24 px usá `careerly-isotipo-simplificado-*` (más separación y tilde más grueso). Los íconos de app ya la usan en los tamaños chicos.
- **Evitar:** rotar, deformar, cambiar los colores o juntar las tarjetas sin la separación.
