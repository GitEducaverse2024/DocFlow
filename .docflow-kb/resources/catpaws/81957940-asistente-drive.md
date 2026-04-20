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
version: 1.0.0
updated_at: 2026-03-30T09:23:38.351Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 81957940-b731-4e5a-b01a-750f8e199a59
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
change_log:
  - { version: 1.0.0, date: 2026-03-30, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
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
