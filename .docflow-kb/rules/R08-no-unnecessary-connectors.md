---
id: rule-r08-no-unnecessary-connectors
type: rule
subtype: design
lang: es
title: "R08 — No vincular conectores ni skills innecesarios"
summary: "No vincular conectores ni skills innecesarios"
tags: [canvas, R08, performance, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R08) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R08 — No vincular conectores ni skills innecesarios

No vincular conectores ni skills innecesarios al nodo. **Cada tool disponible es contexto que confunde al LLM**.

## Por qué

Cada skill inyecta texto al system prompt. Cada conector inyecta tool definitions al tool-calling. El LLM usa esas señales para decidir qué hacer — si hay un `send_email` disponible aunque no lo pidas, el LLM puede decidir enviar un email "porque parece pertinente".

## Incidente real

**v3 del Clasificador** tenía Gmail connector vinculado (herencia de un paw usado antes como Lector). El Clasificador, ante un array de emails, decidió llamar `gmail_mark_as_read` porque "parecía útil dado que estoy clasificándolos". Marcó como leído los 6 emails antes de que el Respondedor procesara el primero. Pipeline roto.

## Cómo aplicar

1. Antes de vincular un skill/conector, preguntarse: "¿este nodo realmente necesita este tool en este canvas?".
2. Si no, usar el patrón **CatPaws genéricos + extras del canvas** (ver **R09**): el CatPaw base es genérico, las skills/conectores/catbrains extras se añaden desde el nodo del canvas, no modificando el CatPaw.
3. Para un Clasificador: NO necesita `gmail_*`. Solo necesita la skill "Leads y Funnel" y el catbrain "Productos Educa360".

## Ejemplo de nodo bien configurado

```
Nodo Clasificador (Agent)
  CatPaw base: "Lector Genérico" (solo LLM, sin conectores)
  extraSkills: ["Leads y Funnel Educa360"]  # añadida desde canvas
  extraCatBrains: ["Productos Educa360"]    # añadida desde canvas
  extraConnectors: []                        # explícitamente vacío
  instructions: "Clasifica cada email..."
```

## Ver también

- **R09** (CatPaws genéricos, especialización del canvas).
- Skill duplicada confunde el Clasificador — ver `incidents/INC-*` y `protocols/catflow-inbound-review.md`.
