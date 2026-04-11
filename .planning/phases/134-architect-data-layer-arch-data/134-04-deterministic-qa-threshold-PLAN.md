---
phase: 134-architect-data-layer-arch-data
plan: 04
type: execute
wave: 3
depends_on:
  - "134-03"
files_modified:
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/services/catbot-pipeline-prompts.ts
  - app/src/lib/__tests__/intent-job-executor.test.ts
autonomous: false
requirements:
  - ARCH-DATA-06
must_haves:
  truths:
    - "runArchitectQALoop decide accept/revise/exhaust en código, NO leyendo qaReport.recommendation"
    - "La condición exacta es: data_contract_score >= 80 AND blockers.length === 0 → accept; else → revise (hasta exhaust)"
    - "blockers = qaReport.issues.filter(i => i.severity === 'blocker')"
    - "Los mismos scores producen siempre la misma decisión (determinismo verificable en tests unitarios)"
    - "CANVAS_QA_PROMPT actualizado para devolver data_contract_score además de quality_score"
    - "Tests unitarios cubren las 4 combinaciones: score≥80+no blockers→accept; score≥80+blockers→revise; score<80+no blockers→revise; score<80+blockers→revise"
    - "Retrocompat: si el LLM omite data_contract_score, fallback a quality_score (registro en log)"
  artifacts:
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "decideQaOutcome(qaReport) helper pure function + runArchitectQALoop usando la decisión código"
      contains: "decideQaOutcome"
    - path: "app/src/lib/services/catbot-pipeline-prompts.ts"
      provides: "CANVAS_QA_PROMPT actualizado con data_contract_score en output schema"
      contains: "data_contract_score"
    - path: "app/src/lib/__tests__/intent-job-executor.test.ts"
      provides: "Tests de determinismo + 4 combinaciones score/blockers"
  key_links:
    - from: "runArchitectQALoop (línea ~538)"
      to: "decideQaOutcome(qaReport)"
      via: "replace `if (qaReport.recommendation === 'accept')` con `if (decideQaOutcome(qaReport) === 'accept')`"
      pattern: "decideQaOutcome"
    - from: "CANVAS_QA_PROMPT output schema"
      to: "QaReport.data_contract_score field"
      via: "prompt declara el field, parser lee el field"
      pattern: "data_contract_score"
---

<objective>
Mover la decisión accept/revise/exhaust de `runArchitectQALoop` desde "leer qaReport.recommendation" (parseado del string del LLM) a código puro determinista: `data_contract_score >= 80 AND blockers.length === 0`. Este es el closure de ARCH-DATA-06.

El QA prompt seguirá recomendando una dirección (accept|revise|reject) porque es útil signal para el architect en la next iteration vía qa_report.recommendation, pero `runArchitectQALoop` YA NO confiará en ese campo — lo decide código. Esto garantiza que los mismos scores producen siempre la misma decisión (determinismo verificable en tests).

Purpose: Phase 136 es un gate VALIDATION que enruta fallos a la fase correcta. Si la decisión accept/revise vive en el string del prompt, el enrutamiento se vuelve probabilístico. Moverla a código hace el failure routing de Phase 136 reproducible.

Output:
- `decideQaOutcome(qaReport): 'accept' | 'revise'` como private static method en IntentJobExecutor (pura, sin side effects)
- `CANVAS_QA_PROMPT` actualizado para pedir `data_contract_score` (0-100) además de `quality_score`
- `runArchitectQALoop` usa la función en vez de leer `qaReport.recommendation`
- Tests unitarios con 4+ combinaciones verificando determinismo
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@app/src/lib/services/intent-job-executor.ts
@app/src/lib/services/catbot-pipeline-prompts.ts
@app/src/lib/__tests__/intent-job-executor.test.ts

<interfaces>
<!-- Actual QaReport shape (parsed from intent-job-executor.ts line 518) -->

interface QaReport {
  quality_score: number;       // 0-100 (existente)
  data_contract_score?: number; // 0-100 (NUEVO en Phase 134, optional para fallback)
  issues: Array<{
    severity: 'blocker' | 'major' | 'minor' | string;
    rule_id?: string;
    node_id?: string;
    description?: string;
    fix_hint?: string;
  }>;
  data_contract_analysis?: Record<string, string>;
  recommendation: 'accept' | 'revise' | 'reject';  // mantener en el prompt por utilidad para la NEXT iter, pero el loop NO decide con esto
}

<!-- Decision logic (codigo) -->

function decideQaOutcome(qa: QaReport): 'accept' | 'revise' {
  const score = typeof qa.data_contract_score === 'number'
    ? qa.data_contract_score
    : qa.quality_score;  // fallback retrocompat
  const blockers = Array.isArray(qa.issues)
    ? qa.issues.filter(i => (i.severity ?? '').toLowerCase() === 'blocker')
    : [];
  if (score >= 80 && blockers.length === 0) return 'accept';
  return 'revise';
}

<!-- Current consumer (lines 538-541 of intent-job-executor.ts) -->
if (qaReport.recommendation === 'accept') {
  return design;
}
// → becomes:
const outcome = IntentJobExecutor.decideQaOutcome(qaReport);
if (outcome === 'accept') {
  return design;
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Añadir decideQaOutcome + determinism tests (ARCH-DATA-06)</name>
  <files>
    app/src/lib/services/intent-job-executor.ts
    app/src/lib/__tests__/intent-job-executor.test.ts
  </files>
  <behavior>
    - Test 1 (determinism anchor): `decideQaOutcome({data_contract_score: 85, issues: []})` → 'accept'. Mismo input → mismo output (ejecutar 3 veces, compararlos con ===).
    - Test 2: `decideQaOutcome({data_contract_score: 80, issues: []})` → 'accept' (boundary inclusive).
    - Test 3: `decideQaOutcome({data_contract_score: 79, issues: []})` → 'revise' (boundary exclusive).
    - Test 4: `decideQaOutcome({data_contract_score: 90, issues: [{severity: 'blocker', description: 'x'}]})` → 'revise' (blocker override).
    - Test 5: `decideQaOutcome({data_contract_score: 90, issues: [{severity: 'major', description: 'x'}]})` → 'accept' (major no es blocker).
    - Test 6: `decideQaOutcome({data_contract_score: 50, issues: []})` → 'revise'.
    - Test 7 (fallback retrocompat): `decideQaOutcome({quality_score: 85, issues: []})` (sin data_contract_score) → 'accept'.
    - Test 8: `decideQaOutcome({quality_score: 70, issues: []})` → 'revise'.
    - Test 9: `decideQaOutcome({data_contract_score: 85, issues: [{severity: 'BLOCKER'}]})` → 'revise' (case-insensitive severity).
    - Test 10: `decideQaOutcome({data_contract_score: 85, issues: undefined as any})` → 'accept' (robust contra issues malformado).
    - Test 11: el LLM recomendó 'accept' pero los scores dicen 'revise' → el código IGNORA `recommendation` y decide 'revise'. Mock: `decideQaOutcome({data_contract_score: 50, issues: [], recommendation: 'accept'})` → 'revise'.
  </behavior>
  <action>
    1. En `intent-job-executor.ts`, añadir el método público-privado (accesible desde tests vía qaInternals wrapper existente):

       ```typescript
       /**
        * Phase 134 (ARCH-DATA-06): deterministic QA outcome decision.
        * The decision lives in code, NOT in qaReport.recommendation.
        * Same scores → same decision, always.
        *
        * Rules:
        *   - data_contract_score >= 80 AND no blockers → 'accept'
        *   - everything else → 'revise'
        *
        * Fallback: if data_contract_score is missing (retrocompat with older
        * reviewer output or degraded LLM response), use quality_score.
        */
       static decideQaOutcome(qa: QaReport): 'accept' | 'revise' {
         const score = typeof qa?.data_contract_score === 'number'
           ? qa.data_contract_score
           : typeof qa?.quality_score === 'number'
             ? qa.quality_score
             : 0;
         const issues = Array.isArray(qa?.issues) ? qa.issues : [];
         const blockers = issues.filter(i => {
           const sev = (i?.severity ?? '').toLowerCase();
           return sev === 'blocker';
         });
         if (score >= 80 && blockers.length === 0) return 'accept';
         return 'revise';
       }
       ```

    2. Actualizar el `QaReport` type (si existe) o el parse shape para incluir optional `data_contract_score`.

    3. Reemplazar en `runArchitectQALoop` (línea ~538):
       ```typescript
       if (qaReport.recommendation === 'accept') {
         return design;
       }
       ```
       por:
       ```typescript
       const qaOutcome = IntentJobExecutor.decideQaOutcome(qaReport);
       logger.info('intent-job-executor', 'QA outcome (deterministic)', {
         jobId: job.id,
         iteration: iter,
         score: qaReport.data_contract_score ?? qaReport.quality_score,
         blockers: Array.isArray(qaReport.issues) ? qaReport.issues.filter((i: { severity?: string }) => (i?.severity ?? '').toLowerCase() === 'blocker').length : 0,
         outcome: qaOutcome,
         llm_recommended: qaReport.recommendation, // for observability only
       });
       if (qaOutcome === 'accept') {
         return design;
       }
       ```

    4. Añadir al bloque de tests (dentro del describe del file existente) los 11 tests listados en <behavior>. Usar `IntentJobExecutor.decideQaOutcome(...)` directamente (es static public). Si los tests existentes accedían vía `qaInternals()`, añadir una suite nueva `describe('decideQaOutcome (Phase 134 ARCH-DATA-06)', () => { ... })` al top level.

    5. NO cambiar los mocks existentes del QA loop (tests ya usan `quality_score` y `recommendation: 'accept'`). La fallback retrocompat asegura que los tests viejos siguen verdes.

    6. CRÍTICO: verificar que los mocks existentes del QA loop en `intent-job-executor.test.ts` siguen en verde. Los mocks que pasan `{quality_score: 90, issues: [], recommendation: 'accept'}` → decideQaOutcome fallback a quality_score=90 → accept. Los mocks que pasan `{quality_score: 55, issues: [{severity:'blocker'}], recommendation: 'revise'}` → 55 < 80 → revise. Los mocks con `recommendation: 'reject'` → sin data_contract_score + bajo quality_score → revise. NOTA: el branch de reject del loop antiguo simplemente caía a revise — ahora siempre cae a revise hasta exhaust, mismo comportamiento efectivo.
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts</automated>
  </verify>
  <done>
    Los 11 tests nuevos de decideQaOutcome pasan. Los tests existentes de runArchitectQALoop siguen verdes. El log line "QA outcome (deterministic)" emerge en cada iteración con los 4 campos.
  </done>
</task>

<task type="auto">
  <name>Task 2: Actualizar CANVAS_QA_PROMPT para pedir data_contract_score</name>
  <files>
    app/src/lib/services/catbot-pipeline-prompts.ts
    app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
  </files>
  <action>
    1. Editar `CANVAS_QA_PROMPT` en `catbot-pipeline-prompts.ts`:

       - En la sección "RECOMENDACION", cambiar "'accept' si quality_score >= 80 Y ningun blocker" a:
         "'accept' si data_contract_score >= 80 Y ningun blocker (NOTA: la decision final la toma el code, no tu string — pero emite recommendation consistente para servir de señal al architect en la siguiente iteracion)"

       - En el schema JSON del output (antes: `"quality_score": 0-100,`), añadir:
         ```
         "quality_score": 0-100,
         "data_contract_score": 0-100,
         ```

       - Añadir una nota al final del prompt: "IMPORTANTE: `data_contract_score` mide específicamente la calidad de los contratos de datos (INPUT/OUTPUT coherencia entre nodos, R01/R10/R13). `quality_score` es el score global. La decisión accept/revise se basa en `data_contract_score >= 80 AND blockers.length === 0` — un `quality_score` alto NO salva un `data_contract_score` bajo."

    2. Verificar que `catbot-pipeline-prompts.test.ts` existente sigue verde. Si tiene snapshot del prompt, actualizar el snapshot.

    3. Añadir un test que verifique que `CANVAS_QA_PROMPT` contiene literalmente la string `data_contract_score`:
       ```typescript
       it('CANVAS_QA_PROMPT declares data_contract_score field (ARCH-DATA-06)', () => {
         expect(CANVAS_QA_PROMPT).toContain('data_contract_score');
       });
       ```
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/catbot-pipeline-prompts.test.ts</automated>
  </verify>
  <done>
    CANVAS_QA_PROMPT incluye `data_contract_score` en el schema del output y en la sección RECOMENDACION. Tests verdes.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Checkpoint — E2E audit del determinismo via test-pipeline.mjs</name>
  <files>app/scripts/test-pipeline.mjs (solo lectura — no se modifica)</files>
  <action>
    Ejecutar el gate tooling de Phase 133 contra el caso canónico Holded Q1 y verificar que (a) el log `QA outcome (deterministic)` aparece en cada iteración, (b) `qa_iter0` persistido contiene `data_contract_score`, y (c) dos runs consecutivos producen outcomes idénticos para los mismos scores (determinismo). Este checkpoint es la evidencia formal del éxito de Plan 04 contra LiteLLM real.
  </action>
  <what-built>
    decideQaOutcome vive en código como pure function; runArchitectQALoop decide accept/revise leyendo scores + blockers (no leyendo qaReport.recommendation); CANVAS_QA_PROMPT pide data_contract_score.
  </what-built>
  <how-to-verify>
    1. Rebuild docker:
       ```
       cd ~/docflow && docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app
       ```

    2. Correr test-pipeline contra el caso canónico:
       ```
       node app/scripts/test-pipeline.mjs --case holded-q1
       ```

    3. Verificar en docker logs que el log line determinista aparece:
       ```
       docker logs docflow-app 2>&1 | grep 'QA outcome (deterministic)' | tail -5
       ```
       Expected: líneas JSON con `score`, `blockers`, `outcome`, `llm_recommended`. Si `llm_recommended` != `outcome`, es evidencia empírica de que el determinismo-en-código corrigió una decisión del LLM.

    4. Verificar en `intent_jobs.qa_iter0` (persistido por FOUND-06) que el JSON devuelto por el reviewer contiene la key `data_contract_score`:
       ```
       node -e "const db=require('better-sqlite3')('data/catbot.db'); const row=db.prepare('SELECT qa_iter0 FROM intent_jobs WHERE qa_iter0 IS NOT NULL ORDER BY created_at DESC LIMIT 1').get(); console.log(JSON.parse(row.qa_iter0));"
       ```
       Expected: objeto con `data_contract_score: N` además de `quality_score`.

    5. Determinismo manual: ejecutar el test-pipeline 2 veces seguidas y comparar los logs "QA outcome (deterministic)" — dado el mismo input del architect, los outcomes deben ser idénticos (cross-run variance solo puede venir del LLM, no de nuestra lógica).

    6. Phase 134 verification (success criterion 4 de REQUIREMENTS.md): el comportamiento determinista debe ser verificable por unit tests. Los 11 tests nuevos de Task 1 son esta evidencia.
  </how-to-verify>
  <verify>
    <automated>docker logs docflow-app 2>&amp;1 | grep -q 'QA outcome (deterministic)' &amp;&amp; echo OK</automated>
  </verify>
  <done>
    Log `QA outcome (deterministic)` con {score, blockers, outcome, llm_recommended} visible en docker logs. qa_iter0 persistido contiene `data_contract_score` como número. 11 tests unitarios de decideQaOutcome verdes.
  </done>
  <resume-signal>Type "approved" si el log line "QA outcome (deterministic)" aparece, qa_iter0 contiene data_contract_score, y los tests unitarios son verdes. Describe el gap específico si algo falta.</resume-signal>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` verde (11 tests nuevos + existentes).
- `npx vitest run src/lib/__tests__/catbot-pipeline-prompts.test.ts` verde.
- docker logs muestran "QA outcome (deterministic)" tras correr test-pipeline.mjs.
- qa_iter0 persistido contiene `data_contract_score` como número.
</verification>

<success_criteria>
- [ ] `decideQaOutcome` existe como static method en IntentJobExecutor
- [ ] La decisión accept vive en código: `score >= 80 AND blockers.length === 0`
- [ ] runArchitectQALoop NO lee qaReport.recommendation para decidir (solo lo loggea como observabilidad)
- [ ] CANVAS_QA_PROMPT declara data_contract_score en el output schema
- [ ] 11 tests de decideQaOutcome verdes cubriendo las 4 combinaciones + boundary + fallback
- [ ] Determinismo verificable: mismos inputs → misma decisión (test anchors a `===`)
- [ ] Retrocompat: tests viejos con solo `quality_score` siguen verdes vía fallback
- [ ] Log line "QA outcome (deterministic)" emerge en docker logs con outcome vs llm_recommended
</success_criteria>

<output>
Crear `.planning/phases/134-architect-data-layer-arch-data/134-04-SUMMARY.md`
</output>