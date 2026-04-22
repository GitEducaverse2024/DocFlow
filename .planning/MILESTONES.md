# Milestones

## v30.0 LLM Self-Service para CatBot (Shipped: 2026-04-22)

**Phases completed:** 5 phases, 19 plans, 1 tasks

**Key accomplishments:**
- (none recorded)

---

## v29.1 KB Runtime Integration (Shipped: 2026-04-21)

**Scope:** Phases 149-157 (9 phases, 35 plans)
**Requirements:** 45/45 satisfied (KB-01..KB-43 + KB-46 + KB-47). KB-44/KB-45 deferred to v29.2 as orthogonal.
**Audit:** cycle 3 passed — 7/7 cross-phase seams WIRED, 4/4 E2E flows end-to-end, 0 open regressions (commit 06d69af7 resurrection pathology closed by Phase 157).

**Delivered:** A fully live Knowledge Base at `.docflow-kb/` that CatBot reads and writes in real time.

### Key accomplishments

- **Foundation** (149) — `.docflow-kb/` scaffold with 10 subdirectories, `frontmatter.schema.json` (13 obligatory fields, bilingual `title.es/en`), `tag-taxonomy.json` controlled vocabulary, `knowledge-sync.ts` service (4 ops × 3 semver bump rules), `scripts/kb-sync.cjs` CLI (`--full-rebuild`/`--audit-stale`/`--archive`/`--purge`, 150d warning + 170d alert + 180d archive retention).
- **Populate** (150) — `kb-sync.cjs --full-rebuild --source db` generates 66 resource files from 6 DB tables (cat_paws, connectors, skills, catbrains, email_templates, canvases) with schema validation, idempotence (0 writes on unchanged DB), orphan detection, `--dry-run`/`--verbose`/`--only` flags.
- **Static migration** (151) — `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skill prompts migrated to `domain/concepts`, `domain/taxonomies`, `domain/architecture`, `rules/` (R01-R25), `protocols/` (orquestador skills), `runtime/*.prompt.md`. 128 entries live.
- **CatBot consume** (152) — `search_kb({tags,type,audience,search})` + `get_kb_entry({id})` tools (always-allowed, read-only); `kb_entry` field on 5 listing tools (`list_cat_paws`, `list_catbrains`, `list_skills`, `list_email_templates`, `canvas_list`); `buildKbHeader()` injects `_header.md` as P1 system context in prompt-assembler.
- **Creation hooks** (153) — 22 hook sites (6 CatBot tool cases + 15 API route handlers + 1 sudo tool) fire `syncResource` on every DB create/update/delete; `kb-audit.ts` module with `markStale()` writing non-schema-validated failure log; DELETE soft-deletes via `markDeprecated()` (no `fs.unlink`). `kb-index-cache` byTableId field-name fix closes prior `kb_entry:null` drift end-to-end.
- **Dashboard** (154) — `/knowledge` server component with 4-filter UI (`type`, `subtype`, `status`, `audience`+tags+search), timeline (recharts), 8-card counts bar, 125-row table; `/knowledge/[id]` detail view with breadcrumb, body via remark-gfm, relations table, metadata; `/api/knowledge/[id]` read-only endpoint; sidebar nav entry with i18n.
- **Legacy cleanup** (155) — `.planning/knowledge/` + `app/data/knowledge/` + `app/src/lib/knowledge-tree.ts` + `TabKnowledgeTree` UI + `knowledge/tree` API physically deleted; `CLAUDE.md` simplified 80→46 lines (pointer + `search_kb({tags:['critical']})` hint); R26-R29 critical rule atoms (canvas-executor inmutable, agentId UUID, `process['env']`, Docker rebuild); `canvas-rules.ts` rewritten to read from `.docflow-kb/rules/` + 7 new atoms (SE01-SE03, DA01-DA04); live-DB backfill produces `kb_entry` non-null for all CatPaws including post-Phase-150 (Operador Holded).
- **Runtime integrity** (156) — canvas write-path sync (`POST`/`PATCH`/`DELETE /api/canvas/*` + `delete_catflow` sudo tool all route through `syncResource`), link tools re-sync parent CatPaw body (`## Conectores vinculados` / `## Skills vinculadas` sections + `buildSearchHints` frontmatter extension, `search_kb({search:"holded"})` 4→9 hits); 15 orphans archived to `.docflow-legacy/orphans/` via `git mv` with retention policy documented in `_manual.md`.
- **Rebuild determinism** (157) — `scripts/kb-sync-db-source.cjs` `loadArchivedIds()` + Pass-2 exclusion gate seals commit 06d69af7 resurrection (0/8 archived catpaws reappear); `buildBody(subtype, row, relations?)` 3-arg signature renders linked sections byte-stable during rebuild; `cmdRestore --from-legacy <id>` opt-in readmission dispatcher; R30 rule atom documents contract with dual-discovery via `search_kb({tags:['retention']})`.

### Metrics

- **Timeline:** 2026-04-18 → 2026-04-21 (~4 days from Phase 149 kickoff to Phase 157 oracle approval)
- **Requirements:** 45 KB REQ-IDs (KB-01..KB-47 minus KB-44/KB-45), 100% satisfied
- **Tests:** 33/33 green on `kb-sync-rebuild-determinism.test.ts`; 22 `knowledge-sync` tests; Playwright 11/11 dashboard; CatBot oracle 3/3 on Phase 157, 4/4 on Phase 156, 3/3 on Phase 155
- **KB state at close:** 187 entries across 10 subdirs, `_header.md` + `_index.json` regenerated atomically, `.docflow-legacy/orphans/` holds 15 archived files

### Known gaps (deferred to v29.2)

- **KB-44**: `email-templates` active count shows +1 vs DB (duplicate-mapping pathology, 2 KB files → 1 DB row, not orphan)
- **KB-45**: CatBot `list_connectors` tool missing (only scoped `list_email_connectors` exists)
- **Idempotence cosmetic regression**: second `--full-rebuild --source db` re-bumps 56 version/timestamp fields on unchanged DB (pre-existing Phase 150/153 drift, non-blocking)

### Tag

- `v29.1` (to be created after milestone commit)

---
