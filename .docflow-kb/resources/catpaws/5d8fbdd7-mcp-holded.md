---
id: 5d8fbdd7-mcp-holded
type: resource
subtype: catpaw
lang: es
title: MCP_Holded
summary: Chat conectado a Holded Educa360
tags: [catpaw, chat, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-03-23T17:26:57.277Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:45:54.309Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 5d8fbdd7-f008-4589-a560-a1e0dcc3e61a
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: seed-hol-holded-mcp }
  - { type: skill, id: 36f0a6ca-holded-erp-guia-operativa-para-asistentes }
search_hints: [Holded ERP — Guía Operativa para Asistentes, Holded MCP]
change_log:
  - { version: 1.0.0, date: 2026-03-30, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Chat conectado a Holded Educa360

## Configuración

- **Mode:** chat
- **Model:** gemini-main
- **Temperatura:** 0.2
- **Max tokens:** 2048
- **Output format:** markdown
- **Tone:** profesional
- **Department tags:** ["Dirección"]
- **times_used:** 10

## System Prompt

```
Eres un asistente experto en Holded ERP. Tienes acceso a las herramientas de Holded para gestionar contactos, CRM, proyectos, fichaje de horas y facturación. consultas etc.
```

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)

## Skills vinculadas

- **Holded ERP — Guía Operativa para Asistentes** (`36f0a6ca-7375-4162-b6a3-7acbe161060e`)
