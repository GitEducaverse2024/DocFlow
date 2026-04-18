---
phase: 149-kb-foundation-bootstrap
plan: 02
subsystem: infra
tags: [knowledge-base, schema, validation, json-schema, yaml-parser]

# Dependency graph
requires:
  - 149-01 (.docflow-kb/_schema/ directory with .gitkeep ready to receive schemas)
provides:
  - ".docflow-kb/_schema/frontmatter.schema.json — JSON Schema Draft-07 with 16 required fields + 3 conditional rules (status=deprecated, ttl=managed, lang=es+en)"
  - ".docflow-kb/_schema/tag-taxonomy.json — literal 8-category controlled vocabulary from PRD §3.4"
  - ".docflow-kb/_schema/resource.schema.json — extends frontmatter via allOf+$ref, restricts subtype to 6 values"
  - "scripts/validate-kb.cjs — vanilla-Node CLI validator (411 lines, 0 npm deps) that enforces the schemas on every .md in the KB"
affects:
  - 149-03 (knowledge-sync.ts will write frontmatter that must pass this validator)
  - 149-04 (kb-sync.cjs --full-rebuild will use the validator as a sanity gate post-generation)
  - Future CI pipeline (if/when added) can invoke `node scripts/validate-kb.cjs` as a pre-merge check

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vanilla-Node YAML subset parser inline (no npm deps at repo root) — supports scalars, inline/multiline lists, nested dicts, list-of-dict-multiline (Apéndice A shape), dict-with-list-values (search_hints shape)"
    - "Manual schema validation (JSON Schema semantics without AJV) — 16 required-fields check + enum checks + 3 conditional rules + semver regex + tag-taxonomy cross-check"
    - "Scope exclusions codified: _archived/ dir, _header.md, _manual.md (stubs/archived not subject to universal frontmatter)"
    - "Clear per-error CLI output: `FAIL <relpath>:` followed by indented bullet list of violations; final line `FAILED: N/M archivos no cumplen el schema` or `OK: N archivos validados`"

key-files:
  created:
    - "scripts/validate-kb.cjs"
  modified: []
  pre-existing-from-task-1:
    - ".docflow-kb/_schema/frontmatter.schema.json"
    - ".docflow-kb/_schema/tag-taxonomy.json"
    - ".docflow-kb/_schema/resource.schema.json"

key-decisions:
  - "Vanilla-Node over AJV — repo root has no package.json; introducing a dependency here was rejected in favor of an inline YAML subset parser + manual schema check. The validator's docstring documents that swapping to AJV is the intended upgrade path once the repo root gets a package.json (likely when CI is formalized)."
  - "Scope of YAML parser: supports exactly the frontmatter shapes in PRD §3.3 + Apéndice A/B (validated against both fixtures). Explicitly out of scope: anchors/aliases, `|`/`>` multiline strings, arbitrary nesting depth. If a future archive uses advanced YAML, parser must be replaced."
  - "Conditional rules enforced in validator code (not deferred to AJV $ref/allOf) — the 3 rules of the PRD §3.3 (deprecated, managed TTL, bilingual) are the load-bearing invariants; validator rejects violations with targeted error messages."
  - "resource.schema.json allOf+$ref is NOT executed by the validator in this phase — the script only applies frontmatter.schema.json rules. The resource.schema.json file exists as contract-of-record for the future AJV-based validator (when KB actually has `type: resource` content in Phase 2/3 PRD)."
  - "Version check uses strict semver `M.m.p` regex — rejects `1.0`, `v1.0.0`, `1.0.0-alpha`. Consistent with PRD §3.3 #11."

patterns-established:
  - "16-field required contract: id, type, lang, title, summary, tags, audience, status, created_at, created_by, version, updated_at, updated_by, source_of_truth, change_log, ttl"
  - "Error messages name the exact rule violated (`ttl=managed requiere last_accessed_at`, `tag X no está en tag-taxonomy.json`, `version X no es semver M.m.p`) — aids debugging when CI fires"
  - "Inline test-against-fixture methodology: canonical PRD examples (Apéndice A/B) become the positive contract; 6 deliberately-invalid fixtures become the negative contract. Both sets were ran during verification; results archived in this summary."

requirements-completed: [KB-02, KB-03]

# Metrics
duration: ~6 min
completed: 2026-04-18
---

# Phase 149 Plan 02: KB Schemas and Validator Summary

**Delivered the 3 JSON Schema files (`frontmatter.schema.json`, `tag-taxonomy.json`, `resource.schema.json`) and `scripts/validate-kb.cjs`, a vanilla-Node CLI validator that enforces the 16-field universal frontmatter contract + 8-category tag taxonomy across every `.md` in `.docflow-kb/` (excluding archived/stubs), verified against both canonical PRD fixtures (Apéndice A bilingüe + Apéndice B deprecated) and 6 deliberately-invalid fixtures.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-18T15:05:52Z
- **Completed:** 2026-04-18T15:11:50Z
- **Tasks:** 2
- **Files created:** 1 new (`scripts/validate-kb.cjs`) — the 3 schema files under `_schema/` were already committed in `551de43` prior to this execution window (Task 1 was a no-op on disk; verification confirms the pre-existing files match the plan's Task 1 action spec byte-for-byte).
- **Files modified:** 0
- **Lines added:** 411 (validator)
- **Validator script:** 411 lines, 0 npm dependencies

## Accomplishments

### Task 1: Schemas (pre-existing from commit `551de43`)

Task 1 was already complete at the start of this execution window — commit `551de43` (`feat(149-02): add KB JSON schemas`) had previously added all 3 required files. Re-ran the plan's Task 1 automated verification and it passes identically to the original run:

```
OK: fm.required=16 tt.categories=8 rs.allOf=2
```

No rewrite was needed; the files match the plan's `<action>` byte-by-byte. Contents:

1. **`.docflow-kb/_schema/frontmatter.schema.json`** (170 lines, JSON Schema Draft-07): 16 `required` fields, `type` enum with 11 values (concept, taxonomy, resource, rule, protocol, runtime, incident, feature, guide, state, audit), `lang` enum (es, en, es+en), `status` enum (5 values), `ttl` enum (never, managed, 30d, 180d), `audience` enum (5 values), semver regex pattern for `version`, and 3 `allOf` conditional rules (deprecated, managed TTL, bilingual).

2. **`.docflow-kb/_schema/tag-taxonomy.json`** (10 lines, literal §3.4 of PRD): 8 categories `domains, entities, modes, connectors, roles, departments, rules, cross_cutting`, with the exact PRD values — no additions, no renames.

3. **`.docflow-kb/_schema/resource.schema.json`** (25 lines): `allOf` extends `frontmatter.schema.json` via `$ref`, restricts `type` to `"resource"`, `subtype` enum to 6 values (catpaw, connector, catbrain, email-template, skill, canvas), and mandates non-null `source_of_truth` with `minItems: 1`.

### Task 2: Validator (new in this plan)

`scripts/validate-kb.cjs` (411 lines, 0 npm deps, executable 0755):

- **Walk logic** recurses `.docflow-kb/**/*.md` excluding `_archived/` dir and `_header.md`/`_manual.md` stubs.
- **YAML parser** (`parseYAML`): inline subset covering exactly the shapes used in the PRD frontmatter. Handles scalars (string, number, bool, null, ISO dates), inline lists (`[a, b, c]`), inline dicts (`{ k: v, k2: v2 }`), multiline lists, multiline dicts, **list-of-dict-multiline** (the Apéndice A `source_of_truth:\n  - db: x\n    id: y\n    fields_from_db: [...]` shape), and dict-of-lists (`search_hints:\n  es: [...]\n  en: [...]`). Includes smart splitting that respects nesting depth and quoted strings, so commas inside quoted change_log strings don't split prematurely.
- **Schema enforcement** (`validateAgainstSchema`): reads the 16 `required` fields from `frontmatter.schema.json`, then checks enums, semver regex, bilingual dict shape, and the 3 conditional rules. All errors accumulate per-file and are printed before exit 1.
- **Tag taxonomy** cross-check: flattens the 8 categories into a single Set; any tag not in the Set emits `tag "X" no está en tag-taxonomy.json`.
- **Exit semantics**: 0 if every file passes (prints `OK: N archivos validados`), 1 if any file fails (prints per-file errors + `FAILED: N/M archivos no cumplen el schema`).

## Task Commits

1. **Task 1 (schemas)**: `551de43` (feat) — pre-existing at plan start. `feat(149-02): add KB JSON schemas (frontmatter, tag-taxonomy, resource)`
2. **Task 2 (validator)**: `56fa4f3` (feat) — new in this run. `feat(149-02): add validate-kb.cjs vanilla-node KB validator`

## Verification Results

### Critical contract: PRD Apéndice A + B as positive fixtures

Both canonical fixtures from `ANALYSIS-knowledge-base-architecture.md` pass the validator with exit 0:

| Fixture | Source | Result |
| ------- | ------ | ------ |
| `apendice-a-operador-holded.md` (bilingüe, status active, ttl managed, multiline source_of_truth) | PRD §Apéndice A | `OK: 1 archivos validados`, exit 0 |
| `apendice-b-consultor-crm.md` (bilingüe, status deprecated, all deprecation fields populated) | PRD §Apéndice B | `OK: 1 archivos validados`, exit 0 |

This confirms the schema and validator do **not** reject valid canonical content. The critical contract from the execution instructions holds: "Schema MUST accept canonical bilingüe example (PRD §Apéndice A) AND deprecated example (§Apéndice B)."

### Negative fixtures (deliberately invalid)

6 invalid fixtures exercise each rule:

| Fixture | Violated rule | Error message | Exit |
| ------- | ------------- | ------------- | ---- |
| `invalid-bad-tag.md` | Tag `foobar_not_in_taxonomy` not in taxonomy | `tag "foobar_not_in_taxonomy" no está en tag-taxonomy.json` | 1 |
| `invalid-deprecated-missing.md` | `status: deprecated` without deprecated_at/by/reason | `status=deprecated requiere deprecated_at` (+ by + reason) | 1 |
| `invalid-ttl-managed.md` | `ttl: managed` without last_accessed_at/access_count | `ttl=managed requiere last_accessed_at` (+ access_count) | 1 |
| `invalid-version.md` | `version: "1.0"` (not semver) | `version "1.0" no es semver M.m.p` | 1 |
| `no-frontmatter.md` | No `---` delimiter | `archivo sin frontmatter (no empieza con ---)` | 1 |
| `invalid-bilingual-title.md` | `lang: es+en` with string title/summary | `lang=es+en requiere title como dict {es, en}` (+ summary) | 1 |

All negative tests exited 1 with targeted error messages. No false positives, no false negatives.

### Global plan verification

```
All 3 schemas are valid JSON
OK: 0 archivos validados
Categories: connectors,cross_cutting,departments,domains,entities,modes,roles,rules
```

- 3 schemas parse as valid JSON ✓
- Validator on current empty KB exits 0 ✓
- Tag taxonomy has exactly the 8 expected categories ✓

## Decisions Made

1. **Vanilla-Node over AJV dependency.** Repo root has no `package.json` (CLIs like `host-agent.mjs`, `mcp-bridge.mjs`, and now `validate-kb.cjs` all run vanilla). Introducing a dependency requires creating/maintaining a root-level `package.json` + lockfile and a CI install step, none of which exist yet. The validator is explicit about this trade-off in its docstring and provides a clear upgrade path: once AJV arrives, swap `validateAgainstSchema()` for `ajv.compile(schema)` + `ajv.addSchema(tagTaxonomy)` and the surface area of the change is ~30 lines.

2. **YAML parser scope: exactly what PRD §3.3 + Apéndice A/B use.** Verified by running the validator against the two canonical fixtures (both exit 0). Parser does NOT support YAML anchors/aliases, `|`/`>` multiline strings, or unbounded nesting. This is intentional: the KB is autogenerated by `knowledge-sync.ts` (Plan 03 onward), so shapes will stay inside the covered subset. If a future archive ingests handwritten advanced-YAML content, the parser must be replaced (upgrade to `js-yaml` + AJV as a single migration).

3. **Conditional rules enforced in validator code, not via `$ref`/`allOf`.** The plan's `resource.schema.json` uses `allOf + $ref`, which is JSON Schema's composition idiom but requires a real JSON Schema engine. The vanilla validator implements the same rules procedurally (cleaner error messages, easier to maintain without AJV). Once AJV is integrated, the `resource.schema.json` composition will be honored — in this phase, only `frontmatter.schema.json` rules apply at validation time.

4. **Semver strict (`M.m.p`), no prerelease suffix.** PRD §3.3 mandates `version: string semver M.m.p`. Validator rejects `1.0` (only 2 parts), `v1.0.0` (with prefix), `1.0.0-alpha` (prerelease). This is stricter than SemVer 2.0.0 but matches PRD intent: change_log already provides build/release annotations.

5. **Validator is stateless and idempotent.** No caching, no file writes. Safe to run in CI, pre-commit hooks, and locally. The `_manual.md` §"Validación y CI" section (written in Plan 149-01) already documents how to invoke it.

## Deviations from Plan

### None

Both tasks executed exactly as written. Task 1 was already satisfied by a pre-existing commit (`551de43`) from a prior execution attempt — the files on disk match the plan's `<action>` spec byte-for-byte, so no rewrite was needed; verification passed on the pre-existing files and execution proceeded directly to Task 2.

**Total deviations:** 0 auto-fixed, 0 architectural.

## Issues Encountered

- **Pre-existing Task 1 commit**: on plan start, the 3 schema files were already on disk and committed (`551de43`). This matched the plan's required output exactly, so Task 1 was effectively a no-op verify-and-move-on. Documented as informational, not a deviation.

## Authentication Gates

None — filesystem-only operations and local Node runs.

## Deferred Issues

None.

## User Setup Required

None — `node scripts/validate-kb.cjs` is runnable immediately with no install/config.

## Next Phase Readiness

- **149-03 (knowledge-sync.ts)**: the validator is the contract the service must satisfy. Plan 03 can call `node scripts/validate-kb.cjs` after writing resources as a post-sync sanity check. The 16-field required list is pinned — no schema drift expected before 149-03 runs.
- **149-04 (kb-sync.cjs CLI)**: `--full-rebuild` can invoke the validator as its final step; exit 1 from the validator should bubble up as exit 1 from the CLI.
- **Future CI**: when `.github/workflows/` or equivalent is added, `node scripts/validate-kb.cjs` is a drop-in step with no install requirements.
- **Future AJV migration**: single-file upgrade path in `validate-kb.cjs`; schemas and tag-taxonomy already use standard JSON Schema constructs (`$ref`, `allOf`, `if`/`then`, enums), so AJV will consume them without changes.

## CatBot Oracle Note

Per CLAUDE.md "Protocolo de Testing: CatBot como Oráculo", Phase 149 creates infrastructure (not user-facing features). Schemas and validator are not consumed by CatBot yet — that is Fase 4 of the PRD (`get_kb_entry`/`search_kb` tools). No CatBot tool/skill update is required in this plan.

When the tools land (later phases), CatBot should be able to answer "What fields does a KB file need?" by reading `.docflow-kb/_schema/frontmatter.schema.json` via the future `get_kb_entry` path. The contract is now fixed and versioned in git.

## Self-Check: PASSED

**Files exist on disk:**

- `scripts/validate-kb.cjs` — FOUND (411 lines, executable)
- `.docflow-kb/_schema/frontmatter.schema.json` — FOUND (170 lines, valid JSON, 16 required)
- `.docflow-kb/_schema/tag-taxonomy.json` — FOUND (10 lines, valid JSON, 8 categories)
- `.docflow-kb/_schema/resource.schema.json` — FOUND (25 lines, valid JSON, 2 allOf entries)

**Commits exist in git history:**

- `551de43` (Task 1, pre-existing) — FOUND in `git log`
- `56fa4f3` (Task 2, new) — FOUND in `git log`

**Success criteria from plan:**

1. `frontmatter.schema.json` has 16 required fields ✓
2. `tag-taxonomy.json` has the 8 literal categories with PRD values ✓
3. `resource.schema.json` extends frontmatter via allOf+$ref, restricts subtype to 6 enum values ✓
4. Validator exits 0 on empty KB with `OK: N archivos validados` ✓
5. Validator rejects bad tag, deprecated-missing-fields, ttl-managed-missing-fields, non-semver version, no-frontmatter files, lang=es+en with string title/summary — all with clear messages and exit 1 ✓
6. Validator does NOT fail on the `.docflow-kb/_header.md` or `.docflow-kb/_manual.md` stubs (excluded by design) ✓

---
*Phase: 149-kb-foundation-bootstrap*
*Plan: 02*
*Completed: 2026-04-18*
