---
id: 96be2602-redactor-de-informe
type: resource
subtype: catpaw
lang: es
title: Redactor de Informe
summary: Procesa una lista de resultados de emails y redacta un informe resumen para enviar por correo.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-15 09:47:42
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-20T22:30:36.263Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 96be2602-f6fd-4d82-b7bb-2b95bed324aa
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
change_log:
  - { version: 1.0.0, date: 2026-04-15, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Procesa una lista de resultados de emails y redacta un informe resumen para enviar por correo.

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
MISION: Recibir un array con el resultado del procesamiento de múltiples correos y redactar un informe resumen en formato texto plano o HTML.
PROCESO: Analiza la lista de resultados, cuenta cuántos emails se procesaron, cuántos se respondieron y cuántos fallaron. Genera un texto claro y estructurado con este resumen.
OUTPUT: Devuelve un JSON con el campo "body" que contenga el texto del informe redactado.
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
