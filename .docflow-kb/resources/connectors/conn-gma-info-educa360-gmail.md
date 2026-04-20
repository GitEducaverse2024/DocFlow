---
id: conn-gma-info-educa360-gmail
type: resource
subtype: connector
lang: es
title: Info Educa360 (Gmail)
summary: Gmail OAuth2 para info@educa360.com — REQUIERE CONFIGURACIÓN MANUAL de OAuth2 en /catpower/connectors
tags: [connector, gmail, email]
audience: [catbot, architect]
status: deprecated
created_at: 2026-04-02 19:05:17
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-02 19:05:17
updated_by: kb-sync-bootstrap
deprecated_at: 2026-04-02 19:05:17
deprecated_by: kb-sync-bootstrap
deprecated_reason: is_active=0 at first population
source_of_truth:
  - db: sqlite
    table: connectors
    id: conn-gmail-info-educa360
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Gmail OAuth2 para info@educa360.com — REQUIERE CONFIGURACIÓN MANUAL de OAuth2 en /catpower/connectors

## Configuración

- **Type:** gmail
- **test_status:** untested
- **times_used:** 0
