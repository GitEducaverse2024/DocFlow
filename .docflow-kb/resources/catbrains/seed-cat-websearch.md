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
version: 1.0.3
updated_at: 2026-04-20T17:44:23.597Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: catbrains
    id: seed-catbrain-websearch
    fields_from_db: [name, description, purpose, tech_stack, status, agent_id, rag_enabled, rag_collection]
change_log:
  - { version: 1.0.0, date: 2026-03-16, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

CatBrain de busqueda web con multiples motores

## Configuración

- **Purpose:** Busqueda web via SearXNG, Gemini y Ollama
- **Tech stack:** -
- **Status:** processed
- **RAG enabled:** no
