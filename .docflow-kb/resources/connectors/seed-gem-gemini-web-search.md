---
id: seed-gem-gemini-web-search
type: resource
subtype: connector
lang: es
title: Gemini Web Search
summary: Busqueda web via Gemini grounding (Google). Requiere modelo gemini-search en LiteLLM.
tags: [connector, http]
audience: [catbot, architect]
status: active
created_at: 2026-03-16T17:59:05.341Z
created_by: kb-sync-bootstrap
version: 1.0.5
updated_at: 2026-04-20T20:52:20.407Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-gemini-search
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.4, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.5, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Busqueda web via Gemini grounding (Google). Requiere modelo gemini-search en LiteLLM.

## Configuración

- **Type:** http_api
- **test_status:** ok
- **times_used:** 0
