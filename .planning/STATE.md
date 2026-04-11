---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: CatBot Intelligence Engine v2 (Memento Man fix)
status: planning_complete
last_updated: "2026-04-11T00:00:00.000Z"
last_activity: 2026-04-11 -- Roadmap v27.0 creado (5 fases 133-137, 45 reqs mapeados). Phase 133 pending.
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Pipeline Architect inyecta el contexto correcto en cada ejecución (tools, contratos, canvases similares) — no espera que el LLM lo recuerde. Caso canónico Holded Q1 debe completarse end-to-end sin intervención.
**Current focus:** v27.0 CatBot Intelligence Engine v2 -- Phase 133 pending, planning complete

## Current Position

Phase: 133 pending (Foundation & Tooling — FOUND)
Plan: — (plans TBD, pending `/gsd:plan-phase 133`)
Status: Planning complete — roadmap aprobado, listo para planificar Phase 133
Last activity: 2026-04-11 -- ROADMAP.md creado con 5 fases (133-137), 45/45 requirements mapeados

```
v27.0 roadmap complete:
  [ ] Phase 133 — Foundation & Tooling (FOUND)          10 reqs   PENDING
  [ ] Phase 134 — Architect Data Layer (ARCH-DATA)       7 reqs
  [ ] Phase 135 — Architect Prompt Layer (ARCH-PROMPT)  14 reqs
  [ ] Phase 136 — End-to-End Validation (VALIDATION)     5 reqs   GATE
  [ ] Phase 137 — Learning Loops & Memory (LEARN)        9 reqs
Execution: linear 133 → 134 → 135 → 136 (gate) → 137
```

## Performance Metrics

- Phases completed this milestone (v27.0): 0/5
- Plans completed this milestone: 0
- Requirements covered (v27.0): 0/45 (45 mapeados, 0 completados)
- Previous milestone (v26.0): 41 reqs + PIPE-01..08 + QA2-01..08 completed en phases 118-132

## Accumulated Context

### Roadmap Evolution
- **v27.0 (new):** 5-phase linear roadmap 133-137 para arreglar el "Memento Man problem" del Pipeline Architect. Phase 136 es gate de validación pura contra LiteLLM real con failure routing matrix por capa (datos→134, prompt→135, gate tooling→133, runtime canvas→defer).
- Phase 128 added: Sistema de Alertas + Memoria de Conversación CatBot (alertas consolidadas, memoria web 10+30, Telegram, sudo preserva contexto)

### v27.0 Key Decisions (goal-backward anchors)
- **Señal única de éxito (PART 7 MILESTONE-CONTEXT.md):** Holded Q1 end-to-end vía Telegram, email a antonio+fen con template corporativo y cifras reales, reproducible 3 veces consecutivas sin intervención.
- **Fix del Memento Man NO es pedir al LLM que recuerde** — es inyectarle contexto estructurado (tools, contratos declarativos, canvases similares, templates) en cada invocación.
- **Phase 133 internal order mandatory:** `test-pipeline.mjs` (FOUND-08/09) es el ÚLTIMO task. Baseline (01/02) → canvas-nodes-catalog (03) → timeout (04) → flow_data exhaustion (07) → exhaustion notify (10) → reaper (05) → persistencia outputs (06) → test-pipeline (08/09).
- **Phase 134 quality threshold en código:** `data_contract_score >= 80 AND blockers.length === 0` determinista — NO parseado del prompt.
- **Phase 135 role-aware QA:** `data.role ∈ {extractor, transformer, synthesizer, renderer, emitter, guard, reporter}` obligatorio; R10 solo aplica a `transformer/synthesizer`; validador determinístico rechaza canvas con agentIds inexistentes sin gastar tokens.
- **Phase 136 NO es fase de código** — es gate de validación con failure routing matrix. Excepción permitida única: "passed QA, defer runtime" si `canvas-executor.ts` falla en runtime real (out-of-scope intocable).
- **Out of scope v27.0:** tocar `canvas-executor.ts`, `insertSideEffectGuards`, state machine `intent_jobs`, `attemptNodeRepair`, channel propagation, UI del canvas, tipos de nodo nuevos, subir `MAX_QA_ITERATIONS`, rehacer `complexity_assessment`.

### From v25.1 (Centro de Modelos)
- Health API con verificacion real por alias/proveedor
- Centro de Modelos: 4 tabs (Resumen, Proveedores, Modelos, Enrutamiento)
- CatBot check_model_health con 3 modos
- UI cleanup: CatBoard, CatTools menu, horizontal tabs, model selector por tier
- CatBot tools: list_mid_models, update_mid_model, FEATURE_KNOWLEDGE actualizado
- Knowledge docs: 80+ archivos .md en .planning/ (catalogos, progress sessions, codebase docs)

### Decisiones previas relevantes para v26.0
- CatBot usa localStorage para historial de conversacion (a migrar a catbot.db)
- FEATURE_KNOWLEDGE eliminado, migrado a knowledge tree (query_knowledge + explain_feature usan loadKnowledgeArea)
- System prompt reemplazado por PromptAssembler con seciones priorizadas P0-P3 y presupuesto de tokens por tier
- CatBot tiene 52+ tools con permission gate (always_allowed, permission-gated, sudo-required)
- search_documentation tool ya busca en .planning/*.md con chunking y scoring

## Session Continuity

**Next action:** `/gsd:plan-phase 133` para crear los plans de Foundation & Tooling.

**Remember when planning Phase 133:**
- `test-pipeline.mjs` (FOUND-08/09) DEBE ser el último task del último plan de la fase. Si se planifica antes, el script ejecuta el pipeline incompleto y sus resultados no sirven.
- Criterio de done exacto: `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios en stdout en < 60 segundos.

**Referencias canonizadas del milestone:**
- `.planning/MILESTONE-CONTEXT.md` — briefing final (8 partes, PART 7 = señal única)
- `.planning/MILESTONE-CONTEXT-AUDIT.md` — auditoría 86 preguntas
- `.planning/REQUIREMENTS.md` — 45 requirements mapeados a fases 133-137
- `.planning/ROADMAP.md` — este roadmap (creado 2026-04-11)
