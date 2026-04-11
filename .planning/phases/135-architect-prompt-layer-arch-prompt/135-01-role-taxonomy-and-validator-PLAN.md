---
phase: 135-architect-prompt-layer-arch-prompt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/src/lib/services/canvas-flow-designer.ts
  - app/src/lib/__tests__/canvas-flow-designer.test.ts
autonomous: true
requirements:
  - ARCH-PROMPT-10
must_haves:
  truths:
    - "ROLE_TAXONOMY constant exports 7 roles: extractor, transformer, synthesizer, renderer, emitter, guard, reporter"
    - "validateCanvasDeterministic(design, {activeCatPaws, activeConnectors}) returns {ok:true} or {ok:false, recommendation:'reject', issues:[]}"
    - "Validator rejects canvas with agentId not in activeCatPaws (ids) without any LLM call"
    - "Validator rejects canvas with connectorId not in activeConnectors (ids)"
    - "Validator rejects canvas with a cycle in the edge graph"
    - "Validator rejects canvas with zero or more-than-one 'start' nodes"
    - "Validator rejects canvas with a node.type not in VALID_NODE_TYPES"
    - "Validator returns ok:true for a minimal DAG with exactly one start, all-valid types, all ids in active sets"
  artifacts:
    - path: "app/src/lib/services/canvas-flow-designer.ts"
      provides: "ROLE_TAXONOMY constant + validateCanvasDeterministic function"
      contains: "ROLE_TAXONOMY"
    - path: "app/src/lib/__tests__/canvas-flow-designer.test.ts"
      provides: "At least 6 new unit tests covering every failure mode + happy path"
      contains: "validateCanvasDeterministic"
  key_links:
    - from: "canvas-flow-designer.ts"
      to: "VALID_NODE_TYPES"
      via: "direct reuse inside validator"
      pattern: "VALID_NODE_TYPES\\.includes"
---

<objective>
Add the deterministic pre-LLM canvas validator and the shared 7-role taxonomy constant that both the architect prompt (plan 02) and the QA prompt (plan 03) will consume. The validator is the gate that rejects invalid canvases (bad agentId, bad connectorId, cycles, multiple starts, invalid types) BEFORE spending any QA LLM tokens.

Purpose: ARCH-PROMPT-10 is the token-saving gate for Phase 135 and the closure of the Phase 134 soft gap where the LLM fabricated `analista-financiero-ia`. It also exports `ROLE_TAXONOMY` so plans 02 and 03 reference a single source of truth for the 7-role vocabulary.
Output: `ROLE_TAXONOMY` constant + `validateCanvasDeterministic` pure function + 6+ unit tests, all green.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/134-architect-data-layer-arch-data/134-VERIFICATION.md
@app/src/lib/services/canvas-flow-designer.ts
@app/src/lib/services/canvas-connector-contracts.ts
@app/src/lib/__tests__/canvas-flow-designer.test.ts

<interfaces>
From app/src/lib/services/canvas-flow-designer.ts (already exported):

```typescript
export const VALID_NODE_TYPES = [
  'agent','catbrain','condition','iterator','multiagent','scheduler',
  'checkpoint','connector','storage','merge','output','start',
] as const;
export type CanvasNodeType = (typeof VALID_NODE_TYPES)[number];

// scanCanvasResources returns CatPawResource[] with paw_id and ConnectorResource[] with connector_id
```

Phase 134 soft gap (from 134-VERIFICATION.md): holded-q1 architect fabricated `agentId='analista-financiero-ia'` (slug, not UUID). Validator MUST reject this pattern without calling the LLM.

Active-rows queries (both tables in catbotDb):
- `cat_paws WHERE is_active = 1` → id column
- `connectors WHERE is_active = 1` → id column
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: ROLE_TAXONOMY + validateCanvasDeterministic skeleton + failing tests</name>
  <files>app/src/lib/services/canvas-flow-designer.ts, app/src/lib/__tests__/canvas-flow-designer.test.ts</files>
  <behavior>
    Tests to add (RED first — all must fail before Task 2 writes implementation):
    - ROLE_TAXONOMY has exactly 7 members: ['extractor','transformer','synthesizer','renderer','emitter','guard','reporter']
    - validateCanvasDeterministic({nodes:[{id:'n1',type:'start'}], edges:[]}, {activeCatPaws:new Set(), activeConnectors:new Set()}) → {ok:true}
    - Rejects when zero start: flow with only [{id:'n1',type:'agent'}] → ok:false, reason includes 'start'
    - Rejects when two starts: two start nodes → ok:false, reason mentions 'exactly one start'
    - Rejects invalid type: {type:'llm_call'} → ok:false, reason mentions 'VALID_NODE_TYPES'
    - Rejects unknown agentId: node type='agent' data.agentId='analista-financiero-ia' while activeCatPaws=new Set(['uuid-1']) → ok:false, reason mentions the bad id
    - Rejects unknown connectorId: node type='connector' data.connectorId='ghost' while activeConnectors=new Set(['real']) → ok:false
    - Rejects cycle: edges [n1→n2, n2→n3, n3→n1] → ok:false, reason mentions 'cycle' or 'DAG'
    - Happy path: 3-node DAG start→agent(real uuid)→connector(real id) with all active → {ok:true}
    - All rejection cases return object shaped `{ok:false, recommendation:'reject', issues:[{severity:'blocker', rule_id:'VALIDATOR', node_id, description}]}` so callers in plan 03 can emit it as a QaReport drop-in
  </behavior>
  <action>
Edit `app/src/lib/services/canvas-flow-designer.ts`:

1. Add near the existing VALID_NODE_TYPES export (around line 32-49):
```ts
export const ROLE_TAXONOMY = [
  'extractor','transformer','synthesizer','renderer','emitter','guard','reporter',
] as const;
export type CanvasRole = (typeof ROLE_TAXONOMY)[number];
```

2. Add types:
```ts
export interface ValidateCanvasInput {
  nodes: Array<{ id: string; type: string; data?: { agentId?: string; connectorId?: string } }>;
  edges: Array<{ id?: string; source: string; target: string }>;
}
export interface ValidateCanvasActiveSets {
  activeCatPaws: Set<string>;
  activeConnectors: Set<string>;
}
export interface ValidateCanvasIssue {
  severity: 'blocker';
  rule_id: 'VALIDATOR';
  node_id: string | null;
  description: string;
}
export type ValidateCanvasResult =
  | { ok: true }
  | { ok: false; recommendation: 'reject'; issues: ValidateCanvasIssue[] };
```

3. Add `validateCanvasDeterministic(input, active)` as a SKELETON that always returns `{ok:true}`. This is intentional — Task 1 is RED, Task 2 makes it GREEN.

4. Edit `app/src/lib/__tests__/canvas-flow-designer.test.ts` adding a new `describe('validateCanvasDeterministic (ARCH-PROMPT-10)', ...)` block with every test in the behavior list. Use `new Set(['uuid-real-1','uuid-real-2'])` style.

5. Run `cd app && npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts` — expect the new tests to FAIL (skeleton always returns ok:true), existing 50 tests STAY GREEN. Do NOT proceed to Task 2 until you see the exact RED pattern.

Constraints (honor CLAUDE.md):
- Do NOT modify canvas-executor.ts
- Do NOT introduce any runtime dependency on the DB here — active sets are passed in by callers (plan 03 will build them from catbotDb)
- validator is a pure function: same input → same output, no side effects, no DB reads, no LLM calls
- Use `process['env']` bracket notation if any env var is ever read (none needed here)
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>ROLE_TAXONOMY exported with 7 members; validateCanvasDeterministic exported as skeleton returning {ok:true}; new test block added; new tests FAIL (skeleton), existing 50 tests still PASS; RED phase confirmed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement validateCanvasDeterministic (GREEN)</name>
  <files>app/src/lib/services/canvas-flow-designer.ts</files>
  <behavior>
    All Task 1 tests go GREEN. Existing 50 canvas-flow-designer tests stay GREEN. No new failures anywhere.
  </behavior>
  <action>
Replace the skeleton body of `validateCanvasDeterministic` in `canvas-flow-designer.ts` with a real implementation, evaluating checks in this exact order (first failure wins — return immediately with all issues collected so far; but each test expects a reason, so just collect one issue per failing check and return):

```ts
export function validateCanvasDeterministic(
  input: ValidateCanvasInput,
  active: ValidateCanvasActiveSets,
): ValidateCanvasResult {
  const issues: ValidateCanvasIssue[] = [];
  const push = (node_id: string | null, description: string) =>
    issues.push({ severity: 'blocker', rule_id: 'VALIDATOR', node_id, description });

  if (!input || !Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    push(null, 'flow_data must have nodes[] and edges[] arrays');
    return { ok: false, recommendation: 'reject', issues };
  }

  // 1. Exactly one start
  const startCount = input.nodes.filter((n) => n.type === 'start').length;
  if (startCount !== 1) {
    push(null, `flow_data must have exactly one start node (found ${startCount})`);
  }

  // 2. All types in VALID_NODE_TYPES
  for (const n of input.nodes) {
    if (!VALID_NODE_TYPES.includes(n.type as CanvasNodeType)) {
      push(n.id, `node.type '${n.type}' not in VALID_NODE_TYPES`);
    }
  }

  // 3. agentId must exist in activeCatPaws
  for (const n of input.nodes) {
    if (n.type === 'agent' || n.type === 'multiagent') {
      const id = n.data?.agentId;
      if (!id || !active.activeCatPaws.has(id)) {
        push(n.id, `agent node references unknown or inactive agentId '${id ?? '<missing>'}'`);
      }
    }
  }

  // 4. connectorId must exist in activeConnectors
  for (const n of input.nodes) {
    if (n.type === 'connector') {
      const id = n.data?.connectorId;
      if (!id || !active.activeConnectors.has(id)) {
        push(n.id, `connector node references unknown or inactive connectorId '${id ?? '<missing>'}'`);
      }
    }
  }

  // 5. DAG check via DFS
  const adj = new Map<string, string[]>();
  for (const n of input.nodes) adj.set(n.id, []);
  for (const e of input.edges) {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of input.nodes) color.set(n.id, WHITE);
  let cycleNode: string | null = null;
  const dfs = (u: string): boolean => {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) { cycleNode = v; return true; }
      if (c === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  };
  for (const n of input.nodes) {
    if (color.get(n.id) === WHITE && dfs(n.id)) {
      push(cycleNode, `flow_data contains a cycle (not a DAG) at node '${cycleNode}'`);
      break;
    }
  }

  if (issues.length > 0) return { ok: false, recommendation: 'reject', issues };
  return { ok: true };
}
```

Run full canvas-flow-designer test file. ALL tests (old + new) must be GREEN.

DO NOT add DB queries here. DO NOT import catbotDb. The callers in plan 03 build the active sets and pass them in.
  </action>
  <verify>
    <automated>cd app && npx vitest run src/lib/__tests__/canvas-flow-designer.test.ts 2>&1 | tail -20</automated>
  </verify>
  <done>All tests in canvas-flow-designer.test.ts (existing 50 + new 8-10) GREEN. ROLE_TAXONOMY and validateCanvasDeterministic exported from canvas-flow-designer.ts with pure-function contract.</done>
</task>

</tasks>

<verification>
- canvas-flow-designer.test.ts all green
- `grep -n "ROLE_TAXONOMY\|validateCanvasDeterministic" app/src/lib/services/canvas-flow-designer.ts` shows exports
- No import of catbotDb inside the validator (pure function)
- VALID_NODE_TYPES reused (not duplicated)
</verification>

<success_criteria>
ROLE_TAXONOMY (7 roles) and validateCanvasDeterministic (6 failure modes + happy path) live in canvas-flow-designer.ts, fully unit-tested, with zero DB coupling. Plans 02 and 03 can import both.
</success_criteria>

<output>
After completion, create `.planning/phases/135-architect-prompt-layer-arch-prompt/135-01-SUMMARY.md`
</output>
</content>
</invoke>