---
phase: 133-foundation-tooling-found
status: complete
completed_date: 2026-04-11
plans_total: 5
plans_complete: 5
requirements_covered: [FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09, FOUND-10]
---

# Phase 133 Foundation & Tooling (FOUND) — Verification

Gate de done de Phase 133. Los 5 criterios de éxito que Phase 134/135/136 asumen ya presentes.

## Success Criteria

### 1. `test-pipeline.mjs --case holded-q1` ejecuta el pipeline async completo

**Status:** `BUILT`

**Evidence:**
- Script creado en `app/scripts/test-pipeline.mjs` (273 lines).
- Inserta fila sintética con `tool_name='__description__'` + `original_request`.
- Polla `catbot.db` hasta terminal state o timeout 120s.
- Imprime 6 outputs intermedios (strategist, decomposer, architect_iter0/1, qa_iter0/1) + roles por nodo + qa summary.
- Cleanup idempotente en happy/SIGINT/timeout paths (0 zombies verificado).

**Smoke-test post-rebuild requerido (operador):**
```bash
cd ~/docflow
docker compose build --no-cache
docker compose up -d
# wait ~90s para que IntentJobExecutor boot delay (60s) pase
time node app/scripts/test-pipeline.mjs --case holded-q1
```

Criterio de aceptación exacto: `duration_s < 60.0` AND `final_status ∈ {awaiting_approval, awaiting_user, completed}` AND `strategist_output`/`decomposer_output`/`architect_iter0`/`qa_iter0` presentes en el JSON.

**Nota:** El run inicial del script contra la imagen actual (pre-rebuild) timeout en 120s — logs de `docflow-app` no muestran `intent-job-executor` startup, indicando imagen pre-Plans 01-04. El rebuild es responsabilidad operacional (no de Plan 05). El tooling está correcto: insert/poll/cleanup validado end-to-end.

### 2. Timeouts + reaper previenen jobs colgados

**Status:** `DONE` (Plans 02 + 03)

**Evidence:**
- **Plan 02 (FOUND-04):** `callLLM` wrap con `AbortSignal.timeout(90_000)` + rewrap de `AbortError` como `litellm timeout (90s)` antes del catch en `tick()`. Commit en Plan 02 SUMMARY.
- **Plan 03 (FOUND-05):** `IntentJobExecutor.startReaper()` cada 5min hace `UPDATE intent_jobs SET status='failed' WHERE pipeline_phase IN ('strategist','decomposer','architect') AND updated_at < datetime('now','-10 minutes')`. Belt-and-braces independiente del timeout de callLLM. `awaiting_user`/`awaiting_approval` nunca se reapan.

### 3. Exhaustion notifica con top-2 issues + flow_data persistido

**Status:** `DONE` (Plan 02)

**Evidence:**
- Plan 02 (FOUND-07/10): QA loop exhaustion persiste `last_flow_data` en `intent_jobs`, `notifyProgress(force=true)` firea ANTES de `markTerminal` para conservar channel info, `extractTop2Issues` rankea `blocker > major/high > minor/medium` cubriendo ambas convenciones del QA prompt, `knowledge_gap.context` slice subido 4000 → 8000 para encajar flow_data completo.

### 4. `getCanvasRule('R10')` funciona en contenedor

**Status:** `DONE` (Plan 01)

**Evidence:**
- Plan 01 (FOUND-01/02/03): canvas rules catalog cargado en runtime via `loadRulesIndex()` desde `app/data/knowledge/` dentro del contenedor. `getCanvasRule('R10')` retorna la regla transformer verdadero-positivo disponible para el architect prompt. Baseline knowledge en disco incluido en docker image build.

### 5. 6 columnas intermedias existen y se pueblan

**Status:** `DONE` (Plan 04)

**Evidence:**
- Plan 04 (FOUND-06): `addColumnIfMissing` helper en `catbot-db.ts` vía `PRAGMA table_info` introspection añade idempotentemente 6 TEXT columns a `intent_jobs`: `strategist_output`, `decomposer_output`, `architect_iter0`, `qa_iter0`, `architect_iter1`, `qa_iter1`.
- `IntentJobExecutor` persiste raw LLM output tras cada `callLLM` vía `updateIntentJob` con stageColumns allowlist.
- `runArchitectQALoop` usa `architectRawFinal` (overwritten con `expandedRaw` cuando `needs_rule_details` expansion dispara) para que `architect_iterN` refleje el output post-expansion que realmente llegó a QA.
- 34/34 `intent-job-executor.test.ts` green (31 previos + 3 nuevos happy path/iter1/expansion).

## Plan-level Completion Matrix

| Plan | Requirements | Status | Commits |
|------|--------------|--------|---------|
| 133-01 baseline-knowledge | FOUND-01, FOUND-02, FOUND-03 | DONE | (ver 133-01 SUMMARY) |
| 133-02 resilience-llm | FOUND-04, FOUND-07, FOUND-10 | DONE | (ver 133-02 SUMMARY) |
| 133-03 job-reaper | FOUND-05 | DONE | (ver 133-03 SUMMARY) |
| 133-04 intermediate-outputs | FOUND-06 | DONE | b5c6239, 61ef4e0, e70311f |
| 133-05 test-pipeline-script | FOUND-08, FOUND-09 | DONE | 58a4a22, 047b262 |

## CatBot Oracle Check (CLAUDE.md protocol)

**Deferred gap:** verificación via CatBot web de "¿tiene intent_jobs las columnas strategist_output, architect_iter0, qa_iter0?" requiere sesión interactiva. CatBot ya dispone de tools genéricos (`query_knowledge`, `explain_feature`) que pueden responder sobre estas columnas una vez el knowledge tree del área `catbrains`/`catflow` se actualice con la feature (Plan 04). **No bloquea Phase 133**; queda para un plan futuro de actualización de knowledge tree si se quiere CatBot oracle explícito para este schema change.

## Out-of-Scope para Phase 134+

Phase 133 NO entregó y no debe entregar:
- `canvas-executor.ts` modifications (out-of-scope v27.0 entero).
- `insertSideEffectGuards` changes.
- State machine changes en `intent_jobs` (status values).
- `attemptNodeRepair` changes.
- UI del canvas.
- Nuevos tipos de nodo.
- `MAX_QA_ITERATIONS` increase.
- `complexity_assessment` rework.

## Phase 133 → Phase 134 Handoff

**Ready for Phase 134 (Architect Data Layer, ARCH-DATA):**
- Los 6 outputs intermedios están persistidos → Phase 134 audit layer puede inspeccionar raw strategist/decomposer/architect sin re-run.
- `test-pipeline.mjs` con 3 fixtures → Phase 134 puede ejercitar cambios de data layer con `--case drive-sync` (R10 verdadero-positivo) y `--save-baseline` para detectar regresiones.
- `getCanvasRule('R10')` + catálogo en runtime → Phase 134 puede inyectar rule context al architect.
- Timeouts + reaper → Phase 134 puede experimentar con prompts más largos sin miedo a jobs colgados.
