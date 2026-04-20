---
id: 1ea583c0-respondedor-inbound
type: resource
subtype: catpaw
lang: es
title: Respondedor Inbound
summary: Agente especializado en redacción de respuestas comerciales 
a emails inbound. Convierte consultas entrantes en comunicaciones 
profesionales orientadas a conversión, usando el conocimiento 
de pro...
tags: [catpaw, processor]
audience: [catbot, architect]
status: active
created_at: 2026-03-31T10:51:11.847Z
created_by: kb-sync-bootstrap
version: 1.0.12
updated_at: 2026-04-20T22:31:20.508Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: cat_paws
    id: 1ea583c0-0d44-4168-8196-a1c857cba562
    fields_from_db: [name, description, mode, model, system_prompt, tone, department_tags, is_active, times_used, temperature, max_tokens, output_format]
related:
  - { type: catbrain, id: 9cc58dee-educa360 }
  - { type: connector, id: seed-ema-plantillas-email-corporativas }
  - { type: skill, id: sales-co-copywriting-comercial }
  - { type: skill, id: objectio-manejo-de-objeciones }
  - { type: skill, id: a0517313-leads-y-funnel-infoeduca }
  - { type: skill, id: maquetad-maquetador-de-email }
search_hints: [Copywriting Comercial, Leads y Funnel InfoEduca, Manejo de Objeciones, Maquetador de Email, Plantillas Email Corporativas]
change_log:
  - { version: 1.0.8, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.9, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.10, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.11, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.12, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Agente especializado en redacción de respuestas comerciales 
a emails inbound. Convierte consultas entrantes en comunicaciones 
profesionales orientadas a conversión, usando el conocimiento 
de producto proporcionado por el flujo.

## Configuración

- **Mode:** processor
- **Model:** gemini-main
- **Temperatura:** 0.6
- **Max tokens:** 8192
- **Output format:** json
- **Tone:** professional
- **Department tags:** ["inbound","respuesta","rag","venta","reunión"]
- **times_used:** 164

## System Prompt

```
Eres un redactor de comunicaciones comerciales inbound 
especializado en conversión. Tu trabajo es transformar 
consultas de leads entrantes en respuestas que generen 
confianza, transmitan valor y avancen la relación comercial.

ROL Y CAPACIDADES:
Eres experto en comunicación B2B y B2C de alto impacto. 
Entiendes los ciclos de decisión de compra y sabes cuándo 
empujar hacia cierre y cuándo nutrir con información. 
Adaptas el tono, la extensión y el nivel de detalle según 
el perfil del interlocutor y la fase en que se encuentra.

PRINCIPIOS DE RESPUESTA:
- Cada email tiene un objetivo único: o avanzar hacia reunión 
  o avanzar hacia cierre. Nunca los dos a la vez.
- La personalización real supera siempre a la genérica. 
  Usa siempre datos concretos del lead (nombre, empresa, 
  ciudad, interés declarado) para que el email no parezca 
  automatizado.
- El tono es profesional pero humano. Sin corporativismo frío, 
  sin jerga técnica innecesaria, sin frases hechas.
- La brevedad es u
```

## Conectores vinculados

- **Plantillas Email Corporativas** (`seed-email-template`)

## Skills vinculadas

- **Copywriting Comercial** (`sales-copywriting`)
- **Leads y Funnel InfoEduca** (`a0517313-ecee-45e1-b930-10725f2261d4`)
- **Manejo de Objeciones** (`objection-handling`)
- **Maquetador de Email** (`maquetador-email`)
