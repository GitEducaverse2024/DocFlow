---
phase: 111-ui-de-inteligencia-de-modelos
plan: 04
subsystem: ui-model-intelligence
tags: [ui-06, catbot, gap-closure, alias-routing]
requires:
  - 111-03
provides:
  - "recommend_model_for_task tool emits recommended_model + alias_target + justification flat fields"
  - "parseRecommendation accepts both flat (new) and legacy nested payload shapes"
  - "Inline Aplicar/Ignorar buttons render under recommend_model_for_task tool cards in CatBot chat"
affects:
  - "CatBot system prompt consumers (nested `recommended` shape preserved, no regression)"
tech-stack:
  added: []
  patterns:
    - "Dual-shape tool result: emit both flat fields for UI + nested legacy shape for LLM prompts"
    - "Defensive parse guard with fallback: prefer flat, derive from nested as backup"
key-files:
  created: []
  modified:
    - app/src/lib/services/catbot-tools.ts
    - app/src/components/catbot/catbot-panel.tsx
decisions:
  - "Tool emitter returns both flat (recommended_model/alias_target/justification) and legacy nested (recommended.*) shapes — surgical fix that keeps backward compat"
  - "target_alias defaults to 'chat' (primary UAT flow) — optional tool arg, LLM can override"
  - "parseRecommendation derives recommended_model + justification from legacy nested shape if flat fields absent — stays robust if tool shape shifts"
  - "justification concatenates reason + best_use + warning (if any) — richer than single reason string"
metrics:
  duration: "1min"
  completed: "2026-04-04T20:57:31Z"
  tasks_completed: 3
  files_modified: 2
---

# Phase 111 Plan 04: UI-06 Gap Closure (CatBot Aplicar/Ignorar) Summary

One-liner: Aligned `recommend_model_for_task` tool payload with the `parseRecommendation` guard in catbot-panel so inline Aplicar/Ignorar buttons render below recommendation tool cards.

## Root Cause

From verification (111-VERIFICATION.md, gap UI-06):
- Tool emitted `{ recommended: { model_key, ... }, alternatives, warning? }` (nested)
- UI guard required top-level `recommended_model`, `alias_target`, `justification` strings
- All three always absent → `parseRecommendation` returned null → `ModelRecommendationActions` never mounted

## Changes

### Task 1 — Align tool output with UI parse guard
**Commit:** ecfa0df

**app/src/lib/services/catbot-tools.ts:**
1. Added optional `target_alias` param to `recommend_model_for_task` schema (default 'chat')
2. Built `justification` string from reason + best_use + warning
3. Return value now includes flat fields (`recommended_model`, `alias_target`, `justification`) alongside the legacy nested shape (`recommended.*`, `alternatives`, `warning`)

**app/src/components/catbot/catbot-panel.tsx:**
4. `parseRecommendation` now prefers the flat shape, falls back to deriving `recommended_model` + `justification` from the legacy nested `recommended` object if flat fields absent
5. Still requires `alias_target` (no sensible fallback without a routing target)

### Task 2 — Full build verification
**Commit:** (no code changes, verification only)

`cd app && npm run build` succeeded. /settings route compiles at 21.8 kB, all routes build cleanly.

### Task 3 — Human UAT
Auto-approved (workflow.auto_advance = true). Build verified successfully; runtime UAT to be performed by user on next interaction with CatBot chat.

## Verification

- `npx tsc --noEmit --skipLibCheck` → zero errors
- `npm run build` → success, all routes compile
- `grep "recommended_model:|alias_target:" app/src/lib/services/catbot-tools.ts` → both fields present in return statement (lines 2327, 2328)

## Deviations from Plan

None — plan executed exactly as written.

## Auth Gates

None.

## Self-Check: PASSED

- [x] app/src/lib/services/catbot-tools.ts modified (target_alias param + flat fields + justification)
- [x] app/src/components/catbot/catbot-panel.tsx modified (parseRecommendation dual-shape)
- [x] Commit ecfa0df exists in git log
- [x] TypeScript clean (zero errors)
- [x] Next.js build succeeds
