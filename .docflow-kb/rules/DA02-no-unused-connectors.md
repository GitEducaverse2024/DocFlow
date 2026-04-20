---
id: rule-da02-no-unused-connectors
type: rule
subtype: anti-pattern
lang: es
title: "DA02 — No enlazar connectors/skills sin usar"
summary: "No enlaces connectors/skills que el nodo no va a usar"
tags: [canvas, DA02, performance]
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

# DA02 — No enlazar connectors/skills sin usar

No vincules a un nodo CatPaw connectors o skills que su `system_prompt` + `instructions` no usan.

## Por qué

Cada tool extra añade **~150-300 tokens** al context del LLM (descripción del tool + parámetros) y reduce la probabilidad de que invoque el tool correcto. Más opciones = más duda = más alucinación. El efecto se amplifica en CatPaws tool-calling pesados: un agente con 8 tools "por si acaso" elige mal con frecuencia.

## Cómo aplicar

1. Revisa que TODOS los tools linkeados aparecen por nombre en el prompt del CatPaw o en las `instructions` del nodo concreto.
2. Si un tool no aparece mencionado → desvincúlalo del nodo (desde el canvas, no del CatPaw base).
3. Los CatPaws genéricos se especializan **por canvas** (ver **R09**), no añadiendo tools al CatPaw raíz.

## Relacionado

- **R08** (no vincular conectores ni skills innecesarios — variante más amplia).
- **R15** (información mínima al LLM).
