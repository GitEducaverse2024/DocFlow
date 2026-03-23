---
phase: 76-docatflow-integration
plan: 01
subsystem: catbot
tags: [holded, mcp, tools, catbot, integration]
dependency_graph:
  requires: []
  provides: [holded-tools, catbot-holded-dispatch]
  affects: [catbot-tools, catbot-chat-route, catbot-sudo-tools]
tech_stack:
  added: []
  patterns: [json-rpc-2.0, mcp-tools-call, env-bracket-notation]
key_files:
  created:
    - app/src/lib/services/catbot-holded-tools.ts
  modified:
    - app/src/lib/services/catbot-tools.ts
    - app/src/app/api/catbot/chat/route.ts
    - app/src/lib/services/catbot-sudo-tools.ts
decisions:
  - Holded tools always allowed in getToolsForLLM filter (bypass allowedActions check)
  - Holded dispatch placed before sudo check in both streaming and non-streaming paths
  - findServerUrl env var lookup covers holded-mcp, seed-holded-mcp, linkedin-mcp, seed-linkedin-mcp
metrics:
  duration: 226s
  completed: "2026-03-23T17:07:27Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 76 Plan 01: CatBot Native Holded Tools Summary

10 native Holded tools registered in CatBot via JSON-RPC 2.0 MCP invocation, conditionally loaded when HOLDED_MCP_URL is set

## Tasks Completed

### Task 1: Create catbot-holded-tools.ts
- Created new file with 10 CatBotTool definitions: search_contact, contact_context, quick_invoice, list_invoices, list_leads, create_lead, list_projects, clock_in, clock_out, list_funnels
- `callHoldedMcp()` helper sends JSON-RPC 2.0 `tools/call` requests with 30s timeout
- `getHoldedTools()` returns empty array when HOLDED_MCP_URL not configured
- `isHoldedTool()` validates tool name prefix + existence in definitions
- `executeHoldedTool()` wraps MCP call with error handling and navigation action
- Results >8000 chars get truncated flag and user-friendly note
- **Commit:** 93c6d5e

### Task 2: Integrate Holded tools into CatBot system
- `catbot-tools.ts`: Added import of `getHoldedTools`, updated `getToolsForLLM` to merge Holded tools into allTools array, Holded tools bypass allowedActions filter
- `chat/route.ts`: Added `isHoldedTool`/`executeHoldedTool` import, added Holded dispatch block BEFORE sudo check in both streaming path (SSE) and non-streaming path (JSON response)
- `catbot-sudo-tools.ts`: Added env var lookup in `findServerUrl` for holded-mcp, seed-holded-mcp, linkedin-mcp, seed-linkedin-mcp before falling back to OpenClaw config
- **Commit:** 2034155

## Decisions Made

1. **Holded tools always allowed**: Unlike create_* tools that require specific allowedActions, Holded tools bypass the filter since they operate via external MCP (no local side effects)
2. **Dispatch order**: Holded check before sudo check prevents holded_* tools from being mistakenly treated as sudo tools
3. **Env var mapping in findServerUrl**: Both canonical names (holded-mcp) and seed names (seed-holded-mcp) map to the same env var for seamless connector integration

## Deviations from Plan

### Pre-existing Build Failure (Out of Scope)

**Found during:** Task 2 verification
**Issue:** `system-health-panel.tsx:144` has a TypeScript error (`Type 'unknown' is not assignable to type 'ReactNode'`) unrelated to this plan
**Action:** Logged to `deferred-items.md`. All 76-01 files compile cleanly via `tsc --noEmit`.

## Verification

- All 3 modified files + 1 new file compile without TypeScript errors
- `getHoldedTools()` returns 10 tools when HOLDED_MCP_URL is set, [] when not
- `isHoldedTool('holded_search_contact')` returns true
- Chat route dispatches holded_* tools to executeHoldedTool in both paths
- `findServerUrl('holded-mcp')` returns HOLDED_MCP_URL value
