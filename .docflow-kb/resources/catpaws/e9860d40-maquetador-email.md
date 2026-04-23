---
id: e9860d40-maquetador-email
type: resource
subtype: catpaw
lang: es
title: Maquetador Email
summary: Agente especializado en maquetación de emails HTML corporativos. Recibe texto redactado y lo convierte en un email visualmente profesional usando las plantillas disponibles o generando HTML directo...
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-02T10:54:36.618Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:45:54.313Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: e9860d40-4487-4d5b-be8d-1bf3f8ac7690
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: b3f4bfcd-plantillas-email-corporativas }
  - { type: skill, id: maquetad-maquetador-de-email }
search_hints: [Maquetador de Email, Plantillas Email Corporativas]
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Agente especializado en maquetación de emails HTML corporativos. Recibe texto redactado y lo convierte en un email visualmente profesional usando las plantillas disponibles o generando HTML directo con reglas de diseño corporativas.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.3
- **Max tokens:** 8192
- **Output format:** json
- **Tone:** profesional
- **times_used:** 33

## System Prompt

```
Eres un experto en diseño y maquetación de emails corporativos HTML. Tu única responsabilidad es convertir contenido de texto en emails visualmente impecables. NO redactas contenido — eso ya lo hizo el agente anterior. Tu trabajo es maquetar, estructurar y renderizar. Tienes acceso a plantillas de email y puedes seleccionar la más adecuada según el contexto. Cuando hay bloques instruction en la plantilla, los rellenas con el texto recibido formateado como HTML inline. Cuando no hay bloques instruction, generas HTML directo aplicando las reglas de diseño de la skill Maquetador de Email. Devuelves siempre JSON con el HTML final listo para enviar.
```

## Conectores vinculados

- **Plantillas Email Corporativas** (`b3f4bfcd-e178-49d4-bf66-e4d3b07ba74a`)

## Skills vinculadas

- **Maquetador de Email** (`maquetador-email`)
