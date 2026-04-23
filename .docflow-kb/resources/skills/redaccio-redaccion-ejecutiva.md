---
id: redaccio-redaccion-ejecutiva
type: resource
subtype: skill
lang: es
title: Redacción ejecutiva
summary: Transforma documentación técnica en comunicación ejecutiva clara para stakeholders no técnicos.
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-10T19:53:02.987Z
created_by: kb-sync-bootstrap
version: 1.0.21
updated_at: 2026-04-23T17:50:04.133Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: redaccion-ejecutiva
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.17, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.18, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.19, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.20, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.21, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Transforma documentación técnica en comunicación ejecutiva clara para stakeholders no técnicos.

## Configuración

- **Category:** writing
- **Source:** built-in
- **Version:** 1.0
- **Author:** DocFlow
- **times_used:** 1

## Instrucciones

Transforma la documentación técnica proporcionada en un documento de comunicación ejecutiva. El público objetivo son stakeholders NO técnicos (CEO, inversores, clientes).

REGLAS DE REDACCIÓN:
- Eliminar toda jerga técnica o explicarla en lenguaje simple
- Usar analogías del mundo real para conceptos complejos
- Frases cortas (máx. 20 palabras)
- Párrafos cortos (máx. 4 líneas)
- Usar negrita para conceptos clave
- Incluir números y métricas cuando sea posible
- Tono: profesional, confiado, orientado a resultados

ESTRUCTURA:
1. **TL;DR** (3 líneas máximo): Lo esencial
2. **Contexto**: Por qué importa (1-2 párrafos)
3. **Estado actual**: Qué tenemos hoy
4. **Próximos pasos**: Qué viene y cuándo
5. **Lo que necesitamos**: Decisiones o recursos pendientes
