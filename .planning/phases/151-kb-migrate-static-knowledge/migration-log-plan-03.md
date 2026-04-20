# Migration log — Plan 151-03 (skill + system prompts migration)

**Date:** 2026-04-20
**Plan:** 151-03
**Requirements:** KB-12, KB-13, KB-14
**Silos migrated:** C (skill in repo root) + F (system prompts hardcoded in TS)

## Silo C — Skill orquestador (root)

| Source                                         | Destination                                    | Body preserved |
| ---------------------------------------------- | ---------------------------------------------- | -------------- |
| `skill_orquestador_catbot_enriched.md` (890 L) | `.docflow-kb/protocols/orquestador-catflow.md` | 14 PARTES + DESCRIPCION intact; H1 renamed + version line removed (moved to frontmatter) |

**Stub strategy:** redirect banner prepended at top of original (lines 1-8). Original content below preserved byte-identical until Phase 155 (cleanup final).

**Frontmatter version: 2.0.0** (not 1.0.0) — preserves semver of the source skill protocol ("Version 2.0 — Marzo 2026" in original line 2).

## Silo F — Runtime prompts (typescript hardcoded)

| TS Export              | Line  | Destination                                  | Body bytes | Body verified |
| ---------------------- | ----- | -------------------------------------------- | ---------- | ------------- |
| `STRATEGIST_PROMPT`    | 16    | `.docflow-kb/runtime/strategist.prompt.md`   | 311        | byte-identical |
| `DECOMPOSER_PROMPT`    | 20    | `.docflow-kb/runtime/decomposer.prompt.md`   | 332        | byte-identical |
| `ARCHITECT_PROMPT`     | 26    | `.docflow-kb/runtime/architect.prompt.md`    | 9409       | byte-identical |
| `CANVAS_QA_PROMPT`     | 188   | `.docflow-kb/runtime/canvas-qa.prompt.md`    | 4222       | byte-identical |
| `AGENT_AUTOFIX_PROMPT` | 257   | `.docflow-kb/runtime/agent-autofix.prompt.md`| 1262       | byte-identical |

**Extraction method:** Node regex `/export const (\w+)_PROMPT = \`([\s\S]*?)\`;/g` on `catbot-pipeline-prompts.ts`. Escaped backticks (`\` + `` ` ``) unescaped to raw backticks inside the markdown fence. All other characters (newlines, `{{RULES_INDEX}}`, embedded JSON blocks, indentation) preserved verbatim. Verbatim-identity re-checked after writing via Node byte-for-byte comparison (all 5 → BYTE-IDENTICAL).

**Fence strategy:**
- `architect.prompt.md` uses a **4-backtick fence** (`` ```` ``) because the prompt body contains triple-backtick code fences (embedded `` ``` `` blocks for iterator pattern + JSON output example). Standard 3-backtick fence would break the Markdown.
- The other 4 prompt files use a standard 3-backtick fence (their bodies don't contain backtick fences).

## NON-MODIFICATION invariant

`app/src/lib/services/catbot-pipeline-prompts.ts` is **NOT modified** by this plan. Verification:

```bash
git diff --stat app/src/lib/services/catbot-pipeline-prompts.ts
# (empty output)
```

Phase 152 owns the refactor from "hardcoded" to `loadPrompt()`. KB copies are parallel reads until then — `source_of_truth` in each `runtime/*.prompt.md` frontmatter points back to the TS export (schema field `source: typescript`, `path: app/src/lib/services/catbot-pipeline-prompts.ts`, `export: <NAME>_PROMPT`).

## Template variable preservation

- `{{RULES_INDEX}}` appears 4 times in `architect.prompt.md` (2 in frontmatter/prose, 1 in summary, 1 literal in the verbatim body at the `## 7. Rules index (lookup on-demand)` section). All preserved byte-identical.
- `{{RULES_INDEX}}` appears 1 time in `canvas-qa.prompt.md` verbatim body. Preserved byte-identical.
- Resolution: `IntentJobExecutor.run()` calls `loadRulesIndex()` at call-time and string-substitutes into the prompt before sending to LiteLLM.

## KB location of migration log

**This file lives at:** `.planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md`
**NOT at:** `.docflow-kb/.migration-log-plan-03.md`

**Rationale (identical to Plans 01/02):** `scripts/validate-kb.cjs` walks all `.md` files under `.docflow-kb/` including dotfiles, and requires the 16-field frontmatter on every one. A migration log inside the KB would either fail validation or require a fake `type: audit` frontmatter that pollutes the KB with plan-ephemeral content.

## Invariant verification (run at task end)

```bash
# 5 runtime files
ls .docflow-kb/runtime/*.prompt.md | wc -l                           # 5 ✓
# 1 protocol file with 14 PARTEs
grep -c "^## PARTE" .docflow-kb/protocols/orquestador-catflow.md     # 14 ✓
# TS file untouched
git diff --stat app/src/lib/services/catbot-pipeline-prompts.ts     # empty ✓
# {{RULES_INDEX}} preserved
grep -c "{{RULES_INDEX}}" .docflow-kb/runtime/architect.prompt.md   # ≥1 ✓
# Redirect stub in original skill
head -3 skill_orquestador_catbot_enriched.md | grep "MOVED to"      # match ✓
# KB validates
node scripts/validate-kb.cjs                                         # OK: 127 archivos ✓
# Migration log OUTSIDE the KB
test -f .planning/phases/151-kb-migrate-static-knowledge/migration-log-plan-03.md   # exists ✓
ls .docflow-kb/.migration-log*.md 2>/dev/null | wc -l               # 0 ✓
```

## Cross-plan context

This is the third and final migration plan of Phase 151 (KB Migrate Static Knowledge — PRD Fase 3). Preceded by:

- **Plan 151-01:** Silo A (`.planning/knowledge/*.md`) + Silo B (taxonomy extension) — 42 files
- **Plan 151-02:** Silo D (`app/data/knowledge/*.json`) + Silo E (other static refs) — 25 files
- **Plan 151-03 (this plan):** Silo C (skill root) + Silo F (TS hardcoded prompts) — 6 destinations from 2 sources

**Next in phase:**
- **Plan 151-04:** Audit of all migrations (cross-references, redirect stubs, validate-kb).
