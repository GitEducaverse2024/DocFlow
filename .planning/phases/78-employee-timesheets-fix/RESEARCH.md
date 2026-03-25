# Phase 78 Research: Employee Timesheets Fix

## Problem Analysis

The `holded_create_timesheet` and `holded_update_timesheet` tools currently accept raw Unix timestamps as input. When a user asks CatBot "crea un fichaje de 09:00 a 18:00 el 17 de marzo", the LLM must convert HH:MM + date to Unix timestamps — but it can't do timezone math reliably, especially across CET/CEST boundaries.

**Root cause**: The tools require the caller (LLM) to perform timezone-aware timestamp conversion, which LLMs do unreliably.

**Fix**: Accept `date` (YYYY-MM-DD) + `startTime`/`endTime` (HH:MM) as human-friendly inputs and convert to Unix timestamps server-side using Europe/Madrid timezone.

## Current Implementation

### Files involved
- `~/holded-mcp/src/tools/employee-timesheets.ts` — Tool definitions
- `~/holded-mcp/src/validation.ts` — Zod schemas
- `~/holded-mcp/src/utils/date-helpers.ts` — Date utilities (no timezone support yet)
- `~/holded-mcp/src/__tests__/employee-timesheets.test.ts` — Existing tests

### Current tool signatures
- `holded_create_timesheet`: `{ employeeId, startTmp: number, endTmp: number }` → converts to string for API
- `holded_update_timesheet`: `{ timeId, startTmp: string, endTmp: string }` → already string timestamps

### Holded API contract
- POST `/employees/{id}/times` — body: `{ startTmp: "unix_seconds_string", endTmp: "unix_seconds_string" }`
- PUT `/employees/times/{id}` — body: `{ startTmp: "unix_seconds_string", endTmp: "unix_seconds_string" }`

## Solution Design

### New input format for both tools
```
{
  employeeId / timeId,
  date: "2026-03-17",       // YYYY-MM-DD
  startTime: "09:00",       // HH:MM
  endTime: "18:00"          // HH:MM
}
```

### Timezone conversion approach
Use Node.js built-in `Intl.DateTimeFormat` (available in Node 20+) to determine UTC offset for Europe/Madrid at the given date, then compute Unix timestamp. No external dependencies needed.

```ts
function timeToTimestamp(dateStr: string, timeStr: string, tz = 'Europe/Madrid'): number
```

**Algorithm:**
1. Parse `dateStr` (YYYY-MM-DD) and `timeStr` (HH:MM)
2. Create tentative UTC Date assuming the time is in the target timezone
3. Use `Intl.DateTimeFormat` with `timeZone` to determine the actual UTC offset
4. Apply offset correction to get the exact Unix timestamp

### CET/CEST handling
- CET (UTC+1): October last Sunday → March last Sunday
- CEST (UTC+2): March last Sunday → October last Sunday
- Node.js `Intl` handles this automatically via IANA timezone database

### Test vectors
| Date | Time | TZ | Expected Unix |
|------|------|----|---------------|
| 2026-03-17 | 09:00 | CET (+1) | 1773734400 |
| 2026-06-15 | 09:00 | CEST (+2) | 1781506800 |
| 2026-03-17 | 18:00 | CET (+1) | 1773766800 |

Note: ROADMAP.md example value `1742205600` corresponds to 2025-03-17, not 2026. Tests will use correct 2026 values.

## Dependencies
- No external packages needed (Node.js 20+ Intl API)
- No cross-phase dependencies

## Risk Assessment
- **Low risk**: DST edge cases are handled by `Intl` automatically
- **Low risk**: Backward compatibility — changing input format from Unix numbers to date+time strings. The LLM will use the new format going forward.
