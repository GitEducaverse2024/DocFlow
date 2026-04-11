---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: milestone
status: Plan 03 commits `7cf7ec0` `1f92685` landed; reapStaleJobs cada 5min mata intent_jobs stuck > 10min en pipeline_phase strategist|decomposer|architect via catbotDb query; startReaper wired en start() con guardia double-init; awaiting_user/awaiting_approval excluidos; 31/31 intent-job-executor tests green.
last_updated: "2026-04-11T09:48:00.000Z"
last_activity: 2026-04-11 -- Plan 03 complete, FOUND-05 done (7/45 reqs)
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 5
  completed_plans: 3
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Pipeline Architect inyecta el contexto correcto en cada ejecución (tools, contratos, canvases similares) — no espera que el LLM lo recuerde. Caso canónico Holded Q1 debe completarse end-to-end sin intervención.
**Current focus:** v27.0 CatBot Intelligence Engine v2 -- Phase 133 en ejecución (3/5 plans complete)

## Current Position

Phase: 133 in progress (Foundation & Tooling — FOUND)
Plan: 133-03 job-reaper COMPLETE → next: 133-04 intermediate-outputs-persistence
Status: Plan 03 commits `7cf7ec0` `1f92685` landed; reapStaleJobs setInterval 5min mata intent_jobs stuck > 10min en pipeline_phase strategist|decomposer|architect (via catbotDb, no @/lib/db); notifyProgress force=true ANTES de markTerminal; awaiting_user/awaiting_approval hard-excluidos; currentJobId se libera si apuntaba al job reaped; stopReaperForTest helper para evitar timer leaks en tests. 31/31 intent-job-executor tests green.
Last activity: 2026-04-11 -- Plan 03 complete, FOUND-05 done (7/45 reqs)

```
v27.0 roadmap progress:
  [~] Phase 133 — Foundation & Tooling (FOUND)          10 reqs   IN PROGRESS (3/5 plans)
      [x] 133-01 baseline-knowledge (FOUND-01/02/03)
      [x] 133-02 resilience-llm (FOUND-04/07/10)
      [x] 133-03 job-reaper (FOUND-05)
      [ ] 133-04 intermediate-outputs-persistence
      [ ] 133-05 test-pipeline-script
  [ ] Phase 134 — Architect Data Layer (ARCH-DATA)       7 reqs
  [ ] Phase 135 — Architect Prompt Layer (ARCH-PROMPT)  14 reqs
  [ ] Phase 136 — End-to-End Validation (VALIDATION)     5 reqs   GATE
  [ ] Phase 137 — Learning Loops & Memory (LEARN)        9 reqs
Execution: linear 133 → 134 → 135 → 136 (gate) → 137
```

## Performance Metrics

- Phases completed this milestone (v27.0): 0/5
- Plans completed this milestone: 3/25 (133-01, 133-02, 133-03)
- Requirements covered (v27.0): 7/45 (FOUND-01/02/03/04/05/07/10)

| Plan    | Duration | Tasks | Files | Date       |
|---------|----------|-------|-------|------------|
| 133-01  | 3 min    | 2     | 4     | 2026-04-11 |
| 133-02  | 3 min    | 2     | 2     | 2026-04-11 |
| 133-03  | 6 min    | 1     | 2     | 2026-04-11 |
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

**Next action:** Ejecutar Plan 133-04 intermediate-outputs-persistence (FOUND-06) — persistir outputs de cada fase del pipeline en intent_jobs para que el reaper y el post-mortem de Phase 136 puedan inspeccionar qué se produjo.

### v27.0 Execution Decisions
- **Plan 133-02 (FOUND-04/07/10):** callLLM rewrap AbortError inside (no en tick catch) para mantener prefix `litellm timeout (90s)` consistente con otros error paths. Knowledge_gap.context slice subido 4000 → 8000 para fit flow_data. extractTop2Issues ranks blocker > major/high > minor/medium para cubrir ambas convenciones del QA prompt. notifyProgress(force=true) DEBE firear ANTES de markTerminal para que channel info aún esté presente.
- **Plan 133-03 (FOUND-05):** Reaper query usa `pipeline_phase IN (...)` NO `status IN (...)` — en el schema real `status` es pending/failed/completed/cancelled y la fase del pipeline vive en `pipeline_phase`. Importado `catbotDb` directo (no default `db` de `@/lib/db`) porque intent_jobs vive en catbot.db, no en sources. Reaper NO se auto-ejecuta al arrancar — primer fire es +5min, aún dentro del threshold 10min y evita race con cleanupOrphans. awaiting_user/awaiting_approval NUNCA se reapan (pueden vivir horas esperando humano).

**Remember when planning Phase 133:**
- `test-pipeline.mjs` (FOUND-08/09) DEBE ser el último task del último plan de la fase. Si se planifica antes, el script ejecuta el pipeline incompleto y sus resultados no sirven.
- Criterio de done exacto: `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios en stdout en < 60 segundos.

**Referencias canonizadas del milestone:**
- `.planning/MILESTONE-CONTEXT.md` — briefing final (8 partes, PART 7 = señal única)
- `.planning/MILESTONE-CONTEXT-AUDIT.md` — auditoría 86 preguntas
- `.planning/REQUIREMENTS.md` — 45 requirements mapeados a fases 133-137
- `.planning/ROADMAP.md` — este roadmap (creado 2026-04-11)
