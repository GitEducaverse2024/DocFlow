---
phase: 76-docatflow-integration
plan: 02
subsystem: mcp-connector-execution
tags: [mcp, canvas, catbrain, connector, json-rpc]
dependency_graph:
  requires: []
  provides: [dynamic-mcp-tool-invocation]
  affects: [canvas-executor, catbrain-connector-executor]
tech_stack:
  patterns: [json-rpc-2.0, mcp-tools-call, fallback-defaults]
key_files:
  modified:
    - app/src/lib/services/catbrain-connector-executor.ts
    - app/src/lib/services/canvas-executor.ts
decisions:
  - "Default tool_name to search_knowledge for backward compatibility"
  - "Canvas MCP nodes return tool result as output (not pass-through like gmail)"
  - "Use Date.now() for JSON-RPC id to avoid collisions"
metrics:
  duration: 63s
  completed: "2026-03-23"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 76 Plan 02: Generalize MCP Connector Execution Summary

Dynamic MCP tool invocation via config.tool_name in both CatBrain and Canvas executors, replacing hardcoded search_knowledge.

## What Was Done

### Task 1: Generalize catbrain-connector-executor.ts MCP case
- Replaced hardcoded `search_knowledge` with `config.tool_name || 'search_knowledge'`
- Added `config.tool_args` support, merged with query
- Changed JSON-RPC id from hardcoded `1` to `Date.now()`
- **Commit:** 00cd43f

### Task 2: Add MCP-specific handling in canvas-executor.ts
- Added dedicated MCP server block before generic POST fallback
- Reads tool_name from node data or connector config (with search_knowledge default)
- Passes predecessor output as `query` argument to MCP tool
- Supports additional `tool_args` from node data
- Extracts text content from MCP response and returns as node output
- Error handling with logging and graceful fallback to predecessorOutput
- Non-MCP connectors fall through to existing generic POST logic
- **Commit:** 00cd43f

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- npm run build: PASS (no errors)
- Backward compatibility: search_knowledge default preserved in both files
- Canvas MCP nodes return tool results (not pass-through)
