---
id: incident-inc-06
type: incident
lang: es
title: "INC-06 — Nodos borrados reaparecen en el Canvas UI"
summary: "Nodos borrados reaparecen en el Canvas UI"
tags: [canvas, canvas, ops]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/incidents-log.md §INC-06" }
ttl: never
---

# INC-06 — Nodos borrados reaparecen en el Canvas UI

**Fecha:** 2026-03-31
**Severidad:** CRITICA — impide editar canvas correctamente

## Síntoma

Al borrar un nodo del canvas, desaparece pero reaparece a los pocos segundos.

## Causa raíz

Doble merge que re-añade nodos eliminados:
1. **Cliente** (`canvas-editor.tsx`): antes de guardar, hacía fetch al servidor y re-añadía nodos que el servidor tenía pero el cliente no (los que acabas de borrar).
2. **Servidor** (`PATCH /api/canvas/[id]`): comparaba incoming contra DB y re-añadía nodos "missing".

## Solución

1. Eliminado el pre-merge del cliente (ya no hace fetch al servidor antes de guardar).
2. Añadido flag `force_overwrite: true` que el cliente envía al servidor.
3. El servidor skipea el merge cuando recibe `force_overwrite: true`.

**Archivos modificados:**
- `app/src/components/canvas/canvas-editor.tsx` — eliminado bloque de pre-merge.
- `app/src/app/api/canvas/[id]/route.ts` — añadido condicional `if (!force_overwrite)` al merge.

## Regla para el futuro

Cualquier lógica de "merge defensivo" contra estado del servidor es sospechosa. El cliente es la fuente de verdad durante la edición.
