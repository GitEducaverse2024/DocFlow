---
id: a3c5df1e-analista-de-facturas
type: resource
subtype: catpaw
lang: es
title: Analista de Facturas
summary: catpaw sin descripción
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-11 17:07:34
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-20T22:30:36.263Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: a3c5df1e-12a0-4b7c-8281-901f2ce55c05
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
change_log:
  - { version: 1.0.0, date: 2026-04-11, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

_(sin descripción)_

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
ROL: Analista financiero de datos.
MISION: Extraer cuantías y categorizar el tipo de cliente de cada factura recibida.
PROCESO: Lee el JSON de la factura, identifica el total y el cliente, y añade los campos 'cuantia' y 'tipo_cliente' preservando el resto.
OUTPUT: JSON con la factura enriquecida.
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
