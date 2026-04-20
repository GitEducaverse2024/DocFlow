---
id: rule-r18-template-instruction-block
type: rule
subtype: design
lang: es
title: "R18 — Plantillas con contenido dinámico necesitan bloque instruction"
summary: "Plantillas con contenido dinámico necesitan bloque instruction"
tags: [canvas, R18, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R18) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R18 — Plantillas con contenido dinámico necesitan bloque instruction

Toda **plantilla** con contenido dinámico NECESITA al menos 1 bloque `instruction`. Si no lo tiene, el connector inyecta el HTML del texto **después del visual** — comportamiento correcto, pero no intuitivo.

## Por qué

El sistema de email templates de DocFlow distingue:

- Bloques `visual` (HTML estático con estilos inline).
- Bloques `instruction` (placeholder donde se inyecta contenido dinámico con una variable).

Si la plantilla es **solo visual** (ej: Pro-K12 v1 con el bloque del producto pero sin placeholder para el saludo/cuerpo personalizado), el renderer NO sabe dónde inyectar el texto del Respondedor. Como fallback seguro, lo inyecta al final del HTML como `<tr><td>...texto...</td></tr>` antes del footer.

## Incidente real

Las plantillas Pro-K12, Pro-REVI, etc. se crearon inicialmente como visual-only (diseño bonito del producto). El Respondedor redactaba un `cuerpo` personalizado pero el renderer lo pegaba al final, después del bloque visual del producto — el cliente veía "Hola [saludo]..." debajo del call-to-action del producto en vez de arriba.

Fix: añadir bloque `instruction` al inicio de cada plantilla con variables `{{saludo}}` y `{{cuerpo}}`.

## Cómo aplicar

Cada vez que se crea una plantilla que se usará con contenido LLM:

1. Asegurar al menos un bloque `instruction` con las variables esperadas del Respondedor.
2. Documentar las variables en la metadata de la plantilla.
3. Si la plantilla es solo visual (ej: newsletter estático), aceptar el fallback de inyección al final — pero dejarlo documentado.

## Ver también

- **R19** (separar selección de plantilla de maquetación).
- `.docflow-kb/resources/email-templates/*` para las plantillas vivas en DB.
