---
gsd_state_version: 1.0
milestone: v27.0
milestone_name: milestone
status: verifying
last_updated: "2026-04-11T11:47:42.615Z"
last_activity: 2026-04-11 -- Phase 134-02 COMPLETE (rules-index scope annotations)
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 9
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Pipeline Architect inyecta el contexto correcto en cada ejecución (tools, contratos, canvases similares) — no espera que el LLM lo recuerde. Caso canónico Holded Q1 debe completarse end-to-end sin intervención.
**Current focus:** v27.0 CatBot Intelligence Engine v2 -- Phase 134 Architect Data Layer IN PROGRESS (Wave 1)

## Current Position

Phase: 134 Architect Data Layer (ARCH-DATA) IN PROGRESS — Wave 1, 134-02 COMPLETE
Plan: 134-02 rules-index-scope-annotations COMPLETE (ARCH-DATA-07)
Status: canvas-rules-index.md con anotaciones [scope: role] en R10/R15/R02/SE01; reglas universales (R03/R04/R11/R20/R23/R24) intactas. Test parser-over-disk (canvas-rules-scope.test.ts, 6/6 green) custodia el mapping. Desbloquea el reviewer role-aware de Phase 135. 11/45 requirements cubiertos (FOUND-01..10, ARCH-DATA-07). Pendiente en Wave 1: 134-01 connector-contracts-module. Wave 2: 134-03 scan-canvas-resources-enriched, 134-04 deterministic-qa-threshold.
Last activity: 2026-04-11 -- Phase 134-02 COMPLETE (2 tasks, 3 min)

```
v27.0 roadmap progress:
  [x] Phase 133 — Foundation & Tooling (FOUND)          10 reqs   COMPLETE
      [x] 133-01 baseline-knowledge (FOUND-01/02/03)
      [x] 133-02 resilience-llm (FOUND-04/07/10)
      [x] 133-03 job-reaper (FOUND-05)
      [x] 133-04 intermediate-outputs-persistence (FOUND-06)
      [x] 133-05 test-pipeline-script (FOUND-08/09)
  [~] Phase 134 — Architect Data Layer (ARCH-DATA)       7 reqs   IN PROGRESS
      [ ] 134-01 connector-contracts-module
      [x] 134-02 rules-index-scope-annotations (ARCH-DATA-07)
      [ ] 134-03 scan-canvas-resources-enriched
      [ ] 134-04 deterministic-qa-threshold
  [ ] Phase 135 — Architect Prompt Layer (ARCH-PROMPT)  14 reqs
  [ ] Phase 136 — End-to-End Validation (VALIDATION)     5 reqs   GATE
  [ ] Phase 137 — Learning Loops & Memory (LEARN)        9 reqs
Execution: linear 133 → 134 → 135 → 136 (gate) → 137
```

## Performance Metrics

- Phases completed this milestone (v27.0): 1/5
- Plans completed this milestone: 6/25 (133-01..05, 134-02)
- Requirements covered (v27.0): 11/45 (FOUND-01..10, ARCH-DATA-07)

| Plan    | Duration | Tasks | Files | Date       |
|---------|----------|-------|-------|------------|
| 133-01  | 3 min    | 2     | 4     | 2026-04-11 |
| 133-02  | 3 min    | 2     | 2     | 2026-04-11 |
| 133-03  | 6 min    | 1     | 2     | 2026-04-11 |
| 133-04  | 4 min    | 2     | 3     | 2026-04-11 |
| 133-05  | 25 min   | 3     | 7     | 2026-04-11 |
| 134-02  | 3 min    | 2     | 2     | 2026-04-11 |
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

**Next action:** Ejecutar Phase 134 Architect Data Layer (ARCH-DATA) — 7 requirements sobre la capa de datos que el architect inyecta al LLM (tools/contratos declarativos/canvases similares/templates). Usar `app/scripts/test-pipeline.mjs --case drive-sync --save-baseline` como regression gate entre iteraciones. El stack ya está rebuildeado con commits 647e3f7/29dab01/ef0a642/2947289/fc56cd6 integrados; baseline empírico `holded-q1.json` (59.1s, PAW-gate path) ya committed en `app/scripts/pipeline-cases/baselines/`.

### Señales empíricas para Phase 134 planner (extraídas del baseline holded-q1)

**LEE ESTAS ANTES DE PLANIFICAR PHASE 134** — son observaciones reproducibles del run real contra LiteLLM, no hipótesis:

1. **ARCH-DATA signal: architect alucina agentId slugs cuando el CatPaw no existe en inventario.**
   En el baseline holded-q1, `n3.data.agentId = "consolidador-financiero"` (run del baseline) / `"data-interpreter-agent"` (run previo) — ambos son **slugs fabricados, no UUIDs reales**. Contraste directo: `n1`, `n2` (holded MCP seed) y `n5` (Gmail emitter) **sí** tienen UUIDs reales. El patrón es reproducible: el architect encuentra agentes que existen en el scan, pero inventa slugs placeholder para cualquier CatPaw listado por el decomposer que aún no tiene fila en `agents`. **Phase 134 scanCanvasResources debe inyectar la lista completa de UUIDs reales con sus capacidades (descripción, connectorId asociado, tipo I/O) — sin inventario completo, el canvas-executor romperá en runtime al intentar resolver un slug que no existe en la tabla.**

2. **ARCH-PROMPT signal (Phase 135, no 134 — contextual): cero nodos del canvas generado tienen `data.role` declarado.**
   Los 6 nodes del baseline (`start`, `extract_2025`, `extract_2026`, `consolidate_data`, `generate_report`, `send_email`) emiten `instructions`, `agentId`, `connectorId` — ningún `role`. VALIDATION-01 (Phase 137) lo exige, y el reviewer de Phase 136 lo necesita para aplicar reglas condicionalmente (p.ej. R10 sólo a collectors/enrichers). Phase 134 no tiene que fixear esto — va en Phase 135 ARCH-PROMPT — **pero la interface entre capa de datos (134) y prompt (135) tiene que contemplar el campo role desde el inicio**.

3. **Backlog observation (NO bloquea v27.0):** el executor deja `status='pending'` cuando `pipeline_phase='awaiting_user'` en el PAW-approval gate. El script `test-pipeline.mjs` ya absorbe esto via `TERMINAL_PHASE`, pero cualquier otro caller que pollee `status` se queda colgado. Candidato a gap futuro.

Evidencia completa en `.planning/phases/133-foundation-tooling-found/133-VERIFICATION.md` (sección "Señales para fases siguientes") y baseline en `app/scripts/pipeline-cases/baselines/holded-q1.json`.

### v27.0 Execution Decisions
- **Plan 134-02 (ARCH-DATA-07):** Sintaxis condicional R02 `[scope: extractor,transformer-when-array]` — guion convierte la condicion en token unico parseable sin romper formato simple de un solo bracket. Reglas no dictadas por ARCH-DATA-07 (R01, R05-R09, R12-R14, R16-R19, R21, R22, R25, SE02, SE03, DA01-DA04) se dejan SIN anotacion: el spec solo exige las 4 enumeradas + las 6 universales exentas. Test parser-over-disk (`fs.readFileSync`) rompe si alguien edita el .md sin actualizar — regression guard efectivo contra drift silencioso entre Phase 134 y Phase 135 reviewer.
- **Plan 133-02 (FOUND-04/07/10):** callLLM rewrap AbortError inside (no en tick catch) para mantener prefix `litellm timeout (90s)` consistente con otros error paths. Knowledge_gap.context slice subido 4000 → 8000 para fit flow_data. extractTop2Issues ranks blocker > major/high > minor/medium para cubrir ambas convenciones del QA prompt. notifyProgress(force=true) DEBE firear ANTES de markTerminal para que channel info aún esté presente.
- **Plan 133-03 (FOUND-05):** Reaper query usa `pipeline_phase IN (...)` NO `status IN (...)` — en el schema real `status` es pending/failed/completed/cancelled y la fase del pipeline vive en `pipeline_phase`. Importado `catbotDb` directo (no default `db` de `@/lib/db`) porque intent_jobs vive en catbot.db, no en sources. Reaper NO se auto-ejecuta al arrancar — primer fire es +5min, aún dentro del threshold 10min y evita race con cleanupOrphans. awaiting_user/awaiting_approval NUNCA se reapan (pueden vivir horas esperando humano).
- **Plan 133-04 (FOUND-06):** Rule 3 deviation — migración y tipos van en `catbot-db.ts`, NO en `db.ts` + `intent-jobs.ts` que el plan pedía (esos paths no existen; intent_jobs vive en catbotDb). Helper `addColumnIfMissing(table, column, type)` introspecta PRAGMA table_info antes del ADD COLUMN (SQLite no soporta IF NOT EXISTS para ADD COLUMN). En runArchitectQALoop se persiste `architectRawFinal` (variable que arranca como architectRaw y se sobreescribe con expandedRaw si la expansion pass needs_rule_details dispara) — así Phase 134 audita el architect output que REALMENTE llegó a QA, no el draft descartado. Mapping iter→columna hardcoded a iter0/iter1 (no dynamic keys) porque MAX_QA_ITERATIONS=2 es invariante declarada en Phase 132 y mantiene TypeScript estricto. Stage columns opt-in en patch (no positional) preserva compatibilidad con 30+ call sites existentes.
- **Plan 133-05 (FOUND-08/09):** Rule 3 deviation — import strategy pivot: el plan asumía `.next/standalone/app/src/lib/services/intent-job-executor.js` pero Next.js bundlea esa clase en chunks de API routes, no la expone como standalone. Abandonar import del executor entero; mirror `setup-inbound-canvas.mjs` (better-sqlite3 puro via ESM). El script inserta fila sintética y confía en `IntentJobExecutor.start()` ya corriendo dentro del contenedor Next.js (lo arranca `instrumentation.ts`) — mismo dispatch flow que un POST desde la UI web. Zero new deps, zero build step. Cleanup SIGINT handler añadido (Rule 2) para no dejar zombies si se Ctrl+C durante el polling. Timeout script = 120s (criterio <60s es de done, no del tooling) para dar headroom al primer pickup (tick 30s) y reportar útil aún en slow runs. Auto-mode checkpoint:human-verify auto-aprobado; smoke-test runtime <60s queda como responsabilidad operacional post docker rebuild.

**Remember when planning Phase 133:**
- `test-pipeline.mjs` (FOUND-08/09) DEBE ser el último task del último plan de la fase. Si se planifica antes, el script ejecuta el pipeline incompleto y sus resultados no sirven.
- Criterio de done exacto: `node app/scripts/test-pipeline.mjs --case holded-q1` imprime flow_data + qa_report + outputs intermedios en stdout en < 60 segundos.

**Referencias canonizadas del milestone:**
- `.planning/MILESTONE-CONTEXT.md` — briefing final (8 partes, PART 7 = señal única)
- `.planning/MILESTONE-CONTEXT-AUDIT.md` — auditoría 86 preguntas
- `.planning/REQUIREMENTS.md` — 45 requirements mapeados a fases 133-137
- `.planning/ROADMAP.md` — este roadmap (creado 2026-04-11)
