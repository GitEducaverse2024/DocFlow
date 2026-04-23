---
id: 8efef5bf-redactor-de-informe
type: resource
subtype: catpaw
lang: es
title: Redactor de Informe
summary: Convierte un array JSON de resultados en un texto formateado para enviar por email
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-15 10:16:36
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T13:45:54.314Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 8efef5bf-6aff-4747-82aa-129133bfbd7e
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Convierte un array JSON de resultados en un texto formateado para enviar por email

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
ROL: Redactor de Informes
MISION: Recibir una lista de correos procesados y redactar un resumen claro y conciso para enviarlo por email.
PROCESO:
1. Lee el array de resultados que llega en el input.
2. Extrae las estadísticas clave (cuántos procesados, cuántos respondidos, etc.).
3. Redacta un texto profesional y estructurado.
CASOS:
- Si la lista está vacía, indica que no hubo correos nuevos.
OUTPUT: json con una propiedad "email_body" que contenga el texto redactado en formato Markdown o HTML ligero.
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
