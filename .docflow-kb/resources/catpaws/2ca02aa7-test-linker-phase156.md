---
id: 2ca02aa7-test-linker-phase156
type: resource
subtype: catpaw
lang: es
title: Test Linker Phase156
summary: Agente de prueba para conectores
tags: [catpaw, processor, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-04-20T20:40:14.631Z
created_by: web:default
version: 1.1.1
updated_at: 2026-04-20T22:19:51.352Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 2ca02aa7-ddba-421f-bba5-36e3a87fac34
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: connector, id: seed-hol-holded-mcp }
search_hints: [Holded MCP]
change_log:
  - { version: 1.0.0, date: 2026-04-20, author: web:default, change: Creado automáticamente por knowledge-sync (web:default) }
  - { version: 1.0.1, date: 2026-04-20, author: catbot:link_connector, change: Auto-sync patch bump }
  - { version: 1.1.0, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync minor bump from DB }
  - { version: 1.1.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Agente de prueba para conectores

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.7
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional
- **times_used:** 0

## System Prompt

```
Eres un agente de prueba. Tu único propósito es verificar la vinculación de conectores.
```
