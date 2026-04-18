---
id: seed-tem-plantilla-basica
type: resource
subtype: email-template
lang: es
title: Plantilla Basica
summary: Plantilla minimalista con instruccion de cuerpo y pie de firma. Usar como base para emails simples.
tags: [template, email]
audience: [catbot, architect]
status: active
created_at: 2026-04-01T11:06:28.358Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-01T11:06:28.358Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: email_templates
    id: seed-template-basic
    fields_from_db: [name, description, category, is_active, times_used]
change_log:
  - { version: 1.0.0, date: 2026-04-01, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Plantilla minimalista con instruccion de cuerpo y pie de firma. Usar como base para emails simples.

## Configuración

- **Category:** general
- **Ref code:** u2Zuxk
- **times_used:** 0
