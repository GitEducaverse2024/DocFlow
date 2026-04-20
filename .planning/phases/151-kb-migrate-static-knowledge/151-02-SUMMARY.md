---
phase: 151-kb-migrate-static-knowledge
plan: 02
subsystem: knowledge-base

tags: [kb, migration, catpaw, catflow, canvas, catbrain, catpower, catboard, settings, user-guide, redirect, json-stub]

requires:
  - phase: 149-kb-foundation-bootstrap
    provides: ".docflow-kb/ scaffolding, _schema/frontmatter.schema.json, _schema/tag-taxonomy.json, scripts/validate-kb.cjs"
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    provides: ".docflow-kb/resources/ populated from DB (references for guides)"

provides:
  - "5 concept atoms: domain/concepts/{catpaw,catflow,catbrain,canvas,catpower}.md"
  - "8 guide atoms: guides/{how-to-use-catpaws,how-to-use-catflows,how-to-use-catbrains,how-to-use-canvases,catboard,settings,user-guide,model-onboarding}.md"
  - "7 JSON originals with top-level __redirect + __redirect_destinations keys (still parseable, still consumed by PromptAssembler until Phase 152)"
  - "4 MD originals with prepended markdown redirect stubs (canvas-nodes-catalog + canvas-rules-index under app/data/knowledge/, user-guide + model-onboarding under .planning/knowledge/)"
  - "Migration log at .planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-02.md (outside KB to avoid validator collision)"

affects:
  - 152-kb-catbot-consume
  - 153-kb-creation-tool-hooks
  - 154-kb-cleanup-final

tech-stack:
  added: []
  patterns:
    - "JSON redirect pattern: top-level __redirect + __redirect_destinations array injected before existing keys; object remains valid JSON and fully parseable"
    - "Concept-vs-guide split: JSON.description + concepts[] → domain/concepts/<entity>.md; endpoints + tools + howto + common_errors + dont + sources → guides/how-to-use-<entities>.md"
    - "Single-atom fallback: small JSONs (catpower ~5KB) or ontology-less JSONs (catboard, settings) collapse into one atom instead of forced split"
    - "ttl=managed for all dynamic guides, ttl=never for stable concepts"

key-files:
  created:
    - ".docflow-kb/domain/concepts/catpaw.md"
    - ".docflow-kb/domain/concepts/catflow.md"
    - ".docflow-kb/domain/concepts/catbrain.md"
    - ".docflow-kb/domain/concepts/canvas.md"
    - ".docflow-kb/domain/concepts/catpower.md"
    - ".docflow-kb/guides/how-to-use-catpaws.md"
    - ".docflow-kb/guides/how-to-use-catflows.md"
    - ".docflow-kb/guides/how-to-use-catbrains.md"
    - ".docflow-kb/guides/how-to-use-canvases.md"
    - ".docflow-kb/guides/catboard.md"
    - ".docflow-kb/guides/settings.md"
    - ".docflow-kb/guides/user-guide.md"
    - ".docflow-kb/guides/model-onboarding.md"
    - ".planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-02.md"
  modified:
    - "app/data/knowledge/catpaw.json"
    - "app/data/knowledge/catflow.json"
    - "app/data/knowledge/catbrains.json"
    - "app/data/knowledge/canvas.json"
    - "app/data/knowledge/catboard.json"
    - "app/data/knowledge/catpower.json"
    - "app/data/knowledge/settings.json"
    - "app/data/knowledge/canvas-nodes-catalog.md"
    - "app/data/knowledge/canvas-rules-index.md"
    - ".planning/knowledge/user-guide.md"
    - ".planning/knowledge/model-onboarding.md"

key-decisions:
  - "JSON __redirect pattern: top-level key injected BEFORE existing keys (preserves order readability); companion __redirect_destinations array makes destinations machine-parseable. Alternative (comment-style stub) rejected: JSON has no native line comments"
  - "catpower.json collapsed into single concept atom: ~5KB source, ontology + howto already interleaved, splitting would fragment a tight body"
  - "catboard + settings → single guide atom each: primarily UI navigation + feature pointers, no stable ontology to extract as concept"
  - "user-guide + model-onboarding migrated verbatim with frontmatter injection — body preserved byte-for-byte (no reflowing/reformatting) to keep single source of truth clean when .planning/knowledge/ originals are deleted in Phase 155"
  - "Redirect stubs for duplicate MDs under app/data/knowledge/ cite Plan 01 outputs (rules/R*.md, domain/concepts/canvas-node.md) as string citations — plans run in parallel, filesystem link integrity verified by Plan 151-04 audit"

patterns-established:
  - "JSON runtime-config + companion KB atom: original JSON keeps runtime role during transition phase, __redirect key points forward to the KB path. Phase 152 migrates PromptAssembler to read the KB atom instead; Phase 155 physically deletes the JSON"
  - "Long migration (e.g., user-guide 264 lines) copied verbatim + frontmatter header instead of re-flowed — prevents translation drift and lets Phase 155 deletion be lossless"
  - "Migration log location = .planning/phases/<phase>/migration-log-plan-NN.md (outside KB): consistent with Plan 01 pattern established by Phase 151"

requirements-completed: [KB-12, KB-13, KB-14]

duration: ~12min
completed: 2026-04-20
---

# Phase 151-02: KB Migrate Static Knowledge (Silo A — app/data/knowledge JSONs + .planning/knowledge guides) Summary

**13 new KB atoms migrated from 9 legacy sources (7 runtime JSONs + 2 orphan .md guides), 11 originals stubbed with redirects, validator clean at 121 files (was 108 baseline).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-20T08:41:35Z
- **Completed:** 2026-04-20T08:54:00Z
- **Tasks:** 3
- **Files created:** 14 (13 atoms + migration log)
- **Files modified:** 11 (7 JSONs with `__redirect`, 4 MDs with prepended stubs)

## Accomplishments

- Split 4 ontology-bearing JSONs (`catpaw`, `catflow`, `catbrains`, `canvas`) each into a concept atom + a howto-use guide atom, faithfully distributing `description`+`concepts` → concept and `endpoints`+`tools`+`howto`+`common_errors`+`dont`+`sources` → guide. Zero content dropped.
- Collapsed `catpower.json` into a single merged concept atom (size ≤5KB, no meaningful split).
- Migrated `catboard.json` and `settings.json` as single guide atoms (UI navigation + pointers, no stable ontology).
- Migrated `user-guide.md` (264 lines) and `model-onboarding.md` (37 lines) verbatim to `guides/` with required frontmatter. Byte-for-byte body preservation.
- Injected `__redirect` + `__redirect_destinations` top-level keys into 7 JSONs; all remain parseable and retain every pre-existing key so PromptAssembler keeps working until Phase 152.
- Prepended markdown MOVED stubs to 4 duplicate/legacy MDs (2 under `app/data/knowledge/`, 2 under `.planning/knowledge/`) — Plan 01 already migrated the canonical versions of the duplicates.
- Migration log lives outside `.docflow-kb/` in the phase directory (same rationale as Plan 01 — `validate-kb.cjs` requires universal frontmatter).
- `validate-kb.cjs` clean: 108 → 117 (after Task 1) → 121 (after Task 2), 121 after Task 3 (redirects outside KB do not affect validator).

## Task Commits

Each task was committed atomically:

1. **Task 1: Atomize 5 ontology JSONs into concepts + guides** — `b3da0c2` (feat) — 10 files (5 concepts + 4 howto guides + migration log)
2. **Task 2: Migrate UI JSONs + orphan MDs to guide atoms** — `76a518f` (feat) — 4 files (catboard, settings, user-guide, model-onboarding)
3. **Task 3: Inject redirect stubs into 7 JSONs + 4 MDs** — `7c5d2e1` (feat) — 11 files

**Plan metadata:** will be committed with STATE/ROADMAP/REQUIREMENTS + this SUMMARY.

## Files Created/Modified

### Created (new atoms under `.docflow-kb/`)

- `.docflow-kb/domain/concepts/catpaw.md` — CatPaw concept (3 modos chat/processor/hybrid, protocolo 5 pasos).
- `.docflow-kb/domain/concepts/catflow.md` — CatFlow concept (pipeline visual, 13 nodos, R01..DA04, modelo dos capas, architect data layer).
- `.docflow-kb/domain/concepts/catbrain.md` — CatBrain concept (RAG Qdrant+Ollama, 3-step pipeline).
- `.docflow-kb/domain/concepts/canvas.md` — Canvas concept (13 nodos, data contracts, restricciones v28.0 pilot).
- `.docflow-kb/domain/concepts/catpower.md` — CatPower concept (Skills + Conectores + Templates, merged single atom).
- `.docflow-kb/guides/how-to-use-catpaws.md` — endpoints/tools/howtos/errors para CatPaws.
- `.docflow-kb/guides/how-to-use-catflows.md` — endpoints/tools/howtos/errors para CatFlows.
- `.docflow-kb/guides/how-to-use-catbrains.md` — endpoints/tools/howtos/errors para CatBrains.
- `.docflow-kb/guides/how-to-use-canvases.md` — endpoints/tools/howtos/errors para Canvas.
- `.docflow-kb/guides/catboard.md` — panel principal (alerts, patterns, complexity outcomes, self-healing retry).
- `.docflow-kb/guides/settings.md` — Settings /config (Centro de Modelos 4 tabs, user profiles/memory, knowledge admin, intent protocol).
- `.docflow-kb/guides/user-guide.md` — guía de usuario v25.0 (10 módulos, equipo comercial, arquitectura).
- `.docflow-kb/guides/model-onboarding.md` — onboarding de modelos (3 pasos: install → discovery → MID).
- `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-02.md` — source→destination mapping (outside KB).

### Modified

- `app/data/knowledge/{catpaw,catflow,catbrains,canvas,catboard,catpower,settings}.json` — each gains `__redirect` (string message) + `__redirect_destinations` (array of KB paths) as top-level keys before existing keys. Still valid JSON, still consumed by `PromptAssembler`.
- `app/data/knowledge/canvas-nodes-catalog.md` — prepended MOVED stub citing Plan 01 outputs (rules + canvas-node concept); content preserved below.
- `app/data/knowledge/canvas-rules-index.md` — prepended MOVED stub citing `.docflow-kb/rules/` directory (Plan 01 split rules); content preserved below.
- `.planning/knowledge/user-guide.md` — prepended MOVED stub pointing at `.docflow-kb/guides/user-guide.md`.
- `.planning/knowledge/model-onboarding.md` — prepended MOVED stub pointing at `.docflow-kb/guides/model-onboarding.md`.

## Decisions Made

1. **JSON `__redirect` as top-level key (not comment).** JSON has no native line-comment syntax. The canonical alternative (dual file with companion `.redirect.md`) adds filesystem noise and doesn't surface inside `PromptAssembler`. Top-level key stays queryable from JS and lives at the top of the serialized form where a human scanning the file will spot it first. Companion `__redirect_destinations` array makes destinations machine-parseable for Phase 152 consumption migration.

2. **catpower.json collapsed into single atom.** The source was ~5KB with interleaved ontology + howto + tool references. Splitting would have produced a 2KB concept and a 3KB guide that cross-reference each other constantly — net cognitive load higher than a single atom. catpower is a "paraguas" module (Skills + Conectores + Templates); the umbrella-description + howto flows better co-located.

3. **catboard + settings → single guide atom each.** Both JSONs are primarily UI navigation + feature pointers with no ontology-level terms. `settings.json` has 34 concept entries but they're all references to other subsystems (user_profiles, intent_protocol, canvas-classifier alias, etc.) — not ontology of Settings itself. Producing a concept atom for something with no content-of-itself would have been hollow.

4. **user-guide + model-onboarding migrated verbatim.** 264 + 37 lines respectively, with tables and code blocks. Re-flowing risked translation drift and makes Phase 155 deletion messy (diff would include subjective re-wording). Byte-for-byte body preservation + frontmatter header = zero-ambiguity migration, lossless rollback if needed.

5. **Migration log outside KB (Plan 01 precedent).** `scripts/validate-kb.cjs` uses `readdirSync` and enforces universal frontmatter on every `.md` under `.docflow-kb/`. Migration logs naturally lack the frontmatter shape (they're tables + source references). Placing at `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-02.md` = same pattern as Plan 01's `migration-log-plan-01.md`, keeps `validate-kb.cjs` green.

6. **Cross-plan redirect citations are strings, not filesystem links.** Plan 02's redirect stubs cite Plan 01 outputs (`rules/R*.md`, `domain/concepts/canvas-node.md`). Because these are documentation strings, not import statements, Plans 01 and 02 run in parallel Wave 1 without dependency. Plan 151-04 audit catches broken citations if any.

## Deviations from Plan

None — plan executed exactly as written.

**Minor automation detail worth noting:** The 7 JSON redirect injections + 4 MD stub injections were implemented via two small Node.js scripts (`/tmp/inject-json-redirect.cjs`, `/tmp/inject-md-redirect.cjs`) to ensure deterministic key ordering and idempotency (re-runs are no-ops via sentinel detection). Scripts are ephemeral; nothing committed to the repo. This is within the plan's allowance ("verify each file is still parseable" + preservation invariants).

## Issues Encountered

None during execution. Validator passed on first run after Task 1 (117 files: 108 baseline + 9 new) and Task 2 (121 files: +4 guides). Task 3 left validator count unchanged (originals are outside `.docflow-kb/`) as expected.

## Self-Check

All 13 new atom files exist and pass `node scripts/validate-kb.cjs` (exit 0, 121 files validated).

Commits verified:

- `b3da0c2` (Task 1) — present in git log.
- `76a518f` (Task 2) — present in git log.
- `7c5d2e1` (Task 3) — present in git log.

Key invariants verified:

- `ls .docflow-kb/domain/concepts/{catpaw,catflow,catbrain,canvas,catpower}.md | wc -l` → 5 ✓
- `ls .docflow-kb/guides/{how-to-use-*,catboard,settings,user-guide,model-onboarding}.md | wc -l` → 8 ✓
- All 7 JSONs in `app/data/knowledge/` have `__redirect` + `__redirect_destinations` (verified via `node -e "JSON.parse(...)"` loop) ✓
- All 4 MDs have `MOVED to` in first 3 lines (verified via `head -3 | grep`) ✓
- Migration log at `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-02.md` exists ✓
- `ls .docflow-kb/.migration-log*.md 2>/dev/null | wc -l` → 0 ✓ (no stray dotfiles in KB)
- Content preservation: `wc -l app/data/knowledge/catpaw.json` → 83 (78 original + ~5 from 2 new keys, not near zero) ✓

**Self-Check: PASSED**

## User Setup Required

None — no external service configuration required. All changes are file-level migrations inside the repository. The JSONs remain consumable by `PromptAssembler` unchanged in behavior; the new KB atoms are content for Phase 152 (CatBot Consume) to wire up.

## Next Phase Readiness

- **151-03** (next plan in phase): ready. The Silo A migration is complete; Plan 03 handles Silo C/D (skill orquestador enriched file + hardcoded system prompts in `catbot-pipeline-prompts.ts`).
- **151-04** (audit + close-out): will verify the cross-plan citations (Plan 01's rules cited in Plan 02's Task-3 stubs) resolve to real files.
- **152-kb-catbot-consume** (paralelizable with 151, Wave 1): `PromptAssembler` migration can now target the new `domain/concepts/*.md` and `guides/*.md` atoms for catpaw/catflow/catbrain/canvas/catpower/catboard/settings/user-guide/model-onboarding. Until that migration lands, the legacy JSONs retain runtime behavior because their original keys are preserved under the `__redirect` stub.
- **155-kb-cleanup-final**: owns physical deletion of the 7 JSONs and 4 MDs listed here.

No blockers or concerns.

---
*Phase: 151-kb-migrate-static-knowledge*
*Completed: 2026-04-20*
