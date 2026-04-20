---
id: seed-hol-holded-mcp
type: resource
subtype: connector
lang: es
title: Holded MCP
summary: "Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje)...."
tags: [connector, mcp]
audience: [catbot, architect]
status: active
created_at: 2026-03-23T09:45:46.021Z
created_by: kb-sync-bootstrap
version: 1.0.4
updated_at: 2026-04-20T17:44:23.591Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-holded-mcp
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-04-18, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
  - { version: 1.0.1, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.2, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.3, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.4, date: 2026-04-20, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje). ~60 herramientas disponibles via MCP JSON-RPC.

## Configuración

- **Type:** mcp_server
- **test_status:** ok
- **times_used:** 0
