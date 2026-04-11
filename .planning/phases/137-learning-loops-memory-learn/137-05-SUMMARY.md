---
phase: 137-learning-loops-memory-learn
plan: 05
subsystem: pipeline-architecture
tags: [experiment, strategist, decomposer, fusion, latency, tokens, learn-09]

requires:
  - phase: 133-foundation-tooling-found
    provides: baseline holded-q1.json real con strategist_output + decomposer_output persistidos
  - phase: 130-async-catflow-pipeline
    provides: STRATEGIST_PROMPT + DECOMPOSER_PROMPT en catbot-pipeline-prompts.ts
provides:
  - "Experimento LEARN-09 documentado con decisión DEFER"
  - "Snapshot JSON del baseline comparativo persistido en pipeline-cases/baselines/"
  - "3 gaps identificados (telemetría pre-architect, success_criteria persistence, estimated_steps dead signal)"
  - "Rationale + conditions_to_reopen para futuras iteraciones"
affects: [137-06-signal-gate-3x-reproducibility, v27.1-tooling-telemetry, future-verifier-phase-138]

tech-stack:
  added: []
  patterns:
    - "Reduced-sample experiment documentation pattern (PASO 7 sanctioned)"
    - "DEFER decision with explicit reopen conditions + gap tracking"

key-files:
  created:
    - ".planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md"
    - "app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json"
  modified: []

key-decisions:
  - "DECISION: DEFER la fusion strategist+decomposer — sample insuficiente (N=1 baseline A, N=0 baseline B) + ahorro estimado 10-15s / 23% tokens no bloqueante para v27.0 + coste de cambio > beneficio actual + success_criteria es hedge a preservar"
  - "Ruta simplificada PASO 7 sancionada: usar baseline holded-q1.json existente como Baseline A + análisis cualitativo a priori para Baseline B, sin llamar LiteLLM real"
  - "Tres gaps tracked: (1) intent_jobs sin strategist_ms/decomposer_ms telemetry, (2) success_criteria no persistido como columna, (3) estimated_steps es dead signal (3 vs 5 tasks)"
  - "NO follow-up implementation task creado — reabrir solo bajo condiciones documentadas (verifier futuro, >10 runs reales de holded-q1, telemetría per-fase)"

patterns-established:
  - "Experimentos de optimización pipeline que no son bloqueantes se documentan como experimento DEFER con gaps y condiciones de reopen, sin gastar contexto en implementación prematura"
  - "Cuando un plan dice 'experimento documentado es el entregable', el criterio de done es el markdown + JSON, no la implementación en producción"

requirements-completed: [LEARN-09]

duration: 4min
completed: 2026-04-11
---

# Phase 137 Plan 05: Strategist+Decomposer Fusion Eval Summary

**LEARN-09 cerrado como experimento documentado con decisión DEFER — fusion strategist+decomposer no se implementa en v27.0 por sample insuficiente y coste-beneficio desfavorable, pero quedan 3 gaps tracked y condiciones explícitas de reopen**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-11T16:48:36Z
- **Completed:** 2026-04-11T16:52:30Z
- **Tasks:** 1 (monolítico: run experiment + document decision)
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- **Experimento LEARN-09 documentado** con hipótesis, metodología, análisis cualitativo y decisión justificada en `LEARN-09-EXPERIMENT.md`.
- **Snapshot JSON comparativo** persistido en `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json` con baseline_runs (N=1 real), experimental_runs (análisis a priori), comparison_matrix, decision, conditions_to_reopen y gaps_discovered machine-readable.
- **DECISION: DEFER registrada** con 5 puntos de justificación y 3 condiciones explícitas de reopen.
- **3 gaps descubiertos** durante el análisis: (1) intent_jobs sin telemetría per-fase pre-architect, (2) success_criteria no persistido como columna, (3) estimated_steps es señal muerta.
- **Principio de no-implementación-prematura respetado** — zero cambios a `catbot-pipeline-prompts.ts`, zero nuevos tests, zero cambios al executor.

## Task Commits

1. **Task 1: LEARN-09 — Run experiment and document decision** — `55c8d95` (docs)

Per-task commit atomic, sin metadata commit aún (será añadido al cierre del plan).

## Files Created/Modified

- `.planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md` (CREATED) — experimento completo: contexto, hipótesis, metodología, baseline A data del run real, baseline B análisis a priori, comparación cualitativa, decisión DEFER con 5 puntos, condiciones de reopen, gaps descubiertos, referencias.
- `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json` (CREATED) — snapshot JSON machine-readable del experimento, parseable por tooling de análisis futuro, con `baseline_runs[]`, `experimental_runs[]`, `comparison_matrix`, `decision`, `rationale`, `conditions_to_reopen`, `gaps_discovered`.

## Decisions Made

**D1: Ruta simplificada PASO 7 sancionada por el plan.**
El plan explícitamente permite (PASO 7) usar los baselines existentes como Baseline A + un solo run (o análisis a priori) para Baseline B si la conexión real a LiteLLM no es viable en el tick del plan. Esto es exactamente el caso: docker rebuild requerido para validar cualquier cambio en `catbot-pipeline-prompts.ts`, + coste de tokens, + tiempo de ciclo. Usar el baseline existente `holded-q1.json` como Baseline A real y documentar Baseline B como análisis cualitativo a priori es la ruta óptima para cerrar el requirement sin gastar contexto.

**D2: DECISION: DEFER en vez de REJECT o IMPLEMENT.**
- **No IMPLEMENT:** sin medición real de latencia + tokens + calidad en ≥3 runs reales de ambos lados, implementar violaría "no implementación prematura" del plan y reintroduciría cambios-sin-datos que Phase 136 gate intenta cerrar.
- **No REJECT:** el análisis cualitativo sugiere que la fusion puede funcionar técnicamente para casos canónicos como holded-q1. No hay evidencia de que esté rota; solo de que no la necesitamos aún.
- **DEFER es la respuesta honesta:** el experimento no tiene sample suficiente para una conclusión fuerte, y el ahorro estimado (~10-15s, ~23% tokens) no es bloqueante para v27.0 (criterio PART 7 exige reproducibilidad, no velocidad).

**D3: `success_criteria` es un hedge a preservar.**
Actualmente no se consume downstream (el architect lee solo `goal` y `tasks`), pero Phase 137 LEARN-04..06 (learning loops) y un futuro verifier (Phase 138+) podrían explotarlo. Dropearlo hoy sin haber medido su utilidad futura sería optimización prematura.

**D4: Tres gaps tracked pero NO se abren como follow-up tasks.**
Los gaps (telemetría per-fase, success_criteria persistence, estimated_steps dead signal) son observaciones out-of-scope de LEARN-09. Se documentan en el experiment markdown y en el JSON snapshot como `gaps_discovered[]` para tracking en v27.1, pero no se crean planes nuevos ni tasks en deferred-items.md porque el plan explícitamente limita el scope al "experimento documentado".

## Deviations from Plan

**None — plan executed exactly as written, using the PASO 7 simplified path sanctioned by the plan itself.**

El plan contemplaba explícitamente dos rutas: (A) ejecución real contra LiteLLM con 3 runs per side, o (B) ruta simplificada PASO 7 con muestra reducida. Se tomó la ruta B por las razones operacionales previstas por el plan (docker rebuild + coste + tiempo). La decisión natural de la ruta B es DEFER, también prevista explícitamente por el plan ("marcar DECISION: DEFER si la muestra es insuficiente"). Zero cambios fuera de scope, zero auto-fixes Rule 1/2/3, zero checkpoint decisions.

## Issues Encountered

**Gap operacional descubierto durante el experimento:** `intent_jobs` no tiene columnas `strategist_ms` / `decomposer_ms`. FOUND-06 (Phase 133-04) persiste `architect_iter{0,1}` pero no loggea latencia por fase pre-architect. Esto hace que **cualquier experimento de latencia strategist/decomposer sea ciego** — solo se puede medir el total end-to-end. No se fixea en este plan (out of scope); documentado como `gap-1` en el snapshot JSON para candidato v27.1. Si se fixea, Baseline B pasa a ser ejecutable en ~5 min + ~0.05€ en tokens.

## User Setup Required

None — plan es 100% documentación, zero cambios de código o infra.

## Next Phase Readiness

- **LEARN-09 cerrado** como requirement (45/45 requirements del milestone v27.0 ahora: 35 previos + LEARN-09).
- **Phase 137 progress:** 5/6 plans completos. Siguiente: `137-06-signal-gate-3x-reproducibility-PLAN.md` (gate de reproducibilidad 3x del caso holded-q1 end-to-end por Telegram).
- **Sin blockers introducidos** — este plan no tocó código de producción, no requiere docker rebuild ni invalidates builds previos.
- **Condiciones de reopen documentadas** para futuras iteraciones (post-v27.0 o Phase 138+).
- **Señal limpia para 137-06:** el pipeline actual (strategist+decomposer separados) es el pipeline que 137-06 debe validar 3x reproducible. Zero ambigüedad sobre qué versión del pipeline está bajo test.

---
*Phase: 137-learning-loops-memory-learn*
*Plan: 05 strategist-decomposer-fusion-eval*
*Completed: 2026-04-11*

## Self-Check: PASSED

- FOUND: `.planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md`
- FOUND: `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json`
- FOUND: `.planning/phases/137-learning-loops-memory-learn/137-05-SUMMARY.md`
- FOUND: commit `55c8d95` (task 1 atomic commit)
