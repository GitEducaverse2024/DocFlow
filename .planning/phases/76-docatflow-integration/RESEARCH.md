# Phase 76 Research: Integración DoCatFlow — CatBot + Canvas + Sistema + Tests

## Phase Goal
El MCP Holded es accesible desde CatBot, Canvas y la página de Sistema. Tests E2E/API cubren la integración.

## Current State (from Phase 71-04)

### Already Implemented
| Component | File | Status |
|-----------|------|--------|
| Seed connector `seed-holded-mcp` | `lib/db.ts:1345-1378` | ✅ Done (6 tools only, inactive) |
| Health check `HOLDED_MCP_URL` | `app/api/health/route.ts:69-137` | ✅ Done (POST initialize + /health) |
| System panel card | `components/system/system-health-panel.tsx:122-151` | ✅ Done |
| Footer status dot | `components/layout/footer.tsx:16` | ✅ Done |
| CatBot FEATURE_KNOWLEDGE | `lib/services/catbot-tools.ts:278` | ✅ Done (describes Holded) |
| HoldedMcpStatus type | `hooks/use-system-health.ts` | ✅ Done |

### Gaps to Close
| Gap | Impact | Priority |
|-----|--------|----------|
| CatBot cannot invoke Holded tools | CatBot only explains Holded, can't act | CRITICAL |
| Canvas MCP executor hardcodes `search_knowledge` | Canvas can't run Holded tools | CRITICAL |
| Seed connector lists only 6/70+ tools | Tool discovery incomplete | HIGH |
| mcp_bridge sudo tool may be incomplete | Advanced users can't discover all tools | MEDIUM |
| No tests for integration | No regression safety | HIGH |

## Architecture Analysis

### CatBot Tool System
- **Regular tools** (`catbot-tools.ts`): 18 tools — no auth required, basic operations
- **Sudo tools** (`catbot-sudo-tools.ts`): 5 tools — require auth token, elevated operations
- **mcp_bridge** (sudo): Can list_servers, discover_tools, invoke_tool across MCP servers
- **Chat API** (`app/api/catbot/chat/route.ts`): Streams LLM responses, executes tool_calls in loop (max 5 iterations)
- **System prompt**: Built dynamically with context (current page, project, stats)

### Canvas Connector Execution
- **Connector node type**: One of 11 node types in canvas palette
- **Executor** (`catbrain-connector-executor.ts:168-194`): MCP case sends JSON-RPC `tools/call`
- **Current MCP handling**: Hardcoded to `search_knowledge` tool — MUST be generalized
- **Connector config**: `{ url, name, tools[] }` stored in JSON

### Holded MCP Server (~/holded-mcp/)
- **Transport**: HTTP (Express) on port 8766 with /mcp and /health endpoints
- **Protocol**: MCP 2024-11-05 (JSON-RPC 2.0)
- **Total tools**: ~70 across 4 modules
- **Modules**: Invoicing (contacts, documents, products, services, treasuries, etc.), CRM (funnels, leads, events), Projects (CRUD, tasks, time tracking), Team (employees, timesheets/clock)
- **Rate limiting**: Per-tool (read: 200/min, write: 20/min, delete: 10/min)
- **Composite tools**: holded_quick_invoice, holded_contact_context, holded_invoice_summary, holded_weekly_timesheet_summary

### Health Check System
- `GET /api/health` — checks all services, 30s cache, `?fresh=1` for bypass
- Holded check: POST initialize to MCP URL + GET /health endpoint
- Returns: status, latency_ms, tools_count, configured flag
- `useSystemHealth()` hook: polls 30s (system page) or 60s (footer)

## Integration Design Decisions

### CatBot: Native Tools vs mcp_bridge
**Decision: Hybrid approach**
- Add ~10 high-value native tools to regular TOOLS array (no sudo needed)
- These wrap HTTP calls to Holded MCP server
- Full tool access remains via mcp_bridge (sudo) for power users
- Native tools focus on daily operations: contacts, invoices, leads, clock in/out

### Canvas: Dynamic MCP Invocation
**Decision: Generalize connector executor + config-driven tool name**
- Fix catbrain-connector-executor.ts to read tool name from connector config
- Connector node config adds `tool_name` and `tool_args_template` fields
- Tool name can be static (from config) or dynamic (from previous node output)

### Seed Connector: Full Catalog
**Decision: Update seed with all tool names + descriptions**
- Replace 6-tool list with complete catalog (~70 tools)
- Group by module for readability
- Keep is_active = 0 (manual activation)

## Test Strategy

### E2E UI Tests (Playwright)
- System page: Holded card visible when configured, status indicator
- CatBot: Send Holded-related message, verify tool invocation display
- Connectors page: Holded MCP connector visible, test button works

### API Tests (Playwright request)
- `/api/health`: Verify holded_mcp field in response
- `/api/catbot/chat`: Tool calls with Holded tools
- Canvas execute: Connector node with MCP server type

### Unit Tests (Vitest)
- CatBot tool handlers: mock fetch to Holded MCP
- Canvas executor: MCP server case with dynamic tool name

## Key Files

### Must Modify
- `lib/services/catbot-tools.ts` — Add Holded native tools
- `lib/services/catbrain-connector-executor.ts` — Fix MCP dynamic invocation
- `lib/db.ts` — Update seed connector tool catalog
- `components/system/system-health-panel.tsx` — Show tools_count, enhance card
- `lib/services/catbot-sudo-tools.ts` — Verify/complete mcp_bridge

### Must Create
- `lib/services/catbot-holded-tools.ts` — Holded tool definitions for CatBot
- `e2e/specs/holded-integration.spec.ts` — E2E UI tests
- `e2e/api/holded-integration.api.spec.ts` — API tests
- `src/lib/services/__tests__/catbot-holded-tools.test.ts` — Unit tests

### Reference (read-only)
- `app/api/catbot/chat/route.ts` — Chat flow understanding
- `components/canvas/canvas-editor.tsx` — Node palette
- `lib/services/canvas-executor.ts` — Execution flow
- `hooks/use-system-health.ts` — Health polling
- `components/layout/footer.tsx` — Footer status

## Plan Breakdown (5 Plans)

| Plan | Title | Wave | Depends |
|------|-------|------|---------|
| 76-01 | CatBot Native Holded Tools | 1 | — |
| 76-02 | Canvas MCP Dynamic Executor + Connector Config | 1 | — |
| 76-03 | System UI Enhancement + Connector Seed Update | 1 | — |
| 76-04 | E2E + API + Unit Tests | 2 | 01, 02, 03 |
| 76-05 | CatBot Knowledge Update + In-App Guide | 2 | 01 |

---
*Researched: 2026-03-23*
