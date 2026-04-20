---
id: e7d15f13-test-n8n
type: resource
subtype: connector
lang: es
title: Test n8n
summary: test n8n
tags: [connector]
audience: [catbot, architect]
status: active
created_at: 2026-03-11T18:28:19.010Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-03-28T07:24:07.571Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: e7d15f13-dffc-4f87-932f-00ff6a87df9b
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-03-28, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

test n8n

## Configuración

- **Type:** n8n_webhook
- **test_status:** failed
- **times_used:** 0
