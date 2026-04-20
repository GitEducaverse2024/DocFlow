---
id: rule-da04-no-implicit-dependencies
type: rule
subtype: anti-pattern
lang: es
title: "DA04 — No dependas de datos fuera del input explícito"
summary: "No dependas de datos fuera del input explicito del nodo"
tags: [canvas, DA04, safety]
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

# DA04 — No dependas de datos fuera del input explícito

El nodo solo puede usar datos que llegan en su `predecessorOutput`. No asumas que el canvas preservó una variable del START o de un nodo lejano.

## Por qué

Aunque **R10** manda preservar campos, el CatBot puede perder campos no canónicos a lo largo de 5-8 nodos: renombres accidentales, merges parciales, fallbacks en nodos intermedios. Confiar en que "el START tenía `external_input.tenant_id` así que lo tendré yo" es apostar contra la probabilística del LLM.

## Cómo aplicar

1. Cada nodo **DEBE** declarar explícitamente su contrato `input` y `output`.
2. Si un nodo necesita un field del START, el pipeline lo propaga **campo a campo** por todos los nodos intermedios (con **R10** + **R12** en cada uno).
3. El guard previo al emitter (ver **SE01**) valida que los campos siguen presentes justo antes de salir.

## Relacionado

- **R10** (preservar campos — si se aplicara al 100%, DA04 sería trivial; no se aplica al 100%, por eso DA04 existe).
- **R12** (PASA SIN MODIFICAR explícito).
- **R13** (nombres canónicos idénticos en todo el pipeline).
