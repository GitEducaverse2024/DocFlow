---
id: rule-r26-canvas-executor-immutable
type: rule
subtype: safety
lang: es
title: "R26 — canvas-executor.ts NUNCA se modifica"
summary: "El runtime canvas-executor.ts está congelado; toda nueva lógica va en servicios adyacentes, no en el dispatcher core"
tags: [canvas, R26, safety, critical]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from CLAUDE.md §Restricciones absolutas (phase 155 cleanup)" }
ttl: never
---

# R26 — canvas-executor.ts NUNCA se modifica

**Regla absoluta:** `app/src/lib/services/canvas-executor.ts` está congelado. No se permiten edits directos.

## Por qué

El executor mantiene invariantes críticos para el funcionamiento de todos los canvas activos en producción. Cualquier cambio en el dispatcher core afecta todos los pipelines simultáneamente. Bugs introducidos aquí son difíciles de revertir una vez que flows reales los han consumido.

## Cómo aplicar

- Nueva lógica de ejecución vive en servicios adyacentes (p.ej. `canvas-auto-repair.ts`, `canvas-connector-contracts.ts`).
- Nuevos tipos de nodo se registran via el dispatcher, sin tocar el executor principal.
- Si creés absolutamente imprescindible editar canvas-executor.ts, abrí una RFC previa en `.planning/reference/` justificando el cambio.

## Relacionado

- R27 — agentId UUID-only (contratos de datos que el executor espera)
- R29 — Docker rebuild tras execute-catpaw.ts (no tocar executor pero sí modules relacionados)
