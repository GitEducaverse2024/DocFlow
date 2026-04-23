---
id: seed-cat-websearch
type: resource
subtype: catbrain
lang: es
title: WebSearch
summary: CatBrain de busqueda web con multiples motores
tags: [catbrain, hybrid]
audience: [catbot, architect]
status: active
created_at: 2026-03-16T18:40:25.257Z
created_by: kb-sync-bootstrap
version: 1.0.18
updated_at: 2026-04-23T16:41:50.097Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: catbrains
    id: seed-catbrain-websearch
    fields_from_db: [name, description, purpose, tech_stack, status, agent_id, rag_enabled, rag_collection, rationale_notes]
change_log:
  - { version: 1.0.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

CatBrain de busqueda web con multiples motores

## Configuración

- **Purpose:** Busqueda web via SearXNG, Gemini y Ollama
- **Tech stack:** -
- **Status:** processed
- **RAG enabled:** no
