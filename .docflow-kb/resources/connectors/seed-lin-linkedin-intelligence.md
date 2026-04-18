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
version: 1.0.0
updated_at: 2026-03-15T21:58:00.624Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-linkedin-mcp
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-03-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta.

## Configuración

- **Type:** mcp_server
- **test_status:** untested
- **times_used:** 0
