---
id: 20dacde5-docatflow
type: resource
subtype: catbrain
lang: es
title: DoCatFlow
summary: Asistente de desarrollo y conocimiento para soluciones técnicas para l a plataforma DoCatFlow
tags: [catbrain, chat]
audience: [catbot, architect]
status: active
created_at: 2026-03-15 08:01:17
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-23T13:45:54.322Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: catbrains
    id: 20dacde5-bdf7-497f-85f1-5a2ad13eb063
    fields_from_db: [name, description, purpose, tech_stack, status, agent_id, rag_enabled, rag_collection, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-17, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Asistente de desarrollo y conocimiento para soluciones técnicas para l a plataforma DoCatFlow

## Configuración

- **Purpose:** Asistir en consultas sobre el proyecto DoCatFlow
- **Tech stack:** -
- **Status:** rag_indexed
- **RAG enabled:** yes
- **RAG collection:** docatflow
