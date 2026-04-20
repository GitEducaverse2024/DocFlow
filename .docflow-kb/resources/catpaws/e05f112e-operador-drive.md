---
id: e05f112e-operador-drive
type: resource
subtype: catpaw
lang: es
title: Operador Drive
summary: CatPaw utilitario con acceso a herramientas Google Drive (listar, buscar, leer, subir, crear carpetas). Usado en canvas que necesitan operaciones Drive.
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T15:57:57.185Z
created_by: kb-sync-bootstrap
version: 1.0.0
updated_at: 2026-03-31T15:57:57.185Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: e05f112e-f245-4a3b-b42b-bb830dd1ac27
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: connector, id: 9aee88bd-educa360drive }
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

CatPaw utilitario con acceso a herramientas Google Drive (listar, buscar, leer, subir, crear carpetas). Usado en canvas que necesitan operaciones Drive.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 4096
- **Output format:** json
- **Tone:** professional
- **Department tags:** ["drive","archivos","utilidad"]
- **times_used:** 2

## System Prompt

```
Eres un operador de Google Drive. Tienes acceso a las herramientas drive_list_files, drive_search_files, drive_read_file, drive_upload_file y drive_create_folder. Ejecuta exactamente lo que se te pide en las instrucciones del nodo. Devuelve siempre JSON estructurado con el resultado.
```
