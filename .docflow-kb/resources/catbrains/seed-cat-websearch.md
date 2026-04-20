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
version: 1.0.12
updated_at: 2026-04-20T22:31:20.516Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: catbrains
    id: seed-catbrain-websearch
    fields_from_db: [name, description, purpose, tech_stack, status, agent_id, rag_enabled, rag_collection]
change_log:
  - { version: 1.0.8, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.9, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.10, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.11, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.12, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

CatBrain de busqueda web con multiples motores

## Configuración

- **Purpose:** Busqueda web via SearXNG, Gemini y Ollama
- **Tech stack:** -
- **Status:** processed
- **RAG enabled:** no
