---
phase: 160-catbot-self-service-tools-skill-kb
plan: 03
subsystem: catbot
tags: [catbot, llm-self-service, wave-2, sudo-gated, tools, tdd-green, alias-routing]

requires:
  - phase: 158-model-catalog-capabilities-alias-schema
    provides: model_intelligence capability columns (supports_reasoning, max_tokens_cap) that PATCH validator consults
  - phase: 159-backend-passthrough-litellm-reasoning
    provides: PATCH /api/alias-routing extended-body validator (hasOwnProperty gate, capability cross-check) — the single source of truth this tool delegates to
  - phase: 160-01-wave-0-test-scaffolds
    provides: 4 RED Vitest cases — 2 TOOL-03 delegation tests + 2 set_catbot_llm visibility tests
  - phase: 160-02-list-and-get-llm-tools
    provides: TOOLS[] slot after get_catbot_llm schema (L820) + switch case after get_catbot_llm handler (L3311) + visibility rule adjacent to update_alias_routing (L1407)
provides:
  - set_catbot_llm (sudo-gated, manage_models-gated) — thin typed-fetch shim over PATCH /api/alias-routing with hasOwnProperty gate for extended-body semantics
  - Dual-tool sudo branch in chat route — `update_alias_routing` and `set_catbot_llm` now share the same SUDO_REQUIRED early-return on BOTH streaming (L333) and non-streaming (L603) paths
affects: [160-04-operador-skill, 161-ui-enrutamiento-oracle]

tech-stack:
  added: []
  patterns:
    - "Thin typed-fetch shim pattern for write-path CatBot tools: handler builds body via hasOwnProperty gate, delegates all validation to HTTP endpoint, passes error verbatim with original HTTP status — eliminates validation drift between UI and programmatic call-sites"
    - "Extended-path hasOwnProperty body gating: `if ('field' in args) body.field = args.field ?? null` — falsy-safe ('off' is valid) and distinguishes absence from explicit null (null activates extended UPDATE, absence keeps legacy 2-arg behavior)"
    - "Dual-site sudo branch: mirrored SUDO_REQUIRED early-return on streaming + non-streaming paths using compound predicate — preserves symmetry and prevents Pitfall #5 (asymmetric gate that Phase 159-04 flagged for update_alias_routing fix)"

key-files:
  created: []
  modified:
    - app/src/lib/services/catbot-tools.ts (+71 lines: TOOLS[] entry L821-L836 + executeTool case L3331-L3381 + visibility rule L1425)
    - app/src/app/api/catbot/chat/route.ts (2-edit surgical: L333 streaming predicate + L603 non-streaming predicate, +2/-2 lines total)

key-decisions:
  - "Handler is DELIBERATELY thin (45 LOC pure I/O + body-shaping): zero capability validation, zero database access, zero business logic. Delegates to PATCH /api/alias-routing (Phase 159-03 validator) as the single source of truth. Verified: grep for supports_reasoning|max_tokens_cap|is_local inside the set_catbot_llm handler returns NOTHING — those columns appear only in schema description strings (user-facing docs) and in list_llm_models/get_catbot_llm handlers (read-path from Plan 02)."
  - "hasOwnProperty gate via `in` operator instead of truthy check: `if ('reasoning_effort' in args)` correctly passes the 'off' sentinel through to PATCH (a truthy check would drop 'off' along with undefined since 'off' is a non-empty string but some guard styles use `args.reasoning_effort && ...` which still works — but the `in` operator is semantically cleaner for 'did caller explicitly pass this?' and mirrors Phase 159-03's PATCH-side detection logic)."
  - "Response shape: `applied.*` uses literal string 'unchanged' when caller didn't pass the field — distinguishes 'not touched' from 'explicitly set to null'. CatBot can narrate 'Reasoning quedó como estaba' vs 'Reasoning se reseteó a default' based on this marker."
  - "Compound predicate in chat route (`toolName === 'update_alias_routing' || toolName === 'set_catbot_llm'`) keeps both tools on the same SUDO_REQUIRED branch with the same message. Not extracting to a SUDO_TOOLS constant because Pitfall noted that SUDO_TOOLS[] is for host-agent tools, not route-level sudo gates. The ~20-character diff per branch is explicit, readable, and surgically minimal."
  - "Visibility rule placed IMMEDIATELY AFTER update_alias_routing rule (L1407→L1425) for locality — write-path model-management rules now cluster together, making future additions (e.g., set_catbrain_llm if added) obvious where to slot."

requirements-completed: [TOOL-03]

# Metrics
duration: ~3min
completed: 2026-04-22
---

# Phase 160 Plan 03: set_catbot_llm Summary

**CatBot gains sudo-gated LLM self-mutation: a 45-LOC typed-fetch shim over PATCH /api/alias-routing (zero local validation — delegates to Phase 159-03 single source of truth) plus a dual-site sudo branch in chat route (streaming + non-streaming mirrored) flipping 4 RED tests GREEN without architectural changes.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-22T10:56:41Z
- **Completed:** 2026-04-22T10:59:41Z (approx)
- **Tasks:** 2
- **Files modified:** 2 (catbot-tools.ts +71 lines; chat/route.ts ±2 lines)

## Accomplishments

- `set_catbot_llm` tool registered (schema + handler + visibility rule) — CatBot now has a programmatic write-path that mirrors the manual UI PATCH call-site Phase 161 will expose. Both go through PATCH /api/alias-routing, both are validated by the same Phase 159-03 capability cross-check, both return the same error shape.
- hasOwnProperty gate preserves the PATCH validator's extended-body semantics: passing `{model, reasoning_effort}` sends only those two optional fields; unpassed fields remain untouched (legacy path). Passing `{model, reasoning_effort: null}` explicitly resets (extended path).
- Sudo enforcement extended to cover BOTH tools in BOTH transport branches (streaming L333 + non-streaming L603). Compound predicate keeps the pre-existing `update_alias_routing` sudo flow working identically — verified via full route.test.ts suite (10/10 GREEN, zero regression).
- Single-source-of-truth invariant preserved: zero capability-column references (`supports_reasoning`, `max_tokens_cap`, `is_local`) inside the `set_catbot_llm` handler. The only appearances of those tokens outside the schema doc strings are in `list_llm_models` / `get_catbot_llm` handlers (read-path, Plan 02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add set_catbot_llm schema + handler + visibility rule in catbot-tools.ts** — `e7bc4f1` (feat)
2. **Task 2: Extend chat route sudo gate for set_catbot_llm (streaming + non-streaming mirror)** — `5dc9406` (feat)

**Plan metadata:** pending (final commit after STATE/ROADMAP updates)

_Note: Between these two commits, a parallel agent committed Plan 160-04 work (`a342051`, `e4daf3c`) in different files (db.ts + catbot-prompt-assembler.ts). Those commits do NOT overlap with 160-03 changes and do not affect the integrity of this plan's commits._

## Exact Line Ranges

### TOOLS[] Insertion (`app/src/lib/services/catbot-tools.ts`)

| Element         | Lines         | Anchor                                                              |
| --------------- | ------------- | ------------------------------------------------------------------- |
| Schema entry    | L821-L837     | IMMEDIATELY AFTER `get_catbot_llm` schema (L813-L820) per Plan 02 handoff |

### executeTool Switch Case Insertion

| Element         | Lines         | Anchor                                                              |
| --------------- | ------------- | ------------------------------------------------------------------- |
| Handler case    | L3331-L3381   | IMMEDIATELY AFTER `get_catbot_llm` case (L3275-L3328) per Plan 02 handoff |

### Visibility Rule Insertion

| Element         | Line          | Anchor                                                              |
| --------------- | ------------- | ------------------------------------------------------------------- |
| Visibility rule | L1425         | IMMEDIATELY AFTER `update_alias_routing` rule (L1424) — cluster write-path model rules |

```typescript
// L1425 (inserted):
if (name === 'set_catbot_llm' && (allowedActions.includes('manage_models') || !allowedActions.length)) return true;
```

### Chat Route Sudo-Gate Edits

Before (both L333 and L603, identical):
```typescript
} else if (toolName === 'update_alias_routing' && !sudoActive) {
```

After (both L333 and L603, identical — compound predicate):
```typescript
} else if ((toolName === 'update_alias_routing' || toolName === 'set_catbot_llm') && !sudoActive) {
```

Total diff: +2 lines / -2 lines (same character count delta on each branch). SUDO_REQUIRED message at L337 and L607 left untouched per RESEARCH.md Open Questions #5 (intentionally shared).

## Tests RED → GREEN

All 4 transitions validated on the two relevant test files:

| Test                                                                       | Location                                            | Pre-plan | Post-plan |
| -------------------------------------------------------------------------- | --------------------------------------------------- | -------- | --------- |
| TOOL-03: set_catbot_llm > delegates to PATCH /api/alias-routing w/ body   | catbot-tools-model-self-service.test.ts            | RED      | GREEN     |
| TOOL-03: set_catbot_llm > surfaces 400 errors from PATCH validator verbatim | catbot-tools-model-self-service.test.ts            | RED      | GREEN     |
| getToolsForLLM visibility > set_catbot_llm hidden without manage_models    | catbot-tools-model-self-service.test.ts            | RED      | GREEN     |
| getToolsForLLM visibility > set_catbot_llm visible with manage_models      | catbot-tools-model-self-service.test.ts            | RED      | GREEN     |
| getToolsForLLM visibility > set_catbot_llm visible when allowedActions empty | catbot-tools-model-self-service.test.ts            | RED      | GREEN     |
| set_catbot_llm without sudo emits SUDO_REQUIRED (streaming path)          | chat/__tests__/route.test.ts                        | RED      | GREEN     |
| set_catbot_llm without sudo emits SUDO_REQUIRED (non-streaming path)      | chat/__tests__/route.test.ts                        | RED      | GREEN     |

Total: 7 GREEN transitions (matches plan-stated "2 TOOL-03 delegation + 3 visibility for set_catbot_llm + 2 sudo gate").

Full verification run:
- `catbot-tools-model-self-service.test.ts`: **10/10 GREEN** (5 Plan 02 + 5 Plan 03)
- `chat/__tests__/route.test.ts`: **10/10 GREEN** (8 pre-existing PASS-03/04/BC + 2 new sudo gate)
- Combined: **20/20 GREEN**, zero regression

## Single-Source-of-Truth Verification (Pitfall #1)

```bash
$ awk '/case .set_catbot_llm.:/,/case .recommend_model_for_task/' src/lib/services/catbot-tools.ts \
  | grep -E "supports_reasoning|max_tokens_cap|is_local"
CLEAN: no capability columns in handler
```

The set_catbot_llm handler contains ZERO capability validation. All capability cross-checks happen server-side in PATCH /api/alias-routing (Phase 159-03). CatBot is a thin consumer; the manual UI (Phase 161) will be another thin consumer. Both go through the same validator, ensuring the UI cannot drift from programmatic access.

## Dual-Site Sudo Gate Verification (Pitfall #5)

```bash
$ grep -nE "set_catbot_llm.*!sudoActive|update_alias_routing.*!sudoActive" src/app/api/catbot/chat/route.ts
333:                } else if ((toolName === 'update_alias_routing' || toolName === 'set_catbot_llm') && !sudoActive) {
603:        } else if ((toolName === 'update_alias_routing' || toolName === 'set_catbot_llm') && !sudoActive) {
```

Both transport branches gated. No sudoActive check inside the handler (stays in the chat route, per established architecture).

## Lint / Build Status

- `npx eslint src/lib/services/catbot-tools.ts`: clean (no errors, no warnings)
- `npx eslint src/app/api/catbot/chat/route.ts`: clean (no errors, no warnings)
- `npm run lint` overall: 1 pre-existing warning (img element, unrelated) + 3 pre-existing errors in `src/lib/__tests__/db-seeds.test.ts` (unused imports from Plan 160-01 RED scaffolds, will self-resolve in Plan 160-04 when imports get consumed) — logged to `deferred-items.md` per SCOPE BOUNDARY rule. None touched by 160-03.

## Decisions Made

- **Handler-as-shim pattern**: The set_catbot_llm handler is pure I/O choreography — build body, fetch, passthrough. This is the first sudo-gated CatBot tool to adopt the "delegate to HTTP endpoint" pattern rather than calling a domain function directly (cf. `update_alias_routing` which calls `updateAlias()` directly and re-validates manually). The new pattern is strictly better: (a) one validator instead of two copies, (b) manual UI and programmatic CatBot share the same contract bit-for-bit, (c) testing is simpler (mock fetch, assert body shape). Expect future write-path tools (set_user_preferences, update_canvas_config) to adopt this pattern.

- **hasOwnProperty via `in` operator**: Chose `'field' in args` over `args.hasOwnProperty('field')` for brevity and because `args` is always a plain object (never an instance with shadowed hasOwnProperty). The `in` operator also includes inherited properties, but since `args` comes from `JSON.parse(tool_call.arguments)` the prototype chain is always Object.prototype which doesn't have these field names. Safe.

- **Body construction order**: `alias` + `model_key` unconditionally, then optional fields in the order `reasoning_effort` → `max_tokens` → `thinking_budget`. Mirrors the schema's `properties` order and Phase 159-03 validator's cross-field check order (reasoning_effort capability → max_tokens cap → thinking_budget relation). Future test assertions that loop through body keys get deterministic order.

- **Error message fallback**: When PATCH returns non-2xx without a JSON `error` field (defensive), the handler surfaces `PATCH failed (${res.status})` rather than silent success. Mirrors Phase 159-03's own fallback pattern for PATCH's own defensive paths. CatBot can surface the HTTP status to the user: "PATCH falló con 500 — contacta al operador".

- **`applied` vs `updated` field name in response**: Used `applied` because the tool's response distinguishes "what fields the caller asked to change" from "what the DB now holds". The PATCH validator's response uses `updated` (the post-mutation row); the tool wraps it with a caller-centric `applied` to make the model/'unchanged' distinction explicit. Prevents CatBot from confusing "I sent null" with "DB now has null" in its narration.

## Deviations from Plan

None — plan executed exactly as written. Insertion points from the handoff notes in 160-02-SUMMARY.md proved accurate. No auto-fixes (Rules 1-3) triggered; no architectural choices (Rule 4) needed.

## Issues Encountered

None. The Plan 02 handoff notes precisely identified the slot coordinates, and the chat/route.ts anchor lines (L333, L603) matched exactly — Phase 159-04 migration to resolveAliasConfig didn't shift those lines. RED tests from Plan 01 were well-structured (explicit `toHaveBeenCalledOnce` + body deep-assertions + `hasOwnProperty` assertions), making the GREEN transition a direct wire-up.

A parallel agent committed Plan 160-04 work between this plan's two task commits (non-overlapping files). Confirmed via `git show --stat` that 160-04 touched only `db.ts` and `catbot-prompt-assembler.ts`, which are orthogonal to 160-03's surface area (`catbot-tools.ts` + `chat/route.ts`). No cross-plan interference. Plan 160-04 will receive its own SUMMARY from its executor.

## Next Phase Readiness

- **Plan 160-04 (Operador de Modelos skill + PromptAssembler P1)**: Already in flight per the parallel commits. No dependency conflicts with 160-03.
- **Phase 161 (UI Enrutamiento + Oracle E2E)**: Now unblocked for TOOL-03 — CatBot has the full read+write surface (list_llm_models + get_catbot_llm + set_catbot_llm). Oracle verification VER-02 ("cambiar a Opus+high vía sudo") is ready: user authenticates sudo → CatBot calls set_catbot_llm → PATCH validates → next turn uses new config via resolveAliasConfig. VER-01 and VER-03 also ready.
- **No blockers.** Single-source-of-truth property holds. Dual-site sudo gate holds. Capability validation centralized in PATCH. Message symmetry preserved between tools.

## Self-Check: PASSED

**Files modified:**
- FOUND: /home/deskmath/docflow/app/src/lib/services/catbot-tools.ts (schema L821-L837, visibility rule L1425, handler case L3331-L3381)
- FOUND: /home/deskmath/docflow/app/src/app/api/catbot/chat/route.ts (sudo gate L333 streaming, L603 non-streaming)

**Commits:**
- FOUND: e7bc4f1 (feat(160-03): register set_catbot_llm sudo-gated tool (schema + handler + visibility))
- FOUND: 5dc9406 (feat(160-03): extend sudo gate to set_catbot_llm (streaming + non-streaming))

**GREEN verification:**
- 2 TOOL-03 delegation/error tests GREEN (catbot-tools-model-self-service.test.ts)
- 3 set_catbot_llm visibility tests GREEN (catbot-tools-model-self-service.test.ts)
- 2 set_catbot_llm sudo gate tests GREEN (chat/__tests__/route.test.ts streaming + non-streaming)
- Full catbot-tools-model-self-service.test.ts: 10/10 GREEN
- Full chat/__tests__/route.test.ts: 10/10 GREEN (zero regression on pre-existing PASS-03/04/BC)

**Invariants verified:**
- Pitfall #1 (single source of truth): handler contains ZERO capability-column references — CLEAN
- Pitfall #5 (dual-site sudo gate): both L333 (streaming) + L603 (non-streaming) updated with compound predicate

---
*Phase: 160-catbot-self-service-tools-skill-kb*
*Completed: 2026-04-22*
