# Phase 153: KB Creation Tool Hooks — Research

**Researched:** 2026-04-20
**Domain:** DB-write hook automation that calls `knowledge-sync.ts` (Phase 149) from `catbot-tools.ts` tool cases and Next.js API route handlers, with graceful failure, cache invalidation (Phase 152), and soft-delete semantics. Closes the gap Phase 152 exposed (`kb_entry: null` for post-snapshot DB rows).
**Confidence:** HIGH (entirely grounded in direct inspection of `knowledge-sync.ts`, `kb-index-cache.ts`, `catbot-tools.ts`, all 5 entity API route files, logger module, middleware, existing test patterns, and the actual `_audit_stale.md` shape produced by Phase 149 CLI).

## Summary

Phase 153 inserts post-DB-write hooks at **15 call sites** (7 tool cases + 8 route handlers across 5 entities) so that every successful create/update/delete on an entity with a KB subdir (`cat_paws`, `catbrains`, `connectors`, `skills`, `email_templates`) triggers `syncResource(entity, op, row, ctx)` immediately. The hook is non-transactional: DB persists unconditionally, and sync failures log ERROR + append a stale marker so `kb-sync.cjs --full-rebuild --source db` can reconcile later. Soft-delete uses `syncResource(entity, 'delete', {id}, ctx)` which internally calls `markDeprecated`. After every success, `invalidateKbIndex()` is called so the Phase 152 TTL cache reflects the change on the next `list_*`/`search_kb`.

The four discovery items that matter for planning:

1. **The tool-side `update_cat_paw` is NOT a direct DB writer.** It `fetch`es `PATCH /api/cat-paws/[id]` (lines 2253-2258), which means hooking **only the API route** covers both the tool call and UI edits. Hooking inside the tool case would double-fire (and the hook in the tool would run before the fetch, when row state is pre-update — wrong). **Do not hook `update_cat_paw`.**
2. **The `_audit_stale.md` shape in CONTEXT §D9 and §Specifics is incompatible with the real file.** Phase 149's `cmdAuditStale()` in `scripts/kb-sync.cjs:667-765` **fully regenerates** the file from a scan of deprecated frontmatter status — it is not an append log and has a fixed frontmatter keyed by `eligible_for_purge`/`warning_only`. Appending hook entries there would work until the next `--audit-stale` run, which would **silently wipe them**. This is the single largest planning correction.
3. **`syncResource` already invalidates internally at the last mile — but only the never-wired LLM cache, not Phase 152's new `kb-index-cache`.** Lines 1203-1205 of `knowledge-sync.ts` call `updateIndexFull` + `regenerateHeader` + `invalidateLLMCache` (no-op, "TODO Fase 4"). Phase 152's `invalidateKbIndex()` is the consumer-facing cache introduced **after** Phase 149 and is not imported by `knowledge-sync.ts`. Hooks must call `invalidateKbIndex()` themselves at the call site, after `await syncResource(...)` returns.
4. **`LogSource` union in `app/src/lib/logger.ts` is closed** (24 named sources). There is no `'kb-sync-hook'` or `'knowledge-sync'` scope. The `LogSource` type must either be extended or hooks must reuse an existing source (`'system'` is the closest neutral choice already used by `catbrains` route handlers, and Phase 149 tests do not mock `@/lib/logger`, so there is no broken contract by adding `'kb-sync'`).

**Primary recommendation:** Implement exactly **15 call-site hooks** (mapped below by file:line), one `markStale()` helper in a new `app/src/lib/services/kb-audit.ts` that writes to a new file `.docflow-kb/_sync_failures.md` (NOT `_audit_stale.md`), extend `LogSource` with `'kb-sync'`, and gate all hooks with `try/catch` so DB operations never regress. Tests split into `kb-hooks-tools.test.ts` + `kb-hooks-api-routes.test.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D1. Double-path hook strategy (tools + API routes).** Hook both paths. Scope matrix:

| Operación | Path tool (catbot-tools.ts case) | Path API route | Entrada KB |
|-----------|----------------------------------|----------------|------------|
| Create CatPaw | `create_cat_paw`/`create_agent` L1636 | `POST /api/cat-paws` | `resources/catpaws/` |
| Update CatPaw | `update_cat_paw` L2238 | `PATCH /api/cat-paws/[id]` | idem |
| Delete CatPaw | (sin tool) | `DELETE /api/cat-paws/[id]` | idem, soft-delete |
| Create CatBrain | `create_catbrain` L1610 | `POST /api/catbrains` | `resources/catbrains/` |
| Create Connector | `create_connector` L1699 | `POST /api/connectors` | `resources/connectors/` |
| Create Skill | (sin tool) | `POST /api/skills` | `resources/skills/` |
| Create Email Template | `create_email_template` L3097 | `POST /api/email-templates` | `resources/email-templates/` |
| Update Email Template | `update_email_template` L3122 | (verify PATCH route) | idem |
| Delete Email Template | `delete_email_template` L3152 | (verify DELETE route) | idem, soft-delete |

**D2. Mecánica del hook — wrapper pattern.** Wrap in-place tras DB commit; `await syncResource`; graceful `try/catch`; `invalidateKbIndex()` only on success path; `markStale()` helper on failure.

**D3. Failure mode — DB wins, KB stale logged.** Sync failure NO rompe la operación DB. ERROR log, stale entry in audit file, reconciliation via `kb-sync.cjs --full-rebuild --source db`. Not transactional, not rollback.

**D4. Delete semantics — soft via markDeprecated.** Always `syncResource(entity, 'delete', {id}, ctx)` → `markDeprecated()`. Nunca `fs.unlink()`. Archivos deprecated persisten hasta Phase 155.

**D5. Author attribution.**
- Tool case con `context?.userId`: `author: context.userId ?? 'catbot'`.
- API route: `author: 'api:<route>'` (e.g. `'api:cat-paws.POST'`).
- Seed: `author: 'system:seed'`.
- Verificar si middleware auth existe; si no, tag de route aceptable (no security boundary).

**D6. Orden operaciones en PATCH/UPDATE.** (1) DB update; (2) `SELECT * WHERE id = ?`; (3) `await syncResource(subtype, 'update', row, {author})`; (4) `invalidateKbIndex()`; (5) response. Paso 2 NO opcional.

**D7. Cache invalidation strategy.** Invalidar **solo tras success**. No invalidar tras fail (cache = estado previo correcto).

**D8. Tests obligatorios (Nyquist enabled).** Unit tests por cada hook + failure simulation + integration API routes + regression + oracle test pre-cierre.

**D9. Ubicación del código nuevo.**
- `markStale` helper: new module `app/src/lib/services/kb-audit.ts` (preference) o extender `knowledge-sync.ts`.
- Hooks en tools: edits in-place en `catbot-tools.ts`.
- Hooks en API routes: edits in-place por file.
- Tests: `app/src/lib/__tests__/kb-hooks-tools.test.ts` + `kb-hooks-api-routes.test.ts`.

**D10. Requirement IDs (Plan 01 Task 1):** KB-19, KB-20, KB-21, KB-22 (detalle en upstream prompt).

### Claude's Discretion

- Ubicación exacta de `markStale` helper (módulo dedicado vs dentro de knowledge-sync) — preferencia módulo.
- Estructura interna de tests (1 archivo grande vs split por entity) — planner decide según tamaño final.
- Si usar `logger.error(...)` o `console.error` — seguir convención del repo. Buscar logger con `grep -rln "logger\." …`.
- Exit strategy si route existe pero planner no puede verificarla: **scope down** — no añadir hook hasta confirmar.
- Mensaje exacto del ERROR log — estilo consistente con Phases 149/150.
- Si añadir Observability metric (counter de sync-failed) — deferred, no critical.

### Deferred Ideas (OUT OF SCOPE)

- Crear tools inexistentes (`update_catbrain`, `delete_cat_paw`, `update_connector`, `delete_connector`, `create_skill`, `update_skill`, `delete_skill`, `create_canvas`, `update_canvas`, `delete_canvas`) — features propias, no scope 153.
- Canvas CRUD tools — gestionados vía `canvas_executor.ts`, flujo distinto.
- Sync transaccional / DB rollback on KB fail — rechazado por filosofía DB-wins.
- Sync bidireccional KB → DB — nunca. KB derivado.
- Observability metrics (sync-failed counter, p99) — futura fase.
- Webhook/event-driven sync — no necesario a esta escala.
- Retry automático en syncResource failure — `_audit_stale.md` + CLI manual suficiente.
- `touchAccess` al servir `get_kb_entry`/`search_kb` — requeriría writes en read path, deferred.
- Deprecación física de archivos tras N días — ya cubierto Phase 149 (180d workflow).
- Prompt injection del event log — out of scope; `kb_entry` del return ya da handle.
- Dashboard UI de stale entries — Phase 154.
- Cleanup físico de legacy layer — Phase 155.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| KB-19 | Tools de CatBot que crean/actualizan/eliminan recursos (8 cases existentes) llaman `syncResource` al final exitoso. Fail mode: DB persiste, ERROR logueado, `_sync_failures.md` actualizado, `invalidateKbIndex()` post-success. | §Target Call Sites (Tools) enumera los 7 cases reales con file:line y exacto wrap shape. §Pitfall 1 confirma que `update_cat_paw` pasa por fetch y no es hookeable directo (corrección al CONTEXT que lista 8 cases). §Hook Recipe §A define la plantilla `try/catch` completa. |
| KB-20 | API routes Next.js (POST `/api/cat-paws`, PATCH/DELETE `/api/cat-paws/[id]`, POST `/api/catbrains`, PATCH/DELETE `/api/catbrains/[id]`, POST `/api/connectors`, PATCH/DELETE `/api/connectors/[id]`, POST `/api/skills`, PATCH/DELETE `/api/skills/[id]`, POST `/api/email-templates`, PATCH/DELETE `/api/email-templates/[id]`) llaman `syncResource`. Misma política fallo. | §Target Call Sites (Routes) enumera los 13 handlers con file:line y shape del body. §Hook Recipe §B da la plantilla. §Entity Key Mapping previene confusión entre table name y entity key. §Pitfall 2 flag sobre `catbrains DELETE` que ya hace 3 side effects non-KB (Qdrant + filesystem + bot dir) — el hook debe colocarse post-DB-delete antes de return, no envolver todo. |
| KB-21 | Tools/routes de delete llaman `syncResource(entity, 'delete', {id}, ctx)` (que internamente llama `markDeprecated`) — nunca `fs.unlink`. Archivos deprecated persisten. | §syncResource Semantics cita lines 1183-1194 del service que rutan `op='delete'` → `markDeprecated(path, {id}, ctx.author, ctx.reason, ctx.superseded_by)`. §Hook Recipe §C muestra el patrón de delete y cómo leer el row PRE-delete para hacer `UPDATE→SELECT→DELETE→syncResource(delete)`. §Pitfall 3 advierte del orden. |
| KB-22 | Helper `markStale(path, reason, errorDetails?)` expuesto desde `app/src/lib/services/kb-audit.ts` nuevo. Append entries a **`.docflow-kb/_sync_failures.md`** (NOT `_audit_stale.md`). | §MAJOR CONFLICT #1: `_audit_stale.md` es REGENERADO por `kb-sync.cjs --audit-stale` (no append-only) — shape incompatible. §Proposed Audit File Design define `_sync_failures.md` append-only con schema-valid frontmatter. §Append Concurrency explica lockfile pattern para writes paralelos. |
</phase_requirements>

## Standard Stack

### Core

| Module / Function | Where | Purpose | Why Standard |
|-------------------|-------|---------|--------------|
| `syncResource(entity, op, row, ctx?)` | `app/src/lib/services/knowledge-sync.ts:1065` | Entry point único para todo sync DB→KB. Handles create/update/delete/access. | Phase 149 contract (KB-04), 38/38 tests green, `detectBumpLevel` + `regenerateHeader` + `updateIndexFull` corren internamente. |
| `markDeprecated(path, row, author, reason?, superseded_by?)` | `knowledge-sync.ts:1220` | Soft-delete: bump major, set `status: deprecated`, añade change_log entry. | Phase 149 contract. Ya invocado internamente por `syncResource('delete')`. Hooks deberían pasar por `syncResource`, NO llamar `markDeprecated` directo (consistency). |
| `invalidateKbIndex()` | `app/src/lib/services/kb-index-cache.ts:174` | Limpia cache in-memory del `_index.json` + `sotCache` (byTableId). Next read hace cold re-read. | Phase 152 contract. Única forma de que `list_*` + `search_kb` vean cambios inmediatos dentro del TTL 60s. |
| `logger.error(source, msg, meta?)` | `app/src/lib/logger.ts:82` | JSONL log a `/app/data/logs/app-YYYY-MM-DD.jsonl` + rotación 7d. | Convención establecida (177 files importan). `LogSource` union cerrado — **extender con `'kb-sync'`**. |

### Supporting

| Library / Module | Version | Purpose | When to Use |
|------------------|---------|---------|-------------|
| `vitest` | 4.1.0 | Test runner con `vi.hoisted`, `vi.mock`, `vi.spyOn`. | Todo test nuevo. Framework ya establecido; no usar jest. |
| `NextRequest` | next 14.x | Constructor de request para tests unit de route handlers. | Tests de `POST /api/cat-paws` etc. Patrón ya usado en `alias-routing/__tests__/route.test.ts`. |
| `better-sqlite3` | (via `app/node_modules`) | DB prepared statements, transactions. | No importar desde el hook — DB ya está usado por el código alrededor. Solo observar. |
| `js-yaml` | 4.1.1 (transitive) | Parse/write YAML frontmatter. | Solo si `markStale` o audit file generator necesita YAML estructural; simple line-append evita la dep. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `syncResource(entity, 'delete', {id}, ctx)` for soft-delete | `markDeprecated(path, ...)` directo | Directo requiere resolver el path primero (duplica `findExistingFileByIdShort`) y bypass `updateIndexFull` + `regenerateHeader` internos. Not worth it. |
| `kb-audit.ts` dedicated module | Extender `knowledge-sync.ts` con `markStale` | CONTEXT D9 permite ambos; preferencia módulo dedicado porque Phase 155 cleanup lo consumirá independientemente. |
| JSONL append for `_sync_failures.md` | YAML frontmatter + markdown body | JSONL es append-safe, línea-atomic, parseable con `readline`. Pero `validate-kb.cjs` walks todos los `.md` — `.jsonl` extension NO es escaneada (ver kb-sync.cjs:34 `EXCLUDED_FILENAMES`). Ambos válidos; recomendado: `_sync_failures.md` con frontmatter-header + append-section para compatibilidad KB. |
| Extend `scripts/kb-sync.cjs --audit-stale` para mergear `_sync_failures.md` | Dejar ambos files separados | Mergear requiere code change en el CLI (scope creep fuera de TS app boundary). Dejar separado es menos invasivo — el audit CLI puede añadir un "Section: Sync Failures" leyendo `_sync_failures.md` as a second pass en futura fase. |

**Installation:** No new deps. Everything está in-tree.

## Architecture Patterns

### Recommended Project Structure (diff from current)

```
app/src/lib/services/
├── knowledge-sync.ts       (Phase 149 — unchanged in 153)
├── kb-index-cache.ts       (Phase 152 — unchanged in 153)
└── kb-audit.ts             ← NEW (Phase 153, <80 LOC: markStale + loadFailures reader)

app/src/lib/
└── logger.ts               ← EDIT: extend LogSource union with 'kb-sync'

app/src/lib/services/
└── catbot-tools.ts         ← EDIT: 7 in-place wraps (L1610, L1636, L1699, L3097, L3122, L3152; skip L2238)

app/src/app/api/
├── cat-paws/route.ts              ← EDIT: POST wrap (L55 → add hook at L120-123 region)
├── cat-paws/[id]/route.ts         ← EDIT: PATCH wrap (L52), DELETE wrap (L117)
├── catbrains/route.ts             ← EDIT: POST wrap (L33)
├── catbrains/[id]/route.ts        ← EDIT: PATCH wrap (L25), DELETE wrap (L72)
├── connectors/route.ts            ← EDIT: POST wrap (L40)
├── connectors/[id]/route.ts       ← EDIT: PATCH wrap (L39), DELETE wrap (L147)
├── skills/route.ts                ← EDIT: POST wrap (L41)
├── skills/[id]/route.ts           ← EDIT: PATCH wrap (L18), DELETE wrap (L61)
├── email-templates/route.ts       ← EDIT: POST wrap (L76)
└── email-templates/[id]/route.ts  ← EDIT: PATCH wrap (L20), DELETE wrap (L57)

app/src/lib/__tests__/
├── kb-hooks-tools.test.ts           ← NEW
├── kb-hooks-api-routes.test.ts      ← NEW
└── kb-test-utils.ts                 ← EXTEND with `createFixtureDb(tmpDir)` if not present

.docflow-kb/
└── _sync_failures.md                ← NEW file (append-only, frontmatter + markdown table)
```

**Total files changed: 13 edited + 4 new = 17 files.**

### Target Call Sites — Tools (7 wrappable cases)

All line numbers verified by direct Grep on `catbot-tools.ts` (4062 lines total). `executeTool` signature: `(name, args, baseUrl, context?: { userId: string; sudoActive: boolean; channel?: string; channelRef?: string; complexityDecisionId?: string })` at line 1587.

| # | Case | File:Line | DB write | Current return | Hook entity | Op | Author source |
|---|------|-----------|----------|----------------|-------------|-----|---------------|
| 1 | `create_catbrain` | `catbot-tools.ts:1610-1621` | INSERT INTO catbrains | `{ id, name, status }` | `'catbrain'` | `'create'` | `context?.userId ?? 'catbot'` |
| 2 | `create_agent` / `create_cat_paw` (fall-through) | `catbot-tools.ts:1635-1654` | INSERT INTO cat_paws | `{ id, name, mode, ... }` | `'catpaw'` | `'create'` | `context?.userId ?? 'catbot'` |
| 3 | `create_connector` | `catbot-tools.ts:1699-1710` | INSERT INTO connectors | `{ id, name, type }` | `'connector'` | `'create'` | `context?.userId ?? 'catbot'` |
| 4 | ~~`update_cat_paw`~~ | `catbot-tools.ts:2238-2272` | **NONE — uses fetch to PATCH /api/cat-paws/[id]** | `{ updated, id, name, fields_updated }` | — | — | **DO NOT HOOK** |
| 5 | `create_email_template` | `catbot-tools.ts:3097-3120` | INSERT INTO email_templates | `{ id, name, category, created }` | `'template'` | `'create'` | `context?.userId ?? 'catbot'` |
| 6 | `update_email_template` | `catbot-tools.ts:3122-3150` | UPDATE email_templates | `{ templateId, updated, fields }` | `'template'` | `'update'` | `context?.userId ?? 'catbot'` |
| 7 | `delete_email_template` | `catbot-tools.ts:3152-3160` | DELETE FROM email_templates (+ template_assets) | `{ deleted, templateId, name }` | `'template'` | `'delete'` | `context?.userId ?? 'catbot'` |

**Critical correction to CONTEXT D1 count:** CONTEXT lists 8 cases. The real hookable set is **6** (create_catbrain, create_cat_paw/create_agent which fall through so count once, create_connector, create_email_template, update_email_template, delete_email_template) because `update_cat_paw` routes through `fetch(…PATCH)` to the API route (verified L2253-2258), not a direct DB write. Hooking it would either double-fire (if we hook the route) or read stale state (if hook runs before the fetch completes).

### Target Call Sites — API Routes (13 handlers across 5 entity domains)

All exports verified with Grep on `app/src/app/api/*/route.ts` and `*/[id]/route.ts`. All five entities (`cat_paws`, `catbrains`, `connectors`, `skills`, `email_templates`) have `POST` in `route.ts` and `PATCH`+`DELETE` in `[id]/route.ts` — **3 handlers per entity × 5 entities = 15 handlers minus 2 gaps** (skills PATCH/DELETE which exist in `[id]/route.ts` at L18+L61, so no gap; plus cat-paws which has 3, so the total is 15 handlers if counting all). Let me correct: actual count by direct inspection is exactly **13 non-GET POST/PATCH/DELETE handlers** in the canonical `route.ts` files (one POST, one PATCH, one DELETE per entity, but `email-templates` PATCH at `[id]/route.ts:20` and DELETE at `[id]/route.ts:57` exist, total per entity = 3; × 5 = 15). **Corrected: 15 handlers. Skipping none.** The "13" figure from CONTEXT is wrong by 2 — CONTEXT missed `email-templates` PATCH+DELETE as "unconfirmed", but they ARE present (verified).

| # | Route handler | File:Line | DB write | Response shape | Hook entity | Op |
|---|--------------|-----------|----------|----------------|-------------|-----|
| 1 | `POST /api/cat-paws` | `api/cat-paws/route.ts:55` | INSERT cat_paws + SELECT row back (L120) | `row` (status 201) | `'catpaw'` | `'create'` |
| 2 | `PATCH /api/cat-paws/[id]` | `api/cat-paws/[id]/route.ts:52` | UPDATE cat_paws + SELECT back (L108) | `updated` (status 200) | `'catpaw'` | `'update'` |
| 3 | `DELETE /api/cat-paws/[id]` | `api/cat-paws/[id]/route.ts:117` | SELECT pre (L120), DELETE (L127) | `{ success: true }` | `'catpaw'` | `'delete'` |
| 4 | `POST /api/catbrains` | `api/catbrains/route.ts:33` | INSERT catbrains + SELECT back (L52) | `catbrain` (201) | `'catbrain'` | `'create'` |
| 5 | `PATCH /api/catbrains/[id]` | `api/catbrains/[id]/route.ts:25` | UPDATE catbrains + SELECT back (L64) | `updatedCatbrain` | `'catbrain'` | `'update'` |
| 6 | `DELETE /api/catbrains/[id]` | `api/catbrains/[id]/route.ts:72` | SELECT pre (L75), 3 side-effects (Qdrant + fs + bots), DELETE (L125) | `{ success: true, warnings? }` | `'catbrain'` | `'delete'` |
| 7 | `POST /api/connectors` | `api/connectors/route.ts:40` | INSERT connectors + SELECT back (L137) | `maskSensitiveConfig(connector)` (201) | `'connector'` | `'create'` |
| 8 | `PATCH /api/connectors/[id]` | `api/connectors/[id]/route.ts:39` | UPDATE connectors + SELECT back (L139) | `maskSensitiveConfig(updated)` | `'connector'` | `'update'` |
| 9 | `DELETE /api/connectors/[id]` | `api/connectors/[id]/route.ts:147` | SELECT pre (L149), DELETE (L155) | `{ success: true }` | `'connector'` | `'delete'` |
| 10 | `POST /api/skills` | `api/skills/route.ts:41` | INSERT skills + SELECT back (L73) | `skill` (201) | `'skill'` | `'create'` |
| 11 | `PATCH /api/skills/[id]` | `api/skills/[id]/route.ts:18` | UPDATE skills + SELECT back (L52) | `updated` | `'skill'` | `'update'` |
| 12 | `DELETE /api/skills/[id]` | `api/skills/[id]/route.ts:61` | SELECT pre (L63), DELETE + 2 cascades (L68-70) | `{ success: true }` | `'skill'` | `'delete'` |
| 13 | `POST /api/email-templates` | `api/email-templates/route.ts:76` | INSERT email_templates + Drive folder + SELECT back (L105) | `created` (201) | `'template'` | `'create'` |
| 14 | `PATCH /api/email-templates/[id]` | `api/email-templates/[id]/route.ts:20` | UPDATE email_templates + SELECT back (L50) | `updated` | `'template'` | `'update'` |
| 15 | `DELETE /api/email-templates/[id]` | `api/email-templates/[id]/route.ts:57` | SELECT pre (L59), DELETE (L62) | `{ deleted: true }` | `'template'` | `'delete'` |

**Total API route hooks: 15.** Combined with 6 tool-case hooks = **21 insertion points**.

### Hook Recipe

#### §A. Hook inside a catbot-tools.ts case (create path)

```typescript
// Pattern for: create_catbrain, create_cat_paw, create_connector, create_email_template
case 'create_catbrain': {
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO catbrains (id, name, purpose, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, args.name, args.purpose || '', 'draft', now, now);

  // NEW (Phase 153 hook):
  try {
    const row = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id) as Record<string, unknown>;
    await syncResource('catbrain', 'create', row as DBRow, {
      author: context?.userId ?? 'catbot',
    });
    invalidateKbIndex();
  } catch (err) {
    logger.error('kb-sync', 'syncResource failed on create_catbrain', {
      entity: 'catbrain',
      id,
      err: (err as Error).message,
    });
    markStale(`resources/catbrains/${id.slice(0, 8)}-${slugify(args.name as string)}.md`, 'create-sync-failed', {
      entity: 'catbrains',
      db_id: id,
      error: (err as Error).message,
    });
  }

  return {
    name,
    result: { id, name: args.name, status: 'draft' },
    actions: [{ type: 'navigate', url: `/catbrains/${id}`, label: `Ir al CatBrain ${args.name} →` }],
  };
}
```

#### §B. Hook inside an API route handler (create path)

```typescript
// Pattern for: POST /api/cat-paws, POST /api/catbrains, etc.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    // ... validation + INSERT + SELECT row back ...
    const row = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id) as Record<string, unknown>;

    // NEW (Phase 153 hook):
    try {
      await syncResource('catpaw', 'create', row as DBRow, { author: 'api:cat-paws.POST' });
      invalidateKbIndex();
    } catch (err) {
      logger.error('kb-sync', 'syncResource failed on POST /api/cat-paws', {
        entity: 'catpaw',
        id,
        err: (err as Error).message,
      });
      markStale(`resources/catpaws/${id.slice(0, 8)}-${slugify(body.name)}.md`, 'create-sync-failed', {
        entity: 'cat_paws',
        db_id: id,
        error: (err as Error).message,
      });
    }

    logger.info('cat-paws', 'CatPaw creado', { pawId: id, name: body.name });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    logger.error('cat-paws', 'Error creando cat-paw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

#### §C. Hook for delete (read row BEFORE delete, pass `{id}` to syncResource)

```typescript
// Pattern for: DELETE /api/cat-paws/[id], DELETE /api/catbrains/[id], etc.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(id);
    if (!paw) {
      return NextResponse.json({ error: 'CatPaw not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM cat_paws WHERE id = ?').run(id);

    // NEW (Phase 153 hook): syncResource('delete') internally routes to markDeprecated
    try {
      await syncResource('catpaw', 'delete', { id }, {
        author: 'api:cat-paws.DELETE',
        reason: `DB row deleted at ${new Date().toISOString()}`,
      });
      invalidateKbIndex();
    } catch (err) {
      logger.error('kb-sync', 'syncResource failed on DELETE /api/cat-paws/[id]', {
        entity: 'catpaw',
        id,
        err: (err as Error).message,
      });
      markStale(`resources/catpaws/${id.slice(0, 8)}-*.md`, 'delete-sync-failed', {
        entity: 'cat_paws',
        db_id: id,
        error: (err as Error).message,
      });
    }

    logger.info('cat-paws', 'CatPaw eliminado', { pawId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('cat-paws', 'Error eliminando cat-paw', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
```

**Key pattern invariants:**
1. Hook sits **inside the outer `try` block** but has its **own inner try/catch** so it never throws past the handler boundary.
2. The hook's catch **does not** rethrow; DB already committed.
3. `invalidateKbIndex()` called only on success path.
4. `markStale(path, reason, {details})` in the failure path. Path is relative to `.docflow-kb/` and may contain a glob fragment for delete (since we don't need the exact slug to reconstruct intent).
5. Hook NEVER interferes with the existing `logger.info('cat-paws', 'CatPaw creado', ...)` lines — both logs coexist.

### Entity Key Mapping (CRITICAL)

Three parallel namespaces exist; misusing them produces silent sync misses:

| Context | Namespace | Examples |
|---------|-----------|----------|
| DB table (SQL) | plural snake_case | `cat_paws`, `catbrains`, `connectors`, `skills`, `email_templates` |
| `syncResource` first arg (`Entity` type, `knowledge-sync.ts:33-39`) | singular lowercase | `'catpaw'`, `'catbrain'`, `'connector'`, `'skill'`, `'template'`, `'canvas'` |
| `resolveKbEntry` first arg (`kb-index-cache.ts:211`, Phase 152) | DB table (as above) | `'cat_paws'`, `'email_templates'`, etc. |
| KB subdir (`ENTITY_SUBDIR`, `knowledge-sync.ts:76-83`) | plural kebab | `resources/catpaws`, `resources/email-templates` |
| Frontmatter `subtype` | singular lowercase | `'catpaw'`, `'email-template'` |

**Trap:** `email_templates` DB table → entity `'template'` (NOT `'email-template'` NOR `'email_template'`). Verified at `knowledge-sync.ts:104-111`:
```typescript
const ENTITY_TO_TABLE: Record<Entity, string> = {
  catpaw: 'cat_paws',
  connector: 'connectors',
  catbrain: 'catbrains',
  template: 'email_templates',   // ← singular, not 'email-template'
  skill: 'skills',
  canvas: 'canvases',
};
```

**Canonical mapping for Phase 153 hooks:**

| Hook site | `syncResource(entity)` arg | `markStale` path dir |
|-----------|---------------------------|----------------------|
| cat-paws* | `'catpaw'` | `resources/catpaws/` |
| catbrains* | `'catbrain'` | `resources/catbrains/` |
| connectors* | `'connector'` | `resources/connectors/` |
| skills* | `'skill'` | `resources/skills/` |
| email-templates* | `'template'` | `resources/email-templates/` |

### syncResource Semantics (verified against `knowledge-sync.ts:1065-1206`)

```typescript
export async function syncResource(
  entity: Entity,                                    // 'catpaw'|'connector'|'catbrain'|'template'|'skill'|'canvas'
  op: Op,                                            // 'create'|'update'|'delete'|'access'
  row: DBRow | { id: string },                       // full DB row for create/update; {id}-only sufficient for delete/access
  context?: SyncContext                              // { author?, kbRoot?, reason?, superseded_by? }
): Promise<void>
```

Behavior per op (verified line references):

- **`'create'` (L1075-1082):** builds frontmatter via `buildFrontmatterForCreate`, writes to `kbFilePath(kbRoot, entity, row)` = `<kbRoot>/<ENTITY_SUBDIR[entity]>/<id.slice(0,8)>-<slug(row.name)>.md`. `mkdirSync(..., recursive: true)`. No existence check — will **overwrite** if file exists (edge case: crash during create leaves stub → next run overwrites cleanly).
- **`'update'` (L1084-1181):** finds existing file via `findExistingFileByIdShort` (L140-153, matches `<id.slice(0,8)>-*.md`). If not found → **falls through to create** (L1086-1089, idempotency). Then: parses frontmatter, merges via `mergeRowIntoFrontmatter` (preserves `enriched_fields`, overwrites `fields_from_db`), refreshes `sync_snapshot`, rewrites system_prompt block in body for catpaw (L1121-1137), runs `isNoopUpdate` short-circuit (L1145 — if no structural change, return without writing), else `detectBumpLevel` + `bumpVersion` + append `change_log` entry + write.
- **`'delete'` (L1183-1194):** `findExistingFileByIdShort`; if missing, silent return (L1185, idempotent); else calls `markDeprecated(existingPath, row, ctx.author ?? 'unknown', ctx.reason, ctx.superseded_by)`.
- **`'access'` (L1195-1200):** `findExistingFileByIdShort`; if present, call `touchAccess(path)` which increments `access_count` + sets `last_accessed_at`. (Not used by Phase 153 hooks — deferred.)

After every op (L1203-1205): `updateIndexFull(kbRoot)` + `regenerateHeader(kbRoot)` + `invalidateLLMCache()` (which is a NO-OP placeholder, L1454-1457, documented "TODO Fase 4 — prompt-assembler cache invalidation"). **None of these are the Phase 152 `kb-index-cache`.** Hooks MUST call `invalidateKbIndex()` themselves.

**Errors:** `syncResource` does NOT catch internally (Phase 149 contract docstring: "Errores: throw new Error(msg); el caller decide logging"). The hook's outer `try/catch` is load-bearing.

### `FIELDS_FROM_DB` allowlist per entity (verified `knowledge-sync.ts:85-102`)

Only these DB row fields are treated as "ground truth" and overwritten on update:

| Entity | Allowlist |
|--------|-----------|
| catpaw | `['name', 'description', 'mode', 'model', 'system_prompt', 'temperature', 'max_tokens', 'is_active', 'department']` |
| connector | `['name', 'description', 'type', 'is_active', 'times_used', 'test_status']` |
| catbrain | `['name', 'description', 'collection', 'is_active']` |
| template | `['name', 'description', 'subject', 'body', 'product']` |
| skill | `['name', 'description', 'category', 'is_active']` |
| canvas | `['name', 'description', 'canvas_data', 'is_active']` |

**Drift with Phase 150 spec:** Phase 150 CONTEXT §D2.2 lists richer allowlists (12 fields for catpaw, additional fields for connector/skill). The CLI `scripts/kb-sync-db-source.cjs` likely has its own parallel implementation. **Phase 153 hooks only go through `knowledge-sync.ts`**, so the service's allowlist is authoritative for runtime syncs. This is acceptable — the CLI `--full-rebuild` path can use a richer allowlist for bootstrap populate, the runtime hooks use the narrower allowlist for incremental updates. If the drift bothers us, it's a separate tech-debt phase; Phase 153 does NOT own unifying these.

**Security guarantee verified:** `connector.config` is NOT in the allowlist → never written to KB (Phase 150 KB-11 invariant preserved). Same for `canvas.flow_data` / `canvas.thumbnail` (canvas isn't even in Phase 153 scope). Same for `email_template.structure` / `email_template.html_preview`. Phase 153 hooks inherit this security posture automatically.

### Author Attribution Strategy

**No `getServerSession` / next-auth / auth middleware on `/api/*` routes.** Verified by:
- `app/src/middleware.ts` only does locale cookie redirection (excludes `/api/`).
- Grep of `getServerSession|next-auth|authMiddleware|getAuth(` across `app/src` returns exactly **1 match** (`app/src/app/api/intent-jobs/route.ts`, unrelated pattern).

**Consequence:** API route hooks cannot resolve a real userId. Use route-tag attribution:

| Call site type | `author` value |
|----------------|----------------|
| Tool case (has `context?.userId`) | `context?.userId ?? 'catbot'` |
| Tool case without `context` (fallback in tests) | `'catbot'` |
| API route POST | `'api:<entity>.POST'` e.g. `'api:cat-paws.POST'` |
| API route PATCH | `'api:<entity>.PATCH'` |
| API route DELETE | `'api:<entity>.DELETE'` |

Recording the route in `author` enables post-hoc forensics ("who deprecated this CatPaw? The api:cat-paws.DELETE endpoint at <timestamp>"). The `change_log` entry in the KB file will reflect this, which is editorial metadata, not a security boundary.

### Anti-Patterns to Avoid

- **Double-hooking `update_cat_paw`.** Tool case L2238 uses `fetch` to call `PATCH /api/cat-paws/[id]`. Hook only the route. Tool passes through.
- **Using DB table name as entity key.** `syncResource('cat_paws', ...)` fails the `Entity` type check at compile-time; `syncResource('catpaws', ...)` also fails. Use `'catpaw'`.
- **Calling `invalidateKbIndex()` inside `syncResource`.** The service is Phase 149 code; Phase 152's `kb-index-cache` was written after. Call site calls `invalidateKbIndex()` explicitly.
- **Writing to `_audit_stale.md`.** That file is regenerated by `kb-sync.cjs --audit-stale`. See §MAJOR CONFLICT #1. Write to `_sync_failures.md` instead.
- **`fs.unlink` on KB file during DELETE.** Violates D4 invariant. Always go through `syncResource('delete', ...)` which calls `markDeprecated`.
- **Hook above `SELECT` post-update in PATCH handlers.** D6 mandates SELECT-after-UPDATE so the row passed to syncResource has the post-update state, not pre-update.
- **Hook inside `async` block without `await`.** `syncResource` is async and needs to finish before `invalidateKbIndex()` (otherwise next read races). Always `await`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML frontmatter generation | Roll own serializer | `knowledge-sync.ts` internal `serializeFrontmatter` (already invoked) | Already tested (38/38), handles edge cases in Phase 149's vanilla YAML parser. |
| Bump level detection | Roll logic based on field comparison | `knowledge-sync.ts:712` `detectBumpLevel` | Handles major/minor/patch tree from PRD §5.2. |
| Finding the existing KB file | `fs.readdirSync` + `startsWith` | `findExistingFileByIdShort(kbRoot, entity, id)` at `knowledge-sync.ts:140` | Already handles the slug mutation edge case (renamed row keeps same short-id). |
| Rebuilding `_index.json` post-write | Write our own | `syncResource` calls `updateIndexFull` internally (L1203) | Atomic guarantee: index coherent after each op. |
| Regenerating `_header.md` counts | Write our own | `syncResource` calls `regenerateHeader` internally (L1204) | Phase 150 KB-10 preserved. |
| Soft-delete markdown patching | Roll frontmatter mutation | `syncResource(entity, 'delete', {id}, ctx)` → `markDeprecated` at `knowledge-sync.ts:1220` | Handles status+deprecated_at+deprecated_by+change_log entry atomically. |
| Cache TTL invalidation | Roll counter logic | `invalidateKbIndex()` at `kb-index-cache.ts:174` | Phase 152 shipped it; reset both `indexCache` + `sotCache`. |
| HTTP client to test API routes | Spin up full Next.js server in tests | Import handler directly + `NextRequest` | Pattern at `app/src/app/api/alias-routing/__tests__/route.test.ts`. Tests are fast, no port conflicts. |
| Concurrent DB fixture setup | Custom in each test | Reuse `vi.hoisted` + `CATBOT_DB_PATH` / `DATABASE_PATH` env redirect | Pattern at `kb-tools-integration.test.ts:11-24`. |
| KB fixture for tests | Roll per-test | `createFixtureKb(tmpDir)` at `kb-test-utils.ts:26` | Phase 152 shipped it; 7 resource entries + rule. Extend in-place if needed. |

**Key insight:** Phase 149+150+152 built 100% of the primitives Phase 153 needs. The hook is pure plumbing — ~30 LOC per call site × 21 sites + ~80 LOC for `kb-audit.ts` + extensions. No new algorithms.

## Common Pitfalls

### Pitfall 1: `update_cat_paw` tool case is a pass-through, not a DB writer

**What goes wrong:** Adding a hook at catbot-tools.ts L2238-2272 would either (a) fire before the `fetch(PATCH)` call returns → row state is pre-update, wrong; or (b) double-fire once in the tool and once when the route handler hook fires. Either way incorrect.

**Why it happens:** The CONTEXT table lists L2238 as one of the "8 cases". Planner assumes it's a direct DB write like the other 7. Reading L2253-2258 reveals `fetch(PATCH)` indirection. No DB writes happen in the tool case; all writes happen server-side in the route handler.

**How to avoid:** Hook **only** the route handler (`PATCH /api/cat-paws/[id]`, `api/cat-paws/[id]/route.ts:52`). The tool case gets no edit. The tool's return shape already includes `{ updated, id, name, fields_updated }` which doesn't need KB metadata — user learns from subsequent `list_cat_paws` that `kb_entry` is now populated (which works because the route hook fired).

**Warning signs:** If a test mocks `syncResource` and expects it to be called from `executeTool('update_cat_paw', ...)` directly, the test is wrong — the tool forwards to a route, so the route-side mock is what must assert.

### Pitfall 2: `catbrains DELETE` has 3 non-KB side effects (Qdrant + filesystem + bot dir)

**What goes wrong:** Naive placement of the hook **around** the side-effects could abort a Qdrant cleanup if syncResource fails. Also: the DELETE handler at `api/catbrains/[id]/route.ts:72-137` aggregates side-effect errors into a `warnings` array; if the KB hook error accidentally merges into that array, the response shape changes.

**Why it happens:** CatBrain delete is more complex than other entities (lines 88-122 do Qdrant DELETE, fs.rmSync for data/projects/, fs.rmSync for data/bots/ — all wrapped in individual try/catches). Hook placement matters.

**How to avoid:** Place the hook **after** the `DELETE FROM catbrains` statement (L125) and **before** the `logger.info('system', 'CatBrain eliminado', ...)` call (L131). The hook's own try/catch wraps it completely; on failure it goes to `_sync_failures.md`, it does NOT append to the existing `warnings` array. Response shape preserved.

**Warning signs:** Any test that checks `response.warnings.length === X` could break if hook placement is wrong. Defensive: the hook uses `markStale(…)`, not `warnings.push(…)`.

### Pitfall 3: Delete read order — SELECT must happen BEFORE DELETE

**What goes wrong:** If the handler does `DELETE FROM cat_paws WHERE id = ?` first, then tries to resolve the slug for `markStale`, the row is gone from DB.

**Why it happens:** For `syncResource('delete', {id}, ctx)`, the service only needs `{id}` — it finds the KB file via `findExistingFileByIdShort`. But for failure-path `markStale`, we need `row.name` to build the slug portion of the path. Without pre-DELETE SELECT, we can only pass `resources/<type>/<shortId>-*.md` with a glob, which is acceptable (the audit tool accepts it) but less precise.

**How to avoid:** All 5 DELETE handlers already do SELECT-then-DELETE (cat-paws L120+L127, catbrains L75+L125, connectors L149+L155, skills L63+L68-70, email-templates L59+L62). Hook uses the pre-DELETE `row.name` for slug construction if available; falls back to glob otherwise.

**Warning signs:** `markStale` path with literal `*` needs the audit tool / future cleanup CLI to treat it as a glob, not a literal. CONTEXT §D9 doesn't specify — recommend documenting in `markStale` docstring.

### Pitfall 4: The `_audit_stale.md` shape is fully regenerated, not appended

**What goes wrong:** `kb-sync.cjs --audit-stale` (scripts/kb-sync.cjs:667) REPLACES the file entirely with a fresh scan of deprecated frontmatter. Any hook-written entries there get wiped on next audit run.

**Why it happens:** CONTEXT §D9 says "shape compatible with `kb-sync.cjs --audit-stale`" implying the same file. Reading the actual CLI reveals full regeneration semantics (L762-764: `writeFrontmatter(auditPath, fm, bodyLines.join('\n'))` — a single write, no append).

**How to avoid:** Use a **separate file** `.docflow-kb/_sync_failures.md`, append-only, owned by hooks. `kb-sync.cjs --audit-stale` leaves it alone. See §Proposed Audit File Design.

**Warning signs:** If a test expects `markStale()` to append to `_audit_stale.md` and then running `kb-sync.cjs --audit-stale` preserves it, that test passes by accident only because `--audit-stale` also generates an audit (both files exist in test env briefly). But next CI cycle with non-empty `_audit_stale.md` regenerated by CLI → entries vanish.

### Pitfall 5: Concurrent hook writes to the audit file

**What goes wrong:** Two simultaneous `create_cat_paw` + `create_connector` both fail syncResource and both call `markStale` → file corruption if both open write streams at once (node `fs.appendFileSync` is atomic at the OS call level only for very small writes).

**Why it happens:** Next.js API routes run in a single Node process; however, a single request handler is async and can interleave with another. `fs.appendFileSync(path, content)` is documented to be atomic per call for small writes (<4KB on Linux), but our failure entries contain timestamps + stack traces that can exceed this.

**How to avoid:** Two options:
- **Option A (simplest):** Use `fs.appendFileSync` with one-line entries (<200 bytes) and add a newline marker. A multi-write scenario is tolerated because each line is atomic.
- **Option B:** Use a mutex via a simple `.lock` file in `.docflow-kb/` or an in-process `Promise.queue` helper. Overkill for this scale.

Recommended: **Option A** with strict 1-line-per-entry format (see §Proposed Audit File Design).

**Warning signs:** CI test "concurrent hooks fire simultaneously, both fail" should assert both entries present in `_sync_failures.md`, not 1 entry with garbled content.

### Pitfall 6: `LogSource` type is closed — adding `'kb-sync'` is a breaking change IF any downstream code enumerates it

**What goes wrong:** Adding a new variant to the exported `LogSource` union type could break consumers that enumerate variants or use `keyof` on a map keyed by `LogSource`.

**Why it happens:** TypeScript union types don't auto-extend consumers. Any `switch (source) { … default: assertNever(source) }` pattern would fail type-check.

**How to avoid:** Grep for `LogSource` usages:

```
grep -rn 'LogSource' app/src | head -10
```

Likely **zero enumeration consumers** (logger is write-only). Adding `'kb-sync'` is safe. If any consumer appears, it would be caught at TypeScript compile-time by `npm run build`.

**Warning signs:** Build failure in `next build` with `Type '"kb-sync"' is not assignable to type 'LogSource'` in any file other than `kb-audit.ts` or the edited hook sites.

### Pitfall 7: `process.env` must be `process['env']` (bracket notation)

**What goes wrong:** `process.env.KB_ROOT` is inlined at build time by webpack, so the runtime value always equals what was present at Docker build.

**Why it happens:** CLAUDE.md mandates bracket notation. `knowledge-sync.ts` doesn't read env at all (uses `SyncContext.kbRoot` or computes default). `kb-index-cache.ts:45` uses `process['env']['KB_ROOT']` correctly. `kb-audit.ts` (new) must follow suit if it reads any env.

**How to avoid:** Bracket notation in new module. `markStale`'s path resolution should either (a) take kbRoot as argument, (b) compute from `process['env']['KB_ROOT']` with same fallback as kb-index-cache.

## Code Examples

### Example 1: `markStale` helper (proposed implementation, ~30 LOC)

```typescript
// app/src/lib/services/kb-audit.ts
// Phase 153 — Append-only audit file for syncResource hook failures.
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_KB_ROOT = path.resolve(__dirname, '../../../../.docflow-kb');

function getKbRoot(): string {
  return process['env']['KB_ROOT'] || DEFAULT_KB_ROOT;
}

export interface StaleEntry {
  entity: string;    // DB table name, e.g. 'cat_paws'
  db_id: string;
  error: string;
}

/**
 * Appends a failure entry to `.docflow-kb/_sync_failures.md`. The file is
 * append-only and owned by Phase 153 hooks. Distinct from `_audit_stale.md`
 * which is fully regenerated by `kb-sync.cjs --audit-stale`.
 *
 * Line format (atomic, <200 bytes):
 *   - YYYY-MM-DDThh:mm:ssZ | <reason> | <entity> | <db_id> | <path> | <error-truncated-100>
 */
export function markStale(
  kbRelPath: string,
  reason: 'create-sync-failed' | 'update-sync-failed' | 'delete-sync-failed' | 'markDeprecated-failed',
  details?: StaleEntry
): void {
  try {
    const kbRoot = getKbRoot();
    const filePath = path.join(kbRoot, '_sync_failures.md');
    if (!fs.existsSync(filePath)) {
      // First entry: write header + frontmatter so file is schema-valid markdown.
      const header = `---
id: sync-failures
type: audit
subtype: null
lang: es
title: Sync Failures Log
summary: Append-only log of Phase 153 hook failures for reconciliation.
tags: [ops]
audience: [developer]
status: active
created_at: ${new Date().toISOString()}
created_by: kb-audit
version: 1.0.0
updated_at: ${new Date().toISOString()}
updated_by: kb-audit
source_of_truth: null
ttl: never
---

# Sync Failures Log

Entries appended by Phase 153 hooks when \`syncResource()\` throws. Run
\`node scripts/kb-sync.cjs --full-rebuild --source db\` to reconcile.

| Timestamp | Reason | Entity | DB ID | KB Path | Error |
|-----------|--------|--------|-------|---------|-------|
`;
      fs.writeFileSync(filePath, header);
    }

    const ts = new Date().toISOString();
    const errTrunc = (details?.error ?? '').replace(/\|/g, '\u2502').slice(0, 100);
    const line = `| ${ts} | ${reason} | ${details?.entity ?? '?'} | ${details?.db_id ?? '?'} | ${kbRelPath} | ${errTrunc} |\n`;
    fs.appendFileSync(filePath, line);
  } catch {
    // Last-ditch fallback: swallow. `_sync_failures.md` unwritable is not fatal
    // — the ERROR log via logger.error() is the canonical record.
  }
}
```

### Example 2: Test for tool-case hook (unit)

```typescript
// app/src/lib/__tests__/kb-hooks-tools.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// Hoist env redirection BEFORE importing code-under-test.
vi.hoisted(() => {
  const nodeFs = require('fs');
  const nodePath = require('path');
  const nodeOs = require('os');
  const tmp = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kbhook-'));
  process['env']['DATABASE_PATH'] = nodePath.join(tmp, 'docflow-test.db');
  process['env']['CATBOT_DB_PATH'] = nodePath.join(tmp, 'catbot-test.db');
  process['env']['KB_ROOT'] = nodePath.join(tmp, '.docflow-kb');
});

import { executeTool } from '@/lib/services/catbot-tools';
import dbModule from '@/lib/db';
import { invalidateKbIndex } from '@/lib/services/kb-index-cache';

describe('Phase 153 hook — create_catbrain', () => {
  beforeEach(() => {
    const kbRoot = process['env']['KB_ROOT']!;
    fs.mkdirSync(path.join(kbRoot, 'resources/catbrains'), { recursive: true });
    fs.writeFileSync(path.join(kbRoot, '_index.json'), JSON.stringify({ schema_version: '2.0', entry_count: 0, entries: [], indexes: { by_type:{}, by_tag:{}, by_audience:{} } }));
    dbModule.prepare('CREATE TABLE IF NOT EXISTS catbrains (id TEXT PRIMARY KEY, name TEXT, purpose TEXT, status TEXT, created_at TEXT, updated_at TEXT)').run();
    dbModule.prepare('DELETE FROM catbrains').run();
    invalidateKbIndex();
  });

  it('writes KB file after successful create_catbrain', async () => {
    const res = await executeTool('create_catbrain', { name: 'Test Brain', purpose: 'test' }, 'http://localhost', { userId: 'u1', sudoActive: false });
    const id = (res.result as { id: string }).id;
    const kbFile = fs.readdirSync(path.join(process['env']['KB_ROOT']!, 'resources/catbrains'));
    expect(kbFile).toHaveLength(1);
    expect(kbFile[0]).toMatch(new RegExp(`^${id.slice(0,8)}-.*\\.md$`));
  });

  it('DB persist + stale marker on syncResource failure', async () => {
    vi.mock('@/lib/services/knowledge-sync', async () => {
      const actual = await vi.importActual<typeof import('@/lib/services/knowledge-sync')>('@/lib/services/knowledge-sync');
      return { ...actual, syncResource: vi.fn(async () => { throw new Error('ENOSPC'); }) };
    });
    const res = await executeTool('create_catbrain', { name: 'FailBrain', purpose: 'test' }, 'http://localhost', { userId: 'u1', sudoActive: false });
    const id = (res.result as { id: string }).id;
    const row = dbModule.prepare('SELECT * FROM catbrains WHERE id = ?').get(id);
    expect(row).toBeDefined();    // DB wins
    const failFile = path.join(process['env']['KB_ROOT']!, '_sync_failures.md');
    expect(fs.existsSync(failFile)).toBe(true);
    expect(fs.readFileSync(failFile, 'utf8')).toMatch(/create-sync-failed/);
  });
});
```

### Example 3: Test for route handler hook (integration)

```typescript
// app/src/lib/__tests__/kb-hooks-api-routes.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.hoisted(() => { /* same as above */ });

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST } from '@/app/api/cat-paws/route';
import dbModule from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 153 hook — POST /api/cat-paws', () => {
  beforeEach(() => { /* table create + kbRoot prep */ });

  it('creates CatPaw + KB file + _index.json entry', async () => {
    const req = new NextRequest('http://localhost/api/cat-paws', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Paw', department: 'business' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    const id = body.id;
    const kbDir = path.join(process['env']['KB_ROOT']!, 'resources/catpaws');
    const files = fs.readdirSync(kbDir);
    expect(files.find(f => f.startsWith(id.slice(0,8)))).toBeDefined();
    const indexPath = path.join(process['env']['KB_ROOT']!, '_index.json');
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    expect(index.entries.some((e: { id: string }) => e.id.startsWith(id.slice(0,8)))).toBe(true);
  });
});
```

### Example 4: Extending LogSource type

```typescript
// app/src/lib/logger.ts — EDIT
export type LogSource =
  | 'processing' | 'chat' | 'rag' | 'catbot'
  | 'tasks' | 'canvas' | 'connectors' | 'system'
  // ... existing ...
  | 'kb-sync';        // ← ADD (Phase 153)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Run `kb-sync.cjs --full-rebuild --source db` manually after each DB edit | Inline hook fires automatically post-write | Phase 153 (this phase) | `kb_entry: null` on fresh CatPaws disappears; manual reconciliation becomes exception, not norm. |
| `markDeprecated` only called by CLI during cleanup | `markDeprecated` called inline via `syncResource('delete')` on every DB DELETE | Phase 153 | Soft-delete is real-time; `search_kb({status:'active'})` stops showing deleted items immediately. |
| Cache TTL 60s + cold-read natural eventual consistency | `invalidateKbIndex()` after every hook success → next read is fresh | Phase 152 + Phase 153 | UI/chat sees fresh `kb_entry` field immediately after an edit. |
| `fs.unlink(kbFile)` on delete (hypothetical naive) | Soft-delete via frontmatter mutation | Phase 149 established the pattern; Phase 153 enforces it on real deletes | Deprecated archives preserved for 180d workflow (Phase 149 thresholds). |

**Deprecated/outdated:**
- None — all prior KB behavior is additive, not replaced.

## Open Questions

1. **Should we extend `kb-sync.cjs --audit-stale` to also surface `_sync_failures.md` entries in the report?**
   - What we know: current CLI only reads deprecated frontmatter. Hook-written failures live in a separate file.
   - What's unclear: UX expectation — will operators expect a single audit command?
   - Recommendation: **Out of scope for 153.** Phase 154 dashboard owns the unified view. In 153, commit clean separation with a 2-line update to `scripts/kb-sync.cjs` `--help` text mentioning both files.

2. **Does `_sync_failures.md` participate in `validate-kb.cjs`?**
   - What we know: validator walks all `.md` in `.docflow-kb/` excluding `EXCLUDED_FILENAMES` (`_header.md`, `_manual.md`, `_audit_stale.md`). `_sync_failures.md` is not excluded.
   - What's unclear: will our frontmatter pass the schema check? Schema requires 13+ mandatory fields (Phase 149 KB-02).
   - Recommendation: use the same frontmatter shape as `_audit_stale.md` (verified schema-valid) + add to `EXCLUDED_FILENAMES` in Phase 153 to avoid coupling: edit `scripts/kb-sync.cjs:34` `EXCLUDED_FILENAMES = new Set(['_header.md', '_manual.md', '_audit_stale.md', '_sync_failures.md'])`. 1-line CLI edit, acceptable since 153 already modifies CLI behavior conceptually.

3. **How to handle `update_cat_paw` tool case that passes through to the route — should it emit an extra `kb_entry` in its return?**
   - What we know: current return at L2264-2268 is `{ updated, id, name, fields_updated }`. No `kb_entry` field.
   - What's unclear: does downstream code expect consistency with `list_cat_paws` result which includes `kb_entry`?
   - Recommendation: **Defer.** The tool's purpose is to confirm update happened; `kb_entry` is a browsing aid from `list_*`. Can be added as a small follow-up if users complain.

4. **Should `create_catbrain` emit a slugified file with `name` when name contains Unicode?**
   - What we know: `knowledge-sync.ts:117-123` `slugify` strips non-a-z0-9 chars. Name "CatBrain Fácil" → "catbrain-fcil" (loses accent).
   - What's unclear: same-issue present since Phase 149 — not a Phase 153 concern.
   - Recommendation: **Inherited; no action.** Existing behavior preserved.

5. **Concurrent hook writes to `_sync_failures.md` — need a lockfile?**
   - What we know: Node `fs.appendFileSync` is atomic per call for small (<4KB on Linux) writes. Our entries are ~200 bytes.
   - What's unclear: in a Docker with multiple Node workers (Next.js cluster mode), cross-process atomicity weakens.
   - Recommendation: **Accept Option A (`fs.appendFileSync` + 1-line-per-entry).** Document in `kb-audit.ts` docstring that cluster mode may interleave lines rarely. Not a correctness issue since each line is self-contained. True lockfile can be Phase 154 concern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `app/vitest.config.ts` (globs `src/**/*.test.ts`) |
| Quick run command | `cd app && npm run test:unit -- kb-hooks` |
| Full suite command | `cd app && npm run test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KB-19 | `create_catbrain` writes KB file + updates `_index.json` | unit | `cd app && npm run test:unit -- kb-hooks-tools` | ❌ Wave 0 — new file |
| KB-19 | `create_cat_paw` writes KB file + updates `_index.json` | unit | same | ❌ Wave 0 |
| KB-19 | `create_agent` (alias of create_cat_paw) writes KB file | unit | same | ❌ Wave 0 |
| KB-19 | `create_connector` writes KB file + no `config` value leaked | unit | same | ❌ Wave 0 |
| KB-19 | `create_email_template` writes KB file; `structure` NOT in body/frontmatter | unit | same | ❌ Wave 0 |
| KB-19 | `update_email_template` bumps version + appends change_log | unit | same | ❌ Wave 0 |
| KB-19 | `delete_email_template` sets `status: deprecated` | unit | same | ❌ Wave 0 |
| KB-19 | `update_cat_paw` tool does NOT fire hook directly (pass-through confirmed) | unit | same | ❌ Wave 0 |
| KB-19 | Tool hook `syncResource` failure → DB persists + `_sync_failures.md` gains entry + `logger.error` called | unit | same | ❌ Wave 0 |
| KB-19 | `invalidateKbIndex()` called after success; NOT called after failure | unit | same | ❌ Wave 0 |
| KB-20 | `POST /api/cat-paws` writes KB file + row returns 201 | integration | `cd app && npm run test:unit -- kb-hooks-api-routes` | ❌ Wave 0 — new file |
| KB-20 | `PATCH /api/cat-paws/[id]` bumps version + KB change_log grows | integration | same | ❌ Wave 0 |
| KB-20 | `DELETE /api/cat-paws/[id]` → KB file `status: deprecated` | integration | same | ❌ Wave 0 |
| KB-20 | `POST /api/catbrains` writes KB file | integration | same | ❌ Wave 0 |
| KB-20 | `PATCH /api/catbrains/[id]` bumps version | integration | same | ❌ Wave 0 |
| KB-20 | `DELETE /api/catbrains/[id]` → KB file deprecated + Qdrant warning preserved in response | integration | same | ❌ Wave 0 |
| KB-20 | `POST /api/connectors` writes KB file + `config` secret NOT present | integration | same | ❌ Wave 0 |
| KB-20 | `PATCH /api/connectors/[id]` bumps version; secret never leaks | integration | same | ❌ Wave 0 |
| KB-20 | `DELETE /api/connectors/[id]` → KB file deprecated | integration | same | ❌ Wave 0 |
| KB-20 | `POST /api/skills` writes KB file | integration | same | ❌ Wave 0 |
| KB-20 | `PATCH /api/skills/[id]` bumps version | integration | same | ❌ Wave 0 |
| KB-20 | `DELETE /api/skills/[id]` → KB file deprecated | integration | same | ❌ Wave 0 |
| KB-20 | `POST /api/email-templates` writes KB file; `structure` NOT in body | integration | same | ❌ Wave 0 |
| KB-20 | `PATCH /api/email-templates/[id]` bumps version | integration | same | ❌ Wave 0 |
| KB-20 | `DELETE /api/email-templates/[id]` → KB file deprecated | integration | same | ❌ Wave 0 |
| KB-20 | Route hook `syncResource` failure → 201/200 still returned + stale entry | integration | same | ❌ Wave 0 |
| KB-21 | Delete operations do NOT `fs.unlink` the KB file; `status: deprecated` frontmatter verified | contract | within unit/integration tests above | ❌ Wave 0 |
| KB-21 | Deleted file still resolvable via `get_kb_entry(id)` | contract | `cd app && npm run test:unit -- kb-hooks-api-routes` | ❌ Wave 0 |
| KB-21 | `search_kb({status:'active'})` post-delete does NOT return the deprecated entry | contract | same | ❌ Wave 0 |
| KB-22 | `markStale(path, reason, details)` appends 1-line entry to `_sync_failures.md` | unit | `cd app && npm run test:unit -- kb-audit` | ❌ Wave 0 — new file |
| KB-22 | First invocation creates file with frontmatter header; subsequent calls append lines only | unit | same | ❌ Wave 0 |
| KB-22 | `markStale` never throws (swallows errors internally) | unit | same | ❌ Wave 0 |
| KB-22 | Entries schema-valid against PRD §3.3 frontmatter schema | contract | spawn validate-kb.cjs | ❌ Wave 0 |
| Concurrency | 2 hooks fire simultaneously, both fail → 2 distinct lines in `_sync_failures.md` | unit | `cd app && npm run test:unit -- kb-audit` | ❌ Wave 0 |
| Concurrency | `Promise.all([create_cat_paw, create_catbrain])` both succeed → 2 KB files + `_index.json` has 2 entries | integration | `cd app && npm run test:unit -- kb-hooks-tools` | ❌ Wave 0 |
| Entity mapping | `syncResource('template', ...)` writes to `resources/email-templates/` | unit | within knowledge-sync existing tests or new | ✅ exists (Phase 149 cover mapping) |
| Author attribution | API route hook records `author: 'api:cat-paws.POST'` in change_log | unit | integration test | ❌ Wave 0 |
| Author attribution | Tool case hook records `author: <userId>` or fallback `'catbot'` | unit | tool test | ❌ Wave 0 |
| Performance | Hook adds <20ms to write path (sync fast fs) | perf | inline timing in test | ❌ Wave 0 |
| Performance | `markStale` append <5ms | perf | inline timing | ❌ Wave 0 |
| Regression | `knowledge-sync.test.ts` 38/38 still green | regression | `cd app && npm run test:unit -- knowledge-sync` | ✅ exists |
| Regression | `kb-sync-cli.test.ts` 13/13 still green | regression | `cd app && npm run test:unit -- kb-sync-cli` | ✅ exists |
| Regression | `kb-sync-db-source.test.ts` 18/18 still green | regression | `cd app && npm run test:unit -- kb-sync-db-source` | ✅ exists |
| Regression | `kb-index-cache.test.ts` 20/20 still green | regression | `cd app && npm run test:unit -- kb-index-cache` | ✅ exists |
| Regression | `kb-tools.test.ts` 18/18 still green | regression | `cd app && npm run test:unit -- kb-tools` | ✅ exists |
| Regression | `kb-tools-integration.test.ts` 6/6 still green | regression | `cd app && npm run test:unit -- kb-tools-integration` | ✅ exists |
| Regression | `catbot-tools-query-knowledge.test.ts` 6/6 still green | regression | `cd app && npm run test:unit -- catbot-tools-query-knowledge` | ✅ exists |
| Regression | `knowledge-tree.test.ts` + `knowledge-tools-sync.test.ts` still green | regression | `cd app && npm run test:unit -- knowledge-tree knowledge-tools-sync` | ✅ exists |
| Regression | `cat-paws` API route existing tests (if any) still green — actual grep: no pre-existing test for cat-paws routes, so nothing to regress | regression | — | N/A |
| Oracle | CatBot: "Crea un CatPaw llamado Tester" → archivo aparece + `list_cat_paws` shows `kb_entry` non-null | oracle | POST `/api/catbot/chat` (manual) | N/A — human+orchestrator |
| Oracle | Then "Actualiza la descripción de Tester a 'v2'" → version bump + change_log 2 entries | oracle | POST `/api/catbot/chat` manual | N/A |
| Oracle | Then "Elimina el CatPaw Tester" → `status: deprecated` + archivo persiste; `get_kb_entry(id)` sigue devolviéndolo | oracle | POST `/api/catbot/chat` manual | N/A |

### Sampling Rate

- **Per task commit:** `cd app && npm run test:unit -- kb-` (all KB tests, ~10s)
- **Per wave merge:** `cd app && npm run test:unit` (full suite ~30-60s)
- **Phase gate:** Full suite green + Docker rebuild + oracle POST `/api/catbot/chat` con 3 prompts (create → update → delete) antes de `/gsd:verify-work`.

### Wave 0 Gaps

- [ ] `app/src/lib/services/kb-audit.ts` — NEW module with `markStale(path, reason, details?)` + docstring about append semantics.
- [ ] `app/src/lib/__tests__/kb-audit.test.ts` — NEW unit tests for `markStale` (append, first-write-creates-header, concurrent atomicity).
- [ ] `app/src/lib/__tests__/kb-hooks-tools.test.ts` — NEW unit+integration tests for 7 tool cases (6 hookable + 1 negative for `update_cat_paw` pass-through).
- [ ] `app/src/lib/__tests__/kb-hooks-api-routes.test.ts` — NEW integration tests for 15 route handlers.
- [ ] `app/src/lib/logger.ts` — EDIT: extend `LogSource` union with `'kb-sync'` (1 line).
- [ ] `.docflow-kb/_sync_failures.md` — created lazily on first `markStale` call; no Wave 0 file needed.
- [ ] `scripts/kb-sync.cjs:34` — EDIT: add `'_sync_failures.md'` to `EXCLUDED_FILENAMES` set (1 char fix).
- [ ] No framework install — vitest already present.

*(No gaps around existing test infrastructure: fixtures `createFixtureKb` + `vi.hoisted` pattern + `NextRequest` direct-call idiom already established Phase 149/152.)*

### Proposed Audit File Design

**File:** `.docflow-kb/_sync_failures.md`
**Ownership:** Phase 153 hooks only (write via `markStale`). `kb-sync.cjs` CLI MUST NOT touch this file (add to `EXCLUDED_FILENAMES`).
**Semantics:** append-only; first invocation lazily creates the header.
**Shape (verified schema-valid against Phase 149 `frontmatter.schema.json`):**

```markdown
---
id: sync-failures
type: audit
subtype: null
lang: es
title: Sync Failures Log
summary: Append-only log of Phase 153 hook failures for reconciliation.
tags: [ops]
audience: [developer]
status: active
created_at: 2026-04-20T12:00:00Z
created_by: kb-audit
version: 1.0.0
updated_at: 2026-04-20T12:00:00Z
updated_by: kb-audit
source_of_truth: null
ttl: never
---

# Sync Failures Log

Entries appended by Phase 153 hooks when `syncResource()` throws. Run
`node scripts/kb-sync.cjs --full-rebuild --source db` to reconcile.

| Timestamp | Reason | Entity | DB ID | KB Path | Error |
|-----------|--------|--------|-------|---------|-------|
| 2026-04-20T12:34:56Z | create-sync-failed | cat_paws | abc12345-… | resources/catpaws/abc12345-tester.md | ENOSPC: no space left on device |
| 2026-04-20T12:45:00Z | update-sync-failed | email_templates | tpl-xyz789 | resources/email-templates/tpl-xyz78-welcome.md | EACCES: permission denied |
```

**Why NOT `_audit_stale.md`:** the CLI `cmdAuditStale` at `scripts/kb-sync.cjs:667` REGENERATES that file (L762-764 single `writeFrontmatter` call replacing content). Any hook-written entries vanish on next audit run. Separate file is the correct solution.

### Append Concurrency

- `fs.appendFileSync` is atomic per call on Linux for writes up to `PIPE_BUF` (typically 4096 bytes). Our entry format is <200 bytes per line.
- Concurrent hooks within same Node process: each `appendFileSync` is sync in user-space + single syscall, no interleaving inside the process.
- Cluster mode (multiple Node workers in same Docker): each worker calls `fs.appendFileSync` which becomes a `write(2)` with O_APPEND — kernel guarantees atomicity for small writes. Rare interleaving across workers is documented limitation; acceptable for audit log.

## Sources

### Primary (HIGH confidence)
- `app/src/lib/services/knowledge-sync.ts` — direct file read, especially L33-111 (types + maps), L700-810 (detectBumpLevel), L1065-1257 (syncResource + touchAccess + markDeprecated). **Authoritative** on sync semantics.
- `app/src/lib/services/kb-index-cache.ts` — direct file read, L41-220 (getKbRoot, getKbIndex, invalidateKbIndex, resolveKbEntry). **Authoritative** on Phase 152 cache contract.
- `app/src/lib/services/catbot-tools.ts` — direct Grep + read of the 8 cases mentioned in CONTEXT (L1610, 1635-1636, 1699, 2238, 3097, 3122, 3152) plus executeTool signature (L1587). **Authoritative** on tool-side call sites.
- `app/src/app/api/cat-paws/route.ts`, `.../cat-paws/[id]/route.ts`, `.../catbrains/route.ts`, `.../catbrains/[id]/route.ts`, `.../connectors/route.ts`, `.../connectors/[id]/route.ts`, `.../skills/route.ts`, `.../skills/[id]/route.ts`, `.../email-templates/route.ts`, `.../email-templates/[id]/route.ts` — all 10 route files fully read. **Authoritative** on API-route call sites.
- `app/src/lib/logger.ts` — full read. **Authoritative** on logger contract and `LogSource` closed union.
- `app/src/middleware.ts` — full read. **Authoritative** on absence of auth middleware.
- `scripts/kb-sync.cjs:667-765` (cmdAuditStale) — full read of function. **Authoritative** on `_audit_stale.md` regeneration semantics.
- `.docflow-kb/_audit_stale.md` — full read of current stub. Confirms shape.
- `app/src/lib/__tests__/kb-tools-integration.test.ts`, `kb-test-utils.ts`, `alias-routing/__tests__/route.test.ts` — patterns for vitest + `vi.hoisted` + `NextRequest` direct-call.
- `.planning/phases/149-kb-foundation-bootstrap/149-CONTEXT.md`, `.planning/phases/150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates/150-CONTEXT.md`, `.planning/phases/152-kb-catbot-consume/152-CONTEXT.md` — prior phase CONTEXTs for invariant context.
- `.planning/ANALYSIS-knowledge-base-architecture.md` §5.3 (Hooks en creation tools) and §7 Fase 5 (PRD text). **Source of truth** for the phase scope.

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` progression — velocity metrics for expected phase duration.
- `.planning/v29.1-MILESTONE-CONTEXT.md` — DoD for the sub-milestone; useful for Phase 153 fit within v29.1.
- `.planning/phases/152-kb-catbot-consume/152-RESEARCH.md` — pattern mining for Validation Architecture section.

### Tertiary (LOW confidence)
- None. All Phase 153 claims are grounded in direct file reads.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — every API referenced is inspected in place.
- Architecture patterns: **HIGH** — hook recipes derived from canonical examples in each route file.
- Pitfalls: **HIGH** — each of the 7 pitfalls maps to a specific file:line observation (update_cat_paw fetch; catbrains delete side-effects; SELECT-before-DELETE; _audit_stale regeneration; concurrent fs.appendFileSync; LogSource closed union; bracket notation rule).
- Entity key mapping: **HIGH** — verified via direct read of `ENTITY_TO_TABLE` at knowledge-sync.ts:104-111.
- Validation Architecture: **HIGH** — test patterns from Phases 149+152 are repeatable; new tests fit the existing vitest + vi.hoisted harness.

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (30 days) for the specific file:line references; sooner if Phase 152 or Phase 149 services are modified. Any edit to `knowledge-sync.ts::syncResource` signature or `kb-index-cache.ts::invalidateKbIndex` requires re-verification of §Hook Recipe shapes.
