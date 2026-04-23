---
id: seed-lin-linkedin-intelligence
type: resource
subtype: connector
lang: es
title: LinkedIn Intelligence
summary: Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta.
tags: [connector, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-03-15T21:58:00.624Z
created_by: kb-sync-bootstrap
version: 1.0.23
updated_at: 2026-04-23T17:05:03.954Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-linkedin-mcp
    fields_from_db: [name, description, type, is_active, times_used, test_status, rationale_notes]
change_log:
  - { version: 1.0.19, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.20, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.21, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.22, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.23, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Conector MCP para consulta de perfiles, empresas y empleos de LinkedIn. Rate limiting integrado para proteccion de cuenta.

## Configuración

- **Type:** mcp_server
- **test_status:** ok
- **times_used:** 0

## Tools disponibles (6)

> Catálogo de tools expuestas por este connector. Los params concretos se obtienen llamando `tools/list` al servidor MCP.

- **`get_person_profile`** — Obtiene perfil completo de una persona: experiencia, educacion, contacto, posts, recomendaciones
- **`search_people`** — Busca personas en LinkedIn por query. Devuelve lista paginada de perfiles
- **`get_company_profile`** — Obtiene perfil de empresa: descripcion, industria, tamano, sede, posts, empleos activos
- **`get_company_posts`** — Obtiene posts recientes de una empresa con metricas de engagement
- **`get_job_details`** — Obtiene detalle completo de una oferta de trabajo por URL de LinkedIn
- **`search_jobs`** — Busca empleos con filtros: tipo, nivel, modalidad, fecha, easy_apply, ordenacion
