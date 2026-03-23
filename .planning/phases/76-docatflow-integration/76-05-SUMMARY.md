---
phase: 76-docatflow-integration
plan: 05
subsystem: catbot
tags: [holded, catbot, system-prompt, feature-knowledge]
dependency_graph:
  requires: [76-01]
  provides: [catbot-holded-discoverability]
  affects: [catbot-chat-route, catbot-tools]
tech_stack:
  added: []
  patterns: [conditional-system-prompt, dynamic-tool-listing]
key_files:
  created: []
  modified:
    - app/src/lib/services/catbot-tools.ts
    - app/src/app/api/catbot/chat/route.ts
decisions:
  - "Holded tools listed in system prompt only when getHoldedTools() returns non-empty (HOLDED_MCP_URL set)"
  - "FEATURE_KNOWLEDGE uses Spanish examples with tool names in parentheses for discoverability"
metrics:
  duration: "~1m"
  completed: "2026-03-23"
---

# Phase 76 Plan 05: CatBot Knowledge + System Prompt for Holded Summary

Actionable Holded tool names in FEATURE_KNOWLEDGE and conditional system prompt section listing all available Holded tools with descriptions.

## What Was Done

### Task 1: Update FEATURE_KNOWLEDGE with actionable Holded tool descriptions
- **Commit:** f40a20d
- Replaced generic Holded connector description with categorized tool examples
- Categories: Contactos, Facturas, CRM, Proyectos, Fichaje
- Each category includes Spanish user-facing examples with tool names (holded_search_contact, holded_quick_invoice, holded_clock_in, etc.)
- Mentions sudo + mcp_bridge for advanced access to ~60 tools

### Task 2: Add Holded tools section to CatBot system prompt
- **Commit:** ab4e065
- Added `getHoldedTools` import to chat route (alongside existing isHoldedTool, executeHoldedTool)
- Added conditional `holdedSection` computation in buildSystemPrompt
- When getHoldedTools() returns tools: lists each tool with name and description
- When HOLDED_MCP_URL not configured: section is empty string (no prompt pollution)
- Includes note suggesting user check /system if service fails

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- npm run build: PASSED
- FEATURE_KNOWLEDGE contains holded_search_contact, holded_quick_invoice, holded_clock_in: VERIFIED (grep count = 3)
- System prompt conditionally includes Holded section: VERIFIED (code review)
