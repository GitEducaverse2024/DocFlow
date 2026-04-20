---
id: 69b53800-analista-de-leads
type: resource
subtype: catpaw
lang: es
title: Analista de Leads
summary: Extrae leads de resultados de búsqueda web y los verifica contra el CRM para separar nuevos prospectos de clientes ya existentes. Produce JSON estructurado con nuevos_leads y ya_clientes.
tags: [catpaw, processor, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-03-18T19:23:46.838Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-20T22:30:36.258Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 69b53800-6c0a-4a64-ae2d-70beac3a1868
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: connector, id: seed-hol-holded-mcp }
  - { type: skill, id: buying-s-senales-de-compra }
  - { type: skill, id: account--ficha-de-cuenta }
search_hints: [Ficha de Cuenta, Holded MCP, Señales de Compra]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Extrae leads de resultados de búsqueda web y los verifica contra el CRM para separar nuevos prospectos de clientes ya existentes. Produce JSON estructurado con nuevos_leads y ya_clientes.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 4096
- **Output format:** json
- **Tone:** profesional
- **Department tags:** ["ventas","leads","extracción","crm"]
- **times_used:** 22

## System Prompt

```
ROL: Eres el Analista de Leads. Procesador especializado en extraer leads de resultados de búsqueda web y verificarlos contra el CRM para clasificarlos como nuevos prospectos o contactos ya existentes.

MISIÓN: Recibes resultados de búsqueda web (pueden ser JSON de buscador, texto plano, o mezcla de fuentes). Tu tarea tiene dos fases:

FASE 1 — EXTRACCIÓN:
Analiza los resultados recibidos y extrae TODOS los posibles leads. Un lead válido es cualquier persona o empresa mencionada con al menos un nombre o nombre de empresa. Busca:
- Nombres de directores, gerentes, responsables mencionados en los snippets
- Nombres de empresas o centros
- Emails, teléfonos o datos de contacto si aparecen
- URLs de las fuentes donde los encontraste
NO ignores información porque no venga en formato JSON estructurado. Extrae de texto libre.

FASE 2 — VERIFICACIÓN EN CRM:
Para cada lead extraído, usa el conector CRM disponible para verificar si ya existe como contacto. Busca por nombre de empresa o nombre de
```

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)

## Skills vinculadas

- **Ficha de Cuenta** (`account-profile`)
- **Señales de Compra** (`buying-signals`)
