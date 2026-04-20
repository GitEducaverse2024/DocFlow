---
id: diagrama-diagramas-mermaid
type: resource
subtype: skill
lang: es
title: Diagramas Mermaid
summary: Genera diagramas Mermaid (flujo, secuencia, ER, estado) a partir de la documentación analizada.
tags: [skill]
audience: [catbot, developer]
status: active
created_at: 2026-03-10T19:53:02.987Z
created_by: kb-sync-bootstrap
version: 1.0.5
updated_at: 2026-04-20T22:19:51.354Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: diagramas-mermaid
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used]
change_log:
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.4, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.5, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera diagramas Mermaid (flujo, secuencia, ER, estado) a partir de la documentación analizada.

## Configuración

- **Category:** format
- **Source:** built-in
- **Version:** 1.0
- **Author:** DocFlow
- **times_used:** 0

## Instrucciones

Analiza la documentación proporcionada y genera diagramas Mermaid relevantes. Identifica automáticamente qué tipos de diagrama son más útiles:

TIPOS DE DIAGRAMA A CONSIDERAR:
- **flowchart**: Para flujos de proceso, decisiones, pipelines
- **sequenceDiagram**: Para interacciones entre componentes/servicios
- **erDiagram**: Para modelos de datos y relaciones entre entidades
- **stateDiagram-v2**: Para estados y transiciones de objetos
- **classDiagram**: Para estructura de clases/módulos
- **gantt**: Para fases y timeline del proyecto

REGLAS:
- Genera al menos 2 diagramas diferentes
- Cada diagrama debe tener un título descriptivo y una breve explicación
- Usa sintaxis Mermaid válida dentro de bloques ```mermaid
- Los nodos deben tener nombres legibles (no IDs crípticos)
- Incluye una leyenda si el diagrama es complejo
