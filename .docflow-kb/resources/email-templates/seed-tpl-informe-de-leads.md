---
id: seed-tpl-informe-de-leads
type: resource
subtype: email-template
lang: es
title: Informe de Leads
summary: Plantilla de informe con cabecera violeta, instruccion para tabla de datos, y pie DoCatFlow.
tags: [template, email]
audience: [catbot, architect]
status: active
created_at: 2026-04-01T12:45:05.894Z
created_by: kb-sync-bootstrap
version: 1.0.6
updated_at: 2026-04-20T22:19:51.359Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: email_templates
    id: seed-tpl-informe-leads
    fields_from_db: [name, description, category, is_active, times_used]
change_log:
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.4, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.5, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.6, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Plantilla de informe con cabecera violeta, instruccion para tabla de datos, y pie DoCatFlow.

## Configuración

- **Category:** report
- **Ref code:** 9tYk9e
- **times_used:** 4
