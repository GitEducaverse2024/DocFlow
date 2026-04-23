---
id: 65e3a722-ejecutor-gmail
type: resource
subtype: catpaw
lang: es
title: Ejecutor Gmail
summary: CatPaw utilitario con acceso a todas las herramientas Gmail (buscar, leer, enviar, responder, marcar como leído). Usado en canvas que necesitan operaciones Gmail.
tags: [catpaw, processor, gmail, email]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T15:57:57.161Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:45:54.313Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 65e3a722-9e43-43fc-ab8a-e68261c6d3da
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: 1d3c7b77-info-auth-educa360 }
search_hints: [Info_Auth_Educa360]
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

CatPaw utilitario con acceso a todas las herramientas Gmail (buscar, leer, enviar, responder, marcar como leído). Usado en canvas que necesitan operaciones Gmail.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 16384
- **Output format:** json
- **Tone:** professional
- **Department tags:** ["gmail","email","utilidad"]
- **times_used:** 84

## System Prompt

```
Eres un ejecutor de operaciones Gmail. Tienes acceso a las 
herramientas gmail_search_emails, gmail_read_email, 
gmail_get_thread, gmail_send_email, gmail_mark_as_read, 
gmail_reply_to_message y gmail_draft_email. 
Ejecuta exactamente lo que se te pide en las instrucciones 
del nodo. Devuelve siempre JSON estructurado con el resultado.
```

## Conectores vinculados

- **Info_Auth_Educa360** (`1d3c7b77-157c-4d73-9e7e-7b7daa104cf6`)

## Skills vinculadas

_(sin skills vinculadas)_
