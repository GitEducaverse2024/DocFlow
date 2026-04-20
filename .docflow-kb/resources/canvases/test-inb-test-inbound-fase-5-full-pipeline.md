---
id: test-inb-test-inbound-fase-5-full-pipeline
type: resource
subtype: canvas
lang: es
title: "TEST Inbound — Fase 5: Full Pipeline"
summary: "Canvas de test fase a fase. Fase 1: solo Lector de emails."
tags: [canvas]
audience: [catbot, architect]
status: active
created_at: 2026-04-02 21:30:55
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-15T10:54:37.301Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: canvases
    id: test-inbound-ff06b82c
    fields_from_db: [name, description, mode, status, tags, is_template]
change_log:
  - { version: 1.0.0, date: 2026-04-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Canvas de test fase a fase. Fase 1: solo Lector de emails.

## Configuración

- **Mode:** mixed
- **Status (DB):** idle
- **Is template:** no
