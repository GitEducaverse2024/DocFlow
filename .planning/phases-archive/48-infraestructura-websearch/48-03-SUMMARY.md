---
phase: 48-infraestructura-websearch
plan: 03
subsystem: websearch
tags: [searxng, health-check, system-ui, footer, catbot]
dependency_graph:
  requires: [health-endpoint, system-health-panel, footer, catbot-tools]
  provides: [searxng-health-monitoring, searxng-ui-card, searxng-catbot-knowledge]
  affects: [phase-49-websearch-catbrain]
tech_stack:
  added: []
  patterns: [conditional-service-card, health-check-probe, bracket-env-notation]
key_files:
  created: []
  modified:
    - app/src/app/api/health/route.ts
    - app/src/hooks/use-system-health.ts
    - app/src/components/system/system-health-panel.tsx
    - app/src/components/system/diagnostic-content.ts
    - app/src/components/layout/footer.tsx
    - app/src/lib/services/catbot-tools.ts
decisions:
  - "Used /search?q=test&format=json as health probe (validates both HTTP and JSON API)"
  - "3s timeout for SearXNG (matches LinkedIn MCP, faster than 5s core services)"
  - "Violet color theme for SearXNG card (bg-violet-500/10, text-violet-400)"
metrics:
  duration: 159s
  completed: "2026-03-16T18:04:43Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 48 Plan 03: SearXNG Health Check + System UI Summary

SearXNG monitoring across health endpoint, /system page card (violet + Search icon), footer dot, CatBot knowledge, and diagnostic steps -- all conditional on SEARXNG_URL.

## Commits

| Task | Commit  | Description                                              |
| ---- | ------- | -------------------------------------------------------- |
| 1    | 9d9e629 | SearXNG health check in /api/health                      |
| 2    | 4a3ce8a | SearXNG card, footer dot, types, CatBot, diagnostics     |

## Task Details

### Task 1: Add SearXNG health check to /api/health
- Added `SEARXNG_URL` env var read with bracket notation
- New entry in `Promise.allSettled` array with 3s timeout
- Probe: `GET /search?q=test&format=json` -- validates JSON API is active
- Returns `configured: true` + `result_count` on success
- Conditional spread in data object (same pattern as LinkedIn MCP)

### Task 2: SearXNG card + footer dot + types + CatBot + diagnostics
- **use-system-health.ts**: New `SearxngStatus` interface with `result_count` field; added `searxng?` to `SystemHealth`
- **system-health-panel.tsx**: Violet card with `Search` lucide icon, online/offline badge, latency + port display, offline hint command
- **footer.tsx**: Conditional SearXNG dot after LinkedIn MCP dot
- **diagnostic-content.ts**: 5 troubleshooting steps (docker ps, compose up, port check, curl test, env check)
- **catbot-tools.ts**: Two FEATURE_KNOWLEDGE entries: `searxng` (metabuscador details) and `websearch` (dual-engine overview)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Build passes (`npx next build` -- no TypeScript errors)
- All grep checks pass for required patterns in all 6 files
