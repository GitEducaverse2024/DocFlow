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
version: 1.0.18
updated_at: 2026-04-23T15:45:46.073Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-gemini-search
    fields_from_db: [name, description, type, is_active, times_used, test_status, rationale_notes]
change_log:
  - { version: 1.0.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Busqueda web via Gemini grounding (Google). Requiere modelo gemini-search en LiteLLM.

## Configuración

- **Type:** http_api
- **test_status:** untested
- **times_used:** 0
