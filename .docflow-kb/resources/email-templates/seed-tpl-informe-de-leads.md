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
version: 1.0.0
updated_at: 2026-04-01T12:45:05.894Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: email_templates
    id: seed-tpl-informe-leads
    fields_from_db: [name, description, category, is_active, times_used]
change_log:
  - { version: 1.0.0, date: 2026-04-01, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Plantilla de informe con cabecera violeta, instruccion para tabla de datos, y pie DoCatFlow.

## Configuración

- **Category:** report
- **Ref code:** jx5XXq
- **times_used:** 0
