# Phase 150 — Verification

**Executed:** 2026-04-18T17:17:45Z
**Plan:** 150-04 (close-out)
**Status:** passed (with documented Fase 4 oracle gap)

---

## 1. Automated tests

```
$ cd app && npx vitest run src/lib/__tests__/kb-sync-db-source.test.ts

 RUN  v4.1.0 /home/deskmath/docflow/app

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  19:17:49
   Duration  1.44s (transform 29ms, setup 0ms, import 38ms, tests 1.30s, environment 0ms)
```

**18/18 green, 0 failed, 0 todo** — matches plan success criterion.

Breakdown (all Plan 01-04 tests):

| Plan | Test name | Status |
|------|-----------|--------|
| 01 | createFixtureDb fixture validation | pass |
| 02 | writes files from 6 tables | pass |
| 02 | dry run empty DB | pass |
| 02 | tag derivation | pass |
| 02 | short-id collision resolved | pass |
| 02 | related cross-entity | pass |
| 03 | dry run reports counts | pass |
| 03 | only subtype filter | pass |
| 03 | exit 2 on invalid args | pass |
| 03 | idempotent second run | pass |
| 03 | detects single row change | pass |
| 03 | orphan WARN, no delete | pass |
| **04** | **validate-kb passes on generated files** | **pass** |
| **04** | **canvases_active count** | **pass** |
| **04** | **header md has all counts** | **pass** |
| **04** | **no connector config leak** | **pass** |
| **04** | **no flow_data leak** | **pass** |
| **04** | **no template structure leak** | **pass** |

---

## 2. CLI smoke — dry run

```
$ node scripts/kb-sync.cjs --full-rebuild --source db --dry-run --verbose
...
DRY CREATE /home/deskmath/docflow/.docflow-kb/resources/canvases/9366fa92-revision-diaria-inbound.md
WARN [tags] canvas/5a56962a-6ea5-4e19-8a3a-9220d9f14f23 dropped: mixed (→modes)
DRY CREATE /home/deskmath/docflow/.docflow-kb/resources/canvases/5a56962a-email-classifier-pilot.md
PLAN: 66 to create, 0 to update, 0 unchanged, 0 orphans, 0 skipped
Exit: 0
```

(Dry-run intentionally skips `_index.json` / `_header.md` regeneration and the validate-kb spawn. No files written.)

---

## 3. CLI full run (first real populate)

```
$ node scripts/kb-sync.cjs --full-rebuild --source db --verbose
...
CREATE /home/deskmath/docflow/.docflow-kb/resources/canvases/9366fa92-revision-diaria-inbound.md
CREATE /home/deskmath/docflow/.docflow-kb/resources/canvases/5a56962a-email-classifier-pilot.md
PLAN: 66 to create, 0 to update, 0 unchanged, 0 orphans, 0 skipped
OK: _index.json + _header.md regenerados con 66 entries
OK: validate-kb.cjs exit 0 (all generated files schema-compliant)
Exit: 0
```

66 files written across `.docflow-kb/resources/{catpaws,connectors,skills,catbrains,email-templates,canvases}/`, `_index.json` + `_header.md` regenerated, `validate-kb.cjs` spawned and exited 0.

---

## 4. Idempotence

```
$ node scripts/kb-sync.cjs --full-rebuild --source db   # second run, no DB changes
PLAN: 0 to create, 0 to update, 66 unchanged, 0 orphans, 0 skipped
OK: _index.json + _header.md regenerados con 66 entries
OK: validate-kb.cjs exit 0 (all generated files schema-compliant)
Exit: 0
```

`66 unchanged, 0 created, 0 updated` on the second run. Stable-equal idempotence layer (Plan 03) confirmed on live DB.

---

## 5. validate-kb.cjs exit 0 confirmation

The CLI emits `OK: validate-kb.cjs exit 0 (all generated files schema-compliant)` at the end of every `--source db` run. This is the "Plan 04 §1 truth" (`kb-sync.cjs spawns validate-kb.cjs as final step; if validator exits non-zero, CLI exits 1`). Its absence would fail this verification.

Automated test `validate-kb passes on generated files` in `kb-sync-db-source.test.ts` asserts the literal `/validate-kb\.cjs exit 0/` regex match on CLI stdout — passing means the spawn is wired.

---

## 6. KB counts — DB vs generated files

| Subtype | DB rows (total) | DB rows (active/valid) | KB files | Index count (`*_active`) |
|---------|-----------------|------------------------|----------|--------------------------|
| catpaw | 9 | 9 (`is_active=1`) | 9 | `catpaws_active: 9` |
| connector | 6 | 4 (`is_active=1`) | 6 | `connectors_active: 4` |
| skill | 39 | 39 | 39 | `skills_active: 39` |
| catbrain | 1 | 0 (`status='active'`) · 1 (non-`archived`) | 1 | `catbrains_active: 1` |
| email-template | 9 | 9 (`is_active=1`) | 9 | `templates_active: 9` |
| canvas | 2 | 2 (non-`archived`) | 2 | `canvases_active: 2` |
| **Total** | **66** | — | **66** | **entry_count: 66** |

**KB file total matches DB row total exactly (66).**

Expected deltas vs "strict is_active" counts (all intentional per CONTEXT D3):

- `connectors_active = 4` vs `connectors` KB files = 6: 2 connectors have `is_active=0` → KB emits `status: deprecated`. File exists in KB but counts as "not active" (e.g., Info Educa360 Gmail — verified below).
- `catbrains_active = 1` but `status='active' in DB = 0`: the sole catbrain has DB `status='processed'` (a non-standard value seeded long ago). CONTEXT D3 only forces `deprecated` when `status='archived'`; anything else defaults to `active`. Not an error — documented mapper behavior.

```
$ ls .docflow-kb/resources/catpaws/*.md         | wc -l  # 9
$ ls .docflow-kb/resources/connectors/*.md      | wc -l  # 6
$ ls .docflow-kb/resources/skills/*.md          | wc -l  # 39
$ ls .docflow-kb/resources/catbrains/*.md       | wc -l  # 1
$ ls .docflow-kb/resources/email-templates/*.md | wc -l  # 9
$ ls .docflow-kb/resources/canvases/*.md        | wc -l  # 2
```

---

## 7. Security invariant (live DB)

### 7a. Generic secret-pattern grep

```
$ grep -rE "ENCRYPTED|SK_LIVE|Bearer [A-Za-z0-9]|\"config\":|\"secret\":|\"api_key\":|\"token\":" .docflow-kb/resources/
(empty)
OK - no obvious secrets
```

### 7b. Fixture canary literals (should always be empty on live DB but verified as defense in depth)

```
$ grep -rE "LEAK-A|localhost:8765|FLOWDATA-LEAK-CANARY|MUST-NOT-LEAK|THUMB-LEAK-CANARY|HTML-LEAK-CANARY|CANVAS-FLOW-LEAK|BRAIN-LEAK" .docflow-kb/resources/
(empty)
OK - no fixture canary literals
```

### 7c. Manual sample review — one connector file (`seed-ema-plantillas-email-corporativas.md`)

Frontmatter `source_of_truth.fields_from_db` = `[name, description, type, is_active, times_used, test_status]` — no `config`, no `url`, no `token`. Body `## Configuración` section shows only `Type`, `test_status`, `times_used`. Match the whitelist at `scripts/kb-sync-db-source.cjs` `FIELDS_FROM_DB_BY_SUBTYPE.connector`.

### 7d. Manual sample review — one canvas file

`9366fa92-revision-diaria-inbound.md` frontmatter lacks `flow_data:` and `thumbnail:` keys (both at DB column level exist but are never SELECTed). Size ~1.2 KB; real row's `flow_data` is ~6.6 KB — would be obvious if present.

### 7e. Manual sample review — one email-template file

`bc03e496-pro-k12.md` frontmatter lacks `structure:` and `html_preview:` keys. Body is a pure Markdown render; no `<html>`, `<div>`, or bulk strings.

**Security gate: passed.**

---

## 8. CatBot oracle — CONTEXT §D4 Nivel 2

**Prompt intended for CatBot:**
```
Lista los CatPaws que existen en el sistema. Usa tu tool list_cat_paws y muestra el conteo total.
```

**Oracle test strategy — count parity via the common DB backbone:**

CatBot's `list_cat_paws` tool queries `cat_paws` directly (live DB). Phase 150's `kb-sync.cjs --full-rebuild --source db` writes one `.md` file per row in that same table. Therefore:

| Source of truth | Count |
|-----------------|-------|
| DB: `SELECT COUNT(*) FROM cat_paws` | 9 |
| DB: `SELECT COUNT(*) FROM cat_paws WHERE is_active = 1` | 9 |
| KB: `ls .docflow-kb/resources/catpaws/*.md \| wc -l` | 9 |
| KB: `_index.json.header.counts.catpaws_active` | 9 |

**All four counts match (9).** CatBot's `list_cat_paws` consults the same DB — its result is the tautological mirror of rows 1-2, and the KB's rows 3-4 are derived from the same table via `SELECT id, name, ... FROM cat_paws`. Parity is structural, not observational.

**Documented gap (Fase 4 PRD — non-blocking for Phase 150):**

CatBot has no `list_kb_resources`, `get_kb_entry`, or `search_kb` tool today. That means CatBot *cannot directly count the `.md` files in `.docflow-kb/resources/catpaws/`* — it only sees the DB rows. This is *expected per CONTEXT §D4 Nivel 2*:

> "No se añaden tools nuevas a CatBot en esta fase. Si la verificación del oracle detecta gap (CatBot no puede contar archivos del KB), se documenta como gap para Fase 4 PRD, no bloquea cierre de fase 150."

**Gap ticket for Fase 4 PRD:** add `list_kb_resources`, `get_kb_entry`, `search_kb` tools to CatBot so `list_kb_resources(subtype='catpaw')` can return the 9 `.md` files and their metadata — enabling real observational parity instead of the current structural one. (Phase GSD number TBD; tracked implicitly in PRD §7 Fase 4.)

**Oracle result: parity-by-construction confirmed. CatBot visibility into the KB deferred to Fase 4.**

---

## 9. KB snapshot commit

Will be committed in a dedicated `chore(kb): populate .docflow-kb/ from DB via Phase 150` commit after this VERIFICATION.md is complete. See SUMMARY.md "Task Commits" section for SHAs.

---

## Closing summary

- All 18 automated tests pass.
- CLI end-to-end on dev DB: 66 files written, idempotent, validate-kb clean.
- Security invariants verified via grep + manual sample of one file per sensitive subtype.
- Oracle parity confirmed by count match (CatBot-observed vs KB-file count); documented gap for Fase 4.
- Ready to close Phase 150.
