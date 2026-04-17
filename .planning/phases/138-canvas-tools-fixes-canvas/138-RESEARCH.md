# Phase 138: Canvas Tools Fixes (CANVAS) - Research

**Researched:** 2026-04-17
**Domain:** CatBot canvas tools — bug fixes in catbot-tools.ts
**Confidence:** HIGH

## Summary

Phase 138 addresses three critical bugs in CatBot's canvas tools (`canvas_add_node` and `canvas_add_edge`) that prevent building functional CatFlows. All three bugs are localized in a single file: `app/src/lib/services/catbot-tools.ts`. The fixes are surgical: (1) persist all `data` fields including `instructions` and `model`, (2) add structural validation rules to `canvas_add_edge`, and (3) require non-empty `label` in `canvas_add_node`.

The codebase is well-structured with clear patterns. The canvas tools operate by reading `flow_data` JSON from SQLite, modifying it, and writing it back. All fixes involve adding validation logic or fixing field persistence within the existing `executeTool` switch cases.

**Primary recommendation:** Fix the three bugs directly in `catbot-tools.ts` with corresponding unit tests. No new files, no architectural changes, no new dependencies.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CANVAS-01 | `canvas_add_node` persiste instructions, model, y todos los campos de `data` al hacer PATCH al flow_data | Bug identificado: linea 2221-2235 de catbot-tools.ts — `nodeData` solo copia `label`, `agentId`, `connectorId`, `instructions` e iterator fields. El campo `model` solo se asigna si hay `agentId` con CatPaw que tenga modelo. No hay parametro `model` explicito en la tool definition (linea 573-591). |
| CANVAS-02 | `canvas_add_edge` valida reglas: OUTPUT terminal, CONDITION requiere sourceHandle valido, START max 1 salida | Bug identificado: lineas 2298-2340 — `canvas_add_edge` solo valida que source/target existen. No hay ninguna validacion de reglas estructurales del canvas. |
| CANVAS-03 | `canvas_add_node` exige label descriptivo obligatorio | Bug identificado: linea 590 — `label` esta en `required` del schema, pero no hay validacion en runtime (linea 2221) de que sea no-vacio o descriptivo. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | DB access for flow_data | Already used throughout catbot-tools.ts |
| vitest | (existing) | Unit testing | Already configured in app/vitest.config.ts |

### Supporting
No new libraries needed. All fixes are pure logic changes within existing code.

## Architecture Patterns

### File Structure (existing, no changes)
```
app/src/lib/services/
  catbot-tools.ts          # THE file to modify — tool definitions + executeTool handler
app/src/lib/__tests__/
  canvas-rules.test.ts     # Existing canvas rules tests (reference pattern)
```

### Pattern 1: Tool Definition + Handler Symmetry
**What:** Each CatBot tool has a definition (lines ~520-810 in catbot-tools.ts) and a handler in the `executeTool` switch (lines ~2000+). The definition declares parameters; the handler reads `args` and operates on DB.
**When to use:** Any canvas tool fix must update BOTH the definition (parameter schema) and the handler (implementation).

### Pattern 2: flow_data Read-Modify-Write
**What:** All canvas tools follow the same pattern:
```typescript
// 1. Read
const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId);
let flowData = JSON.parse(canvasRow.flow_data);

// 2. Modify
flowData.nodes.push(newNode); // or modify edges

// 3. Write
db.prepare('UPDATE canvases SET flow_data = ?, updated_at = ? WHERE id = ?')
  .run(JSON.stringify(flowData), new Date().toISOString(), canvasId);
```
**When to use:** Every canvas tool fix follows this exact pattern. Validation goes between step 1 and step 2.

### Anti-Patterns to Avoid
- **Modifying canvas-executor.ts:** NEVER touch this file (explicit project rule in CLAUDE.md)
- **Creating new API routes:** These are tool-level fixes, not API changes
- **Adding new dependencies:** Pure logic fixes only

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Node type checking | Custom type system | Simple string comparison against known types | Only 13 node types, static list |
| Edge validation framework | Generic graph validator | Inline validation in canvas_add_edge handler | Scope is exactly 4 rules |

## Common Pitfalls

### Pitfall 1: Truthy check on `instructions` loses empty string
**What goes wrong:** `if (args.instructions)` ignores empty string `""`, but `if (args.instructions !== undefined)` correctly handles explicit empty.
**Why it happens:** JavaScript truthy check treats `""` as falsy.
**How to avoid:** For fields that should persist even when empty (like clearing instructions), use `!== undefined` check. For label validation (CANVAS-03), empty string IS the thing to reject.
**Warning signs:** Test with `instructions: ""` to verify behavior.

### Pitfall 2: model field only set from CatPaw lookup
**What goes wrong:** Line 2227 only sets `nodeData.model` when a CatPaw has a model. If CatBot passes `model` directly (e.g., for an Agent node without CatPaw, or to override), the field is lost.
**Why it happens:** The tool definition doesn't include `model` as a parameter, and the handler doesn't read `args.model`.
**How to avoid:** Add `model` to tool definition parameters AND add `if (args.model) nodeData.model = args.model` in handler (after CatPaw lookup, so explicit model overrides CatPaw default).

### Pitfall 3: canvas_add_edge allows duplicate edges
**What goes wrong:** Calling canvas_add_edge twice with same source/target creates duplicate edges (same `edgeId` since it's deterministic `e-{source}-{target}`).
**Why it happens:** No duplicate check exists.
**How to avoid:** Check if edge already exists before pushing. Also relevant for CONDITION sourceHandle validation — need to check if a specific sourceHandle already has an edge.

### Pitfall 4: Node type case mismatch
**What goes wrong:** Tool definition enum uses UPPERCASE (`'AGENT', 'OUTPUT'`) but internally converts to lowercase (line 2238: `nodeTypeLower`). Validation must compare against lowercase.
**Why it happens:** Historical convention — tool params are UPPER, internal storage is lower.
**How to avoid:** Always normalize to lowercase before comparing in validation logic.

## Code Examples

### Bug Fix 1: CANVAS-01 — Persist all data fields including model

Current code (line 2221-2235):
```typescript
// CURRENT — missing model field
const nodeData: Record<string, unknown> = { label: args.label };
if (args.agentId) {
  nodeData.agentId = args.agentId;
  // ... auto-resolve from DB
}
if (args.connectorId) { /* ... */ }
if (args.instructions) nodeData.instructions = args.instructions;
```

Fix approach:
```typescript
// 1. Add 'model' to tool definition parameters (around line 581):
model: { type: 'string', description: 'Modelo LLM para el nodo (default: gemini-main)' },

// 2. In handler, after CatPaw lookup (around line 2235):
// Explicit model param overrides CatPaw default
if (args.model) nodeData.model = args.model;
```

Note: `instructions` is already persisted (line 2235). The auditorium report says it's not, but looking at the code, `if (args.instructions) nodeData.instructions = args.instructions` IS there. The bug may be that the truthy check drops empty-string instructions, or that it was recently added. Verify with a test.

### Bug Fix 2: CANVAS-02 — Validate canvas structural rules in canvas_add_edge

Add validation between "verify nodes exist" and "create edge":
```typescript
// After sourceExists/targetExists checks (around line 2316):

// Find source node to check its type
const sourceNode = flowData.nodes.find((n: Record<string, unknown>) => n.id === sourceNodeId);
const sourceType = (sourceNode?.type as string || '').toLowerCase();

// Rule 1: OUTPUT is terminal — no outgoing edges
if (sourceType === 'output') {
  return { name, result: { error: 'OUTPUT es un nodo terminal — no puede tener edges de salida' } };
}

// Rule 2: START can only have 1 outgoing edge
if (sourceType === 'start') {
  const existingStartEdges = flowData.edges.filter((e: Record<string, unknown>) => e.source === sourceNodeId);
  if (existingStartEdges.length > 0) {
    return { name, result: { error: 'START solo puede tener 1 edge de salida' } };
  }
}

// Rule 3: CONDITION requires valid sourceHandle (yes/no) and no duplicates
if (sourceType === 'condition') {
  const handle = args.sourceHandle as string | undefined;
  if (!handle || !['yes', 'no'].includes(handle)) {
    return { name, result: { error: 'CONDITION requiere sourceHandle valido: "yes" o "no"' } };
  }
  const existingHandleEdge = flowData.edges.find(
    (e: Record<string, unknown>) => e.source === sourceNodeId && e.sourceHandle === handle
  );
  if (existingHandleEdge) {
    return { name, result: { error: `CONDITION ya tiene un edge en la rama "${handle}" — no se puede duplicar` } };
  }
}

// Rule 4: Duplicate edge check
const existingEdge = flowData.edges.find(
  (e: Record<string, unknown>) => e.source === sourceNodeId && e.target === targetNodeId
);
if (existingEdge) {
  return { name, result: { error: `Ya existe un edge entre ${sourceNodeId} y ${targetNodeId}` } };
}
```

### Bug Fix 3: CANVAS-03 — Require descriptive label

Add at the start of canvas_add_node handler (after line 2183):
```typescript
// Validate label is non-empty and descriptive
const label = (args.label as string || '').trim();
if (!label) {
  return { name, result: { error: 'El label es obligatorio — proporciona un nombre descriptivo para el nodo (ej: "Clasificador de emails", "Normalizador JSON")' } };
}
if (label.length < 3) {
  return { name, result: { error: 'El label debe ser descriptivo (minimo 3 caracteres). Ejemplo: "Clasificador de emails"' } };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No validation in canvas_add_edge | Need structural rules | Phase 138 | Prevents invalid CatFlows |
| model only from CatPaw | Explicit model param needed | Phase 138 (fix) + Phase 139 (TOOLS-01 expands) | Enables per-node model assignment |

## Open Questions

1. **CANVAS-01 instructions persistence**
   - What we know: Code at line 2235 does `if (args.instructions) nodeData.instructions = args.instructions` — this LOOKS correct
   - What's unclear: Is the audit reporting a bug that was already fixed, or is there a subtler issue (e.g., truthy check dropping empty string, or `canvas_update_node` not persisting)?
   - Recommendation: Write a test that calls canvas_add_node with instructions, then reads back flow_data to verify. If test passes, the bug may be in how CatBot calls the tool (not passing instructions), not in the tool itself.

2. **CHECKPOINT sourceHandle validation**
   - What we know: CHECKPOINT has approved/rejected handles (similar to CONDITION's yes/no)
   - What's unclear: Should CANVAS-02 also validate CHECKPOINT sourceHandle? Requirements only mention CONDITION
   - Recommendation: Add CHECKPOINT validation too (same pattern as CONDITION) — it's defensive and cheap

3. **SCHEDULER / MULTIAGENT / ITERATOR sourceHandle validation**
   - These nodes also have multiple output handles. Requirements don't mention them.
   - Recommendation: Validate their sourceHandles too for robustness, but scope to requirements first

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts` |
| Full suite command | `cd ~/docflow/app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANVAS-01 | canvas_add_node persists instructions and model in flow_data | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "persists instructions"` | Wave 0 |
| CANVAS-01 | canvas_add_node persists model when passed explicitly | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "persists model"` | Wave 0 |
| CANVAS-02 | canvas_add_edge rejects edge from OUTPUT node | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "OUTPUT terminal"` | Wave 0 |
| CANVAS-02 | canvas_add_edge requires valid sourceHandle for CONDITION | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "CONDITION sourceHandle"` | Wave 0 |
| CANVAS-02 | canvas_add_edge rejects duplicate CONDITION branch | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "duplicate branch"` | Wave 0 |
| CANVAS-02 | canvas_add_edge limits START to 1 outgoing edge | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "START max 1"` | Wave 0 |
| CANVAS-03 | canvas_add_node rejects empty/missing label | unit | `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts -t "empty label"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npx vitest run src/lib/__tests__/canvas-tools-fixes.test.ts`
- **Per wave merge:** `cd ~/docflow/app && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/canvas-tools-fixes.test.ts` — new file covering CANVAS-01, CANVAS-02, CANVAS-03
- [ ] Test needs mock for `better-sqlite3` — reference pattern from existing `catbot-db.test.ts`

## Sources

### Primary (HIGH confidence)
- `app/src/lib/services/catbot-tools.ts` lines 565-610 (tool definitions) and 2183-2340 (handlers) — direct source code inspection
- `.planning/knowledge/canvas-nodes-catalog.md` — node type contracts, connection rules, handle IDs
- `.planning/REQUIREMENTS.md` — CANVAS-01, CANVAS-02, CANVAS-03 specifications
- `auditoria-catflow.md` referenced in STATE.md — motivation for fixes

### Secondary (MEDIUM confidence)
- Existing test patterns in `app/src/lib/__tests__/canvas-rules.test.ts` — vitest setup reference

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — single file fix, no new deps
- Architecture: HIGH — direct code inspection, patterns clearly visible
- Pitfalls: HIGH — bugs identified with exact line numbers

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable codebase, surgical fixes)
