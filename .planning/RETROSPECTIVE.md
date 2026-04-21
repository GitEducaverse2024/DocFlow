# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v29.1 — KB Runtime Integration

**Shipped:** 2026-04-21
**Phases:** 9 (149-157) | **Plans:** 35 | **Timeline:** 2026-04-18 → 2026-04-21 (~4 days)

### What Was Built

A fully live Knowledge Base at `.docflow-kb/` that CatBot reads and writes in real time:

- **Foundation + populate** (149-150): 10-subdir scaffold with schema-validated frontmatter (bilingual `title.es/en`, 13 obligatory fields, controlled tag taxonomy), `knowledge-sync.ts` service (semver bump rules, soft-delete, 150/170/180d retention), `kb-sync.cjs` CLI with `--source db` regeneration across 6 entities and idempotence guarantees.
- **Static migration** (151): `.planning/knowledge/*.md`, `app/data/knowledge/*.json`, skill prompts migrated to `domain/concepts/`, `domain/taxonomies/`, `domain/architecture/`, `rules/` (R01-R25), `protocols/`, `runtime/*.prompt.md`. 128 atoms generated with redirect stubs on originals.
- **CatBot consume** (152): `search_kb({type,subtype,tags,audience,status,search,limit})` + `get_kb_entry({id})` always-allowed read-only tools; `kb_entry` field on 5 listing tools; `buildKbHeader()` injects `_header.md` as P1 system context in prompt-assembler.
- **Creation hooks** (153): 22 hook sites (6 CatBot tool cases + 15 API route handlers + 1 sudo tool) fire `syncResource` on every DB create/update/delete; `kb-audit.ts` with `markStale()` writes to `_sync_failures.md`; DELETE routes through `markDeprecated()` with NO `fs.unlink`.
- **Dashboard `/knowledge`** (154): server components with 4-filter UI, recharts timeline, 8-card counts bar, `/knowledge/[id]` detail view, read-only `/api/knowledge/[id]` endpoint, sidebar nav entry.
- **Legacy cleanup** (155): `app/data/knowledge/*`, `.planning/knowledge/*`, `knowledge-tree.ts`, `TabKnowledgeTree` UI, `/api/catbot/knowledge/tree` route, `skill_orquestador_catbot_enriched.md` all physically deleted; `CLAUDE.md` simplified 80→46 lines; R26-R29 critical rule atoms + canvas-rules.ts rewritten to read from KB.
- **Runtime integrity** (156): canvas write-path KB sync, `delete_catflow` sudo soft-delete, `link_connector_to_catpaw`/`link_skill_to_catpaw` re-sync parent CatPaw body (`## Conectores/Skills vinculadas` + `buildSearchHints`), 15 orphans archived to `.docflow-legacy/orphans/` via `git mv`, retention policy documented.
- **Rebuild determinism** (157): `loadArchivedIds()` + Pass-2 exclusion gate seals commit 06d69af7 resurrection pathology (0/8 archived catpaws resurrected); `buildBody(subtype, row, relations?)` 3-arg renders linked sections byte-stable on rebuild; R30 rule atom documents contract with dual-discovery; `--restore --from-legacy <id>` opt-in readmission.

### What Worked

- **Split from v29.0 was the right call.** Recognizing that KB infrastructure without a consumer (Phase 152) is dead weight, and that cramming it inside v29.0 would force an incomplete shipment, let both milestones carry honest scope. The split surfaced v29.0's remaining debt (146-148 still open) without hiding it under "v29 done."
- **Decimal gap-closure phases (156, 157) with explicit REQ-ID extensions.** When audit cycles found runtime regressions (KB-43 orphan resurrection, KB-42 body-section partial), creating Phases 156 and 157 with new REQ-IDs KB-40..KB-47 was cleaner than retroactively re-opening phase 155. Audit cycle count (3) is a correct signal that scope evolved — not a failure mode.
- **Oracle-first CatBot verification at every phase close.** Each phase's VERIFICATION.md included verbatim oracle transcripts via `POST /api/catbot/chat`, proving features reach end-to-end through the tool surface rather than just unit tests. Phase 157's 3-prompt cadence (body-sections / DB↔KB parity / lifecycle semantics via rule citation) became a template.
- **TDD-RED-first on hook insertion points (153, 156).** Writing failing tests for each of the 22 hook sites before wiring `syncResource` prevented silent no-ops and caught the `update_cat_paw` explicit non-hook case early.
- **3-source cross-reference in milestone audit.** Triangulating VERIFICATION.md + SUMMARY.md frontmatter + REQUIREMENTS.md traceability table caught orphaned requirements that any one source alone would have missed.

### What Was Inefficient

- **Commit 06d69af7 resurrection bug is the single biggest learning.** Phase 156-03 archived 15 orphans via `git mv`, then 28 minutes later ran `kb-sync.cjs --full-rebuild --source db` to populate `search_hints` on 29 CatPaws — and the rebuild resurrected 10 of the 15 archived files because `loadArchivedIds()` didn't exist yet. Root cause: rebuild script's `fs.existsSync()` only checked `.docflow-kb/resources/`, ignoring `.docflow-legacy/orphans/`. Should have had the exclusion contract as a Phase 150 invariant, not a Phase 157 fix.
- **Audit cycle 2 was late.** Cycle 1 passed post-Phase-155, but Phase 156's implementation introduced the regression during the same evening. A proper pre-archive audit-after-every-phase would have caught it in hours, not after the fact.
- **REQUIREMENTS.md was pre-replaced with v30.0 content before v29.1 was archived.** When `/gsd:complete-milestone v29.1` ran, the CLI copied v30.0 requirements into `milestones/v29.1-REQUIREMENTS.md`. Recovered via git history (commit `beafdcf`) but wastes context. Next milestone: run `/gsd:complete-milestone` BEFORE `/gsd:new-milestone`.
- **Cosmetic idempotence regression in rebuild path.** Second consecutive `--full-rebuild --source db` re-bumps 56 version/updated_at fields on unchanged DB rows. Pre-existing Phase 150/153 drift; non-blocking but noisy. Deferred.

### Patterns Established

- **Rule-atom + `_manual.md` subsection dual-discovery for lifecycle invariants.** Operators browse `_manual.md` §policy; CatBot discovers via `search_kb({tags:['retention']})` → `get_kb_entry({id:'rule-rNN-…'})`. Phase 157 canonized this with R30 rebuild-determinism.
- **Decimal phase numbering for gap-closure** (156 = KB Runtime Integrity, 157 = Rebuild Determinism). Matches existing v28 pattern; keeps audit→close→audit cycles traceable in ROADMAP without rewriting history.
- **Phase-level VERIFICATION.md + milestone-level MILESTONE-AUDIT.md separation.** Phase verification is goal-backward per-phase; milestone audit aggregates + adds cross-phase integration + E2E flow checks. Kept both, didn't collapse.
- **CatBot oracle cadence = 3 prompts per phase close.** Prompt A proves KB-level behavior, Prompt B proves index/count parity (DB↔KB), Prompt C proves lifecycle semantics via rule citation. Adopted from Phase 157; reusable template.
- **KB-first mental model for static knowledge.** New features that need "docs" should write rule atoms / protocol atoms / concept atoms directly into `.docflow-kb/` instead of README files or inline comments. Phases 155 R26-R29 and 157 R30 prove the pattern.

### Key Lessons

1. **Archive exclusion must be a foundation-level invariant, not a retrofit.** Any script that rebuilds KB from DB must load the archive set first. If Phase 150 had included this, Phase 157 would not have existed.
2. **Don't pre-replace milestone-scoped files.** REQUIREMENTS.md, ROADMAP.md, PROJECT.md should be archived before being repurposed for the next milestone. The `/gsd:complete-milestone` command owns this cleanup; running `/gsd:new-milestone` first creates documentation debt.
3. **Audit cycles are a feature.** v29.1 needed 3 audit cycles to close honestly (passed → gaps_found → gap-closure phase 157 → passed). Treating the second cycle's `gaps_found` as a failure of the milestone, rather than a correct signal that regression happened, would have led to shipping with a known broken invariant.
4. **Oracle-first verification catches integration gaps that unit tests don't.** Every phase included at least one CatBot prompt that exercised the feature end-to-end through the tool surface. Phase 157's oracle Prompt B ("¿Cuántos CatPaws activos?") caught the `list_cat_paws LIMIT 20` bug that was invisible at the code level.
5. **Decimal phases are worth the audit noise.** Phases 156 and 157 both added REQ-IDs (KB-40..47) and were created explicitly to close audit gaps. This is healthier than retroactively editing Phase 155's scope.

### Cost Observations

- **Model mix:** Predominantly opus/sonnet; haiku sparingly for CLI validation helpers. Model profile set to `quality` throughout (per config.json).
- **Sessions:** Multiple sessions over ~4 days; each phase typically fit in 1-2 sessions. Phase 157 spanned two sessions (implementation + oracle/docs/verification).
- **Notable:** The integration-checker agent (sonnet) in this milestone's audit cycle 3 consumed ~102K tokens but replaced what would have been 15+ direct Grep/Read cycles across 20+ files. Net reduction.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v29.1 | multi-day | 9 | Introduced decimal gap-closure phases (156, 157) + audit cycles as feature + oracle-first CatBot verification cadence |

### Cumulative Quality

| Milestone | Tests Added | KB Atoms | Zero-Dep Additions |
|-----------|-------------|----------|-------------------|
| v29.1 | 33+ rebuild-determinism + 22 knowledge-sync + 11 Playwright dashboard + 15 kb-hook-tests + 3-prompt oracle × 9 phases | 187 (128 migrated + 59 resources) | kb-sync.cjs CLI (inline YAML parser + CJS fallback) |

### Open Known Gaps Across Milestones

- **v29.0**: Phases 146-148 not started (tracked in ROADMAP)
- **v29.1 → v29.2**: KB-44 (templates duplicate-mapping +1), KB-45 (`list_connectors` CatBot tool)
- **v29.1 tech debt**: Idempotence cosmetic regression on `--full-rebuild` (56 version re-bumps); multi-worker KB cache (60s TTL safe today, revisit at scale-out)
