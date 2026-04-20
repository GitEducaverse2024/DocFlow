# Phase 156: KB Runtime Integrity (gap closure) — Research

**Researched:** 2026-04-20
**Domain:** Knowledge Base runtime integrity — closing scope gaps in canvas write-path, delete_catflow sudo tool, link-tool re-sync, and orphan cleanup (v29.1 milestone gap closure).
**Confidence:** HIGH (grounded in direct code inspection of the exact call sites, verified orphan inventory against live DB, and replicated Phase 153 patterns that this phase mirrors byte-identically).

## Summary

Phase 156 is a **pure mirror-and-extend phase** — every success criterion is already solved elsewhere in the codebase by Phase 153 (Plans 02+03), and the task is to propagate that exact pattern to four previously-unhooked surfaces: the 3 canvas API route handlers, the `delete_catflow` sudo tool case, and the 2 link-tool cases. No new design is required. The Phase 153 helpers (`syncResource`, `hookCtx`, `hookSlug`, `markStale`, `invalidateKbIndex`) already exist with frozen signatures; `knowledge-sync.ts` already declares the `canvas` entity (`Entity` union L33-39, `ENTITY_SUBDIR` L76-83, `ENTITY_TO_TABLE` L104-111, `FIELDS_FROM_DB.canvas` L101).

The only genuinely new code is (a) extending `buildBody()` at `knowledge-sync.ts:966` to emit `## Conectores vinculados` + `## Skills vinculadas` sections for `entity === 'catpaw'`, reading from the `cat_paw_connectors` + `cat_paw_skills` JOIN tables, and (b) orphan inventory + retention-policy docs — the existing `scripts/kb-sync-db-source.cjs` already detects orphans but logs `WARN` and leaves them untouched; this phase must either extend the script or manually triage the 10 orphans (actual count is higher — see §Orphan Inventory). The `_manual.md` §Lifecycle section exists but covers only the deprecated-time-elapsed path; it needs a new §Retention Policy section covering the orphan-on-disk case.

**Primary recommendation:** Plan 156-01 replicates `/api/cat-paws/[id]` byte-for-byte across the 3 canvas route handlers and ports `delete_catflow` to use `syncResource('canvas','delete',{id})` instead of the raw `db.prepare('DELETE FROM canvases')`; Plan 156-02 adds 2 tool-case hooks to `link_connector_to_catpaw` + `link_skill_to_catpaw` and extends `buildBody` for catpaw with two new sections that query the relation tables; Plan 156-03 runs `kb-sync.cjs --audit-stale` (may need to extend the script to detect DB-missing orphans — current implementation only detects `status: deprecated` files, not orphans with `status: active`), archives or purges, documents the retention policy. All three plans are TDD RED-first: write the assertion tests against the current state (they fail), ship the hook (they pass).

<user_constraints>
## User Constraints (from CONTEXT.md)

**No CONTEXT.md exists for Phase 156.** The phase was spawned directly from ROADMAP gap-closure (post-audit automatic scope), bypassing `/gsd:discuss-phase`. The Phase 156 ROADMAP entry + the embedded success criteria in the research prompt serve as the effective constraint set. There are no user-discretion zones to leave open — the audit narrowly specified the four deliverables and the research brief explicitly states "Do NOT research alternative designs."

### Locked Decisions (from audit + success criteria)
- **Mirror the Phase 153 pattern byte-identically.** `hookCtx`/`hookSlug`/`markStale`/`invalidateKbIndex`/`syncResource` signatures are frozen. No redesign.
- **Soft-delete semantics for canvas.** DELETE /api/canvas/[id] and delete_catflow sudo both go through `syncResource('canvas','delete',{id})` → `markDeprecated()`. No `fs.unlink` of KB files.
- **Keep sudo session requirement for delete_catflow.** Gate stays; only the internal DELETE statement is rewritten.
- **Canvas_create tool stays pass-through.** It fetches `POST /api/canvas`, so hooking the route is sufficient; no second hook on the tool case (same rationale as Phase 153 KB-19 excluding `update_cat_paw`).
- **Orphans archive to `.docflow-legacy/orphans/`.** `_archived/YYYY-MM-DD/` is for time-elapsed deprecated files (Phase 149 lifecycle); orphans go to the sibling legacy folder, per the success-criteria brief.

### Claude's Discretion
- **Exact API shape for optional `purge:true` flag on `delete_catflow`.** Success criterion KB-41 mentions an optional `purge: true` arg for hard-delete; schema + parameter docs left to planner discretion as long as default remains soft-delete.
- **Wording of §Retention Policy in `_manual.md`.** Brief says ≤30 lines covering four dimensions (when deprecated, when archive, when purge, manual command); exact prose at planner's discretion.
- **Whether to extend `scripts/kb-sync.cjs --audit-stale`** to detect `status: active` orphans (DB row missing), or handle orphan triage manually outside the CLI. Current CLI only detects deprecated-and-old. Low-effort extension; planner picks.
- **Test file organization.** Brief suggests `canvas-api-kb-sync.test.ts` and `catbot-tools-link.test.ts` + `knowledge-sync-catpaw-template.test.ts`; planner may consolidate if more natural.

### Deferred Ideas (OUT OF SCOPE)
- G2 (`create_catbrain` entries schema) — defer to v29.2, needs catbrain data-model research.
- G3a (`delete_cat_paw` tool addition) — SHOULD-FIX in audit but not part of KB-40..KB-43.
- G3b (full CRUD symmetry: skills full CRUD, connector/catbrain/task update+delete, canvas_update, delete_intent) — product scope decision deferred.
- G6 (summary auto-generation quality) — cosmetic, deferred.
- G7 (`updated_by` attribution consistency on email-template delete) — 10-min fix, deferred to hotfix.
- G8 (duplicate `-2` suffix files investigation) — investigation deferred.
- Nyquist backfill for Phases 149-154 (4 PARTIAL + 2 MISSING VALIDATION.md) — owed to `/gsd:validate-phase` loop before `/gsd:complete-milestone v29.1`, not part of 156.
- Hard-delete (physical purge) of orphans during this phase — policy decision documented, but the archive motion stops at `.docflow-legacy/orphans/`. Purge is separate `--purge --confirm` invocation on operator's schedule.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **KB-40** | Canvas write-path KB sync: POST `/api/canvas/route.ts`, PATCH+DELETE `/api/canvas/[id]/route.ts` call `syncResource('canvas', op, row, hookCtx(...))` + `invalidateKbIndex()`; `markStale` on failure. | §Exact Code Sites (§A.1-A.3), §Reference Pattern (§B.1), §Hook Signatures (§C), §Test Strategy (§G.1). Existing `knowledge-sync.ts` already supports `canvas` entity type. |
| **KB-41** | `delete_catflow` in `catbot-sudo-tools.ts` L695-775 replaces `DELETE FROM canvases` with `syncResource('canvas','delete',...)` flow; soft-delete default, optional `purge: true` for hard-delete. | §Exact Code Sites (§A.4), §Reference Pattern (§B.2), §Test Strategy (§G.2). |
| **KB-42** | `link_connector_to_catpaw` (catbot-tools.ts:2122) + `link_skill_to_catpaw` (L2148) call `syncResource('catpaw','update', paw_row, hookCtx(...))` after INSERT; `buildBody()` (L966) extended for `entity === 'catpaw'` with `## Conectores vinculados` + `## Skills vinculadas` sections reading `cat_paw_connectors` JOIN `connectors` and `cat_paw_skills` JOIN `skills`. | §Exact Code Sites (§A.5-A.6), §Template Extension (§D), §Test Strategy (§G.3). |
| **KB-43** | `scripts/kb-sync.cjs --audit-stale` identifies orphans; archive via `--archive --confirm` moves to `.docflow-legacy/orphans/`; retention policy in `.docflow-kb/_manual.md`. | §Orphan Inventory (§E — actual count is 36 active + 6 deprecated orphans, NOT 10 as brief claims), §CLI Extension Options (§F), §Retention Policy Dimensions (§H). |
</phase_requirements>

## A. Exact Code Sites (file paths + line numbers + current state)

### A.1 `/api/canvas/route.ts` — POST handler (create)

**File:** `/home/deskmath/docflow/app/src/app/api/canvas/route.ts`

**Current state (L70-119):** POST handler runs `INSERT INTO canvases` at L96-109, returns `{id, redirectUrl}` at L111-114. Zero imports from knowledge-sync/kb-index-cache/kb-audit/kb-hook-helpers. No try/catch wrapping syncResource.

**Required change:** After the INSERT at L109, before `return NextResponse.json(...)` at L111:
1. `SELECT * FROM canvases WHERE id = ?` to get the canonical row.
2. `try { await syncResource('canvas','create', row, hookCtx('api:canvas.POST')); invalidateKbIndex(); } catch { logger.error + markStale }`.
3. Add 4 imports at top.

**Response shape invariant:** The route currently returns `{id, redirectUrl}`. Don't change that — Phase 153 routes that DO hook pass `row` separately (T3/T4 tests in kb-hooks-api-routes.test.ts assert `syncSpy` called with the row shape, not the response body). Keep `NextResponse.json({id, redirectUrl: ...}, {status: 201})` intact.

### A.2 `/api/canvas/[id]/route.ts` — PATCH handler (update)

**File:** `/home/deskmath/docflow/app/src/app/api/canvas/[id]/route.ts`

**Current state (L22-99):** PATCH handler builds dynamic UPDATE statement, runs it at L92, returns `{success: true}` at L94. Zero KB hooks. Notable: handler has a **short-circuit** at L87-90 when `updates.length === 1` (only `updated_at` was added) — returns without DB write. Hook must respect this short-circuit (skip syncResource when no actual change).

**Function signature note:** This file uses old-style `{ params: { id: string } }` (synchronous), NOT the newer `{ params: Promise<{ id: string }> }` used by `/api/cat-paws/[id]`. Route-handler signature will need to be updated to Promise-based params to match the Phase 153 Next.js 14 convention (or kept synchronous — `/api/connectors/[id]` and `/api/skills/[id]` both still use the non-Promise form; inconsistency exists project-wide). Planner should check project conventions and decide. **Recommendation: keep non-Promise form to minimize diff surface; it's still supported in Next 14 and the existing file uses it.**

**Required change:** After `db.prepare(UPDATE).run(...)` at L92, before `return NextResponse.json({success:true})` at L94:
1. `SELECT * FROM canvases WHERE id = ?` to get the updated row.
2. `try { await syncResource('canvas','update', row, hookCtx('api:canvas.PATCH')); invalidateKbIndex(); } catch { logger.error + markStale }`.
3. `markStale` path on failure: `resources/canvases/${id.slice(0,8)}-${hookSlug(String(row.name))}.md`, reason `'update-sync-failed'`.

### A.3 `/api/canvas/[id]/route.ts` — DELETE handler (delete)

**Current state (L101-117):** DELETE handler runs `db.prepare('DELETE FROM canvases WHERE id = ?').run(params.id)` at L110, relies on CASCADE for canvas_runs cleanup. Returns `{success: true}` at L112.

**Required change:** Before the `DELETE FROM canvases` at L110 (or after — order matters for rollback semantics), need a name available for markStale. Current L103 does `SELECT id FROM canvases WHERE id = ?`; change to `SELECT id, name FROM canvases` so markStale path has the slug. Then:
1. DB DELETE at L110.
2. `try { await syncResource('canvas','delete', {id: params.id}, hookCtx('api:canvas.DELETE', { reason: `DB row deleted at ${new Date().toISOString()}` })); invalidateKbIndex(); } catch { logger.error + markStale with reason 'delete-sync-failed' }`.

**Invariant:** KB file persists with `status: deprecated` after DELETE — **never** `fs.unlink` the KB file. `markDeprecated()` is called internally by `syncResource(_,'delete',_)`.

### A.4 `delete_catflow` sudo tool

**File:** `/home/deskmath/docflow/app/src/lib/services/catbot-sudo-tools.ts`

**Current state (L695-775):** `deleteCatFlow(args)` function. Key flow:
- L696-702: arg validation (`identifier` required, `confirmed` flag).
- L705-734: find canvas by id → name → LIKE match; handle `AMBIGUOUS` (>1 match).
- L736: `runCount = SELECT COUNT(*) FROM canvas_runs WHERE canvas_id = ?`.
- L738-757: if `!confirmed`, return `CONFIRM_REQUIRED` preview.
- **L759-769: the hard-delete site.** `db.prepare('DELETE FROM canvases WHERE id = ?').run(canvas.id)` at **L760**, then logger.info + return `{status: DELETED, deleted: {id, name, runs_cascaded}}`.
- L770-774: catch returns error.

**Required change at L760:**
1. Keep the DB DELETE (source of truth wins).
2. After the DELETE, add the Phase 153 try/catch pattern:
   ```ts
   try {
     await syncResource('canvas', 'delete', { id: canvas.id },
       hookCtx('catbot-sudo:delete_catflow',
         { reason: `canvas run count ${runCount} cascaded` }));
     invalidateKbIndex();
   } catch (err) {
     const errMsg = (err as Error).message;
     logger.error('kb-sync', 'syncResource failed on delete_catflow', {
       entity: 'canvas', id: canvas.id, err: errMsg,
     });
     markStale(
       `resources/canvases/${canvas.id.slice(0,8)}-${hookSlug(canvas.name)}.md`,
       'delete-sync-failed',
       { entity: 'canvases', db_id: canvas.id, error: errMsg },
     );
   }
   ```
3. Function is sync (`function deleteCatFlow(args)`) — must become `async` since `syncResource` is `Promise<void>`. Dispatcher at L249 already `return deleteCatFlow(args)` — it will need to be `return await deleteCatFlow(args)` if caller chain expects synchronous `ToolResult`. Check the dispatcher shape in the sudo-tools executor.
4. 4 new imports needed at top of catbot-sudo-tools.ts (currently only imports execSync, db, catbot-db helpers, catbot-learned, logger): add `syncResource`, `invalidateKbIndex`, `markStale`, `hookCtx`, `hookSlug`.
5. **Optional `purge: true` arg** (KB-41 spec): if `args.purge === true`, skip the syncResource call (hard-delete semantics, file physically removed by separate `fs.unlinkSync` or simply leave orphan for next `--archive` cycle). Default is soft-delete.

### A.5 `link_connector_to_catpaw` tool case

**File:** `/home/deskmath/docflow/app/src/lib/services/catbot-tools.ts`

**Current state (L2122-2146):** Case handler flow:
- L2123-2124: extract `catpawId`, `connectorId` from args.
- L2126-2127: fetch paw row `SELECT id, name FROM cat_paws WHERE id = ?`; error if missing.
- L2129-2130: fetch connector row; error if missing.
- **L2132-2140: the INSERT.** `INSERT INTO cat_paw_connectors (paw_id, connector_id, usage_hint, is_active, created_at) VALUES (?,?,?,1,?)`. UNIQUE collision → return `already_linked: true`; other errors rethrow.
- L2142-2145: return `{linked: true, catpaw_id, catpaw_name, connector_id, connector_name}`.

**Required change after L2140 (successful INSERT path, before return at L2142):**
1. SELECT full paw row for syncResource (current code only has `{id, name}`; we need full row for `syncResource('catpaw','update',row)`):
   ```ts
   const pawRow = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(catpawId) as Record<string, unknown> & { id: string };
   ```
2. Phase 153 try/catch block:
   ```ts
   try {
     await syncResource('catpaw', 'update', pawRow, hookCtx(context?.userId ?? 'catbot:link_connector'));
     invalidateKbIndex();
   } catch (err) {
     const errMsg = (err as Error).message;
     logger.error('kb-sync', 'syncResource failed on link_connector_to_catpaw', {
       entity: 'catpaw', id: catpawId, err: errMsg,
     });
     markStale(
       `resources/catpaws/${catpawId.slice(0,8)}-${hookSlug(paw.name)}.md`,
       'update-sync-failed',
       { entity: 'cat_paws', db_id: catpawId, error: errMsg },
     );
   }
   ```
3. **Do NOT** add the hook on the `UNIQUE` collision / `already_linked` path (nothing changed, idempotent return).
4. `executeTool` is already async (contains other `await fetch` calls and `await syncResource` calls elsewhere in same file — L1524, L1577, L1655), so no function-signature change.
5. The Phase 153 catbot-tools.ts already imports `syncResource`, `invalidateKbIndex` from knowledge-sync / kb-index-cache, plus `hookCtx`/`hookSlug` from kb-hook-helpers, plus `markStale` from kb-audit. Verify all 5 imports at top. Current L9: `import { searchKb, getKbEntry, resolveKbEntry, invalidateKbIndex } from './kb-index-cache'` ✓. Need to verify `syncResource`, `markStale`, `hookCtx`, `hookSlug` are all already imported (Phase 153 added them for other tool cases).

### A.6 `link_skill_to_catpaw` tool case

**File:** `/home/deskmath/docflow/app/src/lib/services/catbot-tools.ts`

**Current state (L2148-2164):** Similar shape to link_connector_to_catpaw:
- L2149-2150: extract args.
- L2152-2153: fetch paw row; error if missing.
- L2155-2156: fetch skill row; error if missing.
- **L2158: `INSERT OR IGNORE INTO cat_paw_skills (paw_id, skill_id) VALUES (?, ?)`** — note `OR IGNORE` means no UNIQUE error thrown; silent idempotence.
- L2160-2163: return `{linked: true, catpaw_id, catpaw_name, skill_id, skill_name}`.

**Required change after L2158:**
Same pattern as §A.5, but using `'catbot:link_skill'` as the hookCtx author. 

**Subtle issue:** `INSERT OR IGNORE` means we can't distinguish a true link from an idempotent re-link. To avoid unnecessary version bumps on re-link, planner should either:
(a) Check `db.changes` after the INSERT and only fire syncResource if `changes === 1`, OR
(b) Always fire syncResource and rely on `isNoopUpdate()` in knowledge-sync.ts:1145 to short-circuit when nothing changed.

Option (a) is more efficient but requires capturing `stmt.run(...)` return value (better-sqlite3 returns `{changes, lastInsertRowid}`). Option (b) is safer against `isNoopUpdate` detecting body text changes even when the link is idempotent — BUT body will NOW change (§D adds the Conectores/Skills sections), and those sections will be byte-identical on re-link. Verify that `isNoopUpdate` compares `body` at L1145 — yes, it compares `newBody` (see L1145). So (b) should work correctly: re-link → same body → no-op detected → no version bump. **Recommend (b) for symmetry with link_connector_to_catpaw.**

## B. Reference Patterns (mirror these byte-identically)

### B.1 `/api/cat-paws/[id]/route.ts` POST/PATCH/DELETE — the gold-standard pattern

**File:** `/home/deskmath/docflow/app/src/app/api/cat-paws/route.ts` (POST, L59-150) and `/home/deskmath/docflow/app/src/app/api/cat-paws/[id]/route.ts` (PATCH L56-138, DELETE L140-180).

**Import block (verbatim, 4 imports in consistent order):**
```ts
import { syncResource } from '@/lib/services/knowledge-sync';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';
import { markStale } from '@/lib/services/kb-audit';
import { hookCtx, hookSlug } from '@/lib/services/kb-hook-helpers';
```

**POST hook (after INSERT, after SELECT-back, before return):**
```ts
const row = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as Record<string, unknown> & { id: string };

try {
  await syncResource('catpaw', 'create', row, hookCtx('api:cat-paws.POST'));
  invalidateKbIndex();
} catch (err) {
  const errMsg = (err as Error).message;
  logger.error('kb-sync', 'syncResource failed on POST /api/cat-paws', {
    entity: 'catpaw', id, err: errMsg,
  });
  markStale(
    `resources/catpaws/${id.slice(0, 8)}-${hookSlug(String(body.name))}.md`,
    'create-sync-failed',
    { entity: 'cat_paws', db_id: id, error: errMsg },
  );
}
```

**PATCH hook (after UPDATE, after SELECT-back `updated`, before return):** Identical, with:
- `author: 'api:cat-paws.PATCH'`
- reason argument omitted (not `hookCtx(author, {reason})`, just `hookCtx(author)`)
- markStale reason: `'update-sync-failed'`

**DELETE hook (after DB DELETE):**
```ts
try {
  await syncResource('catpaw', 'delete', { id }, hookCtx(
    'api:cat-paws.DELETE',
    { reason: `DB row deleted at ${new Date().toISOString()}` },
  ));
  invalidateKbIndex();
} catch (err) {
  const errMsg = (err as Error).message;
  logger.error('kb-sync', 'syncResource failed on DELETE /api/cat-paws/[id]', {...});
  markStale(
    `resources/catpaws/${id.slice(0, 8)}-${hookSlug(String((paw as { name?: string }).name ?? ''))}.md`,
    'delete-sync-failed',
    { entity: 'cat_paws', db_id: id, error: errMsg },
  );
}
```

**Key observations for canvas mirror:**
- The 3rd arg to `syncResource` on `'delete'` op is `{id}` — NOT the full row (for DELETE, row is already gone from DB).
- markStale hard-codes the KB subfolder in the path string (`resources/catpaws/...` → use `resources/canvases/...` for canvas).
- Entity codes differ: `markStale.entity: 'cat_paws'` is the DB table name; `syncResource` first arg is `'catpaw'` (the `Entity` type). For canvas: DB table = `'canvases'`, Entity = `'canvas'`.

### B.2 `DELETE /api/cat-paws/[id]` → mirror for `delete_catflow` sudo tool

The sudo tool pattern differs only in the author string:
- API route: `'api:cat-paws.DELETE'`
- Sudo tool: `'catbot-sudo:delete_catflow'`

The sudo tool also needs to become `async` (current `function deleteCatFlow(args): ToolResult` → `async function deleteCatFlow(args): Promise<ToolResult>`). Dispatcher at L249 + consumer need to await.

## C. Hook Signatures (frozen APIs — do NOT re-invent)

### `syncResource(entity, op, row, context?)`

**Location:** `app/src/lib/services/knowledge-sync.ts:1065`

**Signature:**
```ts
export async function syncResource(
  entity: Entity,
  op: Op,
  row: DBRow | { id: string },
  context?: SyncContext
): Promise<void>
```

- `Entity = 'catpaw' | 'connector' | 'catbrain' | 'template' | 'skill' | 'canvas'` (L33-39 — **canvas already defined**).
- `Op = 'create' | 'update' | 'delete' | 'access'` (L41).
- `row`: full DB row for create/update; `{id}` object for delete/access.
- `context = { author?, kbRoot?, reason?, superseded_by? }` (L59-64).
- Returns `Promise<void>`. Throws on failure — callers wrap in try/catch.
- Side effects on success: writes `.md` file, rewrites `_index.json`, regenerates `_header.md`, calls internal `invalidateLLMCache` (L1205).
- `'update'` op is idempotent: L1145 `isNoopUpdate()` short-circuits when frontmatter+body are structurally identical → no version bump, no file write.
- `'delete'` op calls `markDeprecated(path, row, author, reason, supersededBy)` at L1186.

### `hookCtx(author, extras?)`

**Location:** `app/src/lib/services/kb-hook-helpers.ts:46`

**Signature:**
```ts
export function hookCtx(
  author: string,
  extras?: { reason?: string },
): { author: string; kbRoot?: string; reason?: string }
```

- Bridges `process.env.KB_ROOT` into SyncContext.kbRoot (L50).
- In prod, `KB_ROOT` is unset → returns `{author}` only → service uses `DEFAULT_KB_ROOT`.
- Author convention: `'api:<entity>.<METHOD>'` (e.g., `'api:canvas.POST'`) for routes, `'catbot-sudo:<toolname>'` for sudo tools, `'catbot:<context>'` for CatBot tool cases.

### `hookSlug(name)`

**Location:** `app/src/lib/services/kb-hook-helpers.ts:27`

**Signature:**
```ts
export function hookSlug(name: string): string
```

- Byte-identical mirror of `knowledge-sync.ts:117-123 slugify()` (the service does not export it).
- `(name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'unnamed'`
- Used to build the `markStale` path so it points at the file `syncResource` would have created.

### `markStale(kbRelPath, reason, details?)`

**Location:** `app/src/lib/services/kb-audit.ts:59`

**Signature:**
```ts
export function markStale(
  kbRelPath: string,
  reason: StaleReason,
  details?: StaleEntry,
): void

type StaleReason = 'create-sync-failed' | 'update-sync-failed' | 'delete-sync-failed' | 'markDeprecated-failed';
interface StaleEntry { entity: string; db_id: string; error: string; }
```

- Never throws. Appends to `.docflow-kb/_sync_failures.md` (separate from `_audit_stale.md`).
- `entity` in details is the DB table name (e.g., `'canvases'`, `'cat_paws'`), NOT the Entity union value.

### `invalidateKbIndex()`

**Location:** `app/src/lib/services/kb-index-cache.ts:192`

**Signature:**
```ts
export function invalidateKbIndex(): void
```

- Resets in-memory 60s TTL cache + source-of-truth map.
- Call order per Phase 153 convention: after `syncResource` success, before the HTTP response. **Never** call on the failure path (kb-hooks-api-routes.test.ts T12 line 676 asserts this).

## D. Template Extension (KB-42 — `buildBody` for catpaw)

### Current state

**Location:** `app/src/lib/services/knowledge-sync.ts:966-1011`

**Current catpaw body rendering (L985-1008):**
```ts
if (entity === 'catpaw') {
  lines.push(`**Modo:** ${row.mode ?? 'n/a'} | **Modelo:** ${row.model ?? 'n/a'} | **Departamento:** ${row.department ?? 'n/a'}`);
  lines.push('');
  if (row.system_prompt) {
    lines.push('## System prompt');
    lines.push('');
    lines.push('```');
    lines.push(String(row.system_prompt).slice(0, 1000));
    lines.push('```');
    lines.push('');
  }
  if (row.temperature !== undefined || row.max_tokens !== undefined) {
    lines.push('## Configuración');
    lines.push('');
    if (row.temperature !== undefined) lines.push(`- Temperature: ${row.temperature}`);
    if (row.max_tokens !== undefined) lines.push(`- Max tokens: ${row.max_tokens}`);
    lines.push('');
  }
}
```

### Required extension

**Problem:** `buildBody` currently takes `(entity, row, fm)` — no DB access. To render "Conectores vinculados" + "Skills vinculadas" sections, it needs to query `cat_paw_connectors` JOIN `connectors` and `cat_paw_skills` JOIN `skills`. But `knowledge-sync.ts` **does not import `db`** — it's pure filesystem (explicit contract at L19-20: `No importar better-sqlite3; el servicio opera sólo sobre filesystem`).

**Three resolution options:**

**Option A (preferred): Pass `linked_connectors` + `linked_skills` arrays in the `row` argument**

Caller (hook site) does the JOIN query and passes enriched row. `buildBody` reads `row.linked_connectors` (array of `{id, name}` objects) and renders them. Preserves the "no DB in knowledge-sync" contract. Requires the 2 link-tool cases in catbot-tools.ts to SELECT the enriched row, AND requires `/api/cat-paws/*` route handlers + `create_cat_paw` tool case to do the same (for consistency on first-create rendering). Extra line in every catpaw hook site:
```ts
const linked_connectors = db.prepare('SELECT c.id, c.name FROM cat_paw_connectors cpc LEFT JOIN connectors c ON c.id = cpc.connector_id WHERE cpc.paw_id = ?').all(id);
const linked_skills = db.prepare('SELECT s.id, s.name FROM cat_paw_skills cps LEFT JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?').all(id);
const enriched = { ...row, linked_connectors, linked_skills };
await syncResource('catpaw', op, enriched, hookCtx(...));
```

**Option B: Break the "no DB" contract and import db in knowledge-sync**

Simpler inside the service but violates the Phase 149 Plan 03 contract (decision at STATE.md L107: *"app/ has js-yaml available, but dep-free parser guarantees byte-for-byte round-trip"* — the no-DB stance is equally load-bearing). Regression surface: `scripts/kb-sync-db-source.cjs` imports parts of knowledge-sync via CJS shim; adding a better-sqlite3 import would break that.

**Option C: New helper module `app/src/lib/services/kb-catpaw-relations.ts`**

Export `fetchCatpawRelations(pawId): { linked_connectors, linked_skills }`. knowledge-sync.ts `buildBody` imports the helper conditionally. Same contract preservation as A but centralizes the JOIN logic. Recommended if the planner expects future entities (e.g., catbrain-catpaw links for KB-42 analogue) to need the same pattern.

**Recommendation: Option A** — least coupling, mirrors Phase 153 pattern of "caller computes enriched state, service is pure." Callers will be 6 total call sites (3 route handlers + `create_cat_paw` tool + 2 link tools). Acceptable duplication.

**Template shape (Spanish, matching existing style):**
```markdown
## Conectores vinculados

- **Holded MCP** (`seed-holded-mcp`)
- **Gmail OAuth** (`3f12a9b8-gmail-oauth`)

## Skills vinculadas

- **Orquestador CatFlow** (`skill-orquestador`)
- **Arquitecto de Agentes** (`skill-arquitecto`)
```

If empty: `_(sin conectores vinculados)_` / `_(sin skills vinculadas)_` (following pattern of L746 `_(ninguno)_`). Rendering: only emit section header if relevant data exists, OR emit header + placeholder for grep-ability (recommend second for consistency with `search_kb` body-text matching).

**Body-text search integration:** `search_kb({search:"holded"})` scans `title+summary+body` per knowledge-sync+kb-index-cache conventions (verify in kb-index-cache.ts searchKb impl). Adding `**Holded MCP** (connector-id)` as body text ensures a linked connector by name surfaces the parent CatPaw.

### Bump-level semantics

The existing `detectBumpLevel()` at `knowledge-sync.ts:712` determines version bump based on which fields changed. Linking a connector is NOT in `FIELDS_FROM_DB.catpaw` (L85-96) — so by default it would be `patch`. But linking a connector is a **semantically major relationship change**. Planner should evaluate:
- Let `patch` happen (simpler, but understates change) — OR —
- Extend `detectBumpLevel` to check a new `linked_connectors_hash` in `sync_snapshot` and bump `minor` when it changes.

**Minor bump is the right level** (per `_manual.md` L164: *"minor (1.0.0 → 1.1.0): cambio en system_prompt, related (conectores/skills/catbrains enlazados)"*). The docs already claim this, but the code doesn't implement it yet. KB-42 is a natural place to close this documentation/implementation gap.

## E. Orphan Inventory (KB-43 — ACTUAL count differs from brief)

The research brief states "10 orphans = 6 catpaws + 1 skill + 1 email-template + 2 canvases." **Direct verification against the live DB at `/home/deskmath/docflow-data/docflow.db` (2026-04-20) shows a different picture:**

| Entity | DB rows | KB .md files | Active orphans | Deprecated orphans |
|--------|---------|--------------|----------------|---------------------|
| catpaws | 38 | 46 | **11** | 2 |
| skills | 43 | 44 | **21** (!) | 0 |
| email-templates | 15 | 17 | 0 | 1 |
| canvases | 1 | 3 | **2** ✓ | 0 |
| connectors | 12 | 14 | 0 | 2 |
| catbrains | 3 | 4 | 0 | 1 |
| **Total** | **112** | **128** | **34 active** | **6 deprecated** |

**Interpretation:**
- Brief's "10" count appears stale or was computed against a fixture DB, not the live `docflow-data/docflow.db` (which contains 38 catpaws, not the 9 fixture canonical seeds).
- The 21 skill orphans are almost all **non-UUID slug-based legacy IDs** (e.g., `academic-investigador-academico.md` with `source_of_truth.id: acade` — truncated at 5 chars; DB has full-UUID IDs now). These are Phase 150 bootstrap residue.
- Similarly, catpaw orphans include 5 non-UUID slug IDs (`agente-t-agente-test-docflow.md` id=`agente-test-docflow`, `asesor-e-asesor-estrategico-de-negocio.md`, etc.) + 6 UUID-ID orphans (created + later deleted pre-hook).
- 2 canvas active orphans exactly as expected: `5a56962a-email-classifier-pilot.md` and `9366fa92-revision-diaria-inbound.md` (DB has only `test-inb-...` canvas).
- 6 deprecated-status orphans are already soft-deleted via hooks (from stress-test CRUD cycles); they enter the Phase 149 lifecycle workflow (eligible for archive in 180 days).

**Verified full orphan list (34 active + 6 deprecated), 2026-04-20:**

**catpaws (11 active, 2 deprecated):**
- Active: `72ef0fe5-redactor-informe-inbound.md`, `7af5f0a7-lector-inbound.md`, `96c00f37-clasificador-inbound.md`, `98c3f27c-procesador-inbound.md`, `a56c8ee8-ejecutor-inbound.md`, `a78bb00b-maquetador-inbound.md`, `agente-t-agente-test-docflow.md`, `asesor-e-asesor-estrategico-de-negocio.md`, `estrateg-estratega-de-negocio-y-growth.md`, `executiv-resumidor-ejecutivo.md`, `experto--experto-en-educa360.md`
- Deprecated: `9eb067d6-tester.md`, `a88166cd-controlador-de-fichajes.md`

**skills (21 active):** `4f7f5abf-leads-y-funnel-infoeduca.md`, plus 20 slug-truncated legacy (`academic-`, `account-`, `analisis-`, `api-docu-`, `arquitec-`, `brand-vo-`, `business-business-case.md`, `business-redaccion-empresarial-formal.md`, `buying-s-`, `campaign-`, `code-rev-`, `competit-`, `data-int-`, `decision-`, `deep-res-`, `diagrama-`, `discover-`, `email-pr-`, `executiv-briefing-ejecutivo.md`, `formato-`)

**email-templates (1 deprecated):** `720870b0-recordatorio-fichaje-semanal.md`

**canvases (2 active):** `5a56962a-email-classifier-pilot.md`, `9366fa92-revision-diaria-inbound.md`

**connectors (2 deprecated):** `755315db-test-slack-webhook.md`, `conn-gma-info-educa360-gmail.md`

**catbrains (1 deprecated):** `a91ed58a-conocimiento-fichajes-holded.md`

**Post-cleanup target:** Active KB file count per entity = DB row count. After archive of 34 active orphans to `.docflow-legacy/orphans/`:
- catpaws: 46 → 35 ≠ 38 DB. That's 3 under. Planner must handle 3 MISSING KB files (DB rows without KB). Re-run `kb-sync.cjs --full-rebuild --source db` to generate them.
- skills: 44 → 23 ≠ 43 DB. 20 missing. Same fix.

**Recommended Plan 156-03 sequence:**
1. Run `scripts/kb-sync.cjs --audit-stale` (or extend it) → generate orphan report.
2. Cross-check against DB: for each orphan, confirm `source_of_truth.id` is absent from the DB table. Capture the list.
3. `mkdir -p .docflow-legacy/orphans/{catpaws,skills,canvases,email-templates,connectors,catbrains}`.
4. Move each active orphan file via `git mv`. Move deprecated orphans too (they can enter legacy archive even before 180d).
5. Run `scripts/kb-sync.cjs --full-rebuild --source db` to regenerate any missing-from-KB entries (addresses the 3 catpaw + 20 skill gap created by the move).
6. Verify `grep -l "^status: active" .docflow-kb/resources/<entity>/*.md | wc -l` == `SELECT COUNT(*)` for each entity.
7. Document retention policy in `_manual.md`.

**Caveat:** The brief's acceptance criterion says "active-count per entity = DB row count" — this is achievable only if step 5 succeeds. Verify `kb-sync-db-source.cjs` has no blockers (Phase 155 DATABASE_PATH= env fix noted in STATE.md "Plan 155-03: DATABASE_PATH=/home/deskmath/docflow-data/docflow.db required for kb-sync live-DB backfill").

## F. `scripts/kb-sync.cjs` CLI — Current `--audit-stale` gap

**Current behavior of `cmdAuditStale` (scripts/kb-sync.cjs:667-765):**
- Walks `.docflow-kb/`, reads frontmatter of each file.
- For each file with `status === 'deprecated'`, computes `days` since `last_accessed_at` and incoming refs count.
- Classifies: `days >= 180 && refs === 0` → eligible for archive; `days >= 150` → warning.
- **Does NOT detect orphans where KB file has `status: active` but no DB row.**

**This is the KB-43 gap.** The existing CLI's audit-stale does NOT surface the 34 active orphans — only the 6 deprecated ones. For KB-43 success criterion "identify 10 orphans" (should be 40 given actual count), the CLI needs either:

**Option 1: Extend `--audit-stale` to cross-check DB**

Add a DB loader (using the same better-sqlite3 resolver as `kb-sync-db-source.cjs`). For each KB resource file, extract `source_of_truth.id`, check if the row exists in the corresponding DB table. Flag mismatches as `orphan_active`. Add a section to `_audit_stale.md` report.

**Option 2: Use existing `--full-rebuild --source db` report**

`scripts/kb-sync-db-source.cjs` at line 1557 already emits `WARN orphan <subtype>/<filename>` and increments `report.orphans`. Run the command in `--dry-run` mode, capture stdout, parse WARN lines. Lower-code approach.

**Option 3: Add new flag `--audit-orphans`**

Dedicated sub-command. Cleanest API but requires the most code.

**Recommendation: Option 2 for Plan 156-03 Wave 1** (zero new code in the CLI), then Option 1 as a tech-debt follow-up if the lifecycle evolves to need routine orphan audits.

## G. Test Strategy (Nyquist validation — TDD RED-first)

Project uses **vitest** (confirmed by `app/src/lib/__tests__/*.test.ts` imports `from 'vitest'`; no jest). Framework config at `app/vitest.config.ts` (assumed — not read but Phase 153 tests run with vitest). Test file convention: colocated `__tests__/` next to source, `*.test.ts` suffix. Fixture KB helper: `app/src/lib/__tests__/kb-test-utils.ts` (`createFixtureKb(tmpDir)` — returns `{kbRoot}` with 7-entry KB + schema-valid frontmatter).

### G.1 KB-40 — Canvas API KB sync tests

**New file:** `app/src/lib/__tests__/canvas-api-kb-sync.test.ts` (mirror of `kb-hooks-api-routes.test.ts` T1+T6+T9 at L280-543).

**Test shape (TDD RED-first):**
```ts
// T1 POST /api/canvas → 201 + KB file created + syncResource called with author='api:canvas.POST'
// T2 PATCH /api/canvas/[id] → 200 + version bump + change_log author='api:canvas.PATCH'
// T3 DELETE /api/canvas/[id] → 200 + status: deprecated + search_kb excludes, get_kb_entry still resolves
// T4 idempotence: second POST with same content → no version bump (isNoopUpdate)
// T5 failure path: syncResource throws → HTTP still 201 + _sync_failures.md gains entry + invalidateKbIndex NOT called
```

**Fixture requirements (Wave 0):**
- Add `canvases` table to the table-setup helper in kb-hooks-api-routes.test.ts (columns per `canvas.schema` from db.ts: `id, name, description, emoji, mode, status, thumbnail, tags, is_template, node_count, flow_data, listen_mode, created_at, updated_at`).
- Stub the canvas schedule-summary computation (schedule-utils.ts) if needed — probably not, since POST default `flow_data` has no start-node schedule_config.

**Assertions verbatim pattern (mirror T9 at L499-543):**
```ts
const syncSpy = vi.spyOn(knowledgeSyncModule, 'syncResource');
const res = await postCanvas(req);
expect(res.status).toBe(201);
expect(syncSpy).toHaveBeenCalledWith(
  'canvas',
  'create',
  expect.objectContaining({ id: body.id, name: 'Test Canvas' }),
  expect.objectContaining({ author: 'api:canvas.POST' }),
);
const fname = findKbFile(kbRoot, 'canvases', body.id);
expect(fname).toBeTruthy();
```

### G.2 KB-41 — `delete_catflow` sudo tool soft-delete test

**New file or extend existing:** `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts` (new) OR extend any existing `catbot-sudo-tools.test.ts` (verify existence; none found in the `ls` output, so NEW file).

**Test shape:**
```ts
// T1 delete_catflow with confirmed: true → DB row gone + KB file status:deprecated + markStale NOT called + syncResource called with author='catbot-sudo:delete_catflow'
// T2 delete_catflow with confirmed: false → CONFIRM_REQUIRED preview + DB row intact + KB file unchanged
// T3 delete_catflow ambiguous identifier → AMBIGUOUS status + no delete + no syncResource call
// T4 delete_catflow with purge: true → DB DELETE + NO syncResource call (hard-delete path)
// T5 failure: syncResource throws → DB still DELETEd + logger.error + markStale('delete-sync-failed')
```

### G.3 KB-42 — Link tools + template extension tests

**New file 1:** `app/src/lib/__tests__/catbot-tools-link.test.ts`

```ts
// T1 link_connector_to_catpaw → INSERT into cat_paw_connectors + syncResource('catpaw','update', pawRow, hookCtx('catbot:link_connector'))
// T2 link_skill_to_catpaw → INSERT OR IGNORE + syncResource fired (first link) / noop (re-link via isNoopUpdate)
// T3 already_linked UNIQUE collision on link_connector → NO syncResource call
// T4 CatPaw missing → error + NO syncResource call
// T5 Connector/Skill missing → error + NO syncResource call
// T6 after link, CatPaw .md has "Holded MCP" in body text → search_kb({search:"holded"}) finds it
```

**New file 2:** `app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts`

```ts
// T1 buildBody catpaw with linked_connectors array → renders "## Conectores vinculados" section with each {id, name}
// T2 buildBody catpaw with empty linked_connectors → renders "_(sin conectores vinculados)_" placeholder
// T3 buildBody catpaw with BOTH linked_connectors and linked_skills → both sections rendered in correct order
// T4 syncResource('catpaw','update', enrichedRow) with linked_* changed → minor bump (1.0.0 → 1.1.0)
// T5 syncResource('catpaw','update', enrichedRow) with linked_* unchanged but other fields changed → patch bump
```

### G.4 KB-43 — Orphan audit + cleanup integration test

**Optional new file:** `scripts/__tests__/audit-orphans.test.js` (CJS, mirror of `app/src/lib/__tests__/kb-sync-cli.test.ts`). Lower priority — the cleanup is a one-shot operational task. TDD sensibility: write one integration test that spins up a fixture DB with 1 table + 3 KB files (1 valid, 2 orphan), runs `kb-sync.cjs --audit-stale` (or `--full-rebuild --source db --dry-run`), asserts orphan detection output.

### Sampling rates
- **Per task commit:** `cd app && npx vitest run <test-file-glob>` (< 5s per file).
- **Per plan merge:** `cd app && npx vitest run` (full suite; ~30-60s per Phase 152/153 STATE metrics).
- **Phase gate:** full suite green + Docker rebuild smoke + CatBot oracle (§I).

### Wave 0 gaps
- [ ] `app/src/lib/__tests__/canvas-api-kb-sync.test.ts` — new file, covers KB-40.
- [ ] `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts` — new file, covers KB-41.
- [ ] `app/src/lib/__tests__/catbot-tools-link.test.ts` — new file, covers KB-42.
- [ ] `app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts` — new file, covers KB-42.
- [ ] Extend `ensureTables()` helper (pattern in kb-hooks-api-routes.test.ts L113) with `canvases` + `cat_paw_skills` + `cat_paw_connectors` + `skills` + `connectors` tables (as needed for link tests). NB: `cat_paw_connectors` is already created by the link-tool-case path; tests need the schema.
- No new framework install needed — vitest already present.

## H. Retention Policy Dimensions (KB-43 — `_manual.md` extension)

The `_manual.md` already has a §Lifecycle section (L83-100) covering the deprecated-age workflow (150d warning → 170d visible → 180d archive → 365d purge). **It does NOT cover the orphan case** (KB file exists with `status: active` but DB row is gone). The new §Retention Policy section must answer these four dimensions:

1. **When is a KB file marked deprecated?**
   - Via `syncResource('*','delete',_)` hook (Phase 153 + 156). Triggered by: DB row deletion through API route, CatBot tool case, or sudo tool. Soft-delete — file persists with `status: deprecated`, `deprecated_at`, `deprecated_by`, `deprecated_reason`.

2. **When is a KB file considered an orphan?**
   - `status: active` but `source_of_truth.id` does not correspond to any row in the `source_of_truth.db` table. Caused by: pre-hook deletions (before Phase 153 shipped), manual DB manipulation, failed sync (`_sync_failures.md`), legacy slug-based IDs from Phase 150 bootstrap that DB no longer references.

3. **When is a KB file archived vs purged?**
   - **Deprecated + 180d idle** → archive to `_archived/YYYY-MM-DD/` (existing Phase 149 workflow). Run `node scripts/kb-sync.cjs --archive --confirm`.
   - **Active orphan (KB file without DB row)** → archive to `.docflow-legacy/orphans/<entity>/` (NEW policy in 156). Run manually (or extended CLI) after operator triage. No time threshold — orphans are triaged on audit.
   - **Archived + 365d** → purge (physical delete). `--purge --confirm --older-than-archived=365d`.
   - **Never auto-purge.** All destructive operations require `--confirm`.

4. **Command cheat-sheet:**
   - `node scripts/kb-sync.cjs --audit-stale` → report deprecated-aged eligibles.
   - `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run` → report DB-orphan files (via WARN log lines).
   - `node scripts/kb-sync.cjs --archive --confirm` → move deprecated-180d files to `_archived/`.
   - `git mv .docflow-kb/resources/<entity>/<orphan>.md .docflow-legacy/orphans/<entity>/<orphan>.md` → archive active-orphan (manual / scripted per operator).
   - `node scripts/kb-sync.cjs --purge --confirm --older-than-archived=365d` → physical delete.

**Target length:** ≤30 lines per the success-criteria brief. Recommend:
- Single new H2 section `## Retention Policy (Phase 156)` inserted after §Lifecycle.
- Dense table format: `| Estado | Trigger | Acción | Comando |`.
- Cross-link to §Lifecycle for the time-based workflow (avoid duplication).

## I. Oracle Protocol (CatBot verification post-implementation)

Per `CLAUDE.md` "CatBot como Oráculo" + Phase 155 precedent (STATE.md L118-122), every phase must verify via CatBot chat API. Expected prompts for Phase 156:

**Prompt 1 (KB-40 canvas create):**
> "Crea un canvas llamado 'Phase 156 Verify' y luego busca su kb_entry."

Expected: tool_calls include `canvas_create` → returns `{id, name}`; subsequent `list_cat_paws`-style call OR direct `search_kb({search:"Phase 156 Verify"})` returns non-null `kb_entry: "resources/canvases/<id8>-phase-156-verify.md"`.

**Prompt 2 (KB-41 delete_catflow soft-delete):**
> "Borra el canvas 'Phase 156 Verify' con sudo y confirma que el archivo KB queda marcado como deprecated."

Expected: tool_calls include `delete_catflow({identifier, confirmed:true})` → `{status:DELETED}`. Follow-up `get_kb_entry({id:"canvas-<id8>"})` returns entry with `frontmatter.status === 'deprecated'`.

**Prompt 3 (KB-42 link tools):**
> "Crea un CatPaw 'Test Linker', enlázale el conector Holded MCP, y dime qué conectores tiene vinculados según el KB."

Expected: tool_calls include `create_cat_paw` → `link_connector_to_catpaw` → `get_kb_entry` OR `search_kb({search:"holded connector Test Linker"})`. Response body should include the linked connector from the KB file's "## Conectores vinculados" section.

**Prompt 4 (KB-43 orphan visibility):**
> "¿Cuántos archivos KB tienen status:active por entidad? Compáralo con los counts de la DB."

Expected: tool_calls include `list_cat_paws`, `list_skills`, `canvas_list`, etc. Response compares counts. Post-cleanup: per-entity KB active count == DB row count.

Oracle responses pasted verbatim into `156-VERIFICATION.md`.

## J. Architecture Patterns (reuse from Phase 153)

### Pattern 1: Try/catch hook wrapper
**What:** Wrap `await syncResource(...) + invalidateKbIndex()` in try/catch; catch fires `logger.error` + `markStale`. HTTP/tool response shape never depends on hook success.
**When to use:** Every hook site. Always.
**Source:** `app/src/app/api/cat-paws/route.ts:126-142`, `app/src/app/api/cat-paws/[id]/route.ts:115-130, 154-172`.

### Pattern 2: Author convention
**What:** Author string encodes call-site. Routes: `'api:<entity>.<METHOD>'`. Sudo tools: `'catbot-sudo:<toolname>'`. CatBot tool cases: `'catbot:<context>'` or `context?.userId ?? 'catbot'`.
**When to use:** Every `hookCtx(author, ...)` call.
**Source:** kb-hooks-api-routes.test.ts L322 + L357 + L524 + STATE.md L176 "Phase 153-01 markStale writes..."

### Pattern 3: SELECT-back before sync
**What:** Before calling `syncResource('*','create'|'update', row, ...)`, re-SELECT the row from DB to get canonical column values (handles defaults, triggers, etc.).
**When to use:** Always after INSERT/UPDATE. DELETE uses `{id}` only.
**Source:** `app/src/app/api/cat-paws/route.ts:124` + `app/src/app/api/cat-paws/[id]/route.ts:112`.

### Pattern 4: markStale path composition
**What:** `markStale` path string hardcodes the KB subfolder: `resources/<subdir>/${id.slice(0,8)}-${hookSlug(name)}.md`. Subdir mapping from `knowledge-sync.ts:76-83 ENTITY_SUBDIR` (e.g., `canvas → resources/canvases`).
**When to use:** Every hook's catch block.
**Source:** `app/src/app/api/cat-paws/[id]/route.ts:126-129, 167-171`.

### Anti-patterns to avoid

- **`fs.unlink` on KB delete.** Soft-delete via `markDeprecated()` only. Phase 149 explicit invariant (§Lifecycle).
- **Awaiting syncResource without try/catch.** A sync failure MUST NOT reject the HTTP response. DB wins.
- **Calling `invalidateKbIndex()` on failure path.** Phase 153 T12 asserts this explicitly (kb-hooks-api-routes.test.ts L676).
- **Calling `markDeprecated` directly instead of `syncResource(_,'delete',_)`.** Consistency: all delete paths go through syncResource. Phase 153 KB-21.
- **Importing better-sqlite3 / db into `knowledge-sync.ts`.** The pure-filesystem contract is load-bearing — `scripts/kb-sync-db-source.cjs` shims parts via CJS, adding `db` would break.
- **Forgetting the pass-through rule for CatBot tool cases.** `canvas_create` tool hits POST /api/canvas via fetch → DO NOT double-hook; the route hook covers it (same rationale as Phase 153 excluding `update_cat_paw`).
- **Calling syncResource on `INSERT OR IGNORE` idempotent re-link in `link_skill_to_catpaw`.** Either check `stmt.run().changes` or rely on `isNoopUpdate()` to short-circuit. Prefer the latter for simplicity.

## K. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compute KB file path from id+name | Custom slug/id-short logic | `hookSlug()` from kb-hook-helpers | Must be byte-identical to `knowledge-sync.ts:117` slugify — any drift breaks markStale paths |
| Mark file as deprecated | `fs.writeFile` with modified frontmatter | `syncResource(entity,'delete',{id})` → internal `markDeprecated` | Consistency — delete semantics, version bump, change_log entry all handled |
| Reset kb-index-cache | Call kb-index-cache internals | `invalidateKbIndex()` export | Public API; internals change between phases |
| Log sync failure | Custom JSON writer | `markStale(path, reason, details)` from kb-audit | `_sync_failures.md` must have schema-valid frontmatter (first call lazily writes it); validate-kb.cjs EXCLUDED_FILENAMES handles this file |
| Detect "no actual change on update" | Hash + compare | Rely on `isNoopUpdate` in knowledge-sync.ts:1145 | Service handles it; second identical update is byte-identical no-op |
| Build catpaw linked-relation sections | Custom markdown template | Extend existing `buildBody` with `entity === 'catpaw'` branch | Phase 149 rendering contract; single source of truth for MD generation |
| Resolve DB path for CLI scripts | Hardcode `app/data/docflow.db` | `process['env']['DATABASE_PATH'] ?? path.join(...)` with env override | STATE.md Plan 155-03: *"DATABASE_PATH=/home/deskmath/docflow-data/docflow.db required"* — stale fixture otherwise |

**Key insight:** This phase is 100% "connect plumbing A to plumbing B" work. Any temptation to redesign = scope creep. The Phase 153 pattern is the contract.

## L. Common Pitfalls

### Pitfall 1: Double-firing hook (tool → route → tool)
**What goes wrong:** `canvas_create` tool calls `fetch('/api/canvas', POST)`; if both the tool case AND the route hook call `syncResource`, you get duplicate INSERTs / double version bump.
**Why it happens:** Fast refactor that adds hooks to "everything DB-ish" without distinguishing pass-through from direct-DB cases.
**How to avoid:** Only hook the **DB-closest** layer. For canvas: hook the route, NOT the tool case. Phase 153 precedent: `update_cat_paw` tool case is pass-through → hook only the `/api/cat-paws/[id]` PATCH route.
**Warning signs:** `change_log` grows by 2 per user action; second entry shows same `author` as first (or different — both wrong).

### Pitfall 2: Async function signature mismatch (`delete_catflow`)
**What goes wrong:** Current `deleteCatFlow(args): ToolResult` is synchronous. Adding `await syncResource(...)` forces it to `async function deleteCatFlow(args): Promise<ToolResult>`. Caller dispatcher at L249 `return deleteCatFlow(args)` — TypeScript may silently widen type.
**Why it happens:** Forgetting to `await` at the call site propagates `Promise<ToolResult>` into the caller's return type.
**How to avoid:** Explicitly type the dispatcher return as `Promise<ToolResult> | ToolResult` or await at all call sites. Run `npx tsc --noEmit` after edit.

### Pitfall 3: `isNoopUpdate` ignores body but body now has changing content
**What goes wrong:** `isNoopUpdate` at `knowledge-sync.ts:1145` compares `current.body` vs `newBody`. If the new "## Conectores vinculados" section has a timestamp or changes order of connector rows, every update appears non-noop → spurious patch bump.
**Why it happens:** ORDER BY absent from JOIN query; list sorted by insertion order (non-deterministic).
**How to avoid:** Always sort linked rows alphabetically by name in the SELECT: `ORDER BY c.name ASC`. Never include timestamps in rendered sections.

### Pitfall 4: PATCH no-change short-circuit bypasses hook
**What goes wrong:** `/api/canvas/[id]` PATCH at L87-90 returns early when `updates.length === 1` (only `updated_at` was added). If hook is placed after the branch, the no-change path skips hook — correct. If placed before, runs syncResource on empty update → spurious major bump (from `buildFrontmatterForCreate` no-op path).
**Why it happens:** Copy-paste the hook above the short-circuit by mistake.
**How to avoid:** Place hook AFTER `db.prepare(UPDATE).run(...)` at L92, AFTER the re-SELECT. Outside the `if (updates.length === 1)` block.

### Pitfall 5: Orphan files persist because `--full-rebuild --source db` doesn't delete
**What goes wrong:** Operator runs `--full-rebuild --source db` expecting it to regenerate KB from DB truth. It does — but orphan files (KB with no DB row) are preserved as `WARN orphan` and left untouched (kb-sync-db-source.cjs L1557). Active count remains inflated.
**Why it happens:** Phase 150 explicit decision (STATE.md L108: *"auto-deprecation is Fase 5 PRD, not of this command"*).
**How to avoid:** Orphan cleanup is a distinct operation. Follow the Plan 156-03 sequence in §E.

### Pitfall 6: better-sqlite3 binding not found when running scripts
**What goes wrong:** `scripts/kb-sync-db-source.cjs` requires better-sqlite3 from app/node_modules. Invoked with wrong cwd or KB_SYNC_REPO_ROOT unset → fails exit 3.
**Why it happens:** Repo root has no package.json; scripts must walk up to find app/node_modules.
**How to avoid:** Always run from repo root: `cd /home/deskmath/docflow && node scripts/kb-sync.cjs ...`. Set `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db` to override fixture default (critical, per STATE.md).

### Pitfall 7: Docker container cache stale after hook change
**What goes wrong:** Edit canvas route → rebuild Docker → test CatBot prompt → tool call behavior unchanged.
**Why it happens:** `docker compose up -d` after `build` caches the old image; need `--force-recreate`. Or kb-index-cache 60s TTL still warm.
**How to avoid:** Full deploy sequence per MEMORY.md:
```bash
cd ~/docflow/app && npm run build   # local verify
docker compose build docflow --no-cache
docker compose up -d --force-recreate
docker exec -u root docflow-app chown -R nextjs:nodejs /app/data/
docker restart docflow-app
```

### Pitfall 8: `link_skill_to_catpaw` INSERT OR IGNORE hides failed link
**What goes wrong:** If the `cat_paw_skills` row already exists, INSERT OR IGNORE is a no-op (`changes === 0`); hook fires anyway (with option B), body unchanged (skill already listed), `isNoopUpdate` short-circuits — correct. But a bug where the row was ghost-inserted (e.g., foreign-key ref missing) could leave a stale cache. Low probability.
**How to avoid:** Explicit skill-exists check at L2155-2156 already covers the main case. Trust the flow.

## M. Phase Requirements → Test Map (Validation Architecture)

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (project-pinned via `app/package.json`) |
| Config file | `app/vitest.config.ts` (existing) |
| Quick run command | `cd app && npx vitest run <specific-file>` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KB-40 | POST /api/canvas fires syncResource('canvas','create') + KB file appears | unit/integration | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "POST"` | ❌ Wave 0 |
| KB-40 | PATCH /api/canvas/[id] fires syncResource('canvas','update') + version bump | unit/integration | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "PATCH"` | ❌ Wave 0 |
| KB-40 | DELETE /api/canvas/[id] fires syncResource('canvas','delete') + status:deprecated | unit/integration | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "DELETE"` | ❌ Wave 0 |
| KB-40 | Failure path: HTTP 201 preserved, markStale fires, invalidateKbIndex NOT called | unit | `cd app && npx vitest run canvas-api-kb-sync.test.ts -t "failure"` | ❌ Wave 0 |
| KB-41 | delete_catflow with confirmed:true → soft-delete via syncResource | unit | `cd app && npx vitest run catbot-sudo-delete-catflow.test.ts -t "soft-delete"` | ❌ Wave 0 |
| KB-41 | delete_catflow with purge:true (optional arg) → hard-delete, no syncResource | unit | `cd app && npx vitest run catbot-sudo-delete-catflow.test.ts -t "purge"` | ❌ Wave 0 |
| KB-41 | delete_catflow ambiguous identifier → AMBIGUOUS, no syncResource | unit | `cd app && npx vitest run catbot-sudo-delete-catflow.test.ts -t "AMBIGUOUS"` | ❌ Wave 0 |
| KB-42 | link_connector_to_catpaw fires syncResource('catpaw','update') with enriched row | unit | `cd app && npx vitest run catbot-tools-link.test.ts -t "link_connector"` | ❌ Wave 0 |
| KB-42 | link_skill_to_catpaw re-link is no-op (isNoopUpdate short-circuit) | unit | `cd app && npx vitest run catbot-tools-link.test.ts -t "re-link noop"` | ❌ Wave 0 |
| KB-42 | buildBody catpaw renders "## Conectores vinculados" with sorted connector names | unit | `cd app && npx vitest run knowledge-sync-catpaw-template.test.ts -t "conectores"` | ❌ Wave 0 |
| KB-42 | buildBody catpaw renders "## Skills vinculadas" with sorted skill names | unit | `cd app && npx vitest run knowledge-sync-catpaw-template.test.ts -t "skills"` | ❌ Wave 0 |
| KB-42 | search_kb({search:"holded"}) finds CatPaw via linked connector body text | integration | `cd app && npx vitest run catbot-tools-link.test.ts -t "search_kb"` | ❌ Wave 0 |
| KB-43 | `--full-rebuild --source db --dry-run` reports orphans accurately | manual / scripted | `node scripts/kb-sync.cjs --full-rebuild --source db --dry-run 2>&1 \| grep orphan` | ✅ existing CLI |
| KB-43 | Post-archive: active KB count per entity = DB row count | manual / integration | `grep -l "^status: active" .docflow-kb/resources/catpaws/*.md \| wc -l` vs `sqlite3 docflow.db 'SELECT COUNT(*) FROM cat_paws'` | manual |
| KB-43 | `_manual.md` has §Retention Policy section with ≥4 dimensions | doc check | `grep -c "^## Retention Policy" .docflow-kb/_manual.md` → 1 | manual |

### Sampling Rate
- **Per task commit:** Run the specific new test file (`npx vitest run canvas-api-kb-sync.test.ts`) — < 10s.
- **Per wave merge:** Full `cd app && npx vitest run` — ~30-60s.
- **Phase gate:** Full suite green + Docker rebuild + CatBot oracle (4 prompts, §I).

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/canvas-api-kb-sync.test.ts` — covers KB-40.
- [ ] `app/src/lib/__tests__/catbot-sudo-delete-catflow.test.ts` — covers KB-41.
- [ ] `app/src/lib/__tests__/catbot-tools-link.test.ts` — covers KB-42 (link-tool side).
- [ ] `app/src/lib/__tests__/knowledge-sync-catpaw-template.test.ts` — covers KB-42 (template side).
- [ ] Extend `ensureTables()` helper pattern with `canvases` + link-table schemas (inline in new test files, no shared helper refactor).
- Framework install: none needed (vitest present).

## N. Code Examples (verified from current repo)

### N.1 Canvas POST hook (target state — mirror of cat-paws POST)

```ts
// app/src/app/api/canvas/route.ts (POST — after transformation)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, emoji, mode, tags } = body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const id = generateId();
    const startNodeId = generateId();
    const now = new Date().toISOString();
    const defaultFlowData = JSON.stringify({ nodes: [/* ... */], edges: [], viewport: {x:0,y:0,zoom:1} });

    db.prepare(
      `INSERT INTO canvases (id, name, description, emoji, mode, status, flow_data, tags, is_template, node_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'idle', ?, ?, 0, 1, ?, ?)`
    ).run(id, name.trim(), description || null, emoji || '🔷', mode || 'mixed', defaultFlowData, tags ? JSON.stringify(tags) : null, now, now);

    // NEW: Phase 156 KB-40 hook
    const row = db.prepare('SELECT * FROM canvases WHERE id = ?').get(id) as Record<string, unknown> & { id: string; name: string };
    try {
      await syncResource('canvas', 'create', row, hookCtx('api:canvas.POST'));
      invalidateKbIndex();
    } catch (err) {
      const errMsg = (err as Error).message;
      logger.error('kb-sync', 'syncResource failed on POST /api/canvas', {
        entity: 'canvas', id, err: errMsg,
      });
      markStale(
        `resources/canvases/${id.slice(0, 8)}-${hookSlug(String(row.name))}.md`,
        'create-sync-failed',
        { entity: 'canvases', db_id: id, error: errMsg },
      );
    }

    return NextResponse.json({ id, redirectUrl: `/canvas/${id}` }, { status: 201 });
  } catch (error) {
    logger.error('canvas', 'Error al crear canvas', { error: (error as Error).message });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

### N.2 Link tool hook (link_connector_to_catpaw — after transformation)

```ts
// app/src/lib/services/catbot-tools.ts (link_connector_to_catpaw case — after transformation)
case 'link_connector_to_catpaw': {
  const catpawId = args.catpaw_id as string;
  const connectorId = args.connector_id as string;

  const paw = db.prepare('SELECT id, name FROM cat_paws WHERE id = ?').get(catpawId) as { id: string; name: string } | undefined;
  if (!paw) return { name, result: { error: `CatPaw no encontrado: ${catpawId}` } };
  const connector = db.prepare('SELECT id, name FROM connectors WHERE id = ?').get(connectorId) as { id: string; name: string } | undefined;
  if (!connector) return { name, result: { error: `Conector no encontrado: ${connectorId}` } };

  try {
    db.prepare('INSERT INTO cat_paw_connectors (paw_id, connector_id, usage_hint, is_active, created_at) VALUES (?, ?, ?, 1, ?)')
      .run(catpawId, connectorId, (args.usage_hint as string) || null, new Date().toISOString());
  } catch (e) {
    if ((e as Error).message.includes('UNIQUE')) {
      return { name, result: { already_linked: true, catpaw: paw.name, connector: connector.name } };
    }
    throw e;
  }

  // NEW: Phase 156 KB-42 hook — enriched row with linked_connectors + linked_skills
  const pawRow = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(catpawId) as Record<string, unknown> & { id: string; name: string };
  const linked_connectors = db.prepare(
    'SELECT c.id, c.name FROM cat_paw_connectors cpc LEFT JOIN connectors c ON c.id = cpc.connector_id WHERE cpc.paw_id = ? ORDER BY c.name ASC'
  ).all(catpawId) as Array<{ id: string; name: string }>;
  const linked_skills = db.prepare(
    'SELECT s.id, s.name FROM cat_paw_skills cps LEFT JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ? ORDER BY s.name ASC'
  ).all(catpawId) as Array<{ id: string; name: string }>;
  const enriched = { ...pawRow, linked_connectors, linked_skills };

  try {
    await syncResource('catpaw', 'update', enriched, hookCtx('catbot:link_connector'));
    invalidateKbIndex();
  } catch (err) {
    const errMsg = (err as Error).message;
    logger.error('kb-sync', 'syncResource failed on link_connector_to_catpaw', {
      entity: 'catpaw', id: catpawId, err: errMsg,
    });
    markStale(
      `resources/catpaws/${catpawId.slice(0, 8)}-${hookSlug(paw.name)}.md`,
      'update-sync-failed',
      { entity: 'cat_paws', db_id: catpawId, error: errMsg },
    );
  }

  return {
    name,
    result: { linked: true, catpaw_id: catpawId, catpaw_name: paw.name, connector_id: connectorId, connector_name: connector.name },
  };
}
```

### N.3 `buildBody` catpaw template extension

```ts
// app/src/lib/services/knowledge-sync.ts (buildBody — inside entity === 'catpaw' block, appended after existing catpaw section)
if (entity === 'catpaw') {
  // ... existing Modo/Modelo line + ## System prompt + ## Configuración sections ...

  // NEW: Phase 156 KB-42 — linked relations sections
  const linkedConnectors = (row as unknown as { linked_connectors?: Array<{ id: string; name: string }> }).linked_connectors ?? [];
  const linkedSkills = (row as unknown as { linked_skills?: Array<{ id: string; name: string }> }).linked_skills ?? [];

  lines.push('## Conectores vinculados');
  lines.push('');
  if (linkedConnectors.length === 0) {
    lines.push('_(sin conectores vinculados)_');
  } else {
    for (const c of linkedConnectors) {
      lines.push(`- **${c.name}** (\`${c.id}\`)`);
    }
  }
  lines.push('');
  lines.push('## Skills vinculadas');
  lines.push('');
  if (linkedSkills.length === 0) {
    lines.push('_(sin skills vinculadas)_');
  } else {
    for (const s of linkedSkills) {
      lines.push(`- **${s.name}** (\`${s.id}\`)`);
    }
  }
  lines.push('');
}
```

## O. State of the Art (for this narrow domain)

Not applicable — gap closure phase on an internal pattern. No external library or framework evolution to track. Phase 153 (2026-04-19) is the current state of the art for KB-sync hooks; this phase extends it to the 3 unhooked surfaces.

## P. Open Questions

1. **Should `link_connector_to_catpaw` re-sync when the UNIQUE collision case returns `already_linked: true`?**
   - What we know: Current code returns `already_linked` without touching DB (INSERT threw UNIQUE). No meaningful change to reflect.
   - What's unclear: If a prior syncResource failed (sync_failures log) but DB already has the row, a re-link attempt could be a reconciliation trigger.
   - Recommendation: Do NOT hook the `already_linked` path. Reconciliation is owed to `--full-rebuild --source db` on-demand, not tool-case retry logic.

2. **Does `cat_paw_connectors` table have `usage_hint` column in the fixture test DB?**
   - What we know: Production DB has it (L2134 insert uses 5 columns). Test fixture schema in `kb-hooks-api-routes.test.ts` L113-148 doesn't declare it (the tests don't link connectors).
   - What's unclear: New Plan 156-02 tests need this. Planner must extend the ensureTables helper.
   - Recommendation: Inline fresh table-creation in the new `catbot-tools-link.test.ts` — avoid shared-helper refactor.

3. **Should `delete_catflow` soft-delete propagate the KB `deprecated_reason` into the DB `canvases` row?**
   - What we know: Current DB flow is hard DELETE (row gone). Post-fix, row is still deleted; only KB retains `deprecated_reason`.
   - What's unclear: Some products keep a `status: deleted` flag in DB + preserve the row for audit. Out of scope for Phase 156 per DEFERRED.
   - Recommendation: Keep DB hard-delete semantics; only the KB file is soft. Consistent with all other `delete_*` hooks.

4. **Orphan archive paths: `_archived/YYYY-MM-DD/` vs `.docflow-legacy/orphans/<entity>/`?**
   - What we know: `_archived/` is Phase 149 convention for time-elapsed deprecated files. `.docflow-legacy/` is the pre-KB silo graveyard.
   - What's unclear: Brief says `.docflow-legacy/orphans/`. That's the NEW dir.
   - Recommendation: Follow brief — create `.docflow-legacy/orphans/<entity>/`. Cross-reference in §Retention Policy.

5. **Does `kb-index-cache.searchKb` body-text-match include the rendered `## Conectores vinculados` section?**
   - What we know: kb-index-cache.ts builds search index from `_index.json.entries[].title/summary/tags`, then body lookup via filesystem read on query. Need to verify body ranking.
   - What's unclear: Exact ranking weights for body matches.
   - Recommendation: Add T6 in Plan 156-02 tests: "after linking, search_kb({search:'holded'}) returns the CatPaw id." If it fails, investigate the cache's body-read path.

## Q. Sources

### Primary (HIGH confidence — directly read code)
- `app/src/lib/services/knowledge-sync.ts` — L33-111 (Entity/Op types + entity maps), L117-123 (slugify), L712 (detectBumpLevel), L909-964 (buildFrontmatterForCreate), L966-1011 (buildBody), L1065-1206 (syncResource), L1220-1257 (markDeprecated).
- `app/src/lib/services/kb-hook-helpers.ts` — full file (hookCtx + hookSlug).
- `app/src/lib/services/kb-audit.ts` — full file (markStale).
- `app/src/lib/services/kb-index-cache.ts:192` — invalidateKbIndex.
- `app/src/app/api/canvas/route.ts` — L70-119 (POST, target for KB-40).
- `app/src/app/api/canvas/[id]/route.ts` — L22-117 (GET/PATCH/DELETE).
- `app/src/app/api/cat-paws/route.ts` — L59-150 (POST reference pattern).
- `app/src/app/api/cat-paws/[id]/route.ts` — L1-181 (full reference: GET/PATCH/DELETE).
- `app/src/lib/services/catbot-sudo-tools.ts` — L1-50, L690-789 (delete_catflow target).
- `app/src/lib/services/catbot-tools.ts` — L9 imports, L2122-2164 (link tools target), L2263-2288 (canvas_create pass-through).
- `app/src/lib/__tests__/kb-hooks-api-routes.test.ts` — L1-725 (Phase 153 test convention).
- `app/src/lib/__tests__/kb-hooks-tools.test.ts` — L1-100 (tool-case test convention).
- `app/src/lib/__tests__/kb-test-utils.ts` — full file (fixture KB helper).
- `app/src/lib/__tests__/kb-sync-cli.test.ts` — L1-80 (CLI test convention).
- `scripts/kb-sync.cjs` — L1-150, L664-820 (audit-stale + archive commands).
- `scripts/kb-sync-db-source.cjs` — L45-160 (better-sqlite3 resolver + DATABASE_PATH env).
- `.docflow-kb/_manual.md` — L83-100 (existing §Lifecycle), L360-412 (Phase 155 sections).
- `.planning/REQUIREMENTS.md` — L125-131 (KB-40..KB-43 specs), L228-231 (traceability).
- `.planning/STATE.md` — L104-201 (all Phase 149-155 decisions).
- `.planning/v29.1-MILESTONE-AUDIT.md` — L1-258 (audit findings).
- `.planning/v29.1-STRESS-TEST-FINDINGS.md` — L1-199 (stress-test evidence).
- `.planning/ROADMAP.md` — L40-80 (Phase 156 spec verbatim).

### Secondary (HIGH — computed from DB)
- Live DB `/home/deskmath/docflow-data/docflow.db` row counts for 6 entities (2026-04-20): cat_paws=38, skills=43, email_templates=15, canvases=1, connectors=12, catbrains=3. **Total=112 DB rows vs 128 KB files = 16 orphans by count, confirmed 40 orphans (34 active + 6 deprecated) by source_of_truth.id cross-reference.**

### Tertiary (LOW — none required)
- No WebSearch used. Phase is entirely internal/reference. Training data not applicable to project-specific patterns.

## R. Metadata

**Confidence breakdown:**
- Standard stack (Phase 153 patterns to mirror): HIGH — verified by direct read of production code + production tests, all call sites identified.
- Architecture (try/catch hook wrapper, SELECT-back before sync, etc.): HIGH — Phase 153 precedent, tests assert.
- Orphan inventory: HIGH — direct DB cross-check executed 2026-04-20, exact files listed. **Research brief's "10" count is stale by >20 files; planner must honor the real count.**
- Template extension semantics (bump level for linked-relations change): MEDIUM — `_manual.md` L164 claims minor bump but code doesn't implement it; planner may choose to close this doc/impl gap OR accept patch bump as pragmatic shortcut.
- Retention-policy dimensions: HIGH — existing `_manual.md` §Lifecycle sets the pattern to extend.
- CatBot oracle viability: HIGH — Phase 155 STATE.md L200-201 confirms the CatBot chat API works for ORACLE verification.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days — patterns stable post-Phase-153; DB orphan inventory may drift as new canvases are created before Phase 156 ships).
