---
id: agente-t-agente-test-docflow
type: resource
subtype: catpaw
lang: es
title: Agente Test DocFlow
summary: Agente para test de comprobación de creaciond e Agentes
tags: [catpaw, chat]
audience: [catbot, architect]
status: active
created_at: 2026-03-11T08:42:21.889Z
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-20T22:30:36.253Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: agente-test-docflow
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
change_log:
  - { version: 1.0.0, date: 2026-03-30, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Agente para test de comprobación de creaciond e Agentes

## Configuración

- **Mode:** chat
- **Model:** openai/gpt-4o
- **Temperatura:** 0.7
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional
- **times_used:** 0

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
