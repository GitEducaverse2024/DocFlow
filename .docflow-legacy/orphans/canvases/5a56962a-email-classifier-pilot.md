---
id: 5a56962a-email-classifier-pilot
type: resource
subtype: canvas
lang: es
title: Email Classifier Pilot
summary: "Piloto de clasificacion de emails: normaliza, clasifica por producto Educa360, busca contexto RAG, genera respuesta con plantilla Pro-*, envia via Gmail"
tags: [canvas]
audience: [catbot, architect]
status: active
created_at: 2026-04-17 14:26:28
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-17 14:26:46
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: canvases
    id: 5a56962a-6ea5-4e19-8a3a-9220d9f14f23
    fields_from_db: [name, description, mode, status, tags, is_template]
change_log:
  - { version: 1.0.0, date: 2026-04-17, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Piloto de clasificacion de emails: normaliza, clasifica por producto Educa360, busca contexto RAG, genera respuesta con plantilla Pro-*, envia via Gmail

## Configuración

- **Mode:** mixed
- **Status (DB):** idle
- **Is template:** no
