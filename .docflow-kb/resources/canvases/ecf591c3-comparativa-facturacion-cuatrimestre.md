---
id: ecf591c3-comparativa-facturacion-cuatrimestre
type: resource
subtype: canvas
lang: es
title: Comparativa facturacion cuatrimestre
summary: Genera un informe comparativo Q1 2025 vs Q1 2026 desde Holded y envia por email a Antonio.
tags: [canvas]
audience: [catbot, architect]
status: active
created_at: 2026-04-23T17:51:55.981Z
created_by: api:canvas.POST
version: 1.0.1
updated_at: 2026-04-23T18:34:49.393Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: canvases
    id: ecf591c3-ab30-4197-9b7b-9182f6032fbd
    fields_from_db: [name, description, mode, status, tags, is_template, rationale_notes]
change_log:
  - { version: 1.0.0, date: 2026-04-23, author: api:canvas.POST, change: Creado automáticamente por knowledge-sync (api:canvas.POST) }
  - { version: 1.0.1, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Genera un informe comparativo Q1 2025 vs Q1 2026 desde Holded y envia por email a Antonio.

## Configuración

- **Mode:** mixed
- **Status (DB):** idle
- **Is template:** no

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_canvas_rationale` via CatBot.

### 2026-04-23 — _v30.9 sesion 40_ (by CatBot + v30.9)

**Canvas Comparativa facturación Q1 2025 vs 2026 construido por CatBot post v30.9 con data_extra correcto sin patch manual**

_Por qué:_ Ship del arco v30.5-v30.9. CatBot descubrió holded_period_invoice_summary via list_connector_tools (v30.8 MCP Discovery), configuró 2 connectors Holded con data_extra={tool_name, tool_args}, fan-out directo desde START (v30.6 R32), Redactor existente reutilizado (R04), Gmail auto_send=true (v30.9 P4).

_Tip:_ Los 2 CONNECTOR Holded llevan data_extra con tool_args.starttmp/endtmp como Unix timestamp seconds. El AGENT Redactor recibe JSON consolidado del MERGE y narra sin sumar (R03).

### 2026-04-23 — _v30.9 sesion 40 closer_ (by v30.9-closer)

**Gmail node upgradeado a multi-recipient + template CatBot (077e4fff/zAykt4) + target_subject explicito**

_Por qué:_ Cierre de sesion: el usuario pidio enviar a antonio/fen/fran educa360 con branding oficial CatBot en lugar del seed-tpl-informe-leads (default send_report de Inbound daily). Nodemailer acepta comma-separated en to nativamente.

_Tip:_ Para multi-recipient pasa target_email como comma-separated string, no array: auto_send=true lo envuelve en send_report structured. El report_template_ref resuelve por ref_code primero, luego id, luego LIKE.

### 2026-04-23 — _v30.9 sesion 40 closer_ (by v30.9-closer)

**Agent Redactor instructions ampliadas con estructura obligatoria (Resumen + 2 tablas + Analisis + Recomendaciones)**

_Por qué:_ Markdown converter (canvas-executor mini-converter) ahora soporta tablas, blockquotes, inline code, numbered lists — aprovechar la capacidad para informe ejecutivo bien maquetado en HTML tras render del template corporativo.

_Tip:_ Redactores que terminan en send_report: instruir con estructura Markdown explicita (# H1 con border-bottom violeta, ## H2, tablas | col | col | para comparativas numericas). Evita que genere JSON crudo.

