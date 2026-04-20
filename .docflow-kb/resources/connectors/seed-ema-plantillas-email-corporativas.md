---
id: seed-ema-plantillas-email-corporativas
type: resource
subtype: connector
lang: es
title: Plantillas Email Corporativas
summary: Conector para acceder a las plantillas de email de DoCatFlow. Permite listar, consultar y renderizar templates HTML corporativos.
tags: [connector]
audience: [catbot, architect]
status: active
created_at: 2026-04-01T12:45:05.894Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-20T17:44:23.591Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-email-template
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-04-01, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Conector para acceder a las plantillas de email de DoCatFlow. Permite listar, consultar y renderizar templates HTML corporativos.

## Configuración

- **Type:** email_template
- **test_status:** ok
- **times_used:** 25
