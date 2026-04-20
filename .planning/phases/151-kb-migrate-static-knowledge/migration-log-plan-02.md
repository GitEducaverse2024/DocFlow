# Migration log — Plan 151-02 (JSON knowledge migration)

Plan 151-02 migrates the 7 runtime JSONs (`app/data/knowledge/*.json`) read by
`PromptAssembler` plus the 2 orphan guides in `.planning/knowledge/` (user-guide,
model-onboarding) into structured KB atoms.

This log lives OUTSIDE `.docflow-kb/` on purpose: `validate-kb.cjs` walks all `.md`
including dotfiles and requires universal frontmatter. A migration log with source
URLs and free-form tables has no sensible "frontmatter universal" shape, so placing
it here prevents contamination of KB-14.

## Mapping

| Source | Destination concept | Destination guide |
|--------|---------------------|-------------------|
| `app/data/knowledge/catpaw.json` | `.docflow-kb/domain/concepts/catpaw.md` | `.docflow-kb/guides/how-to-use-catpaws.md` |
| `app/data/knowledge/catflow.json` | `.docflow-kb/domain/concepts/catflow.md` | `.docflow-kb/guides/how-to-use-catflows.md` |
| `app/data/knowledge/catbrains.json` | `.docflow-kb/domain/concepts/catbrain.md` | `.docflow-kb/guides/how-to-use-catbrains.md` |
| `app/data/knowledge/canvas.json` | `.docflow-kb/domain/concepts/canvas.md` | `.docflow-kb/guides/how-to-use-canvases.md` |
| `app/data/knowledge/catpower.json` | `.docflow-kb/domain/concepts/catpower.md` | — (merged into concept, JSON was small) |
| `app/data/knowledge/catboard.json` | — (no ontological content) | `.docflow-kb/guides/catboard.md` (Task 2) |
| `app/data/knowledge/settings.json` | — (no ontological content) | `.docflow-kb/guides/settings.md` (Task 2) |
| `app/data/knowledge/canvas-nodes-catalog.md` | (duplicate; Plan 01 migrated canonical) | redirect stub only (Task 3) |
| `app/data/knowledge/canvas-rules-index.md` | (aggregator; rules split by Plan 01) | redirect stub only (Task 3) |
| `.planning/knowledge/user-guide.md` | — | `.docflow-kb/guides/user-guide.md` (Task 2) |
| `.planning/knowledge/model-onboarding.md` | — | `.docflow-kb/guides/model-onboarding.md` (Task 2) |

## Output totals

- 5 concept atoms under `.docflow-kb/domain/concepts/`
- 8 guide atoms under `.docflow-kb/guides/` (4 howto-use + catboard + settings + user-guide + model-onboarding)
- 7 JSON originals with top-level `__redirect` key (still parseable, still consumed by PromptAssembler until Phase 152)
- 4 MD originals with markdown redirect stub (canvas-nodes-catalog, canvas-rules-index, user-guide, model-onboarding)

## Cross-plan coordination

Plan 151-02 runs in Wave 1 alongside Plan 151-01. Task 3 of this plan writes redirect
stubs that CITE destinations produced by Plan 01 (`rules/R*.md`,
`domain/concepts/canvas-node.md`). Those paths are known at plan-time; the stub is a
string, not a filesystem-verified link. The audit in Plan 151-04 catches any broken
reference if Plan 01 diverges.

## Deletion schedule

Physical deletion of all originals listed above is **Phase 155** (`kb-cleanup-final`).
Until then, the content remains accessible below the stub so any grep-based tooling
that still points to old paths keeps working during the transition.
