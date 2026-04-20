---
phase: 151-kb-migrate-static-knowledge
plan: 01
subsystem: knowledge-base

tags: [kb, migration, canvas, rules, incidents, protocols, yaml, frontmatter]

requires:
  - phase: 149-kb-foundation-bootstrap
    provides: ".docflow-kb/ scaffolding, _schema/frontmatter.schema.json, _schema/tag-taxonomy.json, scripts/validate-kb.cjs, kb-sync.cjs"
  - phase: 150-kb-populate-desde-db-catpaws-connectors-skills-catbrains-templates
    provides: ".docflow-kb/resources/ populated from DB (catpaws, connectors, skills, catbrains, email-templates, canvases)"

provides:
  - "25 atomic rule files R01..R25 under .docflow-kb/rules/ (one per rule of gold)"
  - "10 atomic incident files INC-01..INC-10 under .docflow-kb/incidents/"
  - "domain/concepts/canvas-node.md — base concept of canvas node + 13-node index"
  - "domain/taxonomies/node-roles.md — 7 functional roles (extractor/transformer/synthesizer/renderer/emitter/guard/reporter) + role→type mapping"
  - "domain/taxonomies/canvas-modes.md — agents/catbrains/mixed modes"
  - "domain/architecture/holded-mcp-api.md — Holded REST API reference (~121 endpoints, 5 dominios)"
  - "protocols/catflow-inbound-review.md — 15 errors + patron aplicado (v4.0), cross-linked to atomic rules"
  - "protocols/connector-logs-redaction.md — INC-13 closure policy for connector_logs"
  - "tag-taxonomy.json extended from 6 to 32 rule codes (R01..R25 + SE01..SE03 + DA01..DA04)"
  - "Redirect stubs on 6 originals in .planning/knowledge/ — content preserved for Phase 155 physical deletion"

affects:
  - 152-kb-catbot-consume
  - 153-kb-creation-tool-hooks
  - 154-kb-cleanup-final

tech-stack:
  added: []
  patterns:
    - "Atomic rule/incident files: one atom per rule code or incident ID with deterministic slug"
    - "Cross-linking via relative paths: protocol references atoms in rules/ via [R10](../rules/R10-preserve-fields.md)"
    - "Redirect-before-delete: originals keep full content below a MOVED stub until Phase 155"
    - "Migration log outside KB: .planning/phases/<phase>/migration-log-plan-NN.md to avoid validator contamination"

key-files:
  created:
    - ".docflow-kb/rules/R01-data-contracts.md"
    - ".docflow-kb/rules/R10-preserve-fields.md"
    - ".docflow-kb/rules/R20-code-over-llm.md"
    - ".docflow-kb/rules/R25-mandatory-idempotence.md"
    - ".docflow-kb/incidents/INC-10-buildactivesets-wrong-db.md"
    - ".docflow-kb/domain/concepts/canvas-node.md"
    - ".docflow-kb/domain/taxonomies/node-roles.md"
    - ".docflow-kb/domain/taxonomies/canvas-modes.md"
    - ".docflow-kb/domain/architecture/holded-mcp-api.md"
    - ".docflow-kb/protocols/catflow-inbound-review.md"
    - ".docflow-kb/protocols/connector-logs-redaction.md"
    - ".planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-01.md"
  modified:
    - ".docflow-kb/_schema/tag-taxonomy.json"
    - ".planning/knowledge/canvas-nodes-catalog.md"
    - ".planning/knowledge/incidents-log.md"
    - ".planning/knowledge/proceso-catflow-revision-inbound.md"
    - ".planning/knowledge/connector-logs-redaction-policy.md"
    - ".planning/knowledge/holded-mcp-api.md"
    - ".planning/knowledge/mejoras-sistema-modelos.md"

key-decisions:
  - "Migration log kept outside .docflow-kb/ (in phase dir) — validate-kb.cjs walks all .md including dotfiles, so any log inside would break KB-14"
  - "tag-taxonomy.json extended first (Task 1) as prerequisite — validator rejects unknown tags, so rules referencing R03..R25 needed taxonomy support before writing"
  - "holded-mcp-api.md kept as single architecture atom (not split by endpoint) per Apéndice D §D2 long-file pattern — the whole file is ~120KB of reference with strong internal cohesion"
  - "mejoras-sistema-modelos.md NOT migrated (legacy v25.1 post-mortem) — gets LEGACY stub pointing to Phase 155 move to .docflow-legacy/"
  - "Redirect stubs prepend (do not replace) original content — Phase 155 owns physical deletion"
  - "Cross-linking from protocols/catflow-inbound-review.md to rules/R*.md uses relative paths (../rules/R10-preserve-fields.md) — keeps the KB portable between repos"

patterns-established:
  - "Atomic rule format: frontmatter type=rule, subtype=design, slug R<NN>-<kebab-name>, tags include [canvas, R<NN>, <cross_cutting>]"
  - "Atomic incident format: frontmatter type=incident, slug INC-<NN>-<kebab-name>, body sections Síntoma/Causa/Solución/Regla"
  - "Protocol format: frontmatter type=protocol, cross-references to atomic rules via relative paths"
  - "Redirect stub: blockquote with MOVED + new paths + preservation notice + Phase 155 eviction date"

requirements-completed: [KB-12, KB-13, KB-14]

duration: ~45min
completed: 2026-04-20
---

# Phase 151-01: KB Migrate Static Knowledge Summary

**40 atomic KB files (25 rules, 10 incidents, 3 domain atoms, 2 protocols) migrated from `.planning/knowledge/*.md` to `.docflow-kb/` with redirect stubs on 6 originals — validator clean at 108 files (was 67 baseline).**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-04-20T08:00:00Z (approx)
- **Completed:** 2026-04-20T08:37:27Z
- **Tasks:** 3
- **Files created:** 42 (40 atoms + migration log + summary)
- **Files modified:** 8 (tag-taxonomy + 6 originals + STATE during plan run)

## Accomplishments

- Extended `.docflow-kb/_schema/tag-taxonomy.json` from 6 to 32 rule codes (R01..R25, SE01..SE03, DA01..DA04). Validator still green.
- Wrote 25 atomic rule files R01..R25 with full Spanish content derived from `canvas-nodes-catalog.md` §Reglas de Oro and `proceso-catflow-revision-inbound.md`. Each rule has its own file with frontmatter, context, examples, incident references, cross-links.
- Wrote 10 atomic incident files INC-01..INC-10 with full Síntoma/Causa/Solución/Regla structure — INC-10 preserves the full "tests unitarios verdes + producción rota" regression-test lesson.
- Consolidated canvas node taxonomy into 3 domain atoms: concept (canvas-node), role taxonomy (7 functional roles), mode taxonomy (agents/catbrains/mixed).
- Migrated `proceso-catflow-revision-inbound.md` to `protocols/catflow-inbound-review.md` — kept 15-error table + pattern-aplicado, extracted rules to `rules/` with cross-links.
- Migrated `connector-logs-redaction-policy.md` → `protocols/connector-logs-redaction.md` and `holded-mcp-api.md` → `domain/architecture/holded-mcp-api.md` as single-atom references.
- Inserted redirect stubs on 5 migrated originals + LEGACY stub on `mejoras-sistema-modelos.md` — content preserved below, Phase 155 owns physical deletion.
- `validate-kb.cjs` passes 108 files (67 baseline + 40 new + 1 protocol already in Task 2). Migration log lives in phase dir (0 stray dotfiles inside KB).

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend tag-taxonomy + write migration log** — `1581186` (chore)
2. **Task 2: Atomize canvas-nodes-catalog + inbound protocol** — `a90cc25` (feat) — 29 files (3 domain + 25 rules + 1 protocol)
3. **Task 3: Atomize incidents + migrate policies + redirect originals** — `391efb6` (feat) — 18 files changed

**Plan metadata:** will be committed with STATE/ROADMAP/REQUIREMENTS + this SUMMARY.

## Files Created/Modified

### Created (new atoms under `.docflow-kb/`)

- `.docflow-kb/rules/R01-data-contracts.md` through `R25-mandatory-idempotence.md` — 25 atomic rule files (one per rule of gold).
- `.docflow-kb/incidents/INC-01-agent-sin-catpaw.md` through `INC-10-buildactivesets-wrong-db.md` — 10 atomic incident files.
- `.docflow-kb/domain/concepts/canvas-node.md` — canvas node base concept + 13-node index.
- `.docflow-kb/domain/taxonomies/node-roles.md` — 7 functional roles + role→type mapping.
- `.docflow-kb/domain/taxonomies/canvas-modes.md` — 3 canvas modes.
- `.docflow-kb/domain/architecture/holded-mcp-api.md` — Holded MCP API reference (single atom).
- `.docflow-kb/protocols/catflow-inbound-review.md` — 15-error protocol with cross-links to rules.
- `.docflow-kb/protocols/connector-logs-redaction.md` — INC-13 closure policy.
- `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-01.md` — migration index (outside KB).

### Modified

- `.docflow-kb/_schema/tag-taxonomy.json` — extended rules array from 6 to 32 codes.
- `.planning/knowledge/canvas-nodes-catalog.md` — prepended MOVED stub (content preserved below).
- `.planning/knowledge/incidents-log.md` — prepended MOVED stub.
- `.planning/knowledge/proceso-catflow-revision-inbound.md` — prepended MOVED stub.
- `.planning/knowledge/connector-logs-redaction-policy.md` — prepended MOVED stub.
- `.planning/knowledge/holded-mcp-api.md` — prepended MOVED stub.
- `.planning/knowledge/mejoras-sistema-modelos.md` — prepended LEGACY stub (not migrated).

## Decisions Made

1. **Migration log outside KB.** `scripts/validate-kb.cjs` uses `readdirSync` that includes dotfiles and demands valid frontmatter. Keeping any log file inside `.docflow-kb/` would either require invalid-for-purpose frontmatter or break KB-14. Decision: `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-01.md` — outside the KB validation surface.

2. **Taxonomy extended first.** Task 1 extended `tag-taxonomy.json` before any rule file was written. Reason: validator rejects unknown tags. Rule files used `R03..R25`, `SE02..SE03`, `DA02..DA04` — none existed in the base taxonomy. Extending first is cheaper than writing+fixing.

3. **Holded MCP API kept as single atom.** The source file is ~120KB of dense reference content. Splitting by domain (invoicing/crm/projects/team/accounting) or by endpoint was considered and rejected: the internal cohesion is high (cross-references between domains are frequent), and Apéndice D §D2 of ANALYSIS-knowledge-base-architecture.md explicitly allows long-file single-atom pattern for API references.

4. **mejoras-sistema-modelos.md NOT migrated.** It's the v25.1 milestone post-mortem — closed, not active knowledge, scheduled for `.docflow-legacy/milestone-retrospectives/` in Phase 155 per Apéndice D §D.1 🟡. Gets LEGACY stub (different from MOVED stub) to signal "don't consume from CatBot".

5. **Redirect stubs PREPEND, do not replace.** Phase 155 owns the physical deletion. Meanwhile, the originals keep their full content below the stub — safer than deleting now (git history + file access both work).

6. **Cross-linking uses relative paths.** `protocols/catflow-inbound-review.md` references `../rules/R10-preserve-fields.md` (relative) instead of absolute `.docflow-kb/rules/R10-...` — the KB tree stays portable between repos (e.g., if cloned into a different mount point).

## Deviations from Plan

None — plan executed exactly as written. The only minor automated behavior worth noting: the incident file titles in the source `incidents-log.md` didn't have "Fecha" and "Severidad" as structured fields in all entries (some were loose paragraphs), so the generator script mapped them into structured frontmatter body sections uniformly. This was within the plan's allowance ("preserve the 4 sections verbatim plus Severidad and Fecha from source header").

## Issues Encountered

None during execution. Validator passed on first run for Task 1 (67 files), Task 2 (96 files), and Task 3 (108 files) without a single frontmatter error across the 40 new atoms.

## Self-Check

All 40 new atom files exist and pass `node scripts/validate-kb.cjs` (exit 0, 108 files validated).

Commits verified:

- `1581186` (Task 1) — present in git log.
- `a90cc25` (Task 2) — present in git log.
- `391efb6` (Task 3) — present in git log.

Key invariants verified:

- `ls .docflow-kb/rules/R*.md | wc -l` → 25 ✓
- `ls .docflow-kb/incidents/INC-*.md | wc -l` → 10 ✓
- `ls .docflow-kb/.migration*.md 2>/dev/null | wc -l` → 0 ✓ (no stray dotfiles in KB)
- `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-01.md` exists ✓
- All 6 originals in `.planning/knowledge/` have redirect/legacy stubs at top ✓
- All 6 originals preserve their full content below the stub ✓

**Self-Check: PASSED**

## User Setup Required

None — no external service configuration required. All changes are file-level migrations inside the repository.

## Next Phase Readiness

- **151-02** (next plan in phase): ready. The atomized rules provide the vocabulary for migrating `app/data/knowledge/*.json` CatBot knowledge trees in Plan 02.
- **152** (KB CatBot Consume, paralelizable): can now search/get atomic rule entries — rules and incidents are discoverable per `type` filter.
- **153** (KB Creation Tool Hooks, sequential after 152): needs the atomized structure to decide which resource a tool-write corresponds to.
- **155** (KB Cleanup Final): owns physical deletion of the 6 originals and move of `mejoras-sistema-modelos.md` to `.docflow-legacy/`.

No blockers or concerns.

---
*Phase: 151-kb-migrate-static-knowledge*
*Completed: 2026-04-20*
