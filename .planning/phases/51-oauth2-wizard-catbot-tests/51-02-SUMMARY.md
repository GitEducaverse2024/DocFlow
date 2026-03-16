---
phase: 51-oauth2-wizard-catbot-tests
plan: 02
subsystem: catbot
tags: [catbot, gmail, email, tools]
dependency_graph:
  requires: [connectors-table, connectors-invoke-endpoint]
  provides: [catbot-email-tools, catbot-email-prompt]
  affects: [catbot-chat-route, catbot-tools]
tech_stack:
  added: []
  patterns: [catbot-tool-definition, catbot-executeTool-switch, system-prompt-behavioral-section]
key_files:
  created: []
  modified:
    - app/src/lib/services/catbot-tools.ts
    - app/src/app/api/catbot/chat/route.ts
decisions:
  - send_email gated by send_emails permission in getToolsForLLM filter
  - LIKE fallback search for connector name matching (fuzzy)
metrics:
  duration: 114s
  completed: "2026-03-16T20:39:00Z"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 51 Plan 02: CatBot Email Tools Summary

Two new CatBot tools (list_email_connectors, send_email) with system prompt enforcement of confirmation-before-send workflow.

## Tasks Completed

### Task 1: Add send_email and list_email_connectors tools to catbot-tools.ts
- **Commit:** bcb290b
- **Files:** app/src/lib/services/catbot-tools.ts
- Added `list_email_connectors` tool definition and executeTool case (queries active Gmail connectors)
- Added `send_email` tool definition and executeTool case (finds connector by exact/LIKE name, calls invoke endpoint)
- Added `send_email` to `getToolsForLLM` filter with `send_emails` permission gate

### Task 2: Update CatBot system prompt with email capabilities
- **Commit:** 9aefffd
- **Files:** app/src/app/api/catbot/chat/route.ts
- Added "Email via Gmail" line to DoCatFlow sections description
- Added "Envio de Email" behavioral section enforcing: list connectors -> confirm with user -> send

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added send_email to getToolsForLLM filter**
- **Found during:** Task 1
- **Issue:** send_email would be filtered out when allowedActions is set, making the feature inaccessible
- **Fix:** Added send_emails permission check and empty-allowedActions fallback
- **Files modified:** app/src/lib/services/catbot-tools.ts
- **Commit:** bcb290b

## Verification

- TypeScript compiles with zero errors (both tasks verified)
- TOOLS array contains both send_email and list_email_connectors entries
- executeTool switch handles both new cases
- System prompt mentions email and requires confirmation before sending

## Self-Check: PASSED
