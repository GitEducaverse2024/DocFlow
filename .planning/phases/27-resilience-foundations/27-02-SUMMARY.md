---
phase: 27-resilience-foundations
plan: 02
subsystem: api
tags: [retry, cache, resilience, qdrant, ollama, litellm, openclaw, dashboard, health, settings]

# Dependency graph
requires:
  - phase: 27-01
    provides: withRetry utility (retry.ts) and cacheGet/cacheSet/cacheInvalidate (cache.ts) built in plan 01
provides:
  - All Qdrant service calls wrapped with withRetry (6 functions)
  - All Ollama service calls wrapped with withRetry (healthCheck + getEmbedding)
  - All LiteLLM service calls wrapped with withRetry (healthCheck + getEmbeddings)
  - OpenClaw fetch calls in agents/route.ts wrapped with withRetry (2 calls)
  - tryReloadGateway in agents/create/route.ts wrapped with withRetry
  - TTL caching on 11 GET API routes (agents, 6 dashboard, health, 3 settings)
  - Cache invalidation on agent creation and settings mutations
affects: [28-playwright-foundation, testing, any future phases that call qdrant/ollama/litellm]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "withRetry wraps idempotent external calls — healthCheck pattern: retry then outer try/catch returns false"
    - "cacheGet at top of GET handler before any logic; cacheSet on success path only, never on error"
    - "Cache keys: simple for fixed endpoints ('agents', 'health'), parameterized for variable endpoints ('dashboard:activity:10')"
    - "Mutation handlers (POST/PATCH/DELETE) call cacheInvalidate before success return"

key-files:
  created: []
  modified:
    - app/src/lib/services/qdrant.ts
    - app/src/lib/services/ollama.ts
    - app/src/lib/services/litellm.ts
    - app/src/app/api/agents/route.ts
    - app/src/app/api/agents/create/route.ts
    - app/src/app/api/dashboard/summary/route.ts
    - app/src/app/api/dashboard/activity/route.ts
    - app/src/app/api/dashboard/usage/route.ts
    - app/src/app/api/dashboard/top-agents/route.ts
    - app/src/app/api/dashboard/top-models/route.ts
    - app/src/app/api/dashboard/storage/route.ts
    - app/src/app/api/health/route.ts
    - app/src/app/api/settings/api-keys/route.ts
    - app/src/app/api/settings/api-keys/[provider]/route.ts
    - app/src/app/api/settings/models/route.ts
    - app/src/app/api/settings/processing/route.ts

key-decisions:
  - "Activity and usage/top-agents/top-models dashboard routes use parameterized cache keys (per limit/days) to avoid stale data when query params differ"
  - "LLM generation calls (chatCompletion, catbot chat, process routes) deliberately NOT wrapped — non-idempotent and would break token streaming"
  - "Cache invalidation for settings:api-keys triggered from [provider]/route.ts PATCH and DELETE, not from the read route"

patterns-established:
  - "withRetry healthCheck: wrap fetch in withRetry, outer try/catch returns false — retries transient failures before giving up"
  - "withRetry normal calls: entire fetch+validation logic in callback, existing error propagation preserved"
  - "Cache TTLs: 30s for agents/health (volatile), 60s for dashboard (aggregate), 300s for settings (stable config)"

requirements-completed: [RESIL-02, RESIL-03]

# Metrics
duration: 5min
completed: 2026-03-12
---

# Phase 27 Plan 02: Resilience Foundations — Retry + Cache Summary

**withRetry applied to 11 idempotent external service calls (Qdrant 6, Ollama 2, LiteLLM 2, OpenClaw 3) and TTL caching added to all 11 cacheable GET API routes**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-12T20:57:08Z
- **Completed:** 2026-03-12T21:01:25Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- All 6 Qdrant functions (healthCheck, createCollection, deleteCollection, getCollectionInfo, upsertPoints, search) wrapped with withRetry
- Ollama (healthCheck, getEmbedding) and LiteLLM (healthCheck, getEmbeddings) wrapped with withRetry
- OpenClaw fetch calls in agents GET and agents/create POST wrapped with withRetry
- All 11 GET routes now check cache before executing and cache successful responses with appropriate TTLs
- Mutation handlers (agents/create POST, api-keys PATCH/DELETE, processing PATCH) invalidate relevant cache keys
- No LLM generation calls were wrapped — idempotency constraint enforced

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap service modules with withRetry** - `0446b57` (feat)
2. **Task 2: Add TTL cache to all cacheable GET API routes** - `d01953b` (feat)

**Plan metadata:** (to be added in final commit)

## Files Created/Modified

- `app/src/lib/services/qdrant.ts` - All 6 functions wrapped with withRetry
- `app/src/lib/services/ollama.ts` - healthCheck and getEmbedding wrapped
- `app/src/lib/services/litellm.ts` - healthCheck and getEmbeddings wrapped
- `app/src/app/api/agents/route.ts` - withRetry on both OpenClaw fetches + 30s cache on GET
- `app/src/app/api/agents/create/route.ts` - withRetry on tryReloadGateway + invalidates 'agents' cache
- `app/src/app/api/dashboard/summary/route.ts` - 60s TTL cache
- `app/src/app/api/dashboard/activity/route.ts` - 60s TTL cache (per-limit key)
- `app/src/app/api/dashboard/usage/route.ts` - 60s TTL cache (per-days key)
- `app/src/app/api/dashboard/top-agents/route.ts` - 60s TTL cache (per-limit key)
- `app/src/app/api/dashboard/top-models/route.ts` - 60s TTL cache (per-limit key)
- `app/src/app/api/dashboard/storage/route.ts` - 60s TTL cache
- `app/src/app/api/health/route.ts` - 30s TTL cache
- `app/src/app/api/settings/api-keys/route.ts` - 5min TTL cache
- `app/src/app/api/settings/api-keys/[provider]/route.ts` - PATCH+DELETE invalidate 'settings:api-keys'
- `app/src/app/api/settings/models/route.ts` - 5min TTL cache
- `app/src/app/api/settings/processing/route.ts` - 5min TTL cache, PATCH invalidates

## Decisions Made

- Activity, usage, top-agents, and top-models dashboard routes use parameterized cache keys (e.g., `dashboard:activity:10`) because query param `limit`/`days` can vary — prevents stale data being returned for different param combinations
- LLM generation calls deliberately excluded from withRetry — these are in task-executor.ts, canvas-executor.ts, catbot chat, and process routes. Retrying a partially-started LLM generation is non-idempotent and would break streaming
- Cache invalidation for settings:api-keys is triggered from the `[provider]` sub-route (where PATCH/DELETE live) rather than the read route

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RESIL-02 (retry) and RESIL-03 (cache) requirements complete
- Phase 27 Plan 03 can proceed (error boundaries, remaining resilience features)
- All external service calls in qdrant.ts, ollama.ts, litellm.ts now resilient to transient failures
- Hot API endpoints (dashboard, health, settings) will not hammer the DB on every request

---
*Phase: 27-resilience-foundations*
*Completed: 2026-03-12*
