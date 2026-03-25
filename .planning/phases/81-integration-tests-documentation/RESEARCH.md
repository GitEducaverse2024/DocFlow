# Phase 81 Research: Integration Tests + Documentation

## Phase Goal
Tests verify fixes against real Holded API and documentation reflects critical fields.

## Requirements
- TDOC-01: Integration test script against real Holded API
- TDOC-02: CatPaw system prompt with critical field docs
- TDOC-03: CONNECTORS.md critical field reference section
- TDOC-04: STATE.md and PROJECT.md reflect v18.0 completion

## Success Criteria
1. Integration test script runs against real Holded API: lists employees, registers time, creates timesheet, creates lead note, and requests a delete — all succeed
2. CatPaw system prompt in DoCatFlow includes critical field documentation (duration in seconds, costHour required, holdedUserId vs id, startTmp/endTmp as timestamp strings, title+desc for notes, safe delete behavior)
3. CONNECTORS.md contains a critical field reference section for Holded API
4. STATE.md and PROJECT.md reflect v18.0 completion

---

## Research Findings

### 1. Holded-MCP Codebase (`~/holded-mcp/src/`)

**Structure:**
```
src/
├── index.ts                    # MCP server entry + Express HTTP mode
├── holded-client.ts            # HTTP client with retry/rate-limiting
├── validation.ts               # 100+ Zod schemas
├── __tests__/                  # 31 test files, 383 tests (Vitest)
├── tools/                      # 27 tool definition files
└── utils/
    ├── safe-delete-routes.ts   # Express routes /confirm/:token, /cancel/:token
    ├── pending-deletes.ts      # Token store + requestDelete()
    ├── email-sender.ts         # Nodemailer HTML email
    ├── rate-limiter.ts         # Sliding window rate limiter
    ├── id-resolver.ts          # ID resolution utilities
    └── date-helpers.ts         # timeToTimestamp() with timezone support
```

**Test Framework:** Vitest v4.0.15
**Scripts:** `npm test` (vitest run), `npm run test:watch`, `npm run test:coverage`
**Node:** >=20.0.0, ES2022, Node16 modules

**Environment Variables:**
- `HOLDED_API_KEY` — Required for API auth
- `PORT` — Enables HTTP mode (for safe-delete routes)
- `SAFE_DELETE_SMTP_USER/PASS/NOTIFY_EMAIL` — Email confirmation

### 2. Critical Field Mappings (Phases 77-80)

| Phase | Tool | Field | Fix |
|-------|------|-------|-----|
| 77 | holded_register_time | duration | hours×3600 → seconds |
| 77 | holded_register_time | userId | employeeId → GET /employees/{id} → holdedUserId |
| 77 | holded_register_time | costHour | Always present, defaults 0 |
| 77 | holded_batch_register_times | all above | Resolves holdedUserId once before loop |
| 78 | holded_create_timesheet | startTmp/endTmp | HH:MM → timeToTimestamp(date, time, 'Europe/Madrid') → Unix string |
| 78 | holded_update_timesheet | startTmp/endTmp | Same conversion |
| 79 | holded_create_lead_note | title+desc | Uses {title, desc} NOT {text} |
| 79 | holded_create_lead | stageId | Passed directly (no transform) |
| 79 | holded_search_contact | — | Client-side filtering (API has no name filter) |
| 80 | All 14 DELETE tools | — | requestDelete() → email confirmation → /confirm/:token |

### 3. CatPaw System Prompt Architecture

**System prompt stored in:** `cat_paws.system_prompt` column (SQLite DB)

**Runtime assembly in:** `app/src/app/api/cat-paws/[id]/chat/route.ts` (lines 306-389)

**Current operational guide (hardcoded, lines 334-387):**
- Entity resolution protocol (employees, contacts, projects, leads, funnels)
- Time tracking types (project costing vs legal timesheets)
- Date handling (Unix timestamps)
- Invoice creation (contactId + items)
- Lead creation (funnelId mandatory)

**Critical gap:** The hardcoded guide does NOT include:
- Duration in seconds (not hours)
- costHour required field
- holdedUserId vs id distinction
- startTmp/endTmp as timestamp strings from HH:MM
- title+desc for notes (not text)
- Safe delete behavior (email confirmation flow)

**Also injected in:** `app/src/lib/services/execute-catpaw.ts` (lines 163-201)

### 4. CONNECTORS.md

**Location:** `/home/deskmath/docflow/.planning/CONNECTORS.md` (590 lines)
**Content:** Connector types, LinkedIn MCP, Gmail connector — no Holded-specific field reference section exists.

### 5. Existing Test Patterns

**Unit tests (mocked):**
- `createMockClient()` helper for HoldedClient
- `vi.mock('nodemailer')` for email
- `vi.mock('../utils/pending-deletes.js')` for safe-delete

**No integration tests exist** against real Holded API.

**Integration test considerations:**
- Real API calls need `HOLDED_API_KEY` env var
- Tests must clean up resources they create
- Rate limiting: 100 req/min default
- Need test data strategy (create → verify → cleanup)

### 6. Files to Modify

**holded-mcp (integration tests):**
- Create: `src/__tests__/integration/` directory with test scripts
- Need: Test runner that uses real HoldedClient (not mocked)

**docflow (system prompt + docs):**
- Modify: `app/src/app/api/cat-paws/[id]/chat/route.ts` — Expand operational guide with critical fields
- Modify: `app/src/lib/services/execute-catpaw.ts` — Same operational guide update
- Modify: `.planning/CONNECTORS.md` — Add Holded critical fields section
- Modify: `.planning/STATE.md` and `PROJECT.md` if they exist

---

## Suggested Plan Split

**81-01: Integration Test Script** (holded-mcp repo)
- Create integration test file(s) that hit real Holded API
- Test: list employees, register time, create timesheet, create lead note, request delete
- Uses real HoldedClient with HOLDED_API_KEY
- Cleanup after each test
- Separate npm script: `npm run test:integration`

**81-02: Documentation + System Prompt** (docflow repo)
- Update CatPaw operational guide in chat/route.ts and execute-catpaw.ts
- Add Holded critical field reference to CONNECTORS.md
- Update STATE.md/PROJECT.md for v18.0 completion
