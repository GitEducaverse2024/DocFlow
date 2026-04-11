---
phase: 137-learning-loops-memory-learn
plan: 01
subsystem: runtime-connectors
tags: [gmail, email-templates, google-drive, connector-logs, validation, tdd, vitest, better-sqlite3]

requires:
  - phase: 133-foundation-tooling-found
    provides: baseline knowledge tree + test-pipeline.mjs oracle (FOUND-01/02/08/09)
  - phase: 136-end-to-end-validation-validation-gate
    provides: INC-11/INC-12/INC-13 incident signals raised by the gate
provides:
  - render_template wrapper that fails hard when variables are missing or html still contains placeholders
  - send_email wrapper that requires non-empty to/subject/body and mandatory messageId on response
  - connector_logs rows with rich request/response payloads (INC-13) in gmail, email-template, and drive executors
  - redaction policy documented in .planning/knowledge/connector-logs-redaction-policy.md
  - canvas.json and catflow.json document INC-11/INC-12 as common_errors per CLAUDE.md protocol
affects: [137-06 signal-gate 3x reproducibility, v27.1 post-mortem capability, Holded Q1 end-to-end signal]

tech-stack:
  added: []
  patterns:
    - "Wrapper-level contract enforcement (Option B INC-12): fail loud at catpaw-*-executor.ts instead of patching canvas-executor.ts"
    - "Symmetric log payloads: success and failure paths share safeStringify + redactAndTrimArgs"
    - "extractRequiredVariableKeys/detectUnresolvedPlaceholders double defense against template bleed"

key-files:
  created:
    - .planning/knowledge/connector-logs-redaction-policy.md
    - app/src/lib/__tests__/catpaw-email-template-executor.test.ts
    - app/src/lib/__tests__/catpaw-gmail-executor.test.ts
  modified:
    - app/src/lib/services/catpaw-email-template-executor.ts
    - app/src/lib/services/catpaw-gmail-executor.ts
    - app/src/lib/services/catpaw-drive-executor.ts
    - app/data/knowledge/canvas.json
    - app/data/knowledge/catflow.json
    - app/data/knowledge/_index.json

key-decisions:
  - "INC-12 closed at wrapper layer (Option B) per PLAN objective: canvas-executor.ts and execute-catpaw.ts remain untouched; wrapper emits {error,raw_response} when args are incomplete or response lacks messageId, the agent LLM cannot fabricate success without contradicting the tool response, and 137-06 signal-gate observes end-to-end truth (email arrival in real inbox)."
  - "For render_template, required variable keys = every `block.text` of every `instruction` block across header/body/footer sections, because template-renderer.ts maps `variables[block.text]` during renderBlock."
  - "Second line of defense after renderTemplate scans for residual `{{X}}` tokens OR the literal string 'Contenido principal del email' (exact symptom observed in Phase 136 gate), returning explicit error rather than allowing template bleed into the send_email body."
  - "connector_logs payload cap: safeStringify applies a hard 10_000 char cap on the entire stringified JSON plus per-arg trim; body and html_body are replaced with body_len/html_body_len for privacy and size control."
  - "Credentials redacted by key name (access_token, refresh_token, api_key, password, client_secret, authorization, cookie, oauth_token) in gmail and drive executors — documented in connector-logs-redaction-policy.md."

patterns-established:
  - "TDD strict: RED commit (failing tests) → GREEN commit (implementation) for every fix."
  - "Wrapper logging shape: `{operation, pawId, args}` as request_payload, real tool result as response_payload."
  - "Knowledge tree updates go with the code: canvas.json + catflow.json common_errors added in the same commit as the feature fix, per CLAUDE.md knowledge protocol."

requirements-completed: [INC-11, INC-12, INC-13]

duration: 8min
completed: 2026-04-11
---

# Phase 137 Plan 01: Runtime Connector Contracts Summary

**Wrapper-level closure of INC-11/12/13 runtime bugs that blocked the Phase 136 Holded Q1 signal: render_template now enforces the template variable contract, send_email exiges messageId, and connector_logs captures post-mortem-reconstructible request/response payloads across gmail/email-template/drive executors.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-11T16:24:33Z
- **Completed:** 2026-04-11T16:31:54Z
- **Tasks:** 2 (both TDD, 4 atomic commits)
- **Files modified:** 6 (+ 3 created)

## Accomplishments

- **INC-11 closed** — `render_template` refuses to render when any `instruction` block's text is missing from `variables` or has an empty value, and detects residual `{{X}}` tokens or the literal `"Contenido principal del email"` in the rendered html (both are canvas-executor failure modes observed in the Phase 136 gate).
- **INC-12 closed at wrapper layer** — `send_email` rejects empty `to`/`subject`/`body|html_body` and rejects responses missing `messageId`, emitting `{error, raw_response}` instead of silent `{ok:true}`. Sanctioned as Option B in the plan objective — canvas-executor.ts remains untouched; 137-06 signal-gate observes end-to-end truth as the verifier.
- **INC-13 closed** — `catpaw-gmail-executor.ts`, `catpaw-email-template-executor.ts`, and `catpaw-drive-executor.ts` now persist `{operation, pawId, args}` as request_payload and the real tool result as response_payload. Credentials are redacted by key name; body/html_body/content are replaced by length counters; payloads are hard-capped at 10_000 chars via `safeStringify`. Failure paths share the same rich shape.
- **Knowledge tree** — `canvas.json` and `catflow.json` both document INC-11 and INC-12 as `common_errors` with cause + solution, per CLAUDE.md knowledge protocol. `catflow.json` howto adds a post-mortem diagnostic entry for empty-html renderer runs.
- **Redaction policy doc** — `.planning/knowledge/connector-logs-redaction-policy.md` documents persisted/redacted fields per operation, safeStringify cap, TODO debug mode, and before/after examples — closes INC-13 criterion #3.

## Task Commits

Each task was committed atomically following TDD strict (RED → GREEN):

1. **Task 1 RED: failing tests INC-11/INC-13 email template** — `014342b` (test)
2. **Task 1 GREEN: render_template contract + rich logging** — `184b7ba` (feat)
3. **Task 2 RED: failing tests INC-12/INC-13 gmail + knowledge + policy** — `946f780` (test)
4. **Task 2 GREEN: gmail strict validation + drive logging + knowledge + policy doc** — `1a79601` (feat)

## Files Created/Modified

- `app/src/lib/services/catpaw-email-template-executor.ts` — added `extractRequiredVariableKeys`, `detectUnresolvedPlaceholders`, `safeStringify`, `trimArgsForLog`; render_template fails loud on missing variables / residual placeholders; connector_logs INSERT rewritten with rich payloads on success and failure paths.
- `app/src/lib/services/catpaw-gmail-executor.ts` — added `safeStringify`, `redactAndTrimArgs`; send_email enforces to/subject/body|html_body and messageId; connector_logs payloads rebuilt with redaction.
- `app/src/lib/services/catpaw-drive-executor.ts` — added `safeStringify`, `redactAndTrimDriveArgs`; upload_file `content` arg replaced by `content_len` in logs; both success and failure log paths rebuilt.
- `app/src/lib/__tests__/catpaw-email-template-executor.test.ts` — 5 vitest cases (4 INC-11 + 2 INC-13). Created.
- `app/src/lib/__tests__/catpaw-gmail-executor.test.ts` — 11 vitest cases (8 INC-12 + 2 INC-13 + 3 knowledge/policy parity). Created.
- `app/data/knowledge/canvas.json` — INC-11 / INC-12 common_errors, sources refreshed, updated_at → 2026-04-11.
- `app/data/knowledge/catflow.json` — INC-11 / INC-12 common_errors, howto post-mortem entry, sources refreshed.
- `app/data/knowledge/_index.json` — canvas updated_at synced to 2026-04-11 (Rule 3 auto-fix, parity test).
- `.planning/knowledge/connector-logs-redaction-policy.md` — new doc. Closes INC-13 criterion #3.

## Decisions Made

- **Required variable keys derived from `instruction` blocks only.** The template-renderer maps `variables[block.text]` specifically for `instruction` blocks (line 55-68 of `template-renderer.ts`); `text`/`image`/`video`/`logo` blocks are static. Tracking required keys on those would generate false positives.
- **`block.text` is used both as label and key.** The template DB schema treats the instruction text as the semantic key (e.g. "Contenido principal del email"). When absent, renderBlock emits the dashed placeholder div with that literal text — exactly what leaked through the Phase 136 gate. `detectUnresolvedPlaceholders` looks for that literal as its last line of defense.
- **INC-12 wrapper-level closure (Option B) is adequate for this milestone.** The agent LLM cannot fabricate `{ok:true}` when it receives `{error:...}` from the tool without producing a hallucination visible in the post-mortem (now reconstructible thanks to INC-13). Option A (executor-level check parsing the agent's textual output) was explicitly deferred to v27.2 — documented in the plan objective, not re-argued here.
- **Redaction policy lives in `.planning/knowledge/`, not `/app/data/knowledge/`.** It's a policy spec for developers, not a CatBot knowledge area. The catflow/canvas JSONs link back to the policy doc in their `sources` arrays.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] knowledge-tree parity test failed after canvas.json updated_at bump**

- **Found during:** Task 2 GREEN verification (running `npx vitest run knowledge-tree`).
- **Issue:** `src/lib/__tests__/knowledge-tree.test.ts > updated_at > _index.json areas[].updated_at matches individual JSON updated_at` failed with `expected '2026-04-09' to be '2026-04-11'`. The plan PASO 6 updated `canvas.json.updated_at` to 2026-04-11 but left `_index.json` at 2026-04-09, violating the parity invariant.
- **Fix:** Bumped `_index.json` canvas entry updated_at to 2026-04-11.
- **Files modified:** `app/data/knowledge/_index.json`.
- **Verification:** `npx vitest run knowledge-tree` → 19/19 green.
- **Committed in:** `1a79601` (Task 2 GREEN commit).

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking).
**Impact on plan:** Minimal. Parity fix was mechanical; no scope creep.

## Issues Encountered

- **Pre-existing test failures unrelated to this plan.** Running the full vitest suite revealed ~21 failing tests across `catbot-prompt-assembler.test.ts`, `task-scheduler.test.ts`, and `catbot-holded-tools.test.ts`. Verified via `git stash` pop/push that these failures are present on the baseline tree (they belong to in-flight plans 137-02 / 137-03 / 137-05 whose uncommitted work coexists in the same working directory). **Out of scope per the execution rules' scope boundary** — logged here for visibility but not touched. My task's relevant tests (`catpaw-email-template-executor`, `catpaw-gmail-executor`, `knowledge-tree`) are 35/35 green.
- **Concurrent in-flight plans on the same branch.** The `main` branch already carried uncommitted modifications for 137-02 and 137-03 when this plan started. Only the files listed in `key-files` above were staged into my commits; I took care to avoid `git add .` and staged each file individually.

## Self-Check

- [x] `.planning/knowledge/connector-logs-redaction-policy.md` exists (`test -f` → FOUND).
- [x] Commits `014342b`, `184b7ba`, `946f780`, `1a79601` present in `git log`.
- [x] `grep -q "INC-11" app/data/knowledge/canvas.json` → FOUND.
- [x] `grep -q "INC-12" app/data/knowledge/canvas.json` → FOUND.
- [x] `grep -q "INC-11" app/data/knowledge/catflow.json` → FOUND.
- [x] `grep -q "INC-12" app/data/knowledge/catflow.json` → FOUND.
- [x] `npx vitest run catpaw-email-template-executor catpaw-gmail-executor knowledge-tree` → 35/35 PASSED.

## Self-Check: PASSED

## User Setup Required

None — no external service configuration required. The wrapper-level fixes are live in source; they take effect automatically on the next docker rebuild (`docker compose build --no-cache && docker compose up -d && docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/ && docker restart docflow-app`).

## Next Phase Readiness

- **INC-11/12/13 precondition for LEARN-01 signal lifted.** The 137-06 signal-gate can now validate end-to-end without being masked by render bleed or silent send success.
- **Post-mortem reconstructible.** Any future Phase 136-style incident can now parse `connector_logs` and distinguish (a) args the canvas-executor sent, from (b) what the connector actually returned.
- **137-06 acceptance form update required:** the plan objective documents a new line to add to the signal-gate checklist — "Si el wrapper Gmail falla (args incompletos o respuesta sin messageId), el agent emitter propaga el error en su output textual — NO fabrica 'enviado correctamente'. Verificar en connector_logs que response_payload NO trae messageId ↔ output del nodo emitter NO afirma envío exitoso." This is a doc update to `137-06-signal-gate-3x-reproducibility-PLAN.md` and is tracked there, not here.
- **Option A (executor-level check for agent output ↔ tool response consistency)** remains deferred to v27.2 per the plan objective. Only implement if Phase 137-06 observes evidence that wrapper-level closure is insufficient.

---
*Phase: 137-learning-loops-memory-learn*
*Completed: 2026-04-11*
