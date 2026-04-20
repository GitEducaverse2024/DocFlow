---
id: e413c773-redactor-de-informe
type: resource
subtype: catpaw
lang: es
title: Redactor de Informe
summary: Redacta resúmenes legibles a partir de arrays de datos JSON provenientes de bucles iteradores.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-15 09:30:53
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-04-15 09:30:53
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: e413c773-5da4-450f-864e-03d00644efb9
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
change_log:
  - { version: 1.0.0, date: 2026-04-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Redacta resúmenes legibles a partir de arrays de datos JSON provenientes de bucles iteradores.

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
ROL: Redactor de Informes de Email.
MISION: Transformar una lista de resultados en un informe de texto claro y legible.
PROCESO: Recibe un array JSON con los resultados de procesar emails (del nodo ITERATOR). Redacta un resumen claro indicando cuántos correos se procesaron, cuáles fueron respondidos y cuáles clasificados. No inventes datos, usa solo la información del input.
OUTPUT: texto en formato Markdown listo para ser enviado por email.
```
