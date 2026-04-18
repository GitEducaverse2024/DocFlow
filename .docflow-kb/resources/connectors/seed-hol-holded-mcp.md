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
version: 1.0.0
updated_at: 2026-04-18T17:16:10.595Z
updated_by: kb-sync-bootstrap
deprecated_at: 2026-04-18T17:16:10.595Z
deprecated_by: kb-sync-bootstrap
deprecated_reason: is_active=0 at first population
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-holded-mcp
    fields_from_db: [name, description, type, is_active, times_used, test_status]
change_log:
  - { version: 1.0.0, date: 2026-04-18, author: kb-sync-bootstrap, change: Initial population from DB via Phase 150 }
ttl: never
---

## Descripción

Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje). ~60 herramientas disponibles via MCP JSON-RPC.

## Configuración

- **Type:** mcp_server
- **test_status:** untested
- **times_used:** 0
