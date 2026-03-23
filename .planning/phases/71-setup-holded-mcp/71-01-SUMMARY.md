---
phase: 71
plan: 01
subsystem: holded-mcp
tags: [mcp, holded, fork, rebranding, http-transport]
dependency_graph:
  requires: []
  provides: [holded-mcp-repo, http-transport]
  affects: [71-02, 71-03, 71-04]
tech_stack:
  added: [express, StreamableHTTPServerTransport]
  patterns: [dual-transport-stdio-http, single-tenant-api-key]
key_files:
  created:
    - ~/holded-mcp/README.md
  modified:
    - ~/holded-mcp/package.json
    - ~/holded-mcp/src/index.ts
  deleted:
    - ~/holded-mcp/src/utils/tenant-config.ts
    - ~/holded-mcp/src/utils/tenant-context.ts
    - ~/holded-mcp/.github/
    - ~/holded-mcp/CONTRIBUTING.md
    - ~/holded-mcp/CHANGELOG.md
    - ~/holded-mcp/LICENSE
decisions:
  - Single API key via HOLDED_API_KEY env var (no multi-tenant)
  - HTTP transport on /mcp endpoint, port 8766 (configurable via PORT)
  - stdio remains default fallback when PORT not set
  - Node engine lowered to >=20.0.0 for Docker compatibility
metrics:
  duration: 170s
  completed: "2026-03-23"
  tasks: 3
  files_changed: 8
---

# Phase 71 Plan 01: Fork + Setup del Repositorio Summary

Fork of iamsamuelfraga/mcp-holded rebranded to @docatflow/holded-mcp with multi-tenant removal and dual HTTP/stdio transport on port 8766.

## Task Results

| Task | Name | Status | Commit | Key Changes |
|------|------|--------|--------|-------------|
| 1 | Clone and rebrand repository | DONE | 21723e5 | Rebranded to @docatflow/holded-mcp, removed attribution files, cleaned devDeps |
| 2 | Remove multi-tenant, simplify index.ts | DONE | 5a6901e | Deleted tenant-config.ts/tenant-context.ts, single API key from env |
| 3 | Add HTTP transport | DONE | 4b76dbb | StreamableHTTPServerTransport on /mcp, express, stdio fallback |
| - | Cleanup leftover configs | DONE | 3836be2 | Removed .husky, .prettierrc, .releaserc.json |

## Verification Results

- [x] Repo cloned in ~/holded-mcp/ with complete rebrand
- [x] No multi-tenant files (tenant-config.ts, tenant-context.ts deleted)
- [x] `npm run build` passes without errors
- [x] src/index.ts has HTTP transport on /mcp port 8766
- [x] stdio transport maintained as fallback
- [x] `grep -r "iamsamuelfraga" src/` returns empty

## Decisions Made

1. **Single API key approach**: Removed all multi-tenant complexity. HOLDED_API_KEY is the only env var needed for auth.
2. **Dual transport**: HTTP via express + StreamableHTTPServerTransport when PORT is set or --http flag passed; stdio otherwise.
3. **Node engine >=20**: Lowered from >=22.14.0 for Docker node:20-slim compatibility.
4. **Kept rate limiter**: Retained per-tool rate limiting as it provides value for API protection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing cleanup] Removed leftover config files**
- **Found during:** Post-task review
- **Issue:** .husky/, .prettierrc, .prettierignore, .releaserc.json remained after Task 1
- **Fix:** Deleted all leftover config files in separate commit
- **Commit:** 3836be2

## Self-Check: PASSED

- SUMMARY.md exists
- holded-mcp repo exists with built dist/index.js
- All 4 commits verified: 21723e5, 5a6901e, 4b76dbb, 3836be2
