---
gsd_state_version: 1.0
milestone: v28.0
milestone_name: CatFlow Intelligence
status: "Defining requirements"
last_updated: "2026-04-17"
last_activity: 2026-04-17 -- Milestone v28.0 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17)

**Core value:** CatBot construye CatFlows de calidad — canvas tools sin bugs, instrucciones con data contracts, modelos apropiados por nodo, feedback paso a paso.
**Current focus:** v28.0 CatFlow Intelligence — Defining requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-17 — Milestone v28.0 started

## Performance Metrics

- Previous milestone (v27.0): 5 phases (133-137), 45 requirements, all complete
- Current milestone (v28.0): defining requirements

## Accumulated Context

### From v27.0 (CatBot Intelligence Engine v2)
- Pipeline Architect con contexto estructurado (scanCanvasResources enriquecido, ARCHITECT_PROMPT heartbeat, QA role-aware)
- Validador determinístico pre-LLM (agentIds, connectorIds, DAG, single start)
- test-pipeline.mjs para validación end-to-end contra LiteLLM real
- Architect self-healing: failure classifier, jsonrepair, retry tool, max_tokens 16k
- User interaction patterns table en catbot.db
- Telegram proposal UX con nodos por rol y botones
- INC-11/12/13 cerrados en 137-01 (render_template, send_email validation, connector_logs)

### Auditoría CatFlow (2026-04-17) — Motivación v28.0
- Score CatBot: 60/100. Objetivo: 85+
- canvas_add_node no persiste instructions (CRÍTICO)
- canvas_add_edge no valida reglas (CRÍTICO — permite conectar después de OUTPUT)
- No hay parámetro model por nodo, ni tool canvas_set_start_input
- Skill Orquestador sin data contracts ni mapeo de templates
- CatBot no usa tools de listado (responde de memoria)
- maxIterations=8 insuficiente para canvas complejos (necesita ~17 calls)
- Plantillas Pro-* posiblemente vacías

## Session Continuity

**Next action:** Definir REQUIREMENTS.md con REQ-IDs basados en la auditoría CatFlow. Luego crear ROADMAP.md con fases 138+.
