---
phase: 137-learning-loops-memory-learn
plan: 05
type: execute
wave: 3
depends_on: [137-01, 137-02, 137-03, 137-04]
files_modified:
  - app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json
  - .planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md
autonomous: true
requirements: [LEARN-09]
must_haves:
  truths:
    - "Existe un documento de experimento LEARN-09 con metodología, resultados y decisión"
    - "El baseline comparativo (strategist+decomposer vs fusion) está persistido"
    - "La decisión de implementar/descartar la fusión está justificada con datos"
  artifacts:
    - path: ".planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md"
      provides: "experimento documentado: metodología, 3 runs per side, comparación cualitativa y cuantitativa de tasks, decisión final"
    - path: "app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json"
      provides: "snapshot de outputs del experimento (strategist+decomposer actual vs fused prompt)"
  key_links:
    - from: "LEARN-09-EXPERIMENT.md decision"
      to: "catbot-pipeline-prompts.ts"
      via: "decisión documentada (no cambios de código en este plan)"
      pattern: "DECISION: (IMPLEMENT|DEFER|REJECT)"
---

<objective>
**LEARN-09** — Evaluación documentada de si fusionar strategist + decomposer en 1 LLM call (en lugar de 2) produce resultados equivalentes o mejores en el caso canónico holded-q1.

**Motivación (MILESTONE-CONTEXT §C.7):** El strategist actual reformula la petición sin añadir valor real — produce un `goal` casi idéntico al `original_request`. Una llamada LLM de ~15s que no mueve la aguja es ruido. Si un prompt fusionado produce tasks de calidad equivalente, elimina una fuente de variabilidad y reduce latencia end-to-end.

**Importante:** Este plan es un experimento documentado. Sólo implementa la fusión si la calidad es equivalente o mejor. Si no, documenta el descarte y queda como evidencia para futuros milestones.

**Este plan NO implementa la fusión si el experimento sale negativo.** Si sale positivo, crea un seguimiento en el experimento + implementation task, pero la implementación queda fuera del scope de este plan (sería un gap de Phase 137 o un item de v27.1). El criterio de done de LEARN-09 es el experimento documentado, no la fusión en producción.

Purpose: Cerrar el requirement sin gastar contexto implementando algo que puede no hacer falta. El experimento es el entregable.
Output: Experiment markdown + baseline JSON.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/MILESTONE-CONTEXT.md
@.planning/REQUIREMENTS.md
@app/scripts/test-pipeline.mjs
@app/scripts/pipeline-cases/holded-q1.json
@app/src/lib/services/catbot-pipeline-prompts.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: LEARN-09 — Run experiment and document decision</name>
  <files>
    .planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md,
    app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json
  </files>
  <action>
    PASO 1 — Baseline A (strategist+decomposer actual): ejecutar `node app/scripts/test-pipeline.mjs --case holded-q1 --save-baseline` 3 veces y capturar:
    - `goal` producido por strategist
    - `tasks[]` producidos por decomposer
    - Tiempo total del pipeline hasta pre-architect
    - Tokens estimados de ambas llamadas

    PASO 2 — Construir un prompt fusionado en un archivo temporal (no comitear a `catbot-pipeline-prompts.ts`). Usar el patrón existente de STRATEGIST_PROMPT + DECOMPOSER_PROMPT como base. Output schema: `{goal: string, tasks: Array<{name, description, role_hint}>}`.

    PASO 3 — Crear un script scratch `app/scripts/fusion-eval.mjs` (no comitear si es solo transitorio — puede vivir como anexo del experimento) que:
    - Lee `app/scripts/pipeline-cases/holded-q1.json`
    - Llama LiteLLM con el prompt fusionado 3 veces
    - Captura output, tiempo, tokens
    - Imprime resultados

    PASO 4 — Comparación manual cualitativa entre los 6 runs (3 actual + 3 fusion):
    - ¿El goal es equivalente?
    - ¿Las tasks cubren el mismo ground? (extract Q1 2025, extract Q1 2026, compare, render, send)
    - ¿El role_hint de cada task es correcto?
    - ¿Latencia de fusion < latencia actual - 10s?
    - ¿Tokens totales de fusion < sum(strategist+decomposer)?

    PASO 5 — Crear `LEARN-09-EXPERIMENT.md` con estructura:
    ```markdown
    # LEARN-09 — Experimento: fusion strategist+decomposer

    ## Hipótesis
    Fusionar strategist + decomposer en 1 call produce tasks de calidad equivalente, reduce latencia ~15s y tokens ~30%.

    ## Metodología
    - 3 runs baseline (pipeline actual) y 3 runs experimental (prompt fusionado)
    - Caso: holded-q1 canónico
    - Modelo: (el mismo que usa el pipeline para strategist/decomposer)
    - Criterio de equivalencia: tasks cubren los mismos pasos funcionales, role_hint correcto en ≥80% de los nodos, sin pérdida de información del request original.

    ## Resultados
    | Métrica | Baseline (actual) | Experimental (fusion) | Delta |
    |---|---|---|---|
    | Tiempo medio hasta architect | N s | M s | (N-M) s |
    | Tokens medios (strategist+decomposer) | N | M | (N-M) |
    | Tasks equivalentes | X/Y | X/Y | |
    | Role_hint correcto | X/Y | X/Y | |

    ## Análisis cualitativo
    - (ejemplos de divergencia de goals)
    - (ejemplos de tasks perdidas o añadidas)

    ## Decisión
    **DECISION: [IMPLEMENT|DEFER|REJECT]**

    - Si IMPLEMENT: crear plan de seguimiento en v27.1 con la implementación.
    - Si DEFER: razón + condiciones bajo las cuales reconsiderar.
    - Si REJECT: razón (p.ej. "fusion pierde granularidad en tasks con role_hint, el strategist aporta valor").
    ```

    PASO 6 — Persistir el `baseline.json` en `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json` con:
    ```json
    {
      "experiment": "LEARN-09 fusion eval",
      "date": "YYYY-MM-DD",
      "case": "holded-q1",
      "baseline_runs": [...],
      "experimental_runs": [...],
      "decision": "IMPLEMENT|DEFER|REJECT",
      "rationale": "..."
    }
    ```

    PASO 7 — **IMPORTANTE:** Si en el paso 2 la conexión real a LiteLLM no es viable (docker no rebuild, coste de tokens, tiempo), ejecutar la versión simplificada: usar los baselines existentes de `app/scripts/pipeline-cases/baselines/holded-q1.json` como baseline A, y para baseline B hacer UN SOLO run con el fused prompt. Documentar la reducción de muestra en el experimento y marcar DECISION: DEFER si la muestra es insuficiente.

    PASO 8 — Commit del markdown y el JSON. No comitear `fusion-eval.mjs` si era transitorio (añadir a .gitignore si se crea) o, si vale la pena, persistirlo como tool reutilizable bajo `app/scripts/experiments/`.
  </action>
  <verify>
    <automated>test -f .planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md &amp;&amp; test -f app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json &amp;&amp; grep -q "DECISION:" .planning/phases/137-learning-loops-memory-learn/LEARN-09-EXPERIMENT.md</automated>
  </verify>
  <done>
    - Experimento documentado con metodología clara
    - Baseline JSON persistido
    - Decisión IMPLEMENT|DEFER|REJECT registrada con justificación
    - Si DECISION == IMPLEMENT: follow-up task creado en deferred-items.md o como gap plan del propio Phase 137
  </done>
</task>

</tasks>

<verification>
1. Archivo markdown contiene sección "DECISION:"
2. Archivo JSON parseable
3. Si la decisión es IMPLEMENT, existe un follow-up registrado (plan nuevo o gap-log)
</verification>

<success_criteria>
- LEARN-09 cerrado como requirement (experimento documentado)
- No implementación prematura: la fusión queda fuera a menos que el experimento lo justifique
</success_criteria>

<output>
After completion, create `.planning/phases/137-learning-loops-memory-learn/137-05-SUMMARY.md`
</output>
