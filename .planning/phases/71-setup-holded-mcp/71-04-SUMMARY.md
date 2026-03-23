---
phase: 71
plan: 04
title: "Seed Conector + Health Check + UI en DoCatFlow"
subsystem: docatflow-integration
tags: [holded, mcp, health-check, ui, seed, catbot]
dependency_graph:
  requires: []
  provides: [holded-mcp-connector-seed, holded-health-check, holded-ui-integration]
  affects: [system-health-panel, footer, catbot-knowledge]
tech_stack:
  added: []
  patterns: [mcp-health-check, connector-seed, feature-knowledge]
key_files:
  created: []
  modified:
    - app/src/lib/db.ts
    - app/src/hooks/use-system-health.ts
    - app/src/app/api/health/route.ts
    - app/src/components/system/system-health-panel.tsx
    - app/src/components/layout/footer.tsx
    - app/src/lib/services/catbot-tools.ts
decisions:
  - "Holded MCP seed uses is_active=0 (inactive by default, user activates after verifying service)"
  - "Health check uses POST initialize (same MCP protocol pattern as LinkedIn)"
  - "Port 8766 shown in health panel card"
metrics:
  duration: "3m"
  completed: "2026-03-23"
  tasks_completed: 3
  tasks_total: 3
---

# Phase 71 Plan 04: Seed Conector + Health Check + UI en DoCatFlow Summary

Holded MCP connector fully integrated into DoCatFlow: DB seed, API health check, system panel card, footer dot, and CatBot knowledge entry -- following the established LinkedIn MCP pattern.

## Tasks Completed

### Task 1: Seed conector + tipos de health (d6d9987)

- Added `seed-holded-mcp` connector seed in `db.ts` with `is_active=0` (inactive by default)
- Config includes 6 tools: list_contacts, get_contact, list_documents, get_document, list_products, get_product
- Added `HoldedMcpStatus` interface and `holded_mcp?` field to `SystemHealth` in `use-system-health.ts`
- All env vars use bracket notation: `process['env']['HOLDED_MCP_URL']`

### Task 2: Health check en API route (3c8c025)

- Added `HOLDED_MCP_URL` env var read in health route
- Added Holded MCP check to Promise.allSettled array (8th element)
- POST initialize with MCP protocol (jsonrpc 2.0, protocolVersion 2024-11-05)
- Conditional spread in response object (only when env var configured)

### Task 3: UI -- tarjeta, footer, CatBot knowledge (e3a54d8)

- Added Holded MCP card in system-health-panel.tsx (conditional on `configured`)
- Added Holded MCP dot in footer.tsx (before SearXNG)
- Added 'holded' entry in FEATURE_KNOWLEDGE in catbot-tools.ts

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- `npm run build` passes without errors
- All grep checks pass for seed, types, health check, panel, footer, and catbot knowledge

## Self-Check: PASSED
