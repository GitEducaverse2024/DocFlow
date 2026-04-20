---
id: rule-r23-thinking-vs-execution-nodes
type: rule
subtype: design
lang: es
title: "R23 — Separar nodos de pensamiento de nodos de ejecución"
summary: "Separar nodos de pensamiento de nodos de ejecución"
tags: [canvas, R23, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R23) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R23 — Separar nodos de pensamiento de nodos de ejecución

Separar **nodos de pensamiento** (LLM: clasificar, redactar) de **nodos de ejecución** (código: render, send, mark_read). No mezclar ambos en el mismo nodo.

## Por qué

Un mismo nodo que piensa + ejecuta:

- Es más difícil de debuggear (¿falló el pensar o el ejecutar?).
- Consume más rounds de tool-calling.
- Introduce variabilidad en la ejecución (R17).
- Viola **R05** (un nodo, una responsabilidad).

## Taxonomía aplicada al pipeline inbound v4

### Nodos de pensamiento (3)
- Lector (Agent+CatPaw Gmail): extrae emails crudos → produce JSON estructurado.
- Clasificador (Agent): JSON → JSON con `tipo` y `producto_detectado`.
- Respondedor (Agent): JSON → JSON con `respuesta: {plantilla_ref, saludo, cuerpo}`.

### Nodos de ejecución (2)
- Connector Gmail: recibe JSON, llama `render_template + send_email + mark_as_read` en código.
- Connector Informe: recibe lista de resultados, arma resumen, envía a antonio@.

**Tool-calls LLM para ejecución: 0.** Todo determinista.

## Cómo aplicar

Para cada nodo del diseño:

1. ¿Produce un esquema (output JSON estructurado con campos derivados por juicio)? → Pensamiento (LLM).
2. ¿Ejecuta una acción determinista dado un input estructurado? → Ejecución (código).
3. Si ambas cosas: **dividir en dos nodos**.

## Ver también

- **R05** (un nodo, una responsabilidad).
- **R20** (código > LLM cuando sea posible).
- `domain/taxonomies/node-roles.md` (mapeo rol → tipo nodo).
