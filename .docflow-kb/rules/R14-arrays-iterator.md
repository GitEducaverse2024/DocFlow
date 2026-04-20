---
id: rule-r14-arrays-iterator
type: rule
subtype: design
lang: es
title: "R14 — Arrays + tool-calling = ITERATOR obligatorio"
summary: "Arrays + tool-calling = ITERATOR obligatorio"
tags: [canvas, R14, performance, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R14) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R14 — Arrays + tool-calling = ITERATOR obligatorio

Arrays + tool-calling = **ITERATOR**. Nunca pasar arrays de más de 1 elemento a nodos que usan tools internamente.

## Por qué

Un nodo LLM con tool-calling tiene límite de rounds (`MAX_TOOL_ROUNDS = 12`). Si recibe un array de N items y cada uno requiere k tool-calls, el coste es `N × k` rounds — agota el límite si `N×k > 12`.

Además, el LLM tiende a "agrupar" tool-calls para arrays grandes: llama `get_template` una vez con múltiples IDs en vez de N veces con 1 ID. Esto rompe los contratos de tools single-item.

## Incidente real

**Maquetador v3**: recibía `[email1, ..., email7]`, intentaba llamar `get_template(ref) + render_template(vars) + send(html)` para cada uno en un solo nodo. Round 8/12 agotado → 3 emails enviados, 4 perdidos.

Fix v4: **ITERATOR** antes del Maquetador. Cada iteración recibe 1 email, llama los 3 tools, completa (3/12 rounds) y cede al ITERATOR_END.

## Cómo aplicar

1. Si el input del nodo es un array: comprobar si el CatPaw usa tools.
2. Si sí: ITERATOR antes del nodo.
3. Si no (solo LLM sin tools): se puede pasar el array, pero seguir considerando **R15** (info mínima) y **R16** (max_tokens).

## Diferencia con R02

- **R02** es la estimación (calcula N×k vs 12, usa ITERATOR si > 60%).
- **R14** es el hard-rule: en cuanto hay tool-calling y arrays, ITERATOR — sin cálculo.

## Combinar con R24

- **R24**: el parseo de array del ITERATOR tiene que ser robusto. Si el Lector devuelve JSON truncado, el ITERATOR NO puede hacer fallback a split por líneas (produciría 50 items basura).
