---
phase: 133-foundation-tooling-found
plan: 01-baseline-knowledge
subsystem: catflow-pipeline-architect
tags: [canvas-rules, knowledge-tree, docker, tests, foundation]
requirements: [FOUND-01, FOUND-02, FOUND-03]
dependency_graph:
  requires:
    - app/data/knowledge/canvas-rules-index.md (QA2-01, Phase 132)
    - .planning/knowledge/canvas-nodes-catalog.md (source of truth)
  provides:
    - "canvas-nodes-catalog.md served from /app/data/knowledge/ at runtime"
    - "getCanvasRule('R10') returns long body ≥150 chars inside the container"
    - "VALID_NODE_TYPES gated by exact-set equality test (14 types)"
  affects:
    - app/src/lib/services/canvas-rules.ts
    - app/src/lib/services/canvas-flow-designer.ts (tests only)
    - app/docker-entrypoint.sh (verified, no change)
tech_stack:
  added: []
  patterns:
    - "Runtime-first path resolution (absolute /app/data/knowledge/… before cwd fallbacks)"
    - "Catalog seed = app/data/knowledge/ on host → Docker image data-seed/ → /app/data/knowledge volume at runtime"
key_files:
  created:
    - app/data/knowledge/canvas-nodes-catalog.md
  modified:
    - app/src/lib/services/canvas-rules.ts
    - app/src/lib/__tests__/canvas-rules.test.ts
    - app/src/lib/__tests__/canvas-flow-designer.test.ts
decisions:
  - "Host seed path is app/data/knowledge/, not app/data-seed/knowledge/ (data-seed only exists inside the Docker image via Dockerfile COPY)"
  - "R10 long-body threshold set to >150 chars (catalog 191, index fallback 88) for a clean gate"
metrics:
  duration_minutes: 3
  tasks: 2
  files_touched: 4
  tests_added: 2
  tests_total_after: 49
  completed_date: 2026-04-11
---

# Phase 133 Plan 01: Baseline Knowledge Summary

**One-liner:** Canvas rules catalog now seeds from `app/data/knowledge/`, gets baked into the Docker image and copied to the runtime volume at container boot, and `getCanvasRule('R10')` is gated by a catalog-read test so any regression to the index fallback fails loudly.

## What changed

### Task 1 — Seed the catalog and canonicalise the runtime path (commit `ce9b187`)
- Copied `.planning/knowledge/canvas-nodes-catalog.md` (32 KB, R01–R25 long form) to `app/data/knowledge/canvas-nodes-catalog.md`. This is the host seed source that `Dockerfile` line 56 bakes into `/app/data-seed/knowledge/` inside the image; `docker-entrypoint.sh` line 8 already copies `*.md` from `/app/data-seed/knowledge/` into the runtime volume `/app/data/knowledge/`. No entrypoint edit was needed — the copy plumbing was already in place from Phase 132, it just had no catalog to copy.
- Rewrote `resolveCatalogPath()` in `app/src/lib/services/canvas-rules.ts` to put `/app/data/knowledge/canvas-nodes-catalog.md` as the first absolute candidate (Docker runtime), then `cwd/data/knowledge/...` and `cwd/app/data/knowledge/...` for local dev / vitest, and kept the `.planning/knowledge/` paths as legacy fallback. Parse logic untouched; no tombstone comments.

### Task 2 — Strict tests gating FOUND-02 and FOUND-03 (commit `c43b1c6`)
- **FOUND-02 gate (`canvas-flow-designer.test.ts`):** Replaced the lax `.toContain + .length` assertion with exact-set equality: sorted `[...VALID_NODE_TYPES]` must deep-equal the sorted expected list of 14 types. Any rename / add / remove now breaks the test and forces an explicit update.
- **FOUND-03 gate (`canvas-rules.test.ts`):** Added a test that asserts `getCanvasRule('R10')` returns an object with `long.length > 150` AND contains the canonical anchor `'MISMO array JSON'`. This proves the resolver read `canvas-nodes-catalog.md` (R10 body ≈ 191 chars) instead of silently falling back to the `canvas-rules-index.md` short line (≈ 88 chars). If the catalog ever vanishes at runtime, the architect will see a short rule and this test will catch it.

## Verification

| Check | Result |
|---|---|
| `app/data/knowledge/canvas-nodes-catalog.md` exists with R01–R25 | OK (32019 bytes, 764 lines) |
| `canvas-rules.ts` has `/app/data/knowledge/canvas-nodes-catalog.md` as first path | OK |
| `docker-entrypoint.sh` copies `*.md` to `/app/data/knowledge/` | Already in place (line 8, Phase 132) |
| `vitest run canvas-rules canvas-flow-designer` | 49/49 green |
| `npm run build` | Clean (Next.js 14, no ESLint errors) |

Manual post-deploy check (outside this plan): `docker exec docflow-app ls /app/data/knowledge/canvas-nodes-catalog.md` should return the file once the next image is built and booted.

## Deviations from Plan

### 1. [Rule 3 — blocking] Host seed path differs from plan text

- **Found during:** Task 1 kickoff while reading `app/docker-entrypoint.sh` and `app/Dockerfile`.
- **Issue:** The plan targets `app/data-seed/knowledge/canvas-nodes-catalog.md` as the host file, but `app/data-seed/` does not exist on the host — `data-seed/knowledge` is only created inside the Docker image by `Dockerfile` line 56: `COPY --from=builder /app/data/knowledge ./data-seed/knowledge`. The real host seed source is `app/data/knowledge/`.
- **Fix:** Placed the catalog at `app/data/knowledge/canvas-nodes-catalog.md` (the authoritative host seed the Dockerfile reads). Added both `cwd/data/knowledge/...` (vitest from `app/`) and `cwd/app/data/knowledge/...` (scripts from repo root) to `candidatePaths` so local dev and tests resolve it too.
- **Impact:** Same runtime behaviour as the plan intended — the catalog still lands at `/app/data/knowledge/canvas-nodes-catalog.md` inside the container. No entrypoint change needed. Plan's "success criteria" satisfied.
- **Files modified:** `app/data/knowledge/canvas-nodes-catalog.md` (created), `app/src/lib/services/canvas-rules.ts`.
- **Commit:** `ce9b187`.

### 2. [Tuning — not a deviation] R10 body threshold adjusted

- Plan suggested `r.long.length > 200`. Actual R10 long body in the catalog (after whitespace normalisation) is **191 chars**. Dropped the threshold to `> 150`, which still cleanly gates against the ~88-char index short-form fallback. The test also anchors on the exact substring `'MISMO array JSON'` so content drift is caught regardless of length.

## Authentication gates

None — fully autonomous plan, no CLI/auth interaction.

## CatBot as Oracle (DocFlow protocol)

Evidence test reserved for the live deploy: when Phase 133 is verified end-to-end, ask CatBot:

> "Usa tu tool `query_knowledge` para leer la regla R10 del área catflow y cítame el texto completo."

Expected: CatBot returns the long-form body starting with "Si recibe JSON y devuelve JSON, la primera linea DEBE ser la regla anti-telefono-escacharrado...". If it returns the short index line (~88 chars), the runtime catalog copy failed and this plan regressed.

The knowledge JSON tree was NOT modified in this plan — the catalog is consumed internally by `canvas-rules.ts` (architect prompt expansion), not by `query_knowledge`. No new CatBot tool registration required.

## Self-Check: PASSED

Verified on disk:
- FOUND: `app/data/knowledge/canvas-nodes-catalog.md` (32019 bytes)
- FOUND: `app/src/lib/services/canvas-rules.ts` contains `/app/data/knowledge/canvas-nodes-catalog.md` as first candidate
- FOUND: `app/src/lib/__tests__/canvas-rules.test.ts` contains FOUND-03 gate test
- FOUND: `app/src/lib/__tests__/canvas-flow-designer.test.ts` contains exact-set equality check
- FOUND: commit `ce9b187` (feat 133-01 seed catalog)
- FOUND: commit `c43b1c6` (test 133-01 gate tests)
- FOUND: vitest run 49/49 passed
- FOUND: `npm run build` clean
