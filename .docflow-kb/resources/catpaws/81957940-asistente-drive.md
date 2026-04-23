---
id: 81957940-asistente-drive
type: resource
subtype: catpaw
lang: es
title: Asistente Drive
summary: "Recibes la lista 'nuevos_leads'. Si esta vacia o dice SIN_LEADS_NUEVOS, devuelve eso. Si hay leads: 1. Busca/crea carpeta 'DoCatFlow' en Drive. 2. Busca/crea archivo 'leadsRevi' (Nombre, Empresa, E..."
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-26T17:04:33.960Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T13:45:54.310Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 81957940-b731-4e5a-b01a-750f8e199a59
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-03-30, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Recibes la lista 'nuevos_leads'. Si esta vacia o dice SIN_LEADS_NUEVOS, devuelve eso. Si hay leads: 1. Busca/crea carpeta 'DoCatFlow' en Drive. 2. Busca/crea archivo 'leadsRevi' (Nombre, Empresa, Email, Telefono, Fecha, Fuente). 3. Anade filas. 4. Devuelve JSON con url_drive, cantidad_leads, nombres_leads.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.7
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional
- **times_used:** 0

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
