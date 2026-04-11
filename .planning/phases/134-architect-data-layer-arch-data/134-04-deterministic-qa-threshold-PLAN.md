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
  - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
  - app/data/knowledge/catflow.json
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
    - "El parse pipeline (parseJSON(rawLLM) → QaReport → decideQaOutcome) preserva data_contract_score end-to-end (test de integración)"
    - "knowledge tree catflow.json documenta canvas_connector_contracts y deterministic_qa_threshold para que CatBot pueda responder sobre estas features"
  artifacts:
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "decideQaOutcome(qaReport) helper pure function + runArchitectQALoop usando la decisión código"
      contains: "decideQaOutcome"
    - path: "app/src/lib/services/catbot-pipeline-prompts.ts"
      provides: "CANVAS_QA_PROMPT actualizado con data_contract_score en output schema"
      contains: "data_contract_score"
    - path: "app/src/lib/__tests__/intent-job-executor.test.ts"
      provides: "Tests de determinismo + 4 combinaciones score/blockers + integración parse→decide"
    - path: "app/src/lib/__tests__/catbot-pipeline-prompts.test.ts"
      provides: "Tests que verifican que CANVAS_QA_PROMPT declara data_contract_score"
    - path: "app/data/knowledge/catflow.json"
      provides: "Entradas de knowledge tree para canvas_connector_contracts y deterministic_qa_threshold"
      contains: "canvas_connector_contracts"
  key_links:
    - from: "runArchitectQALoop (línea ~538)"
      to: "decideQaOutcome(qaReport)"
      via: "replace `if (qaReport.recommendation === 'accept')` con `if (decideQaOutcome(qaReport) === 'accept')`"
      pattern: "decideQaOutcome"
    - from: "CANVAS_QA_PROMPT output schema"
      to: "QaReport.data_contract_score field"
      via: "prompt declara el field, parser lee el field"
      pattern: "data_contract_score"
    - from: "parseJSON(qaRaw) (intent-job-executor.ts:518)"
      to: "decideQaOutcome(qaReport).data_contract_score"
      via: "parseJSON returns object with all keys, cast preserves data_contract_score as optional field"
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
- Test de integración parse→decide que prueba que `data_contract_score` sobrevive el parseJSON pipeline
- knowledge tree `catflow.json` actualizado con conceptos nuevos accesibles a CatBot
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
@app/data/knowledge/catflow.json

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

<!-- Parse path (intent-job-executor.ts line 518) -->
// const qaReport = this.parseJSON(qaRaw) as QaReport;
// parseJSON returns a generic object; the cast is structural (TypeScript erased at runtime).
// Therefore if the LLM returns {"data_contract_score": N, ...} in the raw JSON string,
// JSON.parse preserves it and decideQaOutcome sees it. This MUST be verified by a test
// that feeds a raw JSON string through parseJSON → decideQaOutcome and asserts the score
// lands at === N (no silent drop).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Añadir decideQaOutcome + determinism tests + integration parse test (ARCH-DATA-06)</name>
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
    - **Test 12 (parse pipeline integration — BLOCKER 2 closure):** Dado un raw LLM JSON string `'{"quality_score": 90, "data_contract_score": 75, "issues": [], "recommendation": "accept"}'`, ejecutarlo a través del mismo code path que usa `runArchitectQALoop` (es decir: `IntentJobExecutor['parseJSON' as keyof typeof IntentJobExecutor](rawJson) as QaReport`, o un helper estático equivalente si parseJSON es privado — exponerlo vía `qaInternals()` wrapper si hace falta). Assertar explícitamente:
        a) `parsed.data_contract_score === 75` (el campo sobrevive el parseJSON — no es undefined, no es fallback a quality_score)
        b) `IntentJobExecutor.decideQaOutcome(parsed) === 'revise'` (75 < 80 → revise, confirmando que decideQaOutcome recibió data_contract_score=75 y NO el quality_score=90)
       Este test es el oráculo end-to-end: prueba que el campo fluye raw string → parseJSON → QaReport → decideQaOutcome sin silent drop. Si el parser perdiera data_contract_score, el test fallaría porque 90 ≥ 80 → 'accept'.
    - **Test 13 (parse pipeline integration, happy path):** Raw JSON `'{"quality_score": 70, "data_contract_score": 85, "issues": [], "recommendation": "revise"}'` → `parsed.data_contract_score === 85` y `decideQaOutcome(parsed) === 'accept'`. Confirma el inverso: el score alto del data_contract_score gana sobre el quality_score bajo.
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

    4. Añadir al bloque de tests (dentro del describe del file existente) los 13 tests listados en <behavior>. Usar `IntentJobExecutor.decideQaOutcome(...)` directamente (es static public). Si los tests existentes accedían vía `qaInternals()`, añadir una suite nueva `describe('decideQaOutcome (Phase 134 ARCH-DATA-06)', () => { ... })` al top level.

    5. **CRÍTICO para Tests 12-13 (BLOCKER 2 closure):** `parseJSON` es privado en IntentJobExecutor. Si `qaInternals()` existente no lo expone, EXTENDER `qaInternals()` (al final del file) para exportar también `parseJSON`:
       ```typescript
       export const qaInternals = {
         // ... existing exports ...
         parseJSON: (raw: string) => (IntentJobExecutor as unknown as { parseJSON: (s: string) => unknown }).parseJSON.call(IntentJobExecutor, raw),
       };
       ```
       Luego en Tests 12-13 usar: `const parsed = qaInternals.parseJSON(rawJson) as QaReport;` seguido de los asserts. Esto prueba el code path REAL (el mismo `parseJSON` que usa runArchitectQALoop en línea 518), no un mock.

    6. NO cambiar los mocks existentes del QA loop (tests ya usan `quality_score` y `recommendation: 'accept'`). La fallback retrocompat asegura que los tests viejos siguen verdes.

    7. CRÍTICO: verificar que los mocks existentes del QA loop en `intent-job-executor.test.ts` siguen en verde. Los mocks que pasan `{quality_score: 90, issues: [], recommendation: 'accept'}` → decideQaOutcome fallback a quality_score=90 → accept. Los mocks que pasan `{quality_score: 55, issues: [{severity:'blocker'}], recommendation: 'revise'}` → 55 < 80 → revise. Los mocks con `recommendation: 'reject'` → sin data_contract_score + bajo quality_score → revise. NOTA: el branch de reject del loop antiguo simplemente caía a revise — ahora siempre cae a revise hasta exhaust, mismo comportamiento efectivo.
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts</automated>
  </verify>
  <done>
    Los 13 tests nuevos de decideQaOutcome pasan (incluyendo Tests 12-13 que prueban el parse pipeline end-to-end). Los tests existentes de runArchitectQALoop siguen verdes. El log line "QA outcome (deterministic)" emerge en cada iteración con los 4 campos. BLOCKER 2 cerrado: `parseJSON(rawJson)` preserva `data_contract_score` verificado por test unitario contra el code path real.
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

    2. Verificar que `catbot-pipeline-prompts.test.ts` existente sigue verde. Si tiene snapshot del prompt, actualizar el snapshot. Si el file no existe aún, CREARLO con la estructura mínima de vitest (import + describe + it) antes de añadir el test nuevo.

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
    CANVAS_QA_PROMPT incluye `data_contract_score` en el schema del output y en la sección RECOMENDACION. Tests verdes. El file `catbot-pipeline-prompts.test.ts` existe y está listado en el frontmatter files_modified.
  </done>
</task>

<task type="auto">
  <name>Task 3: Actualizar knowledge tree catflow.json (CLAUDE.md protocol compliance)</name>
  <files>
    app/data/knowledge/catflow.json
  </files>
  <action>
    Phase 134 introduce features nuevas que CatBot debe poder explicar si el usuario pregunta. Per CLAUDE.md "Protocolo de Documentación: Knowledge Tree + CatBot", actualizar `app/data/knowledge/catflow.json`:

    1. Leer el file actual para ver su estructura (keys esperadas: `area`, `concepts`, `endpoints`, `tools`, `howto`, `dont`, `common_errors`, `sources`).

    2. Añadir al array `concepts[]` una entrada para `canvas_connector_contracts`:
       ```json
       {
         "key": "canvas_connector_contracts",
         "title": "Canvas Connector Contracts (Phase 134 ARCH-DATA)",
         "what": "Módulo estático que mapea cada tipo de connector (gmail, google_drive, mcp_server, smtp, http_api, n8n_webhook, email_template) a su lista de actions con required_fields/optional_fields. Vive en app/src/lib/services/canvas-connector-contracts.ts. Es la fuente de verdad de qué tools tiene disponible cada CatPaw — scanCanvasResources hace JOIN de cat_paw_connectors contra connectors y usa getConnectorContracts(type) para expandir cada connector a sus actions. El architect LLM recibe estas listas en el payload de entrada para no fabricar agentIds o tools inexistentes.",
         "where": "app/src/lib/services/canvas-connector-contracts.ts",
         "used_by": ["canvas-flow-designer.ts:scanCanvasResources", "intent-job-executor.ts:runArchitectQALoop"]
       }
       ```

    3. Añadir al array `concepts[]` una entrada para `deterministic_qa_threshold`:
       ```json
       {
         "key": "deterministic_qa_threshold",
         "title": "Deterministic QA Threshold (Phase 134 ARCH-DATA-06)",
         "what": "IntentJobExecutor.decideQaOutcome(qaReport) es una pure function que decide accept/revise en código, NO leyendo qaReport.recommendation del LLM. Regla exacta: data_contract_score >= 80 AND blockers.length === 0 → 'accept'; todo lo demás → 'revise'. Fallback retrocompat: si el LLM omite data_contract_score, usa quality_score. El objetivo es que los mismos scores produzcan siempre la misma decisión (determinismo verificable en unit tests) para que Phase 136 pueda enrutar fallos reproduciblemente.",
         "where": "app/src/lib/services/intent-job-executor.ts (decideQaOutcome static method)",
         "rule": "data_contract_score >= 80 AND blockers.length === 0 → accept",
         "used_by": ["runArchitectQALoop (línea ~538)"]
       }
       ```

    4. Añadir al array `concepts[]` una entrada para el shape enriquecido de `CanvasResources`:
       ```json
       {
         "key": "canvas_resources_enriched",
         "title": "Enriched CanvasResources shape (Phase 134 ARCH-DATA-01/04/05)",
         "what": "scanCanvasResources(db, {goal}) devuelve 4 keys que el architect LLM recibe en cada iteración: (1) catPaws[] con {paw_id, paw_name, paw_mode, tools_available[], skills[], best_for}; (2) connectors[] con {connector_id, connector_name, connector_type, contracts}; (3) canvas_similar[] top-3 filtrado por keywords del goal con {canvas_id, canvas_name, node_roles[], was_executed, note}; (4) templates[] desde canvas_templates con {template_id, name, mode, node_types[]}. Este payload fluye a runArchitectQALoop vía el parámetro resources y queda loggeado como `architect_input` en cada iter para auditoría.",
         "where": "app/src/lib/services/canvas-flow-designer.ts (scanCanvasResources)",
         "consumer": "app/src/lib/services/intent-job-executor.ts (runArchitectQALoop)"
       }
       ```

    5. Si existe `sources[]`, añadir:
       ```json
       ".planning/phases/134-architect-data-layer-arch-data/"
       ```

    6. Mantener el JSON válido (parseable): validar con `node -e "JSON.parse(require('fs').readFileSync('app/data/knowledge/catflow.json','utf8'))"` antes de terminar. Si ya existe una entry con el mismo `key`, reemplazarla en vez de duplicar.

    CLAUDE.md dice: "Los knowledge JSON se auto-sincronizan al volumen via docker-entrypoint.sh" — por lo tanto basta con commitear el file; el próximo rebuild lo propaga al contenedor y CatBot tendrá acceso inmediato via PromptAssembler.
  </action>
  <verify>
    <automated>node -e "const j=JSON.parse(require('fs').readFileSync('app/data/knowledge/catflow.json','utf8')); const keys=(j.concepts||[]).map(c=>c.key); if(!keys.includes('canvas_connector_contracts')||!keys.includes('deterministic_qa_threshold')||!keys.includes('canvas_resources_enriched')){process.exit(1)} console.log('OK')"</automated>
  </verify>
  <done>
    `app/data/knowledge/catflow.json` es JSON válido y contiene las 3 entradas nuevas en `concepts[]`. CatBot puede responder preguntas sobre canvas_connector_contracts, deterministic_qa_threshold y el shape enriquecido de CanvasResources vía PromptAssembler.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Checkpoint — E2E audit del determinismo via test-pipeline.mjs</name>
  <files>app/scripts/test-pipeline.mjs (solo lectura — no se modifica)</files>
  <action>
    Ejecutar el gate tooling de Phase 133 contra el caso canónico Holded Q1 y verificar que (a) el log `QA outcome (deterministic)` aparece en cada iteración, (b) `qa_iter0` persistido contiene `data_contract_score`, y (c) dos runs consecutivos producen outcomes idénticos para los mismos scores (determinismo). Este checkpoint es la evidencia formal del éxito de Plan 04 contra LiteLLM real.
  </action>
  <what-built>
    decideQaOutcome vive en código como pure function; runArchitectQALoop decide accept/revise leyendo scores + blockers (no leyendo qaReport.recommendation); CANVAS_QA_PROMPT pide data_contract_score; knowledge tree catflow.json actualizado.
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

    6. Phase 134 verification (success criterion 4 de REQUIREMENTS.md): el comportamiento determinista debe ser verificable por unit tests. Los 13 tests nuevos de Task 1 son esta evidencia (incluyendo Tests 12-13 que prueban el parse pipeline end-to-end).

    7. CatBot oracle (CLAUDE.md protocol): preguntar a CatBot "¿qué es deterministic_qa_threshold y cómo funciona?" — debe responder con la regla `data_contract_score >= 80 AND blockers.length === 0` referenciando intent-job-executor.ts. Si no puede responder, falta sync del volumen de knowledge (rebuild docker).
  </how-to-verify>
  <verify>
    <automated>docker logs docflow-app 2>&amp;1 | grep -q 'QA outcome (deterministic)' &amp;&amp; echo OK</automated>
  </verify>
  <done>
    Log `QA outcome (deterministic)` con {score, blockers, outcome, llm_recommended} visible en docker logs. qa_iter0 persistido contiene `data_contract_score` como número. 13 tests unitarios de decideQaOutcome verdes (incluyendo parse pipeline integration). CatBot puede responder sobre deterministic_qa_threshold vía knowledge tree.
  </done>
  <resume-signal>Type "approved" si el log line "QA outcome (deterministic)" aparece, qa_iter0 contiene data_contract_score, los tests unitarios son verdes, y CatBot responde coherentemente sobre la feature. Describe el gap específico si algo falta.</resume-signal>
</task>

</tasks>

<verification>
- `npx vitest run src/lib/__tests__/intent-job-executor.test.ts` verde (13 tests nuevos + existentes, incluyendo Tests 12-13 de parse pipeline).
- `npx vitest run src/lib/__tests__/catbot-pipeline-prompts.test.ts` verde.
- `app/data/knowledge/catflow.json` es JSON válido y contiene las 3 entradas nuevas.
- docker logs muestran "QA outcome (deterministic)" tras correr test-pipeline.mjs.
- qa_iter0 persistido contiene `data_contract_score` como número.
- CatBot responde sobre canvas_connector_contracts y deterministic_qa_threshold.
</verification>

<success_criteria>
- [ ] `decideQaOutcome` existe como static method en IntentJobExecutor
- [ ] La decisión accept vive en código: `score >= 80 AND blockers.length === 0`
- [ ] runArchitectQALoop NO lee qaReport.recommendation para decidir (solo lo loggea como observabilidad)
- [ ] CANVAS_QA_PROMPT declara data_contract_score en el output schema
- [ ] 13 tests de decideQaOutcome verdes cubriendo las 4 combinaciones + boundary + fallback + parse pipeline integration (Tests 12-13)
- [ ] Determinismo verificable: mismos inputs → misma decisión (test anchors a `===`)
- [ ] Retrocompat: tests viejos con solo `quality_score` siguen verdes vía fallback
- [ ] Log line "QA outcome (deterministic)" emerge en docker logs con outcome vs llm_recommended
- [ ] BLOCKER 2 closure: Tests 12-13 prueban que `parseJSON(rawJson)` preserva `data_contract_score` y decideQaOutcome lo consume (no silent drop)
- [ ] knowledge tree catflow.json contiene canvas_connector_contracts, deterministic_qa_threshold, canvas_resources_enriched (CLAUDE.md protocol)
</success_criteria>

<output>
Crear `.planning/phases/134-architect-data-layer-arch-data/134-04-SUMMARY.md`
</output>
