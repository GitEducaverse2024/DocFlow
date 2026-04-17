---
gsd_state_version: 1.0
milestone: v29.0
milestone_name: CatFlow Inbound + CRM
status: not_started
stopped_at: null
last_updated: "2026-04-17T19:30:00.000Z"
last_activity: 2026-04-17 — Milestone v29.0 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** CatFlow Inbound+CRM completo (email → clasificación → CRM Holded → respuesta con template) como piloto manual, luego CatBot lo construye autónomamente.
**Current focus:** Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-17 — Milestone v29.0 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Previous milestone (v28.0):** 7 phases (138-144), 20 requirements, all complete. Score CatBot 60→70 (medido), piloto E2E verificado.

## Accumulated Context

### From v28.0 (Lecciones del Piloto E2E)
- RESTRICCIÓN: CONDITION solo pasa "yes/no" — el nodo siguiente pierde el JSON. NO usar en pipelines de datos.
- RESTRICCIÓN: CatBrain/RAG usa instructions como query al CatBrain, no el predecessorOutput. Contexto inline.
- RESTRICCIÓN: CatPaws con system_prompt elaborado reinterpretan el input. Nodos genéricos para procesamiento.
- PATRÓN VALIDADO: 8 nodos lineales (START → Normalizador → Clasificador → Respondedor → Gmail → Output)
- DATA CONTRACT Gmail: {accion_final: "send_reply", respuesta: {plantilla_ref, saludo, cuerpo}} — NO {to, subject, html_body}
- CatPaw SOLO para tools externas (Holded MCP, Gmail send). Sin CatPaw para procesamiento de datos.
- PARTEs 19-20 aplicadas en Skill Orquestador. canvas.json actualizado con restricciones.
- CatBot construye canvas email 10/10 criterios post-entrenamiento.

### Decisions
(None yet for v29.0)

### Blockers/Concerns
- CatPaw "Consultor CRM" existente tiene system_prompt rígido (espera tipo_operacion="consulta_crm"). Necesita CatPaw nuevo "Operador Holded" generalista.

## Session Continuity

Last session: 2026-04-17T19:30:00.000Z
Stopped at: null
Resume file: None
