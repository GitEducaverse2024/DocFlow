---
id: rule-r02-array-iterator-threshold
type: rule
subtype: design
lang: es
title: "R02 — Calcular N_items × tool_calls vs MAX_TOOL_ROUNDS"
summary: "Calcular N_items × tool_calls vs MAX_TOOL_ROUNDS"
tags: [canvas, R02, performance]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R02) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R02 — Calcular N_items × tool_calls vs MAX_TOOL_ROUNDS

Calcular `N_items × tool_calls_por_item` y compararlo con `MAX_TOOL_ROUNDS` (actualmente **12**). Si la estimación supera el 60% del máximo, usar **ITERATOR** o patrón Dispatcher/Worker.

## Por qué

Un nodo LLM con tool-calling tiene límite duro de rounds. Un Maquetador que llama `get_template + render_template + send_email` (3 tool-calls) sobre 7 emails necesita 21 rounds → límite agotado, proceso roto.

## Cómo aplicar

1. Estimar N_items del input (en revisión inbound: 5-10 emails/día).
2. Estimar tool_calls por item (en maquetador: 3 — get+render+send).
3. Multiplicar. Si > 7 (60% de 12), ITERATOR obligatorio.
4. El ITERATOR emite 1 item por iteración al loop body, cada iteración arranca con rounds frescos.

## Ejemplo del incidente v3 → v4

**v3** (roto): Maquetador LLM recibe `[email1, email2, ..., email7]` → intenta get+render+send para los 7 en un solo nodo → agota rounds en email3.

**v4** (corregido): ITERATOR antes del Maquetador → el nodo recibe 1 email → 3 tool-calls cabe en 12 rounds.

## Referencias

- Ver **R14** (arrays + tool-calling = ITERATOR obligatorio).
- Ver **R17** (todo LLM es probabilístico, planificar fallbacks).
