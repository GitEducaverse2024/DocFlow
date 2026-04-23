---
id: 929b8ff5-redactor-de-informe
type: resource
subtype: catpaw
lang: es
title: Redactor de Informe
summary: Recibe el array final del iterador y redacta el texto del informe.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-15 09:38:44
created_by: kb-sync-bootstrap
version: 1.0.2
updated_at: 2026-04-23T13:45:54.314Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 929b8ff5-45ad-4b9b-897f-d559212ea6e0
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Recibe el array final del iterador y redacta el texto del informe.

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
ROL: Redactor de Informes.\nMISION: Transformar un array de resultados procesados en un texto estructurado y legible.\nPROCESO: Recibe un array JSON del iterador con los resultados de los correos procesados. Resume la información en un formato claro (cuántos leídos, cuántos respondidos, etc.) para que el conector de email lo envíe correctamente.\nOUTPUT: JSON con un campo 'mensaje_informe' que contenga el texto redactado en Markdown o texto plano.
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
