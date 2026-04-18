---
id: seed-sea-searxng-web-search
type: resource
subtype: connector
lang: es
title: SearXNG Web Search
summary: Busqueda web local via SearXNG. Agrega 246 motores. 100% local, sin API key.
tags: [connector, http]
audience: [catbot, architect]
status: active
created_at: 2026-03-16T17:59:05.341Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-03-16T17:59:05.341Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-searxng
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-03-16, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Busqueda web local via SearXNG. Agrega 246 motores. 100% local, sin API key.

## Configuración

- **Type:** http_api
- **test_status:** untested
- **times_used:** 0
