---
id: 27397b9f-gestor-generico-drive
type: resource
subtype: catpaw
lang: es
title: Gestor Generico Drive
summary: Asistente generico para interactuar con Google Drive. Puede crear carpetas, hojas de calculo, anadir filas y obtener URLs de documentos segun las instrucciones del flujo.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-26T19:41:40.570Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T13:45:54.310Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 27397b9f-700e-4cd7-a91b-e428a8d03d7f
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-03-30, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Asistente generico para interactuar con Google Drive. Puede crear carpetas, hojas de calculo, anadir filas y obtener URLs de documentos segun las instrucciones del flujo.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.7
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional
- **times_used:** 1

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
