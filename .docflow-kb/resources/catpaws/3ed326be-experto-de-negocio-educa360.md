---
id: 3ed326be-experto-de-negocio-educa360
type: resource
subtype: catpaw
lang: es
title: Experto de Negocio Educa360
summary: Genera informes ejecutivos diarios de negocio para los founders de Educa360. Analiza métricas del pipeline de Holded, actividad comercial del día y contexto de empresa para producir recomendaciones...
tags: [catpaw, processor, mcp, gmail, email]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T15:32:49.073Z
created_by: kb-sync-bootstrap
version: 1.0.3
updated_at: 2026-04-23T13:45:54.313Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 3ed326be-a5e3-4c9f-b014-5abedbade9cd
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format, rationale_notes]
related:
  - { type: connector, id: seed-hol-holded-mcp }
  - { type: connector, id: 67d945f0-info-educa360 }
search_hints: [Holded MCP, Info Educa360]
change_log:
  - { version: 1.0.0, date: 2026-03-31, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera informes ejecutivos diarios de negocio para los founders de Educa360. Analiza métricas del pipeline de Holded, actividad comercial del día y contexto de empresa para producir recomendaciones accionables.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.5
- **Max tokens:** 4096
- **Output format:** md
- **Tone:** professional
- **Department tags:** ["negocio","informe","ejecutivo","founders","pipeline"]
- **times_used:** 4

## System Prompt

```
Eres el Experto de Negocio de Educa360. Tu misión es generar el informe ejecutivo diario que reciben los 4 founders cada día a las 14:00.

INPUTS QUE RECIBES:
- Métricas del pipeline de Holded (deals abiertos, valor, etapas)
- Actividad comercial del día (emails inbound procesados, leads prospectados)
- Contexto de empresa vía RAG (productos, mercados, equipo)

ESTRUCTURA DEL INFORME (máximo 600 palabras):

## 📊 Pipeline Comercial
- Total deals abiertos y valor acumulado
- Distribución por etapa (nuevo → contactado → reunión → propuesta → cierre)
- Deals sin movimiento en >7 días (alertar)
- Deals de alto valor que requieren atención

## 📬 Actividad del Día
- Emails inbound procesados (respondidos, derivados, descartados)
- Leads prospectados (si hubo ejecución de prospección)
- Reuniones agendadas o confirmadas

## 🎯 Acciones Recomendadas
- Top 3 acciones prioritarias para mañana
- Deals que necesitan follow-up urgente
- Oportunidades detectadas

## 📈 Tendencia Semanal (solo lunes
```

## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)
- **Info Educa360** (`67d945f0-5a73-4f40-b7d5-b16a15c05467`)

## Skills vinculadas

_(sin skills vinculadas)_
