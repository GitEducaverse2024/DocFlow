---
phase: 73-projects-time-tracking
plan: 04
subsystem: holded-mcp
tags: [utilities, date-time, time-tracking]
dependency-graph:
  requires: []
  provides: [date-helpers]
  affects: [time-tracking-tools, project-tools]
tech-stack:
  added: []
  patterns: [heuristic-ms-detection, holded-timestamp-convention]
key-files:
  created:
    - src/utils/date-helpers.ts
    - src/__tests__/date-helpers.test.ts
  modified: []
key-decisions:
  - "Year 2100 heuristic (4102444800) for ms vs seconds detection"
  - "formatDuration rounds down sub-minute values (floor, not round)"
  - "calculateTotal uses floating-point division to match Holded server formula"
metrics:
  duration: 54s
  completed: 2026-03-23T12:05:38Z
  tasks: 1/1
  tests: 19 passed
---

# Phase 73 Plan 04: Date/Time Helper Utilities Summary

Holded timestamp conversion utilities with smart ms/seconds detection and duration formatting for time tracking integration.

## What Was Built

Five pure utility functions for converting between JavaScript and Holded API date/time conventions:

1. **toHoldedTimestamp** - Converts `Date` objects or numeric timestamps to Unix seconds. Uses a heuristic boundary at year 2100 (4102444800) to auto-detect whether input is in milliseconds or seconds.
2. **fromHoldedTimestamp** - Converts Holded Unix seconds back to JavaScript `Date` objects.
3. **formatDuration** - Converts duration in seconds to human-readable "Xh Ym" strings with floor rounding.
4. **toDurationSeconds** - Converts hours and optional minutes to Holded duration in seconds.
5. **calculateTotal** - Mirrors Holded's server-side cost formula: `(duration / 3600) * costHour`.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| ed69e35 | feat | Add date/time helper utilities for Holded API |

## Verification

- `npm run build` passes cleanly
- 19 unit tests pass covering all functions, edge cases, and boundary conditions

## Deviations from Plan

None - plan executed exactly as written.
