---
id: 43cbe742-antonio-educa360
type: resource
subtype: connector
lang: es
title: Antonio Educa360
summary: connector sin descripción
tags: [connector, gmail, email]
audience: [catbot, architect]
status: active
created_at: 2026-03-18T19:02:54.676Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T18:34:49.385Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: 43cbe742-d8ed-4788-a5df-0f6f874220a8
    fields_from_db: [name, description, type, is_active, times_used, test_status, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-10, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

_(sin descripción)_

## Configuración

- **Type:** gmail
- **test_status:** ok
- **times_used:** 13

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_connector_rationale` via CatBot.

### 2026-04-23 — _v30.9 sesion 40 closer_ (by v30.9-closer)

**Primer uso real con multi-recipient (3 destinatarios) + template CatBot (ref zAykt4) via send_report structured**

_Por qué:_ Cierre v30.9 shipping del canvas Comparativa: envio a antonio+fen+fran educa360 como comma-separated string en target_email del nodo connector. El send_report del canvas-executor resuelve report_template_ref por ref_code (MtV63k, zAykt4, etc.) contra email_templates.

_Tip:_ Para enviar reports desde Redactor LLM a este connector: pasa data_extra={auto_send:true, target_email:"a@x,b@y,c@z", target_subject:"...", report_template_ref:"zAykt4"}. El executor envuelve predecessorOutput Markdown automaticamente en send_report (v30.9 P4).

