---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: milestone
status: Plan 04 commits `b5c6239` `61ef4e0` `e70311f` landed; 6 TEXT columns (strategist_output, decomposer_output, architect_iter0/1, qa_iter0/1) añadidas a intent_jobs via addColumnIfMissing(PRAGMA table_info) idempotente en catbot-db.ts; executor persiste raw LLM output en cada fase; runArchitectQALoop usa architectRawFinal overwritten by expandedRaw para que Phase 134 audite el architect final post-expansion. 34/34 intent-job-executor tests green.
last_updated: "2026-04-11T09:55:00.000Z"
last_activity: 2026-04-11 -- Plan 04 complete, FOUND-06 done (8/45 reqs)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 4
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Pipeline Architect inyecta el contexto correcto en cada ejecución (tools, contratos, canvases similares) — no espera que el LLM lo recuerde. Caso canónico Holded Q1 debe completarse end-to-end sin intervención.
**Current focus:** v27.0 CatBot Intelligence Engine v2 -- Phase 133 en ejecución (4/5 plans complete)

## Current Position

Phase: 133 in progress (Foundation & Tooling — FOUND)
Plan: 133-04 intermediate-outputs-persistence COMPLETE → next: 133-05 test-pipeline-script
Status: Plan 04 commits `b5c6239` `61ef4e0` `e70311f` landed; 6 TEXT columns añadidas a intent_jobs via addColumnIfMissing(PRAGMA table_info); executor persiste strategist_output/decomposer_output tras cada callLLM, y runArchitectQALoop usa architectRawFinal (overwritten by expandedRaw cuando fires needs_rule_details expansion) para que architect_iterN siempre refleje el output final post-expansion que realmente llegó a QA. IntentJobRow y updateIntentJob extendidos con las 6 keys (dynamic UPDATE via stageColumns allowlist). 34/34 intent-job-executor tests green (31 previos + 3 nuevos happy path/iter1/expansion).
Last activity: 2026-04-11 -- Plan 04 complete, FOUND-06 done (8/45 reqs)

```
v27.0 roadmap progress:
  [~] Phase 133 — Foundation & Tooling (FOUND)          10 reqs   IN PROGRESS (4/5 plans)
      [x] 133-01 baseline-knowledge (FOUND-01/02/03)
      [x] 133-02 resilience-llm (FOUND-04/07/10)
      [x] 133-03 job-reaper (FOUND-05)
      [x] 133-04 intermediate-outputs-persistence (FOUND-06)
      [ ] 133-05 test-pipeline-script
  [ ] Phase 134 — Architect Data Layer (ARCH-DATA)       7 reqs
  [ ] Phase 135 — Architect Prompt Layer (ARCH-PROMPT)  14 reqs
  [ ] Phase 136 — End-to-End Validation (VALIDATION)     5 reqs   GATE
  [ ] Phase 137 — Learning Loops & Memory (LEARN)        9 reqs
Execution: linear 133 → 134 → 135 → 136 (gate) → 137
```

## Performance Metrics

- Phases completed this milestone (v27.0): 0/5
- Plans completed this milestone: 4/25 (133-01, 133-02, 133-03, 133-04)
- Requirements covered (v27.0): 8/45 (FOUND-01/02/03/04/05/06/07/10)

| Plan    | Duration | Tasks | Files | Date       |
|---------|----------|-------|-------|------------|
| 133-01  | 3 min    | 2     | 4     | 2026-04-11 |
| 133-02  | 3 min    | 2     | 2     | 2026-04-11 |
| 133-03  | 6 min    | 1     | 2     | 2026-04-11 |
| 133-04  | 4 min    | 2     | 3     | 2026-04-11 |
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

**Next action:** Ejecutar Plan 133-05 test-pipeline-script (FOUND-08/09) — último plan de la fase, debe ejecutar el pipeline end-to-end contra LiteLLM real y volcar a stdout flow_data + qa_report + los 6 outputs intermedios ahora persistidos (strategist_output/decomposer_output/architect_iter0-1/qa_iter0-1) para el caso canónico holded-q1 en < 60 segundos.

### v27.0 Execution Decisions
- **Plan 133-02 (FOUND-04/07/10):** callLLM rewrap AbortError inside (no en tick catch) para mantener prefix `litellm timeout (90s)` consistente con otros error paths. Knowledge_gap.context slice subido 4000 → 8000 para fit flow_data. extractTop2Issues ranks blocker > major/high > minor/medium para cubrir ambas convenciones del QA prompt. notifyProgress(force=true) DEBE firear ANTES de markTerminal para que channel info aún esté presente.
- **Plan 133-03 (FOUND-05):** Reaper query usa `pipeline_phase IN (...)` NO `status IN (...)` — en el schema real `status` es pending/failed/completed/cancelled y la fase del pipeline vive en `pipeline_phase`. Importado `catbotDb` directo (no default `db` de `@/lib/db`) porque intent_jobs vive en catbot.db, no en sources. Reaper NO se auto-ejecuta al arrancar — primer fire es +5min, aún dentro del threshold 10min y evita race con cleanupOrphans. awaiting_user/awaiting_approval NUNCA se reapan (pueden vivir horas esperando humano).
- **Plan 133-04 (FOUND-06):** Rule 3 deviation — migración y tipos van en `catbot-db.ts`, NO en `db.ts` + `intent-jobs.ts` que el plan pedía (esos paths no existen; intent_jobs vive en catbotDb). Helper `addColumnIfMissing(table, column, type)` introspecta PRAGMA table_info antes del ADD COLUMN (SQLite no soporta IF NOT EXISTS para ADD COLUMN). En runArchitectQALoop se persiste `architectRawFinal` (variable que arranca como architectRaw y se sobreescribe con expandedRaw si la expansion pass needs_rule_details dispara) — así Phase 134 audita el architect output que REALMENTE llegó a QA, no el draft descartado. Mapping iter→columna hardcoded a iter0/iter1 (no dynamic keys) porque MAX_QA_ITERATIONS=2 es invariante declarada en Phase 132 y mantiene TypeScript estricto. Stage columns opt-in en patch (no positional) preserva compatibilidad con 30+ call sites existentes.

**Remember when planning Phase 133:**
- `test-pipeline.mjs` (FOUND-08/09) DEBE ser el último task del último plan de la fase. Si se planifica antes, el script ejecuta el pipeline incompleto y sus resultados no sirven.
- Criterio de done exacto: `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios en stdout en < 60 segundos.

**Referencias canonizadas del milestone:**
- `.planning/MILESTONE-CONTEXT.md` — briefing final (8 partes, PART 7 = señal única)
- `.planning/MILESTONE-CONTEXT-AUDIT.md` — auditoría 86 preguntas
- `.planning/REQUIREMENTS.md` — 45 requirements mapeados a fases 133-137
- `.planning/ROADMAP.md` — este roadmap (creado 2026-04-11)
