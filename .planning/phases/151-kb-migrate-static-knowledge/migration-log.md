# Migration log — Phase 151 (KB Migrate Static Knowledge)

**Phase:** 151
**Executed:** 2026-04-20
**Plans:** 151-01, 151-02, 151-03, 151-04
**Requirements closed:** KB-12 (full 3-origin migration), KB-13 (redirects), KB-14 (schema validation)

## Why this log lives outside `.docflow-kb/`

`scripts/validate-kb.cjs` walks every `.md` under `.docflow-kb/` via `readdirSync` (including dotfiles) and enforces universal frontmatter. Migration logs are process metadata, not KB content — they belong in the phase directory. Dotfile logs inside the KB (e.g. `.docflow-kb/.migration-log.md`) would fail validation with "archivo sin frontmatter" and break KB-14.

## Silos migrated

### Silo A — `app/data/knowledge/*.json` (7 files) — Plan 151-02

Per `migration-log-plan-02.md`:

| Source | Destination concept | Destination guide |
|--------|---------------------|-------------------|
| `app/data/knowledge/catpaw.json` | `.docflow-kb/domain/concepts/catpaw.md` | `.docflow-kb/guides/how-to-use-catpaws.md` |
| `app/data/knowledge/catflow.json` | `.docflow-kb/domain/concepts/catflow.md` | `.docflow-kb/guides/how-to-use-catflows.md` |
| `app/data/knowledge/catbrains.json` | `.docflow-kb/domain/concepts/catbrain.md` | `.docflow-kb/guides/how-to-use-catbrains.md` |
| `app/data/knowledge/canvas.json` | `.docflow-kb/domain/concepts/canvas.md` | `.docflow-kb/guides/how-to-use-canvases.md` |
| `app/data/knowledge/catpower.json` | `.docflow-kb/domain/concepts/catpower.md` | — (merged into concept) |
| `app/data/knowledge/catboard.json` | — | `.docflow-kb/guides/catboard.md` |
| `app/data/knowledge/settings.json` | — | `.docflow-kb/guides/settings.md` |

Result: 5 concept atoms + 7 guide atoms.

### Silo B — `.planning/knowledge/*.md` — Plans 151-01 + 151-02 + 151-04

Per `migration-log-plan-01.md` (Plan 01, 6 sources → 40 atoms):

| Source | Destination(s) | Count |
|--------|----------------|-------|
| `.planning/knowledge/canvas-nodes-catalog.md` | `domain/concepts/canvas-node.md` + `domain/taxonomies/node-roles.md` + `domain/taxonomies/canvas-modes.md` + `rules/R01..R25` | 25 rules + 3 domain atoms |
| `.planning/knowledge/incidents-log.md` | `incidents/INC-01..INC-10` | 10 incidents |
| `.planning/knowledge/proceso-catflow-revision-inbound.md` | `protocols/catflow-inbound-review.md` | 1 protocol |
| `.planning/knowledge/connector-logs-redaction-policy.md` | `protocols/connector-logs-redaction.md` | 1 protocol |
| `.planning/knowledge/holded-mcp-api.md` | `domain/architecture/holded-mcp-api.md` | 1 architecture doc |
| `.planning/knowledge/mejoras-sistema-modelos.md` | (legacy; Phase 155 → `.docflow-legacy/`) | 0 (LEGACY stub) |

Plus Plan 151-02 orphan guides:

| Source | Destination |
|--------|-------------|
| `.planning/knowledge/user-guide.md` | `.docflow-kb/guides/user-guide.md` |
| `.planning/knowledge/model-onboarding.md` | `.docflow-kb/guides/model-onboarding.md` |

Plus Plan 151-04 DB-synced catalogs (redirect-only — live data already in `resources/` from Phase 150):

| Source | Redirect target |
|--------|-----------------|
| `.planning/knowledge/catpaw-catalog.md` | `.docflow-kb/resources/catpaws/` |
| `.planning/knowledge/connectors-catalog.md` | `.docflow-kb/resources/connectors/` |
| `.planning/knowledge/email-templates-catalog.md` | `.docflow-kb/resources/email-templates/` |
| `.planning/knowledge/skills-catalog.md` | `.docflow-kb/resources/skills/` |

### Silo C — `skill_orquestador_catbot_enriched.md` (root) — Plan 151-03

Per `migration-log-plan-03.md`:

| Source | Destination | Body preserved |
|--------|-------------|----------------|
| `skill_orquestador_catbot_enriched.md` (890 L, 14 PARTES) | `.docflow-kb/protocols/orquestador-catflow.md` | byte-identical below frontmatter |

### Silo F — System prompts (typescript hardcoded) — Plan 151-03

Per `migration-log-plan-03.md`:

| TS Export | Destination | Bytes | Verified |
|-----------|-------------|-------|----------|
| `STRATEGIST_PROMPT` | `.docflow-kb/runtime/strategist.prompt.md` | 311 | byte-identical |
| `DECOMPOSER_PROMPT` | `.docflow-kb/runtime/decomposer.prompt.md` | 332 | byte-identical |
| `ARCHITECT_PROMPT` | `.docflow-kb/runtime/architect.prompt.md` | 9409 | byte-identical (4-backtick fence) |
| `CANVAS_QA_PROMPT` | `.docflow-kb/runtime/canvas-qa.prompt.md` | 4222 | byte-identical |
| `AGENT_AUTOFIX_PROMPT` | `.docflow-kb/runtime/agent-autofix.prompt.md` | 1262 | byte-identical |

## Destination counts (post-migration)

| KB subdirectory | Files added by Phase 151 |
|-----------------|-------------------------|
| `rules/` | 25 (R01..R25) |
| `incidents/` | 10 (INC-01..INC-10) |
| `protocols/` | 3 (catflow-inbound-review, connector-logs-redaction, orquestador-catflow) |
| `runtime/` | 5 (strategist, decomposer, architect, canvas-qa, agent-autofix) |
| `domain/concepts/` | 6 (canvas-node, catpaw, catflow, catbrain, canvas, catpower) |
| `domain/taxonomies/` | 2 (node-roles, canvas-modes) |
| `domain/architecture/` | 1 (holded-mcp-api) |
| `guides/` | 8 (how-to-use-{catpaws,catflows,catbrains,canvases}, catboard, settings, user-guide, model-onboarding) |
| **Total new files** | **~60** |

## Redirects added (exhaustive audit)

| Original | Target(s) | Redirect type | Plan |
|----------|-----------|---------------|------|
| `.planning/knowledge/canvas-nodes-catalog.md` | `rules/` + `domain/concepts/canvas-node.md` | markdown stub | 151-01 |
| `.planning/knowledge/incidents-log.md` | `incidents/` | markdown stub | 151-01 |
| `.planning/knowledge/proceso-catflow-revision-inbound.md` | `protocols/catflow-inbound-review.md` | markdown stub | 151-01 |
| `.planning/knowledge/connector-logs-redaction-policy.md` | `protocols/connector-logs-redaction.md` | markdown stub | 151-01 |
| `.planning/knowledge/holded-mcp-api.md` | `domain/architecture/holded-mcp-api.md` | markdown stub | 151-01 |
| `.planning/knowledge/mejoras-sistema-modelos.md` | (legacy → `.docflow-legacy/` en Phase 155) | LEGACY stub | 151-01 |
| `.planning/knowledge/user-guide.md` | `guides/user-guide.md` | markdown stub | 151-02 |
| `.planning/knowledge/model-onboarding.md` | `guides/model-onboarding.md` | markdown stub | 151-02 |
| `.planning/knowledge/catpaw-catalog.md` | `resources/catpaws/` | REPLACED stub | 151-04 |
| `.planning/knowledge/connectors-catalog.md` | `resources/connectors/` | REPLACED stub | 151-04 |
| `.planning/knowledge/email-templates-catalog.md` | `resources/email-templates/` | REPLACED stub | 151-04 |
| `.planning/knowledge/skills-catalog.md` | `resources/skills/` | REPLACED stub | 151-04 |
| `app/data/knowledge/catpaw.json` | `concepts/catpaw.md` + `guides/how-to-use-catpaws.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/catflow.json` | `concepts/catflow.md` + `guides/how-to-use-catflows.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/catbrains.json` | `concepts/catbrain.md` + `guides/how-to-use-catbrains.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/canvas.json` | `concepts/canvas.md` + `guides/how-to-use-canvases.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/catboard.json` | `guides/catboard.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/catpower.json` | `concepts/catpower.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/settings.json` | `guides/settings.md` | `__redirect` key | 151-02 |
| `app/data/knowledge/canvas-nodes-catalog.md` | `rules/` + `concepts/canvas-node.md` (dup) | markdown stub | 151-02 |
| `app/data/knowledge/canvas-rules-index.md` | `rules/` (dup) | markdown stub | 151-02 |
| `skill_orquestador_catbot_enriched.md` (root) | `protocols/orquestador-catflow.md` | markdown stub | 151-03 |

**Total: 21 redirects across 3 filesystem locations.**

## NON-modified files (critical contract preservation)

- `app/src/lib/services/catbot-pipeline-prompts.ts` — Phase 152 owns the `loadPrompt()` refactor. KB `runtime/*.prompt.md` files are parallel reads until then.
- `CLAUDE.md` — out of scope per phase constraints (documentation update to point at `.docflow-kb/` is deferred to Phase 155).
- `app/data/knowledge/_index.json` + `_template.json` — PromptAssembler still reads them until Phase 152 (KB CatBot Consume).

## Deferred to Phase 155 (cleanup final)

- Physical deletion of all originals with redirect stubs.
- Move of `.planning/knowledge/mejoras-sistema-modelos.md` to `.docflow-legacy/milestone-retrospectives/`.
- Update of `CLAUDE.md` §"Documentación de referencia" to point at `.docflow-kb/` paths instead of `.planning/knowledge/` paths.

## Requirement closure matrix

| Requirement | Evidence artifact | Status |
|-------------|-------------------|--------|
| **KB-12** (full 3-origin migration) | this log + 151-VERIFICATION.md §KB-12 + disk counts under `.docflow-kb/` | closed |
| **KB-13** (redirects in originals) | this log "Redirects added" table (21 entries) + grep-verifiable invariants | closed |
| **KB-14** (schema validation) | `validate-kb.cjs` exit 0 on full KB (127+ files post-migration) | closed |

## Per-plan log cross-references

- `migration-log-plan-01.md` — Silo B migration atomic-by-atomic (40 atoms).
- `migration-log-plan-02.md` — Silo D (`app/data/knowledge/*.json`) + 2 orphan guides.
- `migration-log-plan-03.md` — Silo C (root skill) + Silo F (TS runtime prompts).
- `migration-log.md` (this file) — global audit + Plan 151-04 closure.
