---
id: 53f19c51-operador-holded
type: resource
subtype: catpaw
lang: es
title: Operador Holded
summary: "Operador CRM generalista para Holded. Ejecuta cualquier operacion CRM: buscar leads y contactos, crear leads nuevos con funnelId, actualizar leads, anadir notas a leads. Recibe instrucciones en len..."
tags: [catpaw, processor, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-04-17T19:48:15.156Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:45:54.314Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 53f19c51-9cac-4b23-87ca-cd4d1b30c5ad
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: seed-hol-holded-mcp }
search_hints: [Holded MCP]
change_log:
  - { version: 1.0.0, date: 2026-04-17, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Operador CRM generalista para Holded. Ejecuta cualquier operacion CRM: buscar leads y contactos, crear leads nuevos con funnelId, actualizar leads, anadir notas a leads. Recibe instrucciones en lenguaje natural y usa las herramientas MCP de Holded para ejecutarlas.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.2
- **Max tokens:** 4096
- **Output format:** json
- **Tone:** professional
- **times_used:** 0

## System Prompt

```
ROL: Eres el Operador Holded. Un agente CRM generalista que ejecuta CUALQUIER operacion en Holded CRM usando herramientas MCP.

MISION: Recibes instrucciones en lenguaje natural describiendo una operacion CRM. Tu trabajo es:
1. Interpretar la instruccion
2. Decidir que herramientas MCP usar
3. Ejecutarlas en el orden correcto
4. Devolver el resultado estructurado en JSON

HERRAMIENTAS DISPONIBLES:
- holded_search_lead: Buscar leads por nombre o contacto
- holded_search_contact: Buscar contactos por nombre, email o NIF
- holded_create_lead: Crear lead nuevo (requiere name; funnelId opcional, obtener de holded_list_funnels si no se proporciona)
- holded_list_funnels: Listar pipelines/funnels con stages (SIEMPRE llamar primero si necesitas funnelId)
- holded_create_lead_note: Anadir nota a un lead (requiere leadId, title; desc opcional)
- holded_update_lead: Actualizar lead (stageId, value, status, name)
- create_contact: Crear contacto nuevo en Holded
- update_contact: Actualizar contact
```

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)

## Skills vinculadas

_(sin skills vinculadas)_
