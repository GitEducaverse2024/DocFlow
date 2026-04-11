---
phase: 135-architect-prompt-layer-arch-prompt
plan: 03
type: execute
wave: 3
depends_on: ["135-01", "135-02"]
files_modified:
  - app/src/lib/services/catbot-pipeline-prompts.ts
  - app/src/lib/services/intent-job-executor.ts
  - app/src/lib/__tests__/catbot-pipeline-prompts.test.ts
  - app/src/lib/__tests__/intent-job-executor.test.ts
autonomous: true
requirements:
  - ARCH-PROMPT-11
  - ARCH-PROMPT-12
  - ARCH-PROMPT-13
  - ARCH-PROMPT-14
must_haves:
  truths:
    - "CANVAS_QA_PROMPT instructs the reviewer to read data.role from each node BEFORE applying any rule"
    - "CANVAS_QA_PROMPT says R10 applies ONLY to nodes with role in {transformer, synthesizer} and NEVER to terminal/emitter/guard/reporter nodes"
    - "CANVAS_QA_PROMPT output schema includes instruction_quality_score and each issue carries {severity, scope, rule_id, node_id, node_role, description, fix_hint}"
    - "runArchitectQALoop calls validateCanvasDeterministic with active catPaw and connector id sets built from catbotDb BEFORE calling the QA LLM"
    - "When the validator returns ok:false, runArchitectQALoop feeds a synthetic QaReport with recommendation:'reject' (mapped to revise by decideQaOutcome) into the next iteration WITHOUT calling the QA LLM"
    - "Four new unit tests in intent-job-executor.test.ts pass: (a) emitter without R10, (b) transformer dropping fields -> R10 blocker -> revise, (c) exhaustion notifyProgress top-2 issues spy, (d) validator rejects unknown agentId without LLM call"
    - "All existing catbot-pipeline-prompts and intent-job-executor tests stay green (mocks updated to new schema where needed)"
  artifacts:
    - path: "app/src/lib/services/catbot-pipeline-prompts.ts"
      provides: "CANVAS_QA_PROMPT rewritten role-aware with new issue schema"
      contains: "CANVAS_QA_PROMPT"
    - path: "app/src/lib/services/intent-job-executor.ts"
      provides: "validateCanvasDeterministic wired into runArchitectQALoop before QA LLM call"
      contains: "validateCanvasDeterministic"
    - path: "app/src/lib/__tests__/intent-job-executor.test.ts"
      provides: "4 new ARCH-PROMPT-13 tests"
      contains: "ARCH-PROMPT-13"
  key_links:
    - from: "intent-job-executor.ts runArchitectQALoop"
      to: "canvas-flow-designer.ts validateCanvasDeterministic"
      via: "import + call right after architect parse, before QA callLLM"
      pattern: "validateCanvasDeterministic\\("
    - from: "intent-job-executor.ts"
      to: "catbotDb"
      via: "prepared statements to read active cat_paws + connectors id sets"
      pattern: "cat_paws WHERE is_active"
    - from: "CANVAS_QA_PROMPT"
      to: "ROLE_TAXONOMY"
      via: "prompt enumerates the 7 roles and scopes R10 to transformer/synthesizer"
      pattern: "transformer.*synthesizer"
---

<objective>
Close ARCH-PROMPT-11..14: rewrite `CANVAS_QA_PROMPT` to be role-aware (R10 only on transformer/synthesizer), extend the reviewer output schema with `instruction_quality_score` and per-issue `scope` + `node_role`, wire `validateCanvasDeterministic` into `runArchitectQALoop` as the token-saving pre-LLM gate, and add the 4 new unit tests required by ARCH-PROMPT-13 plus update existing mocks to the new reviewer schema (ARCH-PROMPT-14).

Purpose: This plan is where Phase 134's data layer + Phase 135-01's validator + Phase 135-02's architect prompt come together. Without role-aware QA the architect's `data.role` declarations are inert; without the validator the LLM still gets called on invalid canvases; without the new tests the acceptance criteria 1 of Phase 135 fails.
Output: Updated prompts, wired validator, 4 new tests green, whole intent-job-executor.test.ts + catbot-pipeline-prompts.test.ts suites green.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/135-architect-prompt-layer-arch-prompt/135-01-role-taxonomy-and-validator-PLAN.md
@.planning/phases/135-architect-prompt-layer-arch-prompt/135-02-architect-prompt-rewrite-PLAN.md
@app/src/lib/services/catbot-pipeline-prompts.ts
@app/src/lib/services/intent-job-executor.ts
@app/src/lib/services/canvas-flow-designer.ts
@app/src/lib/__tests__/intent-job-executor.test.ts
@app/src/lib/__tests__/catbot-pipeline-prompts.test.ts

<interfaces>
From plan 135-01 (wave 1, canvas-flow-designer.ts exports):
```typescript
export const ROLE_TAXONOMY: readonly ['extractor','transformer','synthesizer','renderer','emitter','guard','reporter'];
export function validateCanvasDeterministic(
  input: { nodes: Array<{id,type,data?:{agentId?,connectorId?}}>, edges: Array<{source,target}> },
  active: { activeCatPaws: Set<string>, activeConnectors: Set<string> },
): { ok: true } | { ok: false, recommendation: 'reject', issues: Array<{severity:'blocker',rule_id:'VALIDATOR',node_id:string|null,description:string}> };
```

From intent-job-executor.ts (current):
- Line 423: `private static async runArchitectQALoop(job, goal, tasks, resources)`
- Lines 481-485: architect callLLM + parseJSON
- Lines 544-551: needs_cat_paws short-circuit (KEEP — do not disturb)
- Lines 553-565: QA callLLM — this is where we inject the validator BEFORE the callLLM
- Line 570: `IntentJobExecutor.decideQaOutcome(qaReport)` — MUST keep determinism; validator rejection maps to `recommendation:'reject'` which decideQaOutcome treats as not-accept
- Lines 651-655: exhaustion extractTop2Issues + notifyProgress(force=true) — already exists (Phase 133 FOUND-10), test (c) just spies on it
- Line 793: `private static async callLLM(systemPrompt, userInput)` — tests mock this via `(IntentJobExecutor as any).callLLM = vi.fn(...)` patterns already used

Active-rows queries (catbotDb):
```typescript
import { catbotDb } from '@/lib/services/catbot-db'; // or wherever it's imported in this file
const catPawRows = catbotDb.prepare('SELECT id FROM cat_paws WHERE is_active = 1').all() as Array<{id:string}>;
const connectorRows = catbotDb.prepare('SELECT id FROM connectors WHERE is_active = 1').all() as Array<{id:string}>;
```
Verify the actual import symbol by grepping intent-job-executor.ts top imports before writing.

From catbot-pipeline-prompts.ts existing CANVAS_QA_PROMPT (lines 75-117): to be REPLACED wholesale. Keep the `{{RULES_INDEX}}` placeholder.

Existing QaReport shape in intent-job-executor.ts (line ~55-64): `{ quality_score, data_contract_score, issues: [{severity, rule_id, node_id, description, fix_hint}], recommendation, data_contract_analysis? }`. The new schema adds `instruction_quality_score` and each issue gets `scope` + `node_role`. BACKWARD COMPAT mandatory: decideQaOutcome already falls back to quality_score when data_contract_score missing (Phase 134 Plan 04) — KEEP that. Do not break the existing 47 intent-job-executor tests.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rewrite CANVAS_QA_PROMPT role-aware + extend QaReport type + prompt tests</name>
  <files>app/src/lib/services/catbot-pipeline-prompts.ts, app/src/lib/services/intent-job-executor.ts, app/src/lib/__tests__/catbot-pipeline-prompts.test.ts</files>
  <behavior>
    New tests in catbot-pipeline-prompts.test.ts (describe `CANVAS_QA_PROMPT v135 (ARCH-PROMPT-11..12)`):
    - Prompt contains the literal string 'data.role' and instructs reviewer to READ it before applying rules
    - Prompt contains a phrase restricting R10 to {transformer, synthesizer} and explicitly exempting emitter/guard/reporter/renderer from R10
    - Output schema section of the prompt mentions: quality_score, data_contract_score, instruction_quality_score, issues[].severity, issues[].scope, issues[].rule_id, issues[].node_id, issues[].node_role, issues[].description, issues[].fix_hint, recommendation
    - {{RULES_INDEX}} placeholder preserved
    - All 7 roles from ROLE_TAXONOMY appear in the prompt

    QaReport type extended in intent-job-executor.ts to optionally include `instruction_quality_score?: number` and each issue gets optional `scope?: string` and `node_role?: string`. Existing 47 tests MUST stay green (fields are additive + optional).
  </behavior>
  <action>
1. **Replace CANVAS_QA_PROMPT** in `app/src/lib/services/catbot-pipeline-prompts.ts` (lines 75-117) with a role-aware version. Draft:

```
Eres el Canvas QA Reviewer role-aware. Auditas un canvas_proposal del architect contra las reglas de diseño. Tu principio rector: **lee `data.role` de cada nodo ANTES de aplicar cualquier regla** — R10 y varias otras son condicionales al rol funcional.

REGLAS DE DISEÑO (con scope por rol en [scope:...]):
{{RULES_INDEX}}

Taxonomía de roles (idéntica a la del architect):
extractor | transformer | synthesizer | renderer | emitter | guard | reporter

## Algoritmo de revisión (orden obligatorio)

Para cada nodo del `canvas_proposal.flow_data.nodes[]`:
1. Lee `node.data.role`. Si falta o no está en la taxonomía → emite issue `blocker` rule_id='R_ROLE_MISSING' node_role=null.
2. Determina si el nodo es terminal (sin edges outgoing). Los nodos terminales con role ∈ {emitter, reporter} NUNCA reciben R10.
3. Aplica SOLO las reglas cuyo `[scope:...]` incluye el role del nodo, más las universales (las que no tienen scope).
4. **R10 (preserva-campos) aplica SOLO a role ∈ {transformer, synthesizer}**. Si el nodo es emitter/guard/reporter/renderer/extractor, NO emitas R10 aunque las instrucciones no mencionen "preserva todos los campos". Esto es crítico: un falso positivo de R10 en un emitter bloquea el caso holded-q1.
5. R15 aplica a {transformer, synthesizer, renderer}. R02 aplica a {extractor, transformer} cuando producen arrays. SE01 aplica a emitter. Las demás reglas sin scope se aplican a todos.
6. Valida la cadena de datos entre nodos consecutivos (OUTPUT del N coincide con INPUT del N+1 por nombre canónico, R13 — universal).
7. Recoge issues y asigna `severity`:
   - blocker: fallo garantizado en runtime o output vacío/incorrecto
   - major: alta probabilidad de fallo
   - minor: mejora no crítica
   Cada issue además incluye `scope` (literal del rules index para la regla, ej. 'transformer,synthesizer' o 'universal') y `node_role` (el role del nodo afectado, o null si el issue no es por nodo).

## Scoring
- `data_contract_score` (0-100): mide calidad de contratos INPUT/OUTPUT entre nodos (R01/R10/R13). Un solo R10 legítimo en un transformer ⇒ score < 80.
- `instruction_quality_score` (0-100): mide claridad de las instructions de cada nodo (estructura INPUT/PROCESO/OUTPUT, mención de tools por nombre, campos específicos declarados).
- `quality_score` (0-100): score global legacy (mantenido por compat).

## Recomendación
- 'accept' si data_contract_score >= 80 Y ningún blocker.
- 'revise' si hay blockers o data_contract_score < 80 pero el diseño es rescatable.
- 'reject' si el diseño no se puede rescatar (NOTA: la decisión final accept/revise la toma el código via decideQaOutcome; tu recommendation sirve al architect como señal en la iteración siguiente).

## Output (SOLO JSON)
{
  "quality_score": 0-100,
  "data_contract_score": 0-100,
  "instruction_quality_score": 0-100,
  "issues": [
    {
      "severity": "blocker|major|minor",
      "scope": "transformer,synthesizer | universal | emitter | ...",
      "rule_id": "R10|R01|SE01|R_ROLE_MISSING|...",
      "node_id": "n3",
      "node_role": "transformer|emitter|null",
      "description": "Descripción corta",
      "fix_hint": "Cambio concreto sugerido (2 líneas max)"
    }
  ],
  "data_contract_analysis": { "n1->n2": "ok | broken: razón" },
  "recommendation": "accept | revise | reject"
}

IMPORTANTE:
- Un emitter o un nodo terminal NUNCA debe recibir R10.
- Si detectas `data.role` ausente en cualquier nodo, el issue es blocker y suficiente para recomendar 'revise'.
- data_contract_score alto no salva blockers (la decisión accept/revise vive en código: data_contract_score>=80 AND blockers===0).
```

2. **Extend QaReport type** in `intent-job-executor.ts` (around line 55-64). Add optional fields without breaking existing mocks:
```ts
interface QaReport {
  quality_score: number;
  data_contract_score?: number;
  instruction_quality_score?: number; // NEW — ARCH-PROMPT-12
  issues?: Array<{
    severity?: string;
    rule_id?: string;
    node_id?: string;
    node_role?: string;  // NEW — ARCH-PROMPT-12
    scope?: string;      // NEW — ARCH-PROMPT-12
    description?: string;
    fix_hint?: string;
  }>;
  data_contract_analysis?: Record<string, string>;
  recommendation?: string;
}
```
Verify first by grepping the current definition; adapt exact location. Do NOT rename fields. The new fields are OPTIONAL — existing tests that build QaReport objects without them must keep compiling.

3. **Add prompt tests** to `catbot-pipeline-prompts.test.ts` matching the behavior list (use import of `CANVAS_QA_PROMPT` and `ROLE_TAXONOMY`).

4. Run both test files. catbot-pipeline-prompts.test.ts: all green (existing 18 + plan-02 new ~12 + new ~6 here). intent-job-executor.test.ts: still 47 green (type extension is additive-optional).

Constraints:
- Do NOT modify canvas-executor.ts
- Do NOT touch ARCHITECT_PROMPT (plan 02)
- Keep `{{RULES_INDEX}}` placeholder (intent-job-executor replaces it at render-time on line 431)
- Use `process['env']` bracket notation if adding env access (not expected)
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/catbot-pipeline-prompts.test.ts src/lib/__tests__/intent-job-executor.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>CANVAS_QA_PROMPT rewritten with role-aware checklist, R10 scoped to transformer/synthesizer, new output schema with instruction_quality_score + scope + node_role; QaReport type extended with optional fields; all catbot-pipeline-prompts tests green; existing 47 intent-job-executor tests still green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire validateCanvasDeterministic into runArchitectQALoop + 4 new ARCH-PROMPT-13 tests</name>
  <files>app/src/lib/services/intent-job-executor.ts, app/src/lib/__tests__/intent-job-executor.test.ts</files>
  <behavior>
    Four new tests in intent-job-executor.test.ts (describe `runArchitectQALoop — ARCH-PROMPT-13`):

    **(a) emitter without R10 → reviewer not asked for R10, outcome accept**
    - Mock callLLM: 1st call (architect) returns a canvas with a renderer+emitter pair where the emitter has role:'emitter' and instructions without R10 language. 2nd call (QA reviewer) returns `{quality_score:90, data_contract_score:92, issues:[], recommendation:'accept'}`.
    - Mock validateCanvasDeterministic via dependency injection OR stub the DB active-sets builder to return sets containing the referenced ids.
    - Assert: decideQaOutcome returns 'accept'; no R10 issue raised; qa_outcome log line shows outcome='accept'; loop returned the design.

    **(b) transformer that drops fields → reviewer emits R10 blocker → outcome revise**
    - Mock callLLM: architect returns canvas with a `transformer` node whose instructions don't preserve all input fields. QA returns `{quality_score:70, data_contract_score:55, issues:[{severity:'blocker', rule_id:'R10', node_id:'n2', node_role:'transformer', scope:'transformer,synthesizer', description:'drops campo_x', fix_hint:'add preserva todos los campos'}], recommendation:'revise'}`.
    - Assert: decideQaOutcome returns 'revise'; loop goes into iter 1 (or exhausts if mock only provides 2 iters); R10 blocker is in qaReport.issues.

    **(c) exhaustion → notifyProgress called with top-2 issues (spy)**
    - Mock callLLM: both iterations return QA with blockers (score < 80) → loop exhausts.
    - Spy on `IntentJobExecutor.notifyProgress` (or whatever the private method is — tests already spy on it per intent-job-executor.test.ts patterns).
    - Assert: after MAX_QA_ITERATIONS, notifyProgress was called with `force=true` and a message containing at least one blocker description from the top-2 issues (reuse extractTop2Issues, already exists from FOUND-10).

    **(d) validator rejects canvas with unknown agentId → no QA LLM call**
    - Mock callLLM for architect only (returns a canvas with `agentId:'ghost-slug'`).
    - Active catPaw set: `new Set(['real-uuid'])`. Active connector set: empty OK.
    - Spy on callLLM count. After the architect callLLM returns, the validator runs and rejects. Assert: (i) callLLM was called exactly ONCE total across the iteration (architect), NOT twice — QA reviewer not invoked; (ii) the synthetic QaReport with recommendation:'reject' propagates as previousQaReport into iter 1; (iii) if both iterations fail validator, loop exhausts with notifyProgress called with validator reasons.

    Existing 47 tests stay green.
  </behavior>
  <action>
1. **Import validator** at the top of `intent-job-executor.ts`:
```ts
import { validateCanvasDeterministic, type ValidateCanvasResult } from './canvas-flow-designer';
```
(plus catbotDb if not already imported at module scope — grep first)

2. **Add helper** to build active sets (near other private statics, around line 793):
```ts
private static buildActiveSets(): { activeCatPaws: Set<string>, activeConnectors: Set<string> } {
  try {
    const paws = (catbotDb.prepare('SELECT id FROM cat_paws WHERE is_active = 1').all() as Array<{id:string}>).map(r => r.id);
    const conns = (catbotDb.prepare('SELECT id FROM connectors WHERE is_active = 1').all() as Array<{id:string}>).map(r => r.id);
    return { activeCatPaws: new Set(paws), activeConnectors: new Set(conns) };
  } catch (err) {
    logger.warn('intent-job-executor', 'buildActiveSets failed — validator will reject everything', { error: String(err) });
    return { activeCatPaws: new Set(), activeConnectors: new Set() };
  }
}
```
Expose as test-reachable via the same `as unknown as DecideQaExec` trick already used in the test file for decideQaOutcome (see STATE.md note about qaInternals pattern).

3. **Wire into runArchitectQALoop** AFTER the needs_cat_paws short-circuit (currently line 551) and BEFORE the QA callLLM (currently line 555). Insert:

```ts
// Phase 135 ARCH-PROMPT-10: deterministic pre-LLM gate.
const activeSets = IntentJobExecutor.buildActiveSets();
const validation: ValidateCanvasResult = validateCanvasDeterministic(
  (design?.flow_data ?? { nodes: [], edges: [] }) as any,
  activeSets,
);
if (!validation.ok) {
  logger.info('intent-job-executor', 'Validator rejected canvas (pre-LLM gate)', {
    jobId: job.id,
    iteration: iter,
    issue_count: validation.issues.length,
    first_issue: validation.issues[0]?.description,
  });
  // Synthesize a QaReport-compatible object so the rest of the loop behaves
  // identically to an LLM-rejected iteration. decideQaOutcome will return
  // 'revise' (data_contract_score=0, blockers>0) and the loop advances.
  const syntheticQa: QaReport = {
    quality_score: 0,
    data_contract_score: 0,
    issues: validation.issues.map(i => ({
      severity: 'blocker' as const,
      rule_id: i.rule_id,
      node_id: i.node_id ?? undefined,
      description: i.description,
      fix_hint: `Fix validator issue: ${i.description}`,
    })),
    recommendation: 'reject',
  };
  // Persist as qa_iter{N} raw so FOUND-06 post-mortem still works.
  if (iter === 0) updateIntentJob(job.id, { qa_iter0: JSON.stringify(syntheticQa) });
  else if (iter === 1) updateIntentJob(job.id, { qa_iter1: JSON.stringify(syntheticQa) });

  const qaOutcome = IntentJobExecutor.decideQaOutcome(syntheticQa);
  logger.info('intent-job-executor', 'QA outcome (deterministic)', {
    jobId: job.id,
    iteration: iter,
    score: 0,
    blockers: syntheticQa.issues?.length ?? 0,
    outcome: qaOutcome,
    llm_recommended: 'reject',
    source: 'validator',
  });
  // Skip the QA LLM call this iteration. Feed synthetic report to next iter as feedback.
  previousDesign = design;
  previousQaReport = syntheticQa;
  continue;
}
```

4. **Add the 4 tests** to `intent-job-executor.test.ts`. Follow existing test patterns in that file: mock callLLM via vi.spyOn, mock updateIntentJob, mock loadRulesIndex, build a minimal IntentJobRow fixture. For active sets, mock `IntentJobExecutor.buildActiveSets` directly via `vi.spyOn(IntentJobExecutor as any, 'buildActiveSets').mockReturnValue({...})`. For tests (a)/(b)/(c) use sets containing the referenced paw_ids/connectorIds so the validator passes and the QA LLM is invoked. For test (d) use sets NOT containing 'ghost-slug' so validator fails.

For test (d) specifically assert `callLLMSpy.mock.calls.length` equals exactly the number of architect calls (1 per iteration), NEVER a QA call, because the loop `continue`s after the validator rejection.

For test (c) the spy on notifyProgress uses `vi.spyOn(IntentJobExecutor as any, 'notifyProgress')` and asserts `.toHaveBeenCalledWith(expect.anything(), expect.stringContaining('drops'), true)` or equivalent matching the extractTop2Issues output.

Update any existing test mocks whose QaReport shape becomes incompatible after the type extension — ARCH-PROMPT-14 explicitly requires the existing suite to stay green. Since fields are additive+optional, no change should be needed, but verify by running the full file.

5. Run `cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts`. Target: 47 existing + 4 new = 51 tests green.

6. Docker rebuild note (for SUMMARY, NOT blocking this task): CLAUDE.md mandates docker rebuild after canvas-executor.ts changes — here we DO NOT touch canvas-executor.ts, so no rebuild is strictly required for tests. Runtime verification against LiteLLM is Phase 136 gate scope.

Constraints:
- Do NOT modify canvas-executor.ts
- Do NOT remove the existing needs_cat_paws short-circuit (it fires BEFORE the validator)
- Do NOT remove the QA callLLM path; validator is an additive gate that can `continue` past it
- Keep decideQaOutcome untouched (Phase 134 Plan 04 contract)
- The validator failure path must still persist qa_iter{0,1} so FOUND-06 post-mortem doesn't lose the rejection signal
- Use `process['env']` bracket notation if needed (not expected)
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/intent-job-executor.test.ts src/lib/__tests__/catbot-pipeline-prompts.test.ts src/lib/__tests__/canvas-flow-designer.test.ts 2>&1 | tail -40</automated>
  </verify>
  <done>validateCanvasDeterministic wired into runArchitectQALoop between needs_cat_paws short-circuit and QA callLLM; buildActiveSets reads active ids from cat_paws/connectors; 4 new ARCH-PROMPT-13 tests green (emitter no-R10, transformer R10 blocker, exhaustion notifyProgress spy, validator rejects unknown agentId without QA LLM call); all existing 47 intent-job-executor tests + 18+ catbot-pipeline-prompts tests + 50+ canvas-flow-designer tests green.</done>
</task>

</tasks>

<verification>
- Full three-file test run green (canvas-flow-designer, catbot-pipeline-prompts, intent-job-executor)
- Grep confirms wiring: `grep -n "validateCanvasDeterministic" app/src/lib/services/intent-job-executor.ts` shows import + call site inside runArchitectQALoop
- CANVAS_QA_PROMPT contains 'data.role' and R10 scoped to transformer/synthesizer
- needs_cat_paws short-circuit path (lines ~544-551) still present and unchanged
- decideQaOutcome function body unchanged (Phase 134 contract preserved)
</verification>

<success_criteria>
ARCH-PROMPT-11/12/13/14 closed. Reviewer is role-aware. Validator runs before every QA LLM call and rejects unknown-agentId / unknown-connectorId / cycles / invalid types / non-unique start without spending tokens. Four new tests green plus existing suite intact. Phase 135 acceptance criterion 1 (all tests green including 4 new) is satisfied.
</success_criteria>

<output>
After completion, create `.planning/phases/135-architect-prompt-layer-arch-prompt/135-03-SUMMARY.md`
</output>
</content>
</invoke>