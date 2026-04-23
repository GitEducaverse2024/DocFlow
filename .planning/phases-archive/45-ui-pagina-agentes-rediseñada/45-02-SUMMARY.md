---
phase: 45-ui-pagina-agentes-rediseñada
plan: 02
subsystem: ui
tags: [agents, catpaw, wizard, detail, tabs, chat, sse, skills]
dependency_graph:
  requires: [cat-paws-api, catpaw-types, execute-catpaw, stream-utils]
  provides: [agents-wizard, agents-detail-page, catpaw-skills-api, catpaw-chat-api]
  affects: [agents-page, cat-paws-api]
tech_stack:
  added: []
  patterns: [sse-streaming-chat, 4-step-wizard, tabbed-detail, relation-link-dialogs]
key_files:
  created:
    - app/src/app/api/cat-paws/[id]/skills/route.ts
    - app/src/app/agents/new/page.tsx
    - app/src/app/agents/[id]/page.tsx
    - app/src/app/api/cat-paws/[id]/chat/route.ts
  modified:
    - app/src/components/process/process-panel.tsx
decisions:
  - Skills API uses INSERT OR IGNORE for idempotent linking (no UNIQUE conflict errors)
  - Chat route replicates executeCatPaw prompt assembly for streaming (executeCatPaw returns non-streaming only)
  - Custom tab bar instead of shadcn Tabs to match project zinc/violet style consistently
  - Chat/OpenClaw tabs conditionally hidden based on CatPaw mode (processor excluded)
metrics:
  duration: 651s
  completed: "2026-03-15T14:07:07Z"
---

# Phase 45 Plan 02: Wizard + Detail Page + Skills API + Chat SSE Summary

4-step creation wizard, 5-tab detail page with SSE streaming chat, skills CRUD API, and chat API endpoint for CatPaw agents.

## Tasks Completed

### Task 1: Skills API endpoint -- GET, POST, DELETE for cat_paw_skills
- **Commit:** a15774f
- Created `/api/cat-paws/[id]/skills/route.ts` (77 lines)
- GET lists skills with JOIN to skills table
- POST validates both paw and skill existence, INSERT OR IGNORE
- DELETE with 404 if skill not linked

### Task 2: 4-step creation wizard at /agents/new
- **Commit:** 65f94cf
- Created wizard page (719 lines) with horizontal stepper component
- Step 1 (Identidad): name, emoji, 6-color palette, departments, 3 mode cards, description
- Step 2 (Personalidad): system prompt, tone select, model, temperature slider, max tokens; processor fields conditional
- Step 3 (Skills): multi-select checklist fetched from /api/skills
- Step 4 (Conexiones): collapsible CatBrains/Conectores/Agentes sections with per-link config
- Submit creates CatPaw then sequentially links skills, catbrains, connectors, agents

### Task 3: Detail page /agents/[id] with 5 tabs + chat SSE endpoint
- **Commit:** 5614cb1
- Created detail page (960 lines) with 5 tabs
- **Identidad tab:** edit all fields, PATCH save, DELETE with confirm dialog
- **Conexiones tab:** link/unlink CatBrains, connectors, agents via dialogs with config fields
- **Skills tab:** list/add/remove skills via /api/cat-paws/[id]/skills
- **Chat tab:** SSE streaming with typing indicator, source badges, Enter-to-send
- **OpenClaw tab:** sync status display, re-sync button, Mission Control link
- Created chat API route (191 lines) with CatBrain context assembly and SSE streaming

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing lint errors in process-panel.tsx**
- **Found during:** Task 2
- **Issue:** Unused imports (CatPawWithCounts, Image, FileOutput) and unused variables (processorPaws, selectedProcessorId, selectedProcessor) caused build failure
- **Fix:** Added FileOutput to lucide imports, removed unused Image import, added eslint-disable-next-line comments for WIP variables
- **Files modified:** app/src/components/process/process-panel.tsx
- **Commit:** 65f94cf (included in Task 2 commit)

## Verification

- Build passes without errors (`next build` compiles successfully)
- Skills API route handles GET, POST, DELETE at /api/cat-paws/[id]/skills
- Wizard at /agents/new creates CatPaw with 4 guided steps including skills linking
- Detail page at /agents/[id] has 5 functional tabs
- Chat tab uses SSE streaming for real-time responses
- Chat and OpenClaw tabs hidden for processor-only mode
- All files exceed minimum line requirements (wizard 719 >= 200, detail 960 >= 300, chat 191 >= 40, skills 77 >= 30)

## Self-Check: PASSED

- FOUND: app/src/app/api/cat-paws/[id]/skills/route.ts
- FOUND: app/src/app/agents/new/page.tsx
- FOUND: app/src/app/agents/[id]/page.tsx
- FOUND: app/src/app/api/cat-paws/[id]/chat/route.ts
- FOUND: commit a15774f (Task 1)
- FOUND: commit 65f94cf (Task 2)
- FOUND: commit 5614cb1 (Task 3)
