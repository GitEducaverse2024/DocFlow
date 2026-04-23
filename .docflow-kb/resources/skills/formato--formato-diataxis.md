---
id: formato--formato-diataxis
type: resource
subtype: skill
lang: es
title: Formato Diátaxis
summary: Reestructura documentación técnica siguiendo el framework Diátaxis (tutoriales, guías, explicación, referencia).
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-10T19:53:02.987Z
created_by: kb-sync-bootstrap
version: 1.0.15
updated_at: 2026-04-23T13:45:59.946Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: formato-diataxis
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.11, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.12, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.13, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.14, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.15, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Reestructura documentación técnica siguiendo el framework Diátaxis (tutoriales, guías, explicación, referencia).

## Configuración

- **Category:** format
- **Source:** built-in
- **Version:** 1.0
- **Author:** DocFlow
- **times_used:** 0

## Instrucciones

Reorganiza toda la documentación siguiendo el framework Diátaxis. Clasifica cada pieza de contenido en una de estas 4 categorías:

1. **Tutoriales** (aprendizaje orientado): Guías paso a paso para principiantes. Deben llevar al usuario de 0 a un resultado concreto.
2. **Guías prácticas** (problema orientado): Recetas para resolver problemas específicos. Asumen conocimiento previo.
3. **Explicación** (comprensión orientada): Contexto, razones y arquitectura. Responde "¿por qué?" y "¿cómo funciona?".
4. **Referencia** (información orientada): API docs, configuración, parámetros. Debe ser precisa, completa y técnica.

REGLAS:
- Cada sección debe estar claramente etiquetada con su tipo Diátaxis
- No mezcles tipos en una misma sección
- Si contenido encaja en múltiples categorías, duplícalo adaptado a cada contexto
- Mantén un índice al inicio con links a cada sección
