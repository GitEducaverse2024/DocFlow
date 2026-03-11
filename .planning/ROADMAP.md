# Roadmap: DocFlow v3.0

**Milestone:** Conectores + Dashboard de Operaciones
**Phases:** 6 (phases 9-14, continuing from v2.0)
**Requirements:** 48 active

---

## Phase 9: Data Model (Connectors, Logs, Usage)

**Goal:** Create the SQLite tables (connectors, connector_logs, usage_logs, agent_connector_access) and TypeScript interfaces.

**Requirements:** CDATA-01, CDATA-02, CDATA-03, CDATA-04, CDATA-05

**What changes:**
- Add 4 tables to `db.ts` using existing CREATE TABLE IF NOT EXISTS pattern
- Add TypeScript interfaces to `types.ts`
- Seed default model pricing in settings table
- Add `connector_config` column to `task_steps` table (ALTER TABLE)

**Success criteria:**
1. Tables created on app startup without errors
2. TypeScript types compile correctly
3. Default model pricing seeded in settings
4. `npm run build` passes

**Estimated complexity:** Low — schema + types, no logic

---

## Phase 10: Connectors API CRUD

**Goal:** Full REST API for connectors management including CRUD, test, logs, and agent access filtering.

**Requirements:** CAPI-01, CAPI-02, CAPI-03, CAPI-04, CAPI-05, CAPI-06, CAPI-07, CAPI-08

**What changes:**
- `app/src/app/api/connectors/route.ts` — GET (list), POST (create, max 20)
- `app/src/app/api/connectors/[id]/route.ts` — GET (detail), PATCH (update), DELETE
- `app/src/app/api/connectors/[id]/test/route.ts` — POST (test by type)
- `app/src/app/api/connectors/[id]/logs/route.ts` — GET (last 50 logs)
- `app/src/app/api/connectors/for-agent/[agentId]/route.ts` — GET (filtered by access)

**Success criteria:**
1. All 8 connector API endpoints respond correctly
2. Max 20 connectors validation works
3. Test endpoint handles all 4 connector types
4. Logs return last 50 entries with proper fields
5. Agent filtering respects agent_connector_access
6. `npm run build` passes

**Estimated complexity:** Medium — 5 route files, test logic per connector type

---

## Phase 11: Connectors UI Page

**Goal:** The /connectors page with connector cards, create/edit sheet, test, logs dialog, and sidebar entry.

**Requirements:** CUI-01, CUI-02, CUI-03, CUI-04, CUI-05, CUI-06, CUI-07

**What changes:**
- `app/src/components/layout/sidebar.tsx` — Add "Conectores" with Plug icon
- `app/src/app/connectors/page.tsx` — Connectors page with type cards, list, create/edit sheet, logs dialog, suggested templates

**Success criteria:**
1. "Conectores" appears in sidebar between Tareas and Configuracion
2. Page shows 4 type cards, configured connectors list, and unconfigured sections
3. Create/edit sheet shows dynamic fields per connector type
4. Test button works and shows result
5. Logs dialog shows last 50 invocations
6. 3 n8n suggested templates pre-fill config
7. `npm run build` passes

**Estimated complexity:** Medium-High — dynamic forms per connector type, multiple dialogs

---

## Phase 12: Pipeline Connector Integration + Agent Access

**Goal:** Enable connectors in task pipelines (before/after step execution) and manage agent-connector access.

**Requirements:** CPIPE-01, CPIPE-02, CPIPE-03, CPIPE-04, CPIPE-05, CPIPE-06, CACCESS-01, CACCESS-02, CACCESS-03

**What changes:**
- `app/src/lib/services/task-executor.ts` — Add connector execution before/after agent steps
- `app/src/app/tasks/new/page.tsx` — Add connector selection in pipeline step editor
- `app/src/app/agents/page.tsx` — Add connector access checkboxes in agent edit sheet
- New service function for executing connector calls (fetch with timeout, type-specific logic)

**Success criteria:**
1. Connectors execute before/after agent steps based on mode
2. Connector responses added to context (before mode)
3. Output sent to connectors (after mode)
4. Connector invocations logged in connector_logs
5. Agent edit shows connector access checkboxes
6. Wizard filters connectors by agent access
7. `npm run build` passes

**Estimated complexity:** High — execution logic, UI updates in 3 files

---

## Phase 13: Usage Tracking + Cost Settings

**Goal:** Instrument all LLM endpoints to log usage (tokens, costs, duration) and add cost configuration to settings.

**Requirements:** USAGE-01..08, COST-01, COST-02, COST-03

**What changes:**
- New helper: `app/src/lib/services/usage-tracker.ts` — logUsage() function for background inserts
- Modify 6 endpoints to call logUsage after LLM operations
- `app/src/app/settings/page.tsx` — Add "Costes de modelos" section with editable pricing table
- `app/src/app/api/settings/route.ts` — Support model_pricing key

**Success criteria:**
1. All 6 event types log to usage_logs correctly
2. Token counts extracted from LLM responses
3. Cost estimated using stored model pricing
4. Settings page shows editable pricing table
5. Default pricing seeded on first run
6. Background insert doesn't block API response
7. `npm run build` passes

**Estimated complexity:** Medium — instrumentation across multiple files, settings UI

---

## Phase 14: Dashboard de Operaciones

**Goal:** Replace the basic dashboard with a full operations center showing metrics, charts, activity, and system status.

**Requirements:** DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, DASH-07, DASH-08

**What changes:**
- Install `recharts` dependency
- `app/src/app/api/dashboard/summary/route.ts` — Summary endpoint
- `app/src/app/api/dashboard/usage/route.ts` — Token usage by day/provider
- `app/src/app/api/dashboard/activity/route.ts` — Recent activity feed
- `app/src/app/api/dashboard/top-agents/route.ts` — Top agents
- `app/src/app/api/dashboard/top-models/route.ts` — Top models
- `app/src/app/api/dashboard/storage/route.ts` — Storage usage
- `app/src/app/page.tsx` — Rewrite dashboard with all sections

**Success criteria:**
1. All 6 dashboard API endpoints return correct data
2. Dashboard shows summary cards with live counts
3. Token usage chart renders with recharts (bars by day, colored by provider)
4. Activity feed shows recent events as timeline
5. Top agents and models sections populated
6. Storage section shows project/Qdrant/Ollama sizes
7. Recent projects and running tasks sections work
8. `npm run build` passes

**Estimated complexity:** High — install dependency, 6 API endpoints, complex dashboard UI with charts

---

## Summary

| # | Phase | Goal | Requirements | Criteria |
|---|-------|------|--------------|----------|
| 9 | Data Model | SQLite tables + types | CDATA-01..05 | 4 |
| 10 | Connectors API | Full REST API (COMPLETE) | CAPI-01..08 | 6 |
| 11 | Connectors UI | /connectors page + sidebar (COMPLETE) | CUI-01..07 | 7 |
| 12 | Pipeline Integration | Connector execution + agent access | CPIPE-01..06, CACCESS-01..03 | 7 |
| 13 | Usage Tracking + Costs | Instrument endpoints + settings | USAGE-01..08, COST-01..03 | 7 |
| 14 | Dashboard | Operations center with charts | DASH-01..08 | 8 |

**Total:** 6 phases | 48 requirements mapped | 0 unmapped

**Dependency chain:**
```
Phase 9 (Data) → Phase 10 (API) → Phase 11 (UI)
                        ↓
Phase 9 (Data) → Phase 12 (Pipeline Integration)
                        ↓
Phase 9 (Data) → Phase 13 (Usage + Costs) → Phase 14 (Dashboard)
```

Phases 10 and 12 can run after 9. Phase 11 depends on 10. Phase 14 depends on 13.

---
*Roadmap created: 2026-03-11*
