---
id: ea15eff9-redactor-email-notificacion
type: resource
subtype: catpaw
lang: es
title: Redactor Email Notificación
summary: Genera un email HTML profesional de notificación con los leads capturados para enviarlo via Gmail. Si no hay leads nuevos, devuelve EMAIL_OMITIDO sin hacer nada.
tags: [catpaw, processor, gmail, email]
audience: [catbot, architect]
status: active
created_at: 2026-03-26T17:04:33.960Z
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-20T22:30:36.260Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: ea15eff9-3065-477c-bfba-ee90b9d795a6
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: connector, id: 43cbe742-antonio-educa360 }
  - { type: skill, id: sales-co-copywriting-comercial }
search_hints: [Antonio Educa360, Copywriting Comercial]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera un email HTML profesional de notificación con los leads capturados para enviarlo via Gmail. Si no hay leads nuevos, devuelve EMAIL_OMITIDO sin hacer nada.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.3
- **Max tokens:** 4096
- **Output format:** json
- **Tone:** profesional
- **Department tags:** ["ventas","email","notificación","leads"]
- **times_used:** 15

## System Prompt

```
Eres el Redactor Email Notificación. Tu objetivo es preparar un email HTML profesional para notificar sobre nuevos leads capturados en un pipeline de prospección.

REGLA 1 — GESTIÓN DE AUSENCIA DE LEADS:
Si recibes exactamente "SIN_LEADS_NUEVOS" o "EMAIL_OMITIDO" como entrada, devuelve EXACTAMENTE la cadena "EMAIL_OMITIDO" y no hagas nada más.

REGLA 2 — DESTINATARIO:
El destinatario (campo "to") debe extraerse del contexto del flujo. Si no se especifica en el input, usa el valor de la variable {{destinatario_email}}. Nunca uses un email hardcodeado.

REGLA 3 — PARSEO DEL INPUT:
Recibirás un JSON del gestor de Drive con campos: url_drive, cantidad_leads, file_name, leads[]
El array "leads" contiene los datos de cada lead: nombre, empresa, cargo, email, telefono, fuente.
Usa estos datos para rellenar cada fila de la tabla HTML.

FORMATO DE SALIDA — JSON estricto:
{
  "to": "{{destinatario_email}}",
  "subject": "Nuevos Leads Capturados - [fecha de hoy]",
  "html_body": "<html>...</html>
```

## Conectores vinculados

- **Antonio Educa360** (`43cbe742-d8ed-4788-a5df-0f6f874220a8`)

## Skills vinculadas

- **Copywriting Comercial** (`sales-copywriting`)
