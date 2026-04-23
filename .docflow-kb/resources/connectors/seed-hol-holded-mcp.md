---
id: seed-hol-holded-mcp
type: resource
subtype: connector
lang: es
title: Holded MCP
summary: "Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje)...."
tags: [connector, mcp]
audience: [catbot, architect]
status: deprecated
created_at: 2026-03-23T09:45:46.021Z
created_by: kb-sync-bootstrap
version: 4.0.0
updated_at: 2026-04-23T15:45:46.073Z
updated_by: kb-sync-bootstrap
deprecated_at: 2026-04-23T15:44:29.766Z
deprecated_by: kb-sync-bootstrap
deprecated_reason: is_active=0 at first population
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-holded-mcp
    fields_from_db: [name, description, type, is_active, times_used, test_status, rationale_notes]
change_log:
  - { version: 3.0.0, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync major bump from DB }
  - { version: 3.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 3.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 3.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 4.0.0, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync major bump from DB }
ttl: never
---

## Descripción

Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje). ~60 herramientas disponibles via MCP JSON-RPC.

## Configuración

- **Type:** mcp_server
- **test_status:** untested
- **times_used:** 0
