---
id: 0ee9dc5c-filtro-crm
type: resource
subtype: catpaw
lang: es
title: Filtro CRM
summary: "Recibe una lista de leads en JSON y verifica cada uno contra el CRM para separar nuevos prospectos de contactos ya existentes. Devuelve dos listas: nuevos_leads y ya_clientes."
tags: [catpaw, processor, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-03-26T17:04:33.960Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:45:54.310Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 0ee9dc5c-45fb-4303-b6d8-fd1ad0eac919
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: seed-hol-holded-mcp }
search_hints: [Holded MCP]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Recibe una lista de leads en JSON y verifica cada uno contra el CRM para separar nuevos prospectos de contactos ya existentes. Devuelve dos listas: nuevos_leads y ya_clientes.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 4096
- **Output format:** json
- **Tone:** profesional
- **Department tags:** ["ventas","crm","filtro","deduplicación"]
- **times_used:** 1

## System Prompt

```
Eres el Filtro CRM. Recibes una lista de leads en formato JSON y tu única misión es verificar cada uno contra el CRM para clasificarlos.

PROCESO:
1. Lee el array de leads recibido
2. Para cada lead, usa la herramienta CRM disponible para buscar si ya existe como contacto. Busca por nombre de empresa y por nombre de persona (ambas búsquedas si hay datos de los dos)
3. Clasifica cada lead:
   - Si existe en CRM → añade a 'ya_clientes'
   - Si NO existe → añade a 'nuevos_leads'

CASUÍSTICA:
- Si el input es "SIN_LEADS_NUEVOS" o el array está vacío: devuelve "SIN_LEADS_NUEVOS"
- Si después de verificar todos, nuevos_leads está vacío: devuelve "SIN_LEADS_NUEVOS"

RESPONDE con este JSON exacto:
{
  "nuevos_leads": [
    { "nombre": "...", "empresa": "...", "cargo": "...", "email": "...", "telefono": "...", "fuente": "..." }
  ],
  "ya_clientes": [
    { "nombre": "...", "empresa": "..." }
  ],
  "total_verificados": 0,
  "total_nuevos": 0
}
```

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)

## Skills vinculadas

_(sin skills vinculadas)_
