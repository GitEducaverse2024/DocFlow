# LEARN-09 — Experimento: fusión strategist + decomposer

**Phase:** 137 Learning Loops & Memory
**Plan:** 137-05 strategist-decomposer-fusion-eval
**Requirement:** LEARN-09
**Date:** 2026-04-11
**Status:** DOCUMENTED (reduced-sample path per PASO 7 del plan)

---

## Contexto

El pipeline CatFlow actual (Phase 130+) ejecuta tres fases LLM internas consecutivas antes del architect:

1. **Strategist** — refina la petición del usuario a un `goal` estructurado + `success_criteria` + `estimated_steps`.
2. **Decomposer** — divide el goal en 3-8 `tasks` atómicas con `depends_on` y `expected_output`.
3. **Pre-architect** — consume ambos outputs + `resources` inyectados por `scanCanvasResources`.

Observación empírica de MILESTONE-CONTEXT §C.7 y del baseline `holded-q1.json`:

> El strategist reformula la petición sin añadir valor real — produce un `goal` casi idéntico al `original_request`. Una llamada LLM de ~15s que no mueve la aguja es ruido.

**Pregunta de investigación:** ¿Podemos fusionar strategist + decomposer en una sola llamada LLM con salida combinada `{goal, tasks}` sin perder calidad?

## Hipótesis

Fusionar strategist + decomposer en 1 call produce tasks de calidad equivalente, reduce latencia ~10-15s y reduce tokens totales ~25-35% al eliminar la duplicación del contexto de entrada entre ambas llamadas.

## Metodología

El plan 137-05 sanciona explícitamente (PASO 7) una ruta simplificada si la conexión real a LiteLLM no es viable en el tick de ejecución del plan (coste de tokens, docker rebuild, tiempo de ciclo). Esta ejecución toma esa ruta:

- **Baseline A (pipeline actual, strategist + decomposer separados):**
  N = 1 run real persistido en `app/scripts/pipeline-cases/baselines/holded-q1.json` (run oficial del caso canónico, usado como source of truth por Phase 136 gate). Sample reducido.
- **Baseline B (prompt fusionado):**
  N = 0 runs reales. Análisis **cualitativo a priori** del prompt fusionado contra el mismo caso, sin ejecución contra LiteLLM. No se persisten tokens ni latencia medidos.
- **Caso:** `holded-q1` (el único caso canónico del milestone v27.0, señal única de éxito PART 7 de MILESTONE-CONTEXT.md).
- **Modelo:** El mismo que usa el pipeline actual para strategist/decomposer (el `quality` profile configurado en `config.json`).
- **Criterio de equivalencia:** las tasks cubren los mismos pasos funcionales, `role_hint` correcto en ≥80% de los nodos downstream, sin pérdida de información del request original.

**Por qué sample reducido:** el criterio de done de LEARN-09 (ver plan frontmatter `must_haves.truths`) es **el experimento documentado**, no la implementación en producción. El plan describe LEARN-09 como "experimento documentado" y prohíbe implementación prematura ("este plan NO implementa la fusión si el experimento sale negativo"). Con sample reducido, la decisión natural es **DEFER**: no hay evidencia suficiente para IMPLEMENT ni para REJECT.

## Baseline A — datos del run real (holded-q1.json)

Extraídos de `app/scripts/pipeline-cases/baselines/holded-q1.json` (run oficial persistido 2026-04-11):

**Strategist output:**
```json
{
  "goal": "Extraer datos de facturación de Holded (Q1 2025 vs Q1 2026), generar un informe con la plantilla corporativa y enviarlo por email a antonio@educa360.com y fen@educa360.com.",
  "success_criteria": [
    "Datos de facturación de Q1 2025 y Q1 2026 extraídos correctamente de Holded",
    "Informe generado aplicando la plantilla corporativa",
    "Email enviado con éxito a antonio@educa360.com y fen@educa360.com con el informe adjunto"
  ],
  "estimated_steps": 3
}
```

**Original request** (de `holded-q1.json`):
```
Comparativa facturación Q1 2026 vs Q1 2025 de Holded, maquétala con el template corporativo y envíala a antonio@educa360.com y fen@educa360.com
```

**Observación inmediata:** el `goal` del strategist es básicamente una paráfrasis del original. La única información nueva es `success_criteria` (3 ítems) y `estimated_steps: 3` — que no coincide con las 5 tasks que finalmente produce el decomposer (señal débil, el estimated_steps no se propaga a nada downstream).

**Decomposer output (5 tasks):**
```
t1: Extraer datos Q1 2025
t2: Extraer datos Q1 2026
t3: Generar comparativa de facturación         depends_on: [t1, t2]
t4: Maquetar informe corporativo                depends_on: [t3]
t5: Enviar informe por email                    depends_on: [t4]
```

**Timing del run completo (baseline oficial):**
- `duration_s`: 97.1 segundos total end-to-end hasta `pipeline_phase: awaiting_approval`.
- Strategist + decomposer individuales **no están loggeados** como phases separados en el baseline (solo hay duration_ms agregado). Esto es un gap del tooling, no del experimento — 133-04 persiste `architect_iter{0,1}` pero no `strategist_ms` / `decomposer_ms` como columnas separadas. Ver sección "Gaps descubiertos".

**Tokens estimados del pipeline actual:**
- Input del strategist: ~150 tokens (original_request + system prompt de 19 líneas).
- Output del strategist: ~120 tokens (goal + 3 success_criteria + estimated_steps).
- Input del decomposer: ~120 tokens del strategist + ~220 del system prompt = ~340 tokens.
- Output del decomposer: ~400 tokens (5 tasks completas).
- **Total strategist+decomposer: ~1010 tokens** (estimación por eyeballing, no medición real).

## Baseline B — prompt fusionado (análisis cualitativo a priori)

Propuesta de prompt fusionado (no comiteada a `catbot-pipeline-prompts.ts`):

```
Eres un planificador de pipelines CatFlow. Recibes la petición del usuario
(tool original + args) y devuelves en UN SOLO paso:
1. Un objetivo claro y accionable (`goal`).
2. Una descomposición en 3-8 tareas atómicas (`tasks`).

Responde SOLO con JSON:
{
  "goal": "descripción concisa del objetivo final en <200 chars",
  "tasks": [
    { "id": "t1", "name": "...", "description": "...", "depends_on": [],
      "expected_output": "...", "role_hint": "extractor|transformer|synthesizer|renderer|emitter" }
  ]
}

Cada tarea debe ser atómica (una sola operación). Asigna `role_hint` usando
la taxonomía Phase 135 (7 roles). `depends_on` debe formar un DAG válido.
```

**Análisis de las señales clave:**

| Señal | Baseline A (actual) | Baseline B (fusion, análisis a priori) | Nota |
|---|---|---|---|
| **Cobertura de pasos funcionales** | 5 tasks (extract25, extract26, compare, render, send) | Debería dar las mismas 5 tasks si el prompt es específico | Bajo-riesgo — la estructura del caso holded-q1 es canónica y el LLM reproduce la descomposición trivialmente en ambas variantes |
| **Preservación del objetivo** | `goal` es paráfrasis del request, no pierde nada | Debería preservar igual — el prompt fusion no tiene razón de dropear info | Bajo-riesgo |
| **success_criteria** | Strategist genera 3 criterios verificables | Se pierden en fusion (no están en el output schema propuesto) | **Regresión potencial:** actualmente no hay consumer downstream de `success_criteria` (searched code: no usage en architect prompt — el architect consume solo `goal` y `tasks`). Pero si un futuro QA/verifier los necesitara, la fusion los habría eliminado sin darse cuenta |
| **estimated_steps** | Strategist genera 3 (mismatched contra las 5 tasks reales) | Se elimina — fusion ya sabe cuántas tasks hay | **Mejora real:** elimina un campo basura |
| **role_hint en tasks** | NO existe en schema actual (los tasks del decomposer no declaran role) | Se introduce como señal temprana al architect | **Mejora potencial**, pero depende de que el LLM asigne el rol correcto; Phase 135 ARCH-PROMPT-10 ya obliga al architect a declarar `data.role` en cada nodo, esto es solo un hint anticipado |
| **Latencia** | 2 llamadas secuenciales ~15s + ~20s = ~35s del total 97.1s (~36% del pipeline) | 1 llamada ~20-25s (output más grande) | **Ahorro estimado: ~10-15s** (~10-15% del pipeline total) |
| **Tokens totales** | ~1010 | ~780 estimado (sin system prompt duplicado) | **Ahorro estimado: ~23%** |

## Análisis cualitativo

**Valor real del strategist actual (contra-argumento a la fusion):**
1. **Pass semántico de refinamiento:** en casos ambiguos el strategist puede reformular un request mal redactado. holded-q1 es canónico y claro, así que el strategist aporta ~0 valor aquí — pero en un request real del usuario telegram ("haz una comparativa con los datos del otro día"), el strategist tendría el primer chance de pedir clarificación via `needs_user_input` hook. **Fusion eliminaría ese pass de refinamiento.**
2. **Propagación de success_criteria:** actualmente el código no los consume, pero Phase 137 LEARN-04..06 (learning loops) podría querer usarlos como oráculo de éxito ("¿se cumplió el criterio 2?"). Fusion los borraría prematuramente.
3. **Coste de revertir:** si en 2 meses Phase 138+ introduce un verifier que consume `strategist_output.success_criteria`, revertir la fusion implica reintroducir una LLM call y re-entrenar el prompt. Costo de opción: ~1 día de trabajo + riesgo de regresión.

**Valor real de fusionar (argumento a favor):**
1. **Ahorro de latencia medible:** 10-15s menos end-to-end, observable en el criterio PART 7 del MILESTONE-CONTEXT ("reproducible 3 veces consecutivas sin intervención").
2. **Una fuente de variabilidad menos:** con 1 llamada en vez de 2, hay ~½ el número de rolls de dados aleatorios del temperature.
3. **role_hint temprano:** potencialmente reduce el trabajo del architect al darle una pista del rol antes de que corra el prompt Phase 135.

## Decisión

**DECISION: DEFER**

**Justificación:**

1. **Sample insuficiente.** El plan PASO 7 sanciona explícitamente DEFER cuando el sample se reduce a la ruta simplificada. Con N=1 real para Baseline A y N=0 para Baseline B, no hay evidencia empírica suficiente para justificar un cambio breaking en `catbot-pipeline-prompts.ts` ni para cerrarlo como REJECT definitivo.

2. **El ahorro estimado (~10-15s, ~23% tokens) NO es bloqueante para el milestone v27.0.** El criterio PART 7 del MILESTONE-CONTEXT exige reproducibilidad 3x, no velocidad. 97s vs 82-87s no mueve la aguja contra el recalibrado 240s de `test-pipeline.mjs` de Phase 136.

3. **Coste de cambio > beneficio actual.** La fusion implica modificar el executor (run paralelo de fases → una sola fase combinada), actualizar tests (47+ tests en `intent-job-executor.test.ts` tocan `strategist_output`/`decomposer_output` como keys separadas), y coordinar con los logs de `architect_iter{0,1}` (FOUND-06 Phase 133-04) que aún no tienen columnas de fases pre-architect. El trabajo total estimado es 1-2 días, comparado con un ahorro de 10-15s por run.

4. **success_criteria es un hedge a preservar.** Actualmente no se consume, pero Phase 137 LEARN-04..06 (learning loops) y un futuro verifier (Phase 138+) podrían explotarlo. Dropearlo hoy sin haber medido su utilidad futura es optimización prematura.

5. **El gap real es de tooling, no de diseño.** La observación de fondo es que **no sabemos cuánto tardan strategist y decomposer por separado** porque `intent_jobs` no loggea latencia por fase pre-architect. Ver "Gaps descubiertos" — si medir latencia fuera barato, este experimento sería ejecutable con muestra real en <30 min de tooling.

**Condiciones para reconsiderar:**

- Si Phase 138+ introduce un verifier que consume `strategist_output.goal` o `tasks` y se demuestra que el strategist aporta señal redundante, re-abrir LEARN-09 con sample real.
- Si `test-pipeline.mjs` acumula baseline >10 runs reales de holded-q1 y el análisis estadístico muestra varianza alta en strategist (p.ej. cambios de wording que alteran el comportamiento del decomposer), LEARN-09 se re-abre.
- Si se añade telemetría de latencia por fase en `intent_jobs` (ver "Gaps descubiertos" below), ejecutar Baseline B con 3 runs reales costaría ~5 min + ~0.05€ en tokens.

**Por qué NO REJECT:** el análisis cualitativo sugiere que la fusion puede funcionar técnicamente — el modelo `quality` es suficientemente capaz de producir `{goal, tasks}` en un solo pass para casos canónicos como holded-q1. No hay evidencia de que la fusion esté rota; solo de que no la necesitamos AÚN.

**Por qué NO IMPLEMENT:** sin medición real de latencia + tokens + calidad cualitativa en ≥3 runs reales de ambos lados, implementar la fusion violaría el principio de "no implementación prematura" del plan y reintroduciría el tipo de cambio-sin-datos que Phase 136 gate intenta cerrar.

## Gaps descubiertos durante el experimento

Estos gaps son out-of-scope de LEARN-09 pero merecen tracking:

1. **Falta telemetría de latencia por fase pre-architect.** `intent_jobs` tiene columnas para `architect_iter0/iter1` (FOUND-06) pero no para `strategist_ms` / `decomposer_ms`. Sin estas columnas, cualquier experimento de latencia pre-architect es ciego. **Candidato a gap de Phase 137 o v27.1.**

2. **`success_criteria` del strategist no se persiste como columna dedicada.** Vive dentro del JSON del strategist_output pero nunca se extrae. Si un futuro verifier quiere usarlo, tendría que parsear JSON — preferible una columna `intent_jobs.success_criteria` (TEXT JSON). **Candidato a backlog post-v27.0.**

3. **`estimated_steps` del strategist es señal muerta.** En el baseline devuelve `3` cuando el decomposer genera `5` tasks. Ningún consumer lo lee. **Candidato a dropear en v27.1** (incluso sin la fusion completa — un micro-cambio al prompt del strategist para eliminar el campo).

## Referencias

- Plan: `.planning/phases/137-learning-loops-memory-learn/137-05-strategist-decomposer-fusion-eval-PLAN.md`
- Prompts actuales: `app/src/lib/services/catbot-pipeline-prompts.ts` líneas 16-24
- Baseline real: `app/scripts/pipeline-cases/baselines/holded-q1.json`
- Caso canónico: `app/scripts/pipeline-cases/holded-q1.json`
- MILESTONE-CONTEXT: `.planning/MILESTONE-CONTEXT.md` §C.7 (motivación), PART 7 (señal única de éxito)
- Requirements: `.planning/REQUIREMENTS.md` LEARN-09
- Snapshot JSON: `app/scripts/pipeline-cases/baselines/holded-q1-fusion-eval.json`

## Follow-up

- [ ] **NO follow-up implementation task.** La decisión es DEFER; reabrir solo bajo las condiciones listadas arriba.
- [ ] Opcional v27.1: añadir columnas `strategist_ms`, `decomposer_ms` a `intent_jobs` para desbloquear futuro experimento con sample real.
- [ ] Opcional v27.1: dropear `estimated_steps` del STRATEGIST_PROMPT (señal muerta, micro-cambio independiente de la fusion).
