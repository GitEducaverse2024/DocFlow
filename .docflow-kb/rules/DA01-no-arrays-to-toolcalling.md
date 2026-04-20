---
id: rule-da01-no-arrays-to-toolcalling
type: rule
subtype: anti-pattern
lang: es
title: "DA01 — No arrays >1 item a tool-calling"
summary: "No pases arrays >1 item a nodos con tool-calling interno (usa ITERATOR)"
tags: [canvas, DA01, safety]
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

# DA01 — No arrays >1 item a tool-calling

No pases arrays con N>1 items directamente a nodos con tool-calling interno (CatPaw con tools enlazados, CatBrain+tool). Usa **ITERATOR** / Dispatcher.

## Por qué

El LLM del nodo tool-calling rara vez invoca N tool-calls correctos cuando el input es un array. Success rate observado <40% en arrays >3 items: el LLM agrupa tool-calls (1 llamada con todos los IDs en vez de N), pierde items a mitad del loop interno, o se queda sin rounds (ver **R02**, **R14**).

## Cómo aplicar

1. Si el contrato del nodo recibe un array (`input: Array<Item>`) y el nodo tiene tools enlazados → el predecesor **DEBE** ser un ITERATOR con `items_from: input.array_field`.
2. El cuerpo del loop recibe un único item, ejecuta las tool-calls con rounds frescos (12 rounds por iteración).
3. Al terminar, ITERATOR_END acumula los resultados.

## Relacionado

- **R02** (estimación N×k vs MAX_TOOL_ROUNDS=12).
- **R14** (arrays + tool-calling = ITERATOR obligatorio — hard-rule que instancia DA01).
