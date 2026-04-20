---
id: rule-r07-catbrain-vs-agent
type: rule
subtype: design
lang: es
title: "R07 — CatBrain = texto→texto. Agent+CatBrain = JSON→JSON con RAG"
summary: "CatBrain = texto→texto. Agent+CatBrain = JSON→JSON con RAG"
tags: [canvas, R07, safety]
audience: [catbot, architect, developer]
status: active
created_at: 2026-04-20T00:00:00Z
created_by: catbot:phase-151
version: 1.0.0
updated_at: 2026-04-20T00:00:00Z
updated_by: catbot:phase-151
source_of_truth: null
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: catbot:phase-151, change: "Migrated from .planning/knowledge/canvas-nodes-catalog.md §Reglas de Oro (R07) + proceso-catflow-revision-inbound.md" }
ttl: never
---

# R07 — CatBrain = texto→texto. Agent+CatBrain = JSON→JSON con RAG

- Nodo **CatBrain puro** = texto → texto. Recibe una query, devuelve un texto con contexto RAG.
- Nodo **Agent con CatBrain vinculado** = JSON → JSON con RAG. Mantiene la estructura del input y añade campos.

Para manipular arrays JSON, SIEMPRE usar **Agent** con CatBrain(s) vinculado(s) como capa de contexto.

## Por qué

El nodo CatBrain está diseñado para completion text-based: recibe texto, consulta vectorial, produce texto. Si recibe un array JSON, lo serializa a texto y devuelve un string — pierdes la estructura.

El nodo Agent, en cambio, usa el CatBrain como tool de RAG (`rag_search`) que el LLM llama cuando necesita contexto, pero el I/O del nodo sigue siendo JSON.

## Antipattern

```
Clasificador (CatBrain con knowledge "Leads y Funnel")
  input:  [{email1}, {email2}, {email3}]
  output: "El email 1 es un lead, el email 2 es spam..."
```

El array se perdió. El siguiente nodo recibe texto plano.

## Pattern correcto

```
Clasificador (Agent con CatBrain "Leads y Funnel" vinculado via RAG)
  input:  [{email1}, ..., {emailN}]
  output: [{email1, tipo, producto}, ..., {emailN, tipo, producto}]
```

El CatBrain se consulta cuando el LLM del Agent llama `rag_search("criterios de lead cualificado")`, pero el contrato JSON del nodo se mantiene.

## Cuándo usar CatBrain puro

- Nodos de **investigación**: "resume lo que sabemos sobre X".
- Nodos de **búsqueda web**: CatBrain con engine SearXNG/Gemini.
- Flujos modo `catbrains` donde todo es texto→texto.

Nunca cuando el flujo es un pipeline de datos JSON.
