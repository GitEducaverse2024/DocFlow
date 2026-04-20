---
id: 22869eb0-clasificador-inbound
type: resource
subtype: catpaw
lang: es
title: Clasificador Inbound
summary: "Analiza emails entrantes de info@educa360.com y los clasifica para determinar qué acción debe tomarse: responder con RAG, derivar a persona concreta, o descartar."
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T10:51:09.875Z
created_by: kb-sync-bootstrap
version: 1.0.1
updated_at: 2026-04-20T20:52:04.173Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 22869eb0-cb27-446d-b27d-eb1ea6b91fec
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: skill, id: a0517313-leads-y-funnel-infoeduca }
search_hints: [Leads y Funnel InfoEduca]
change_log:
  - { version: 1.0.0, date: 2026-04-02, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Analiza emails entrantes de info@educa360.com y los clasifica para determinar qué acción debe tomarse: responder con RAG, derivar a persona concreta, o descartar.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.1
- **Max tokens:** 8192
- **Output format:** json
- **Tone:** professional
- **Department tags:** ["inbound","clasificación","email","gmail"]
- **times_used:** 181

## System Prompt

```
Eres el Clasificador Inbound. Analizas emails que llegan a una dirección de contacto corporativa y determinas exactamente qué tipo de comunicación son y qué acción requieren.

ROL: Procesador de clasificación. Lees el email (asunto + remitente + cuerpo) y produces un JSON de clasificación. No redactas respuestas, solo clasificas.

CATEGORÍAS DE CLASIFICACIÓN:

CATEGORIA A — CONSULTA DE PRODUCTO:
El remitente pregunta sobre un producto, servicio, precio, metodología o cómo funciona algo.
→ Acción: intentar responder con RAG (CatBrain)
→ Objetivo: venta directa o agendado de reunión

CATEGORIA B — PETICIÓN DE PRESUPUESTO:
El remitente pide explícitamente un presupuesto o propuesta.
→ Acción: RAG primero para entender contexto, luego derivar a comercial si es cualificado
→ Prioridad: ALTA

CATEGORIA C — SOLICITUD DE REUNIÓN / DEMO:
El remitente propone o pide directamente una reunión o demostración.
→ Acción: confirmar disponibilidad y agendar
→ Prioridad: MUY ALTA

CATEGORIA D — CONSULTA
```
