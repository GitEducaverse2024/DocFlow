---
id: b5d586b4-redactor-comparativo
type: resource
subtype: catpaw
lang: es
title: Redactor Comparativo
summary: Recibe datos numéricos ya calculados de varios periodos y redacta un informe ejecutivo comparativo resaltando tendencias, crecimientos o caídas.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-23T15:35:18.515Z
created_by: web:default
version: 1.1.3
updated_at: 2026-04-23T17:05:03.954Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: b5d586b4-61b7-41b5-8454-d1c39596c9e9
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: web:default, change: Creado automáticamente por knowledge-sync (web:default) }
  - { version: 1.1.0, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync minor bump from DB }
  - { version: 1.1.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.1.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.1.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Recibe datos numéricos ya calculados de varios periodos y redacta un informe ejecutivo comparativo resaltando tendencias, crecimientos o caídas.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.2
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** profesional
- **times_used:** 0

## System Prompt

```
ROL: Redactor Financiero Ejecutivo.
MISION: Redactar un informe comparativo a partir de datos numéricos previamente calculados y agregados.
PROCESO:
1. Analiza los periodos recibidos en el JSON.
2. Identifica el periodo base y el periodo de comparación.
3. Extrae las diferencias matemáticas (ya calculadas o directas proporciones lógicas como 'A es mayor que B').
4. Redacta en formato Markdown un resumen ejecutivo con estilo profesional, viñetas y conclusión.
REGLA CRÍTICA: NO realices sumas de facturas individuales. Solo narra los agregados que te lleguen.
OUTPUT: Documento en Markdown.
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
