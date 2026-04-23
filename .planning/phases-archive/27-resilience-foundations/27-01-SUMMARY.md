---
phase: 27-resilience-foundations
plan: 01
subsystem: lib
tags: [retry, cache, logger, resilience, db-cleanup, health]
dependency_graph:
  requires: []
  provides: [retry.ts, cache.ts, logger.ts, task-startup-cleanup, health-latency]
  affects: [all future resilience plans, db.ts startup, /api/health]
tech_stack:
  added: []
  patterns: [exponential-backoff-with-jitter, in-memory-ttl-cache, jsonl-file-logging, 7-day-log-rotation]
key_files:
  created:
    - app/src/lib/retry.ts
    - app/src/lib/cache.ts
    - app/src/lib/logger.ts
  modified:
    - app/src/lib/db.ts
    - app/src/app/api/health/route.ts
decisions:
  - "withRetry default shouldRetry: transient errors only (ECONNREFUSED, timeout, aborted, 502/503/504, AbortError)"
  - "Logger uses fs.appendFile (async/callback) — NOT appendFileSync to avoid blocking event loop"
  - "cacheInvalidatePrefix uses Array.from(store.keys()) for ES target compatibility"
  - "Stuck task cleanup placed after canvas_runs cleanup block in db.ts init sequence"
metrics:
  duration: 118s
  completed: "2026-03-12"
  tasks_completed: 2
  files_modified: 5
---

# Phase 27 Plan 01: Resilience Foundations — Utility Modules Summary

**One-liner:** retry.ts/cache.ts/logger.ts primitive utilities plus DB stuck-task cleanup and health DB latency measurement

## What Was Built

Three new foundational utility modules in `app/src/lib/` that all subsequent resilience plans consume, plus two surgical changes to existing files:

**retry.ts** — `withRetry<T>` with configurable max attempts (default 3), exponential backoff (`baseDelayMs * 2^(attempt-1)`), capped at `maxDelayMs`, with ±25% jitter. Default `shouldRetry` accepts transient errors (ECONNREFUSED, timeout, aborted, 502/503/504, AbortError) and rejects everything else (4xx, parse errors). Calls `logger.warn` on each retry attempt.

**cache.ts** — Module-level `Map<string, { data, expiresAt }>` singleton. `cacheGet<T>` returns typed data within TTL, deletes stale entries and returns null. `cacheSet` includes JSDoc warning that only successful responses should be cached. `cacheInvalidatePrefix` iterates via `Array.from` for ES target compatibility.

**logger.ts** — Writes structured JSONL lines (`{ ts, level, message, ...data }`) to `/app/data/logs/app-YYYY-MM-DD.jsonl` using async `fs.appendFile`. Creates log directory on module load. Rotates (deletes) log files older than 7 days at module load via `readdirSync` + regex date parsing.

**db.ts** — Added `import { logger } from './logger'` and a startup cleanup block (immediately after canvas_runs cleanup) that resets `tasks` and `task_steps` with `status='running'` to `'failed'`. Paused tasks are intentionally untouched.

**health/route.ts** — Wraps the existing `SELECT 1` DB ping with `Date.now()` timing. Reports `latency_ms` in the `docflow` section of the JSON response alongside existing `status`, `db`, `projects_count`, `sources_count`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create retry.ts, cache.ts, logger.ts | b5c2b6c | app/src/lib/retry.ts, app/src/lib/cache.ts, app/src/lib/logger.ts |
| 2 | Add DB startup cleanup and health latency | 3c618db | app/src/lib/db.ts, app/src/app/api/health/route.ts |

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed MapIterator ES target issue in cache.ts**
- **Found during:** Task 1 verification (standalone tsc --strict call)
- **Issue:** `for (const key of store.keys())` triggers `TS2802` when tsc runs without project tsconfig's `lib: esnext` context
- **Fix:** Changed to `Array.from(store.keys())` — works regardless of ES target
- **Files modified:** app/src/lib/cache.ts
- **Commit:** b5c2b6c (included in same commit)

## Self-Check: PASSED

- retry.ts: FOUND
- cache.ts: FOUND
- logger.ts: FOUND
- Commit b5c2b6c: FOUND
- Commit 3c618db: FOUND
