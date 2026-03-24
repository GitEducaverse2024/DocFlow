---
phase: "78"
plan: "01"
subsystem: holded-mcp/employee-timesheets
tags: [bugfix, timezone, timestamps, europe-madrid]
dependency_graph:
  requires: []
  provides: [human-friendly-timesheet-input, timezone-aware-timestamp-conversion]
  affects: [holded_create_timesheet, holded_update_timesheet]
tech_stack:
  added: []
  patterns: [intl-api-timezone-detection, wall-clock-to-utc-conversion]
key_files:
  created: []
  modified:
    - src/utils/date-helpers.ts
    - src/tools/employee-timesheets.ts
    - src/validation.ts
    - src/__tests__/date-helpers.test.ts
    - src/__tests__/employee-timesheets.test.ts
decisions:
  - Used Node.js Intl.DateTimeFormat API for CET/CEST offset detection (no external deps)
  - Kept timeToTimestamp as a general-purpose function with configurable timezone defaulting to Europe/Madrid
metrics:
  duration: "3m 7s"
  completed: "2026-03-24"
  tasks_completed: 6
  tasks_total: 6
  files_modified: 5
requirements: [TFIX-01, TFIX-02, TFIX-03, TFIX-04]
---

# Phase 78 Plan 01: Employee Timesheets Fix Summary

**One-liner:** Server-side HH:MM to Unix timestamp conversion using Intl API for Europe/Madrid CET/CEST detection

## What Changed

### Task 1: Added `timeToTimestamp()` to date-helpers.ts
- New exported function converts date (YYYY-MM-DD) + time (HH:MM) to Unix timestamp (seconds)
- Uses `Intl.DateTimeFormat` to detect UTC offset for Europe/Madrid at any given date
- Handles CET (UTC+1, winter) and CEST (UTC+2, summer) automatically
- Private helper `getDateParts()` extracts year/month/day/hour/minute from formatted date parts

### Task 2: Updated `holded_create_timesheet` tool
- Changed inputs from `{ employeeId, startTmp: number, endTmp: number }` to `{ employeeId, date, startTime, endTime }`
- Handler calls `timeToTimestamp()` and sends string Unix timestamps to API
- Updated tool description to document new input format

### Task 3: Updated `holded_update_timesheet` tool
- Changed inputs from `{ timeId, startTmp: string, endTmp: string }` to `{ timeId, date, startTime, endTime }`
- Same conversion pattern as create tool

### Task 4: Updated Zod validation schemas
- `createTimesheetSchema`: date regex `YYYY-MM-DD`, startTime/endTime regex `HH:MM`
- `updateTimesheetSchema`: same pattern with timeId instead of employeeId

### Task 5: Unit tests
- Added 4 tests for `timeToTimestamp()`: CET winter, CEST summer, end-of-day, midnight
- Updated create timesheet tests: CET conversion, CEST conversion, validation rejections
- Added update timesheet tests: conversion verification, validation rejections

### Task 6: Build verification
- TypeScript compiles cleanly
- All 315 tests pass (27 test files)

## Commits

| Hash | Message |
|------|---------|
| fb45358 | fix(timesheets): convert HH:MM to Unix timestamps with Europe/Madrid timezone |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| # | Criterion | Result |
|---|-----------|--------|
| 1 | `holded_create_timesheet` with startTime '09:00' on '2026-03-17' sends `startTmp: '1773734400'` | PASS |
| 2 | `holded_update_timesheet` applies same conversion | PASS |
| 3 | CET (+1) and CEST (+2) handled correctly | PASS |
| 4 | Unit tests pass for known date+time combos | PASS (315/315) |
