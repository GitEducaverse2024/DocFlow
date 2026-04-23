---
id: skill-sy-canvas-rules-inmutables
type: resource
subtype: skill
lang: es
title: Canvas Rules Inmutables
summary: Skill del sistema con las 8 reglas inmutables R01-R08 para disenar cualquier canvas. Inyectada literal en el prompt de CatBot via buildCanvasInmutableSection (mirror Auditor/Cronista). Antes de v30...
tags: [skill, system]
audience: [catbot, developer]
status: active
created_at: 2026-04-23T14:45:20.345Z
created_by: kb-sync-bootstrap
version: 1.0.8
updated_at: 2026-04-23T18:34:49.392Z
updated_by: kb-sync-bootstrap
source_of_truth:
  - db: sqlite
    table: skills
    id: skill-system-canvas-inmutable-v1
    fields_from_db: [name, description, category, tags, instructions, source, version, author, times_used, rationale_notes]
change_log:
  - { version: 1.0.4, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.5, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.6, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.7, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
  - { version: 1.0.8, date: 2026-04-23, author: kb-sync-bootstrap, change: Auto-sync patch bump from DB }
ttl: never
---

## Descripción

Skill del sistema con las 8 reglas inmutables R01-R08 para disenar cualquier canvas. Inyectada literal en el prompt de CatBot via buildCanvasInmutableSection (mirror Auditor/Cronista). Antes de v30.5 estas reglas vivian en el skill Orquestador CatFlow que esta en lazy-load — el LLM no las cargaba.

## Configuración

- **Category:** system
- **Source:** built-in
- **Version:** 1.0
- **Author:** DoCatFlow
- **times_used:** 0

## Instrucciones

REGLAS INMUTABLES DE DISENO DE CANVAS (prioridad absoluta, aplican en planificacion, no solo en ejecucion)

Si tu plan menciona una entidad como reusable o propone crear una, ya has tomado una decision que debe cumplir estas reglas. No puedes corregir despues sin perder credibilidad — re-planifica antes de enviar la respuesta.

## R01 — Historial antes de decidir
Antes de mencionar una entidad (catpaw/canvas/catbrain/connector/skill) como candidata a reuso o modificacion, llama `get_entity_history({type, id})`. Resume al usuario los 1-3 ultimos cambios relevantes. Aplica en planificacion, no solo en ejecucion.

## R02 — Detalle completo antes de afirmar reuso
Nunca afirmes que una entidad "esta vacia", "sirve para X" o "esta bien configurada" sin haber cargado su detalle (`get_cat_paw` / `get_skill` / `get_email_template` / `get_kb_entry`). Cita textualmente un fragmento de sus instructions reales que justifique el reuso.

## R03 — Calculos numericos NO se delegan al LLM (regla CRITICA)
Sumas, conteos, promedios, porcentajes, agregaciones temporales, comparativas numericas, ranking, estadisticas: van en nodos deterministicos (`storage` con script, `connector` a endpoint SQL, nodo script). El LLM interpreta/narra/clasifica — no calcula.

ANTI-PATTERN CONCRETOS (todos prohibidos — re-planifica si tu plan los incluye):
- Agent "Validador Matematico" / "Calculador Estricto" / "Calculador" / "Auditor Financiero" / "Analista Comparativo" / "Contador" / "Verificador Aritmetico".
- Instrucciones tipo "Solo puedes realizar sumas y conteos" o "recalcula total=sum(lineas)" o "valida que las sumas cuadren" a un agent LLM.
- Modelos tier Elite con reasoning=high delegados a "razonar matematicamente". El razonamiento detecta errores pero NO los evita.

PATTERN CORRECTO: storage/script calcula → agent recibe numeros YA validados y los NARRA.

## R04 — Enumerar alternativas antes de proponer crear
Antes de crear conector/catpaw/skill/template nuevo, enumera alternativas: tools `<do

## Historial de mejoras

> Entries gestionadas por la skill "Cronista CatDev" (v30.4). Append-only, idempotente por (date, change). No editar a mano — usar tool `update_skill_rationale` via CatBot.

### 2026-04-23 — _v30.5 sesion 36_ (by v30.5-p2)

**Creación skill Canvas Rules Inmutables v1.0 con 8 reglas R01-R08 + checklist obligatorio**

### 2026-04-23 — _v30.9 sesion 40_ (by v30.9-p3)

**Anadida R09 Contrato node.data con data_extra (+2717 chars). CHECKLIST pasa de 8 a 9 items.**

_Por qué:_ Ship v30.9 introdujo el param data_extra generico en canvas_add_node/update_node + whitelist auto-generado por audit-tool-runtime-contract.cjs. R09 documenta el whitelist por nodeType dentro del prompt literal (acceso sin llamar search_kb).

_Tip:_ Ejemplos positivos en R09 cubren connector MCP (tool_name+tool_args), agent con RAG (useRag+ragQuery+projectId), condition, output con notify_on_complete. Antipattern explicito: texto libre en instructions para connectors MCP (el executor lo ignora y falla silenciosamente al default search_people).

