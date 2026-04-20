---
id: rule-se03-guard-false-auto-repair
type: rule
subtype: side-effects
lang: es
title: "SE03 — Guard.false → auto-repair 1 vez"
summary: "Si guard.false agent reportador auto-repara via CatBot 1 vez, luego log_knowledge_gap"
tags: [canvas, SE03, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-155
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-155
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-155, change: "Migrated from app/data/knowledge/canvas-rules-index.md §Side Effects Guards + Anti-patterns (phase 155 cleanup)" }
ttl: never
---

# SE03 — Guard.false → auto-repair 1 vez

Si `guard.false`, el canvas ruta a un agent reportador que pide a CatBot auto-reparar el input vía `canvas_repair_input` **una sola vez**. Si la segunda pasada sigue en `guard.false`, se llama `log_knowledge_gap` y el pipeline finaliza en error controlado.

## Por qué

Infinite loops de auto-repair son peores que un fallo limpio + gap registrado. Un canvas que reintenta indefinidamente consume cuota del LLM, bloquea la cola del scheduler y no emite señal de alarma al equipo. Un gap registrado es accionable: el equipo sabe qué contrato hay que arreglar.

## Cómo aplicar

1. Nodo reportador con flag `max_retries: 1`.
2. Si `retry.count == 1` → invoca `canvas_repair_input(original_input, missing_fields)` → reintenta el guard.
3. Si `retry.count > 1` → `{accion_final: 'no_action', reason: 'auto_repair_exhausted'}` + llama `log_knowledge_gap({gap_type: 'contract_mismatch', canvas_id, node_id, missing_fields})`.
4. El pipeline emite un output controlado (no crash) con la razón explícita.

## Relacionado

- **SE01** (fuente del guard).
- **SE02** (qué valida el guard).
- **R24** (no-destructive fallback — aborta limpio, no inventa datos).
