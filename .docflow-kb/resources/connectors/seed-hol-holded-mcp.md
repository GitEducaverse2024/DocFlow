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
version: 7.0.5
updated_at: 2026-04-23T18:34:49.385Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: connectors
    id: seed-holded-mcp
    fields_from_db: [name, description, type, is_active, times_used, test_status, rationale_notes]
change_log:
  - { version: 7.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 7.0.2, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 7.0.3, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 7.0.4, date: 2026-04-23, author: api:connectors.PATCH, change: "Auto-sync patch bump (warning: DB overwrote local human edit in fields_from_db)" }
  - { version: 7.0.5, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Conector MCP para Holded ERP. Modulos: Facturacion (contactos, documentos, productos, servicios), CRM (leads, funnels, eventos), Proyectos (tareas, registros horarios), Equipo (empleados, fichaje). ~60 herramientas disponibles via MCP JSON-RPC.

## Configuración

- **Type:** mcp_server
- **test_status:** ok
- **times_used:** 0

## Tools disponibles (60)

> Catálogo de tools expuestas por este connector. Los params concretos se obtienen llamando `tools/list` al servidor MCP.

- **`list_contacts`** — Lista contactos con filtros
- **`get_contact`** — Detalle de contacto por ID
- **`create_contact`** — Crear contacto
- **`update_contact`** — Actualizar contacto
- **`holded_search_contact`** — Busqueda fuzzy de contactos
- **`holded_resolve_contact`** — Resolver nombre a ID de contacto
- **`holded_contact_context`** — Contexto completo del contacto (facturas, leads, eventos)
- **`list_documents`** — Lista facturas, presupuestos, pedidos, etc.
- **`get_document`** — Detalle de documento
- **`create_document`** — Crear factura/presupuesto
- **`update_document`** — Actualizar documento
- **`pay_document`** — Registrar pago
- **`send_document`** — Enviar documento por email
- **`holded_quick_invoice`** — Crear factura rapida (contacto + items)
- **`holded_list_invoices`** — Lista facturas por contacto
- **`holded_invoice_summary`** — Resumen de facturacion por contacto
- **`holded_period_invoice_summary`** — Aggregate global invoice summary for a date range (NOT per-contact): total_amount, invoice_count, unique_contacts, by_month, by_status. Use for period comparisons/dashboards/KPIs. For per-contact use holded_invoice_summary.
- **`list_products`** — Lista productos
- **`get_product`** — Detalle de producto
- **`create_product`** — Crear producto
- **`list_services`** — Lista servicios
- **`list_treasuries`** — Lista cuentas bancarias
- **`list_taxes`** — Lista impuestos (IVA, etc.)
- **`list_payments`** — Lista pagos
- **`list_sales_channels`** — Lista canales de venta
- **`list_contact_groups`** — Lista grupos de contactos
- **`holded_list_funnels`** — Lista pipelines CRM con stages
- **`holded_get_funnel`** — Detalle de funnel
- **`holded_list_leads`** — Lista leads (enriquecidos con funnel/stage)
- **`holded_search_lead`** — Busqueda fuzzy de leads
- **`holded_get_lead`** — Detalle de lead
- **`holded_create_lead`** — Crear lead
- **`holded_update_lead`** — Actualizar lead
- **`holded_create_lead_note`** — Agregar nota a lead
- **`holded_create_lead_task`** — Crear tarea de lead
- **`holded_list_events`** — Lista eventos CRM
- **`holded_create_event`** — Crear evento CRM
- **`holded_list_projects`** — Lista proyectos
- **`holded_get_project`** — Detalle de proyecto
- **`holded_create_project`** — Crear proyecto
- **`holded_update_project`** — Actualizar proyecto
- **`holded_delete_project`** — Eliminar proyecto
- **`holded_get_project_summary`** — Resumen de proyecto
- **`holded_list_project_tasks`** — Lista tareas de proyecto
- **`holded_create_project_task`** — Crear tarea en proyecto
- **`holded_list_time_entries`** — Lista registros horarios de proyecto
- **`holded_list_all_time_entries`** — Registros horarios cross-project
- **`holded_create_time_entry`** — Registrar horas
- **`holded_list_employees`** — Lista empleados
- **`holded_get_employee`** — Detalle de empleado
- **`holded_search_employee`** — Busqueda fuzzy de empleados
- **`holded_set_my_employee_id`** — Configurar mi ID de empleado
- **`holded_get_my_employee_id`** — Obtener mi ID de empleado
- **`holded_list_timesheets`** — Lista fichajes
- **`holded_create_timesheet`** — Crear fichaje retroactivo
- **`holded_clock_in`** — Fichar entrada
- **`holded_clock_out`** — Fichar salida
- **`holded_clock_pause`** — Pausar fichaje
- **`holded_clock_unpause`** — Reanudar fichaje
- **`holded_weekly_timesheet_summary`** — Resumen semanal de horas

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_connector_rationale` via CatBot.

### 2026-04-23 — _v30.7 sesion 38 + v30.9 sesion 40_ (by v30.9-closer)

**Nuevo tool holded_period_invoice_summary anadido al MCP (v30.7) y corregido by_status fallback (v30.9 P4)**

_Por qué:_ Ship v30.7 creo el tool para agregacion global por periodo absoluto (complementa holded_invoice_summary per-contacto). Ship v30.9 P4 detecta si Holded API expose paid field en el list endpoint — si no, emite by_status.available=false para evitar que Redactor LLM alucine morosidad critica.

_Tip:_ El catalogo config.tools[] se persiste desde db.ts:1380 (holdedConfig inline). Si anades tool al MCP, actualiza AMBOS: el MCP server (holded-mcp repo) + el holdedConfig en db.ts — si solo tocas el seed, el catalogo sobrevive rebuild; si solo tocas config via API, el siguiente init container lo sobreescribe.

