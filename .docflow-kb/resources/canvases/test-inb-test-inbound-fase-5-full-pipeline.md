---
id: test-inb-test-inbound-fase-5-full-pipeline
type: resource
subtype: canvas
lang: es
mode: mixed
title: Control Leads Info@Educa360.com
summary: "catdev P1 smoke 1776888574

---
[v4d-doc-v1]

**Pipeline Inbound v4d** (shipped v30.3, sesion 34, 2026-04-23):

Canvas que orquesta la lectura del inbox de info@educa360.com, clasifica y responde lead"
tags: [canvas]
audience: [catbot, architect]
status: active
created_at: 2026-04-02 21:30:55
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:01:21.658Z
updated_by: api:canvas.PATCH
source_of_truth:
  - db: sqlite
    table: canvases
    id: test-inbound-ff06b82c
    fields_from_db: [name, description, mode, status, tags, is_template]
change_log:
  - { version: 1.0.0, date: 2026-04-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-22, author: api:canvas.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
  - { version: 1.0.2, date: 2026-04-23, author: api:canvas.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
  - { version: 1.0.3, date: 2026-04-23, author: api:canvas.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
ttl: never
---

## Descripción

Canvas de test fase a fase. Fase 1: solo Lector de emails.

## Configuración

- **Mode:** mixed
- **Status (DB):** idle
- **Is template:** no
