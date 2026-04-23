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
version: 1.0.17
updated_at: 2026-04-23T13:45:59.946Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-email-template
    fields_from_db: [name, description, type, is_active, times_used, test_status, rationale_notes]
change_log:
  - { version: 1.0.13, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Conector para acceder a las plantillas de email de DoCatFlow. Permite listar, consultar y renderizar templates HTML corporativos.

## Configuración

- **Type:** email_template
- **test_status:** ok
- **times_used:** 25
