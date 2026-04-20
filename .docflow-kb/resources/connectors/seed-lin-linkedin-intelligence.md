---
id: seed-lin-linkedin-intelligence
type: resource
subtype: connector
lang: es
title: LinkedIn Intelligence
summary: Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta.
tags: [connector, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-03-15T21:58:00.624Z
created_by: kb-sync-bootstrap
version: 1.0.5
updated_at: 2026-04-20T20:52:20.407Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-linkedin-mcp
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

Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta.

## Configuración

- **Type:** mcp_server
- **test_status:** ok
- **times_used:** 0
