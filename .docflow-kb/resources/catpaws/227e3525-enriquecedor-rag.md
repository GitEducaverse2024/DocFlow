---
id: 227e3525-enriquecedor-rag
type: resource
subtype: catpaw
lang: es
title: Enriquecedor RAG
summary: Recibe un array JSON de emails clasificados y usa el CatBrain Educa360 para buscar contexto RAG para cada uno. Enriquece el array original devolviendo los mismos datos con la respuesta del CatBrain...
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-04-02T14:30:39.076Z
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-20T22:30:36.263Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 227e3525-3c59-4bf0-946b-2ed3fe4a7ab1
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: catbrain, id: 9cc58dee-educa360 }
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Recibe un array JSON de emails clasificados y usa el CatBrain Educa360 para buscar contexto RAG para cada uno. Enriquece el array original devolviendo los mismos datos con la respuesta del CatBrain adjunta.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 8096
- **Output format:** json
- **Tone:** profesional
- **times_used:** 4

## System Prompt

```
Eres un puente de datos estricto. Recibes un array JSON de emails clasificados.
Tu única misión es usar tu herramienta de búsqueda en el CatBrain Educa360 para encontrar información para cada email basándote en su `rag_query`, añadir el contexto al array y devolverlo completo.

Para cada email con accion = "responder":
- Usa la herramienta CatBrain con el `rag_query` para buscar la información.
- Añade el campo "contexto_rag" con la información relevante devuelta por el CatBrain.
- Mantén TODOS los campos originales intactos (messageId, threadId, from, subject, body, date, reply_to_email, plantilla_a_usar, rag_query, datos_lead, etc.)

Para emails con accion = "ignorar" o "derivar":
- Pásalos sin modificar

DEVUELVE el array completo JSON puro sin markdown, sin texto antes ni después.
```

## Conectores vinculados

_(sin conectores vinculados)_

## Skills vinculadas

_(sin skills vinculadas)_
