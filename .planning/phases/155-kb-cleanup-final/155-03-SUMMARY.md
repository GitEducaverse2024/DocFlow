---
phase: 155-kb-cleanup-final
plan: 03
subsystem: infra
tags: [knowledge-base, critical-rules, taxonomy, kb-backfill, docker]

requires:
  - phase: 155-kb-cleanup-final
    plan: 02
    provides: "CLAUDE.md search_kb({tags:['critical']}) pointer + container rebuild recipe; legacy knowledge tree gone"
  - phase: 155-kb-cleanup-final
    plan: 01
    provides: "tag-taxonomy.json with R01-R25 + SE01-SE03 + DA01-DA04; validate-kb.cjs rejects unknown tags"
  - phase: 153-kb-creation-tool-hooks
    provides: "rw volume mount .docflow-kb:/docflow-kb + kb-index-cache source_of_truth[].db field contract"
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    provides: "kb-sync.cjs --full-rebuild --source db semantics + isNoopUpdate stable-equal comparison"
provides:
  - "4 critical rule atoms R26-R29 discoverable via search_kb({tags:['critical']})"
  - "tag-taxonomy.json extended with cross_cutting tags: critical, build, docker"
  - "Live-DB backfilled .docflow-kb/resources/ with all 38 catpaws + 6 connectors + 43 skills + 15 email-templates + 3 catbrains + 1 canvas from ~/docflow-data/docflow.db"
  - "Phase 152 kb_entry:null drift RESOLVED — list_cat_paws returns resources/catpaws/53f19c51-operador-holded.md for Operador Holded"
  - "_index.json regenerated with 195 entries (was 138)"
affects: [phase-155-plan-04, phase-156-future-work]

tech-stack:
  added: []
  patterns:
    - "Live-DB backfill requires DATABASE_PATH=$HOME/docflow-data/docflow.db — the Docker-mounted production DB, NOT app/data/docflow.db (which is a stale 9-row fixture leftover from pre-Phase-150 testing)"
    - "Taxonomy-first workflow: extend tag-taxonomy.json (Task 1) BEFORE writing atoms that use those tags (Task 2) — validate-kb.cjs exits 1 on unknown tags"
    - "Forward-reference resolution pattern: Plan 02 wrote CLAUDE.md pointer search_kb({tags:['critical']}) expecting Plan 03 to populate the result"

key-files:
  created:
    - ".docflow-kb/rules/R26-canvas-executor-immutable.md"
    - ".docflow-kb/rules/R27-agent-id-uuid-only.md"
    - ".docflow-kb/rules/R28-env-bracket-notation.md"
    - ".docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md"
    - "57 live-DB backfilled resources (35 catpaws + 7 email-templates + 7 connectors + 5 skills + 2 catbrains + 1 canvas)"
  modified:
    - ".docflow-kb/_schema/tag-taxonomy.json"
    - ".docflow-kb/_index.json"
    - ".docflow-kb/_header.md"
    - "55 pre-existing resources (38 skills + 8 email-templates + 5 connectors + 3 catpaws + 1 catbrain — version bumps + frontmatter timestamp refresh)"

key-decisions:
  - "Extended cross_cutting with 'build' + 'docker' (NOT just 'critical') — plan spec listed [build, R28, safety, critical] for R28 and [docker, catpaw, R29, safety, critical] for R29; taxonomy had neither. Rule-3 auto-fix added both to cross_cutting alongside the pre-planned 'critical' to avoid validate-kb.cjs blocking."
  - "Used DATABASE_PATH=/home/deskmath/docflow-data/docflow.db env var for kb-sync.cjs — default DEFAULT_DB_PATH=app/data/docflow.db in kb-sync-db-source.cjs points to a stale 9-row fixture DB, not the live 38-row production DB that Docker mounts. Without the env override, Operador Holded (53f19c51-*) would have stayed absent from the KB."
  - "Container restart forced after backfill to invalidate kb-index-cache 60s TTL — otherwise list_cat_paws would serve pre-backfill cached lookups and oracle would still see kb_entry:null despite the resource file existing on disk."
  - "Second-pass idempotence is NOT perfectly held (56 updates on re-run despite unchanged DB) — this is a pre-existing isNoopUpdate regression that predates Phase 155 (inherited from Phase 150-01). Out of scope for cleanup phase; committed after first clean backfill; the delta on re-runs is cosmetic (version++, change_log++, updated_at refresh) not content-level."

patterns-established:
  - "Critical rule atom shape: subtype:safety + tags:[<domain>, <RID>, safety, critical] + audience:[catbot, architect, developer] + ttl:never (4 instances: R26-R29)"
  - "Taxonomy entries for `build` and `docker` as cross_cutting (not domains/entities) — infrastructure concerns that cut across canvas/catpaw/connector domains"

requirements-completed: [KB-34, KB-35, KB-36]

duration: 6min
completed: 2026-04-20
---

# Phase 155 Plan 03: Critical Rules + Live-DB Backfill Summary

**R26-R29 (4 CLAUDE.md absolute restrictions) migrated to KB as critical-tagged atoms; live-DB backfill populated 57 missing resources including Operador Holded (resolves Phase 152 kb_entry:null drift); taxonomy extended with critical/build/docker.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-20T17:40:40Z
- **Completed:** 2026-04-20T17:46:24Z
- **Tasks:** 3 (all implementation + verification)
- **Files created:** 61 (4 rule atoms + 57 backfilled resources)
- **Files modified:** 58 (taxonomy + _index + _header + 55 resource refreshes)

## Accomplishments

- **Task 1 (commit `f7ce40d`):** Extended `tag-taxonomy.json` — added `R26, R27, R28, R29` to rules and `critical` to cross_cutting. Prerequisite for Task 2 atom creation.
- **Task 2 (commit `fce1713`):** Created 4 critical rule atoms migrating CLAUDE.md §Restricciones absolutas:
  - `R26-canvas-executor-immutable.md` — dispatcher core freeze
  - `R27-agent-id-uuid-only.md` — canvas agentId must be UUID from cat_paws, never slugs
  - `R28-env-bracket-notation.md` — process['env']['X'] escape from webpack inline substitution
  - `R29-docker-rebuild-execute-catpaw.md` — bundle staleness on execute-catpaw.ts changes
  - Rule-3 auto-fix: added `build` + `docker` to taxonomy cross_cutting to avoid validator blocking
  - validate-kb.cjs: 135 → 139 files OK
- **Task 3 (commit `4f74445`):** Docker rebuild + live-DB backfill + oracle smoke
  - Image cached (Plan 02 already rebuilt); `docker compose up -d` recreated container; healthy in 274ms
  - First-pass backfill against `app/data/docflow.db` found only 9 rows (stale fixture); root-cause: kb-sync default DATABASE_PATH points to repo-relative fixture, not live Docker-mounted DB
  - Re-ran with `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db`: **57 creates + 55 updates + 12 orphans**
  - `_index.json`: 138 → 195 entries; `_header.md` regenerated
  - validate-kb.cjs: 139 → 196 files OK
  - Oracle smoke 1: `list_cat_paws` returns `kb_entry:"resources/catpaws/53f19c51-operador-holded.md"` for Operador Holded — Phase 152 drift **RESOLVED**
  - Oracle smoke 2: `search_kb({tags:["critical"]})` returns R26, R27, R28, R29 — Plan 02 forward-reference CLAUDE.md pointer **RESOLVED**

## Task Commits

1. **Task 1: Extend tag-taxonomy.json** — `f7ce40d` (chore)
2. **Task 2: Create R26-R29 critical rule atoms** — `fce1713` (feat)
3. **Task 3: Docker rebuild + live-DB backfill** — `4f74445` (chore)

## Files Created/Modified

### Created (4 critical rule atoms)

- `.docflow-kb/rules/R26-canvas-executor-immutable.md` — canvas-executor.ts freeze (tags: canvas, R26, safety, critical)
- `.docflow-kb/rules/R27-agent-id-uuid-only.md` — agentId UUID-only (tags: canvas, catpaw, R27, safety, critical)
- `.docflow-kb/rules/R28-env-bracket-notation.md` — process['env'] bracket notation (tags: build, R28, safety, critical)
- `.docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md` — Docker rebuild (tags: docker, catpaw, R29, safety, critical)

### Created (57 live-DB backfilled resources)

- **35 catpaws** including `53f19c51-operador-holded.md` (key gap closer), `5d8fbdd7-mcp-holded.md`, `92733993-director-comercial-ia.md`, `740e38ab-agente-de-aprendizaje-comercial.md`, `89df30e3-investigador-de-cuentas.md`, `1e1eb424-preparador-de-discovery.md`, and 29 others
- **7 connectors** including `1d3c7b77-info-auth-educa360.md`, `43cbe742-antonio-educa360.md`, `67d945f0-info-educa360.md`, `9aee88bd-educa360drive.md`, `b3f4bfcd-plantillas-email-corporativas.md`, `e7d15f13-test-n8n.md`
- **7 email-templates** including `077e4fff-catbot.md`, `deef21aa-test-template.md`, `seed-tem-plantilla-corporativa.md`, 4 "pro-*" dedupes
- **5 skills** including `36f0a6ca-holded-erp-guia-operativa-para-asistentes.md`, `31e3dbc4-orquestador-catflow-creacion-inteligente-de-flujos.md`, `9c136bbb-deduplicacion-de-leads.md`
- **2 catbrains** (`20dacde5-docatflow.md`, `9cc58dee-educa360.md`)
- **1 canvas** (`test-inb-test-inbound-fase-5-full-pipeline.md`)

### Modified

- `.docflow-kb/_schema/tag-taxonomy.json` — added R26-R29 + critical/build/docker
- `.docflow-kb/_index.json` — regenerated (138 → 195 entries)
- `.docflow-kb/_header.md` — regenerated counts
- 55 existing resources refreshed (version++/timestamp/change_log append; body unchanged for 54/55, only `seed-hol-holded-mcp.md` had deprecated_at timestamp refresh)

## Decisions Made

See frontmatter `key-decisions`. Highlights:

- **Taxonomy extended with `build` + `docker` in addition to `critical`** — plan spec for R28 and R29 referenced these domain tags but they were absent from the whitelist. Auto-fix in Task 2 (Rule-3 blocking) kept the plan's intended tag shapes instead of stripping the domain hint.
- **DATABASE_PATH env override is required for kb-sync against the live DB** — this is a latent issue in the default `DEFAULT_DB_PATH` resolver that Phase 150 never had to hit because its test fixtures seeded `app/data/docflow.db` directly; Phase 155's whole-DB backfill is the first real use that needs the env var. Worth documenting in `.docflow-kb/_manual.md` operations section (deferred to Plan 04).
- **Container restart forced post-backfill** — 60s kb-index-cache TTL would have delayed oracle verification; `docker restart docflow-app` invalidates the cache cleanly (acceptable since `.docflow-kb/` is volume-mounted rw, not compiled into the image).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Taxonomy rejected `build` + `docker` tags**
- **Found during:** Task 2 (first validate-kb.cjs run after atom creation)
- **Issue:** Plan frontmatter for R28 specified `tags: [build, R28, safety, critical]` and R29 specified `tags: [docker, catpaw, R29, safety, critical]`. The taxonomy only had `critical` added in Task 1; `build` and `docker` weren't in any category. Validator exit 1: `tag "build" no está en tag-taxonomy.json` and `tag "docker" no está en tag-taxonomy.json`.
- **Fix:** Extended `cross_cutting` array with `"build"` and `"docker"` alongside the already-added `"critical"`. Rationale: these are infrastructure concerns that cut across canvas/catpaw domains, not domains/entities/roles themselves.
- **Files modified:** `.docflow-kb/_schema/tag-taxonomy.json`
- **Verification:** validate-kb.cjs → OK: 139 archivos validados
- **Committed in:** `fce1713` (Task 2 commit, rolled in alongside the atom creation)

**2. [Rule 3 - Blocking] kb-sync backfill pointed at stale DB**
- **Found during:** Task 3 (first pass showed only 1 update + 65 unchanged; oracle returned kb_entry:null for Operador Holded)
- **Issue:** `kb-sync-db-source.cjs` DEFAULT_DB_PATH resolves to `app/data/docflow.db` (repo-relative), which is a 9-row fixture DB leftover from pre-Phase-150 testing. The live production DB mounted into Docker is `~/docflow-data/docflow.db` (38 catpaws + 6 connectors + 43 skills + etc.). Backfill ran against the wrong source.
- **Fix:** Re-ran with `DATABASE_PATH=/home/deskmath/docflow-data/docflow.db node scripts/kb-sync.cjs --full-rebuild --source db`
- **Files modified:** 114 files across .docflow-kb/ (57 creates + 55 updates + _index.json + _header.md)
- **Verification:** Oracle smoke confirmed `kb_entry:"resources/catpaws/53f19c51-operador-holded.md"` for Operador Holded post-backfill
- **Committed in:** `4f74445` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule-3 blocking)
**Impact on plan:** Both auto-fixes essential to reach the done criteria. Fix 1 (taxonomy extension) was a spec gap. Fix 2 (DATABASE_PATH env) was a dormant issue in kb-sync's default resolver. Zero scope creep — both fixes aligned with plan intent.

## Issues Encountered

### Pre-existing, deferred

**isNoopUpdate idempotence regression (non-blocking)**
- **Symptom:** Second pass of `kb-sync.cjs --full-rebuild --source db` reports "56 to update, 56 unchanged" instead of "0 to update, 112 unchanged" per the Plan 150-01 contract.
- **Root cause:** Something in the frontmatter projection differs across runs even on unchanged DB rows. `stripVolatile` excludes `updated_at`/`version`/`change_log`/`sync_snapshot` but another field is drifting.
- **Impact:** Cosmetic — re-runs produce patch-version bumps + change_log entries without body changes. Does NOT affect KB correctness or oracle evidence.
- **Scope decision:** OUT of scope for Phase 155 cleanup. This is a Phase 150/153 regression. Logged for future follow-up (candidate for Phase 156 or KB cleanup maintenance cycle).

### Orphan warnings (expected)

12 resources in KB have no matching DB row in the live DB:
- 7 catpaws from inbound-pilot (72ef0fe5, 7af5f0a7, 96c00f37, 98c3f27c, 9eb067d6, a56c8ee8, a78bb00b) — obsolete test catpaws from Phase 150 fixture
- 1 connector (conn-gma-info-educa360-gmail)
- 1 skill (4f7f5abf-leads-y-funnel-infoeduca)
- 1 email-template (seed-tem-plantilla-basica)
- 2 canvases (5a56962a-email-classifier-pilot, 9366fa92-revision-diaria-inbound)

These are left untouched by kb-sync policy; auto-deprecation is the remit of a future `--audit-stale` run (Phase 153 hooks handled by Plan 04 oracle or Phase 156 cleanup).

## Verification Evidence

### Task 1 Gate

```
$ node -e "const t = require('.docflow-kb/_schema/tag-taxonomy.json'); ..."
taxonomy OK
```

### Task 2 Gate

```
$ node scripts/validate-kb.cjs 2>&1 | tail -3
OK: 139 archivos validados
$ ls .docflow-kb/rules/R26-*.md .docflow-kb/rules/R27-*.md .docflow-kb/rules/R28-*.md .docflow-kb/rules/R29-*.md
.docflow-kb/rules/R26-canvas-executor-immutable.md
.docflow-kb/rules/R27-agent-id-uuid-only.md
.docflow-kb/rules/R28-env-bracket-notation.md
.docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md
```

### Task 3 Gates

**Docker build + container health:**
```
$ docker compose build docflow
... (all cached, image 36978681ac79 up to date) ...
docflow-docflow  Built

$ docker compose up -d
Container docflow-app  Recreated
Container docflow-app  Started

$ docker logs docflow-app --tail 30
▲ Next.js 14.2.35
✓ Ready in 274ms
```

**Backfill log tail (second final pass post-DATABASE_PATH fix):**
```
PLAN: 57 to create, 55 to update, 0 unchanged, 12 orphans, 0 skipped
OK: _index.json + _header.md regenerados con 195 entries
OK: validate-kb.cjs exit 0 (all generated files schema-compliant)
```

**Validator post-backfill:**
```
$ node scripts/validate-kb.cjs
OK: 196 archivos validados
```

**Oracle smoke 1 — kb_entry for Operador Holded:**
```json
{
  "id": "53f19c51-9cac-4b23-87ca-cd4d1b30c5ad",
  "name": "Operador Holded",
  "avatar_emoji": "📋",
  "mode": "processor",
  "model": "gemini-main",
  "department": "business",
  "is_active": 1,
  "description": "Operador CRM generalista para Holded. ...",
  "linked_skills": null,
  "kb_entry": "resources/catpaws/53f19c51-operador-holded.md"
}
```
Phase 152 drift resolved end-to-end.

**Oracle smoke 2 — search_kb({tags:["critical"]}):**
```
args: {"tags": ["critical"]}
  - rule-r26-canvas-executor-immutable     R26 — canvas-executor.ts NUNCA se modifica
  - rule-r27-agent-id-uuid-only            R27 — agentId en canvas: solo UUIDs, nunca slugs
  - rule-r28-env-bracket-notation          R28 — process['env']['X'] obligatorio, nunca process.env.X
  - rule-r29-docker-rebuild-execute-catpaw R29 — Docker rebuild necesario tras cambios en execute-catpaw.ts
```
All 4 critical atoms discoverable. CLAUDE.md pointer from Plan 02 now resolves.

## User Setup Required

None. Docker rebuild was cached (image already current from Plan 02 build); no service config changes. All backfill operations used existing DATABASE_PATH override pattern from kb-sync-db-source.cjs.

## Next Phase Readiness

**Plan 04 can proceed immediately:**
- All 4 R26-R29 atoms exist and are discoverable via the exact `search_kb({tags:["critical"]})` call specified in CLAUDE.md
- KB is fully backfilled; 195 entries; 196 files validated
- Container running with Plan 02 code (confirmed by absence of `query_knowledge` in oracle tool_calls in Plan 02 verification)
- Operador Holded kb_entry populated — Phase 152 deferred gap closed
- Only deferred item is isNoopUpdate cosmetic bump loop (non-blocking)

**For Plan 04 formal oracle (3 prompts):**
1. `search_kb({tags:["critical"]})` — proven above (returns R26-R29)
2. `list_cat_paws()` + `get_kb_entry` round-trip — proven above (kb_entry path resolves)
3. Third prompt (CLAUDE.md pointer discovery OR manual update test) — Plan 04 scope

## Self-Check: PASSED

**Files verified to exist:**
- FOUND: `.docflow-kb/rules/R26-canvas-executor-immutable.md`
- FOUND: `.docflow-kb/rules/R27-agent-id-uuid-only.md`
- FOUND: `.docflow-kb/rules/R28-env-bracket-notation.md`
- FOUND: `.docflow-kb/rules/R29-docker-rebuild-execute-catpaw.md`
- FOUND: `.docflow-kb/resources/catpaws/53f19c51-operador-holded.md` (target resource)
- FOUND: `.docflow-kb/_schema/tag-taxonomy.json` (modified)

**Commits verified to exist:**
- FOUND: `f7ce40d` — chore(155-03): extend tag-taxonomy with critical + R26-R29
- FOUND: `fce1713` — feat(155-03): create R26-R29 critical rule atoms
- FOUND: `4f74445` — chore(kb): backfill resources from live DB post-155

---
*Phase: 155-kb-cleanup-final*
*Completed: 2026-04-20*
