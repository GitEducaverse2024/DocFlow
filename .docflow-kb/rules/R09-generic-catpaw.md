---
id: rule-r09-generic-catpaw
type: rule
subtype: design
lang: es
title: "R09 — CatPaws genéricos, especialización via extras del canvas"
summary: "CatPaws genéricos, especialización via extras del canvas"
tags: [canvas, R09, learning]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R09) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R09 — CatPaws genéricos, especialización via extras del canvas

Los CatPaws son genéricos; la especialización es del canvas. Usar **extras del nodo** (extraSkills, extraConnectors, extraCatBrains) sin modificar el CatPaw base.

## Modelo de dos capas (Base + Canvas)

| Capa | Origen | Editable desde canvas | Se ejecuta |
|------|--------|----------------------|------------|
| **Base** | CatPaw (/agents) | NO (solo lectura) | SI, siempre |
| **Extra** | Canvas (este nodo) | SI | SI, se mergea con base |

- Skills **base**: vinculadas al CatPaw en /agents. No se pueden quitar desde canvas.
- Skills **extra**: añadidas desde el nodo canvas. Solo afectan a este nodo.
- Igual para conectores y catbrains.

## Por qué

- Un CatPaw "Ejecutor Gmail" sirve en 20 canvases. Si cada canvas modifica sus skills/conectores, se vuelve imposible de mantener y los canvases se rompen unos a otros.
- Las necesidades específicas de un canvas (ej: una skill con el tono comercial de Q1) van en el nodo del canvas, no en el CatPaw.

## Cómo aplicar

1. Buscar primero si existe un CatPaw genérico que cubra la función (ver skill "Arquitecto de Agentes" del CatBot).
2. Si existe, usarlo como `agentId` del nodo.
3. Añadir `extraSkills`/`extraConnectors`/`extraCatBrains` solo para lo específico del canvas.
4. NUNCA crear un CatPaw nuevo "Ejecutor Gmail Para Canvas X" — es una copia que se desincroniza.

## Ejemplo

**Malo:** crear CatPaw "Clasificador Inbound Q1 2026" con skill "Leads y Funnel".

**Bueno:** usar CatPaw "Clasificador Genérico" (solo LLM) + `extraSkills: ["Leads y Funnel Educa360"]` en el nodo canvas.

## Ver también

- **R08** (no vincular tools innecesarios).
- Modelo dos capas: `domain/concepts/canvas-node.md` §2 Agent.
