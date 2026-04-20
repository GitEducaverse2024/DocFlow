---
id: seed-tem-plantilla-corporativa
type: resource
subtype: email-template
lang: es
title: Plantilla Corporativa
summary: Utilizada para correos corporativos tanto a empleados , directivos y comunicación con clientes para fines no de venta.
tags: [template, email]
audience: [catbot, architect]
status: active
created_at: 2026-04-01T11:07:57.828Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-10T20:36:07.587Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: email_templates
    id: seed-template-basic
    fields_from_db: [name, description, category, is_active, times_used]
change_log:
  - { version: 1.0.0, date: 2026-04-10, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Utilizada para correos corporativos tanto a empleados , directivos y comunicación con clientes para fines no de venta.

## Configuración

- **Category:** corporate
- **Ref code:** tPXz3A
- **times_used:** 4
