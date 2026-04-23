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
version: 1.1.16
updated_at: 2026-04-23T18:34:49.384Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 2ca02aa7-ddba-421f-bba5-36e3a87fac34
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: seed-hol-holded-mcp }
search_hints: [Holded MCP]
change_log:
  - { version: 1.1.12, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.1.13, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.1.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.1.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.1.16, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
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

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)

## Skills vinculadas

_(sin skills vinculadas)_
