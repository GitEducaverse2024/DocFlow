---
id: taxonomy-canvas-modes
type: taxonomy
subtype: canvas-modes
lang: es
title: "Modos del Canvas (agents / catbrains / mixed)"
summary: "Los 3 modos del Canvas determinan qué tipos de nodo están disponibles en el editor. mixed es el superset y el default para CatFlows de producción."
tags: [canvas, catflow]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Modos del Canvas" }
ttl: never
---

# Modos del Canvas (agents / catbrains / mixed)

Los nodos disponibles en la paleta del editor dependen del **modo** del Canvas:

| Modo | Nodos disponibles |
|------|-------------------|
| **agents** | `start`, `agent`, `checkpoint`, `merge`, `condition`, `scheduler`, `iterator`, `storage`, `multiagent`, `output` |
| **catbrains** | `start`, `catbrain`, `checkpoint`, `merge`, `condition`, `scheduler`, `iterator`, `storage`, `multiagent`, `output` |
| **mixed** | `start`, `agent`, `catbrain`, `connector`, `checkpoint`, `merge`, `condition`, `scheduler`, `iterator`, `storage`, `multiagent`, `output` |

## Diferencias clave

- **agents**: modo clásico para pipelines de automatización CRM/email. No permite nodos CatBrain — todo RAG debe ir via Agent+CatPaw con CatBrains vinculadas (modelo dos capas).
- **catbrains**: modo orientado a flujos de investigación/consulta. Solo expone CatBrain como motor LLM.
- **mixed**: superset. Es el modo default para CatFlows de producción post-v4 (revisión inbound, CRM completo, etc.). Todos los flujos validados en producción viven aquí.

## Regla derivada (R08)

El modo restringe la paleta pero **no restringe los conectores/skills dentro del CatPaw**. Un Agent en modo `agents` puede tener Gmail + Drive + Holded via su CatPaw. La restricción es visual del editor, no de runtime.

Por eso **R08** — "no vincular conectores ni skills innecesarios" — se aplica a TODOS los modos: cada tool disponible es contexto que confunde al LLM.

## Cuando el editor crea un canvas nuevo

- POST `/api/canvas` con `mode: 'mixed'` es el default.
- El CatBot usa modo `mixed` para todos los canvases generados automáticamente (Phase 142+).
- Si el usuario pide explícitamente "solo agentes" o "solo catbrains" el CatBot respeta la elección.

## Referencias

- Concepto base: `domain/concepts/canvas-node.md`.
- Roles funcionales: `domain/taxonomies/node-roles.md`.
- Regla R07 (CatBrain vs Agent): `rules/R07-catbrain-vs-agent.md`.
- Regla R08 (conectores innecesarios): `rules/R08-no-unnecessary-connectors.md`.
