# Phase 74: Modulo Equipo (Empleados + Control Horario) - Research

**Researched:** 2026-03-23
**Domain:** Holded Team API v1 (employees + clock-in/timesheet)
**Confidence:** HIGH

## Summary

Phase 74 extends the Holded MCP server with employee management and work schedule tracking (control horario / fichaje). The Holded Team API v1 (`https://api.holded.com/api/team/v1`) provides 15 endpoints split into two groups: 5 for employee CRUD and 10 for employee time-tracking (timesheets + clock-in/out/pause/unpause).

The codebase already supports `module: 'team'` in `HoldedClient` (base URL mapped since phase 71). The pattern established in phases 72-73 (tool file + Zod schemas + tests + index registration + rate limiter) applies directly. The requirements also call for a "myId" config mechanism (`holded_set_my_employee_id` / `holded_get_my_employee_id`) and a composite `holded_weekly_timesheet_summary` tool.

**Primary recommendation:** Two plans: Plan 01 covers employee CRUD + search + myId config (TEAM-01, 5 tools). Plan 02 covers timesheet listing, creation, clock-in actions, and the weekly summary composite tool (TEAM-02, ~6-8 tools).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEAM-01 | Employee tools: list, get, search, set_my_id, get_my_id | Holded API endpoints for employees fully documented; myId is local config pattern (no API) |
| TEAM-02 | Control horario tools: list_timesheets, create_timesheet, weekly_summary | Holded API time-tracking endpoints documented; clock-in/out/pause/unpause available; weekly summary is a composite tool built on list |
</phase_requirements>

## Holded Team API v1 -- Endpoint Reference

### Employees (CRUD)

| Method | Path | Purpose | Key Params | Response |
|--------|------|---------|------------|----------|
| GET | `/employees` | List all employees | `page` (optional, paginated 500/page) | Array of employee objects |
| POST | `/employees` | Create employee | body: `{name, lastName, email, sendInvite?}` | `{status, info, id}` |
| GET | `/employees/{employeeId}` | Get single employee | path: employeeId | Employee object (full detail) |
| PUT | `/employees/{employeeId}` | Update employee | body: see Update Fields below | `{status, info, id}` |
| DELETE | `/employees/{employeeId}` | Delete employee | path: employeeId | `{status, info, id}` |

#### Employee Update Fields (PUT)
All optional: `name`, `lastName`, `mainEmail`, `email`, `nationality`, `phone`, `mobile`, `dateOfBirth` (dd/mm/yyyy), `gender` (male/female), `mainLanguage`, `iban`, `timeOffPolicyId`, `timeOffSupervisors` (array of IDs), `reportingTo` (employee ID), `code` (NIF), `socialSecurityNum`, `address` (object: address, city, postalCode, province, country), `fiscalResidence` (boolean), `fiscalAddress` (object with nested fields), `workplace` (ID), `teams` (array of IDs), `holdedUserId`.

### Employee Time-Tracking (Timesheets)

| Method | Path | Purpose | Key Params | Response |
|--------|------|---------|------------|----------|
| GET | `/employees/times` | List ALL employee time records | `page` (optional, 500/page) | Array of time-tracking objects |
| GET | `/employees/times/{employeeTimeId}` | Get specific time record | path: employeeTimeId | Time-tracking object |
| PUT | `/employees/times/{employeeTimeId}` | Update time record | body: `{startTmp, endTmp}` (both required) | `{status, info, id}` |
| DELETE | `/employees/times/{employeeTimeId}` | Delete time record | path: employeeTimeId | `{status, info, id}` |
| GET | `/employees/{employeeId}/times` | List employee's time records | path: employeeId, paginated 500/page | Array of time-tracking objects |
| POST | `/employees/{employeeId}/times` | Create time record | body: `{startTmp, endTmp}` (both required) | `{status, info, id}` |

### Clock-In/Out Actions

| Method | Path | Purpose | Body |
|--------|------|---------|------|
| POST | `/employees/{employeeId}/times/clockin` | Start clock | `{location?}` |
| POST | `/employees/{employeeId}/times/clockout` | End clock | `{latitude?, longitude?}` |
| POST | `/employees/{employeeId}/times/pause` | Pause clock | `{latitude?, longitude?}` |
| POST | `/employees/{employeeId}/times/unpause` | Resume clock | `{latitude?, longitude?}` |

All return `{status, info, id}` with HTTP 201.

**Important:** `startTmp` and `endTmp` are strings (likely Unix timestamps as strings or ISO format). The field naming is `Tmp` not `Timestamp` -- follow API convention exactly.

## Architecture Patterns

### Existing Codebase Pattern (from phases 72-73)

Every module follows this structure:
1. **Tool file** (`src/tools/{module}.ts`) -- exports `get{Module}Tools(client: HoldedClient)` returning an object of tool definitions
2. **Zod schemas** (`src/validation.ts`) -- appended at bottom, grouped by module comment
3. **Tests** (`src/__tests__/{module}.test.ts`) -- uses `createMockClient()`, tests each handler
4. **Registration** (`src/index.ts`) -- import + spread into `allTools` + rate limiter entries

### Tool Definition Shape
```typescript
toolName: {
  description: string,
  inputSchema: { type: 'object', properties: {...}, required: [...] },
  readOnlyHint?: boolean,       // GET operations
  destructiveHint?: boolean,    // POST/PUT/DELETE operations
  handler: withValidation(zodSchema, async (args) => { ... }),
}
```

### Module Parameter
All team endpoints use `module: 'team'` -- the HoldedClient already maps this to `https://api.holded.com/api/team/v1`.

### Recommended Project Structure (new files)
```
src/
  tools/
    employees.ts          # TEAM-01: employee CRUD + search + myId
    employee-timesheets.ts # TEAM-02: timesheet CRUD + clock actions + weekly summary
  __tests__/
    employees.test.ts
    employee-timesheets.test.ts
```

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | existing | Input validation | All tools use withValidation pattern |
| vitest | existing | Testing | All tests use vi.fn() + createMockClient |
| typescript | existing | Type safety | Strict compilation required |

### Supporting (new for this phase)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs + node:path | built-in | Config file for myId | `holded_set_my_employee_id` / `holded_get_my_employee_id` |

No new npm dependencies required.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Input validation | Manual checks | `withValidation` + Zod schemas | Consistent error messages, type inference |
| HTTP requests | fetch calls | `client.get/post/put/delete` with `'team'` module | Rate limiting, retry, auth handled |
| Client-side search | Custom fuzzy | Simple `.filter()` + `.toLowerCase().includes()` | Same pattern as lead search in phase 72 |
| Config persistence | DB or env var | JSON file at `~/.config/holded-mcp/config.json` | Requirement spec; simple, user-editable |

## Common Pitfalls

### Pitfall 1: startTmp / endTmp Format Ambiguity
**What goes wrong:** API docs show `startTmp` and `endTmp` as strings but do not document the exact format (Unix timestamp string? ISO 8601? epoch seconds?).
**Why it happens:** Holded documentation is minimal on field formats.
**How to avoid:** Accept Unix timestamp (seconds) as number, convert to string for the API. Document the expected format clearly in tool description.
**Warning signs:** 400 errors on timesheet creation.

### Pitfall 2: "myId" Config Path Cross-Platform
**What goes wrong:** Hardcoding `~/.config/` may fail in Docker or different OS environments.
**How to avoid:** Use `process['env']['HOME']` or `os.homedir()` + `/.config/holded-mcp/config.json`. Create directory recursively if not exists.
**Warning signs:** ENOENT errors on first use.

### Pitfall 3: Clock-In Without Employee Context
**What goes wrong:** User says "clock me in" but no employeeId is known.
**How to avoid:** The `holded_get_my_employee_id` tool reads the config. Clock-in tools require explicit employeeId. The LLM should call get_my_employee_id first, then pass the ID to clock-in.
**Warning signs:** Tools called without employeeId.

### Pitfall 4: Confusing Project Time-Tracking vs Employee Time-Tracking
**What goes wrong:** Phase 73 already has `holded_list_time_entries` (project-level). Phase 74 adds `holded_list_timesheets` (employee-level). Different APIs (`projects` module vs `team` module).
**How to avoid:** Use clear naming: `timesheet` for employee/team time records, `time_entry` for project time records. Tool descriptions must clarify the difference.

### Pitfall 5: Pagination Not Matching Expected Format
**What goes wrong:** List endpoints return up to 500 items per page, but response structure is unclear (array or paginated wrapper?).
**How to avoid:** Follow the same client-side pagination pattern used in projects (fetch all, slice locally). The API likely returns a flat array.

## Code Examples

### Employee Tool Pattern (following projects.ts)
```typescript
// src/tools/employees.ts
import { HoldedClient } from '../holded-client.js';
import { withValidation, employeeIdSchema, listEmployeesSchema } from '../validation.js';
import { readMyEmployeeId, writeMyEmployeeId } from './employee-config.js';

interface HoldedEmployee {
  id: string;
  name: string;
  lastName?: string;
  email?: string;
  [key: string]: unknown;
}

export function getEmployeeTools(client: HoldedClient) {
  return {
    holded_list_employees: {
      description: 'List all employees in Holded with client-side pagination.',
      inputSchema: { type: 'object' as const, properties: { page: {type:'number'}, limit: {type:'number'} }, required: [] },
      readOnlyHint: true,
      handler: withValidation(listEmployeesSchema, async (args) => {
        const all = await client.get<HoldedEmployee[]>('/employees', undefined, 'team');
        const page = args.page ?? 1;
        const limit = Math.min(args.limit ?? 50, 500);
        const start = (page - 1) * limit;
        const items = all.slice(start, start + limit);
        return { items, page, pageSize: items.length, totalItems: all.length, totalPages: Math.ceil(all.length / limit), hasMore: start + limit < all.length };
      }),
    },
    // ... get, search, set_my_id, get_my_id follow same pattern
  };
}
```

### MyId Config Pattern
```typescript
// Config stored at ~/.config/holded-mcp/config.json
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'holded-mcp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface MpcConfig {
  myEmployeeId?: string;
}

export function readConfig(): MpcConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function writeConfig(config: MpcConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
```

### Clock-In Tool Pattern
```typescript
holded_clock_in: {
  description: 'Clock in (start work tracking) for an employee. Use holded_get_my_employee_id first to get your ID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      employeeId: { type: 'string', description: 'Employee ID (required)' },
      location: { type: 'string', description: 'Optional location description' },
    },
    required: ['employeeId'],
  },
  destructiveHint: true,
  handler: withValidation(clockInSchema, async (args) => {
    const body: Record<string, string> = {};
    if (args.location) body.location = args.location;
    return client.post(`/employees/${args.employeeId}/times/clockin`, body, 'team');
  }),
},
```

## Tool Breakdown (Suggested)

### Plan 01 -- Employee CRUD + Config (TEAM-01, Wave 1)

| Tool | Type | API Endpoint |
|------|------|-------------|
| `holded_list_employees` | READ | GET `/employees` |
| `holded_get_employee` | READ | GET `/employees/{employeeId}` |
| `holded_search_employee` | READ | GET `/employees` + client-side filter |
| `holded_set_my_employee_id` | CONFIG | Local file write (no API) |
| `holded_get_my_employee_id` | CONFIG | Local file read (no API) |

Files: `src/tools/employees.ts`, `src/__tests__/employees.test.ts`, `src/validation.ts`, `src/index.ts`

### Plan 02 -- Timesheet + Clock Actions + Weekly Summary (TEAM-02, Wave 2)

| Tool | Type | API Endpoint |
|------|------|-------------|
| `holded_list_timesheets` | READ | GET `/employees/{employeeId}/times` (or `/employees/times` for all) |
| `holded_create_timesheet` | WRITE | POST `/employees/{employeeId}/times` |
| `holded_clock_in` | WRITE | POST `/employees/{employeeId}/times/clockin` |
| `holded_clock_out` | WRITE | POST `/employees/{employeeId}/times/clockout` |
| `holded_clock_pause` | WRITE | POST `/employees/{employeeId}/times/pause` |
| `holded_clock_unpause` | WRITE | POST `/employees/{employeeId}/times/unpause` |
| `holded_weekly_timesheet_summary` | READ (composite) | GET `/employees/{employeeId}/times` + aggregation logic |

Files: `src/tools/employee-timesheets.ts`, `src/__tests__/employee-timesheets.test.ts`, `src/validation.ts`, `src/index.ts`

**Note on TEAM-02 requirements vs actual tools:** The requirements list 3 tools (`list_timesheets`, `create_timesheet`, `weekly_timesheet_summary`). Research shows the API also provides clock-in/out/pause/unpause which are essential for "fichaje" (the core use case). These 4 clock actions should be included in Plan 02 as they are the primary mechanism for daily time tracking. The `create_timesheet` tool covers manual/retroactive entry (with startTmp/endTmp), while clock-in/out covers real-time tracking.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest.config.ts (existing in holded-mcp) |
| Quick run command | `cd ~/holded-mcp && npm test -- --run src/__tests__/employees.test.ts` |
| Full suite command | `cd ~/holded-mcp && npm test -- --run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEAM-01 | list employees with pagination | unit | `npm test -- --run src/__tests__/employees.test.ts` | No -- Wave 0 |
| TEAM-01 | get employee by ID | unit | same file | No -- Wave 0 |
| TEAM-01 | search employee by name (fuzzy) | unit | same file | No -- Wave 0 |
| TEAM-01 | set/get myEmployeeId config | unit | same file | No -- Wave 0 |
| TEAM-02 | list timesheets with date filter | unit | `npm test -- --run src/__tests__/employee-timesheets.test.ts` | No -- Wave 0 |
| TEAM-02 | create timesheet entry | unit | same file | No -- Wave 0 |
| TEAM-02 | clock in/out/pause/unpause | unit | same file | No -- Wave 0 |
| TEAM-02 | weekly summary aggregation | unit | same file | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd ~/holded-mcp && npm run build && npm test -- --run`
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `src/__tests__/employees.test.ts` -- covers TEAM-01
- [ ] `src/__tests__/employee-timesheets.test.ts` -- covers TEAM-02
- [ ] No new framework install needed (vitest already configured)

## Open Questions

1. **startTmp / endTmp exact format**
   - What we know: API docs say "string", required for create and update
   - What's unclear: Is it Unix epoch seconds as string? ISO 8601? "dd/mm/yyyy HH:mm"?
   - Recommendation: Start with Unix epoch seconds as string (most common in Holded APIs). If 400 errors occur, try ISO 8601. Document as string in Zod schema with `.describe()`.

2. **Employee list response fields**
   - What we know: API returns employee objects, paginated at 500
   - What's unclear: Exact fields returned in list vs get (list may be abbreviated)
   - Recommendation: Use `[key: string]: unknown` interface pattern like other modules. Important fields (id, name, lastName, email) are highly likely.

3. **Clock-in "location" vs "latitude/longitude"**
   - What we know: Clock-in accepts `{location: string}`, clock-out/pause/unpause accept `{latitude, longitude}` strings
   - What's unclear: Whether clock-in also accepts lat/lng, or only a text location
   - Recommendation: Implement as documented. Clock-in gets optional `location` string; others get optional `latitude`/`longitude` strings.

## Sources

### Primary (HIGH confidence)
- [Holded API - List Employees](https://developers.holded.com/reference/listemployees) -- GET /employees, pagination
- [Holded API - Create Employee](https://developers.holded.com/reference/createemployee) -- POST fields: name, lastName, email, sendInvite
- [Holded API - Get Employee](https://developers.holded.com/reference/get-a-employee) -- GET /employees/{id}
- [Holded API - Update Employee](https://developers.holded.com/reference/update-employee) -- PUT with full field list
- [Holded API - Delete Employee](https://developers.holded.com/reference/delete-a-employee) -- DELETE /employees/{id}
- [Holded API - Clock In](https://developers.holded.com/reference/employeeclockin) -- POST clockin with location
- [Holded API - Clock Out](https://developers.holded.com/reference/employeeclockout) -- POST clockout with lat/lng
- [Holded API - Pause](https://developers.holded.com/reference/employeepause) -- POST pause with lat/lng
- [Holded API - Unpause](https://developers.holded.com/reference/employeeunpause) -- POST unpause with lat/lng
- [Holded API - Create Employee Time](https://developers.holded.com/reference/createemployeetime) -- POST with startTmp/endTmp
- [Holded API - List Times](https://developers.holded.com/reference/listtimes) -- GET /employees/times (all)
- [Holded API - List Employee Times](https://developers.holded.com/reference/listemployeetimes) -- GET /employees/{id}/times
- [Holded API - Update Time](https://developers.holded.com/reference/updatetime) -- PUT /employees/times/{id}
- [Holded API - Delete Time](https://developers.holded.com/reference/deletetime) -- DELETE /employees/times/{id}
- [Holded API - Get Time](https://developers.holded.com/reference/gettime) -- GET /employees/times/{id}

### Secondary (MEDIUM confidence)
- Existing codebase patterns (holded-client.ts, validation.ts, index.ts, tools/*.ts) -- verified by reading source

### Tertiary (LOW confidence)
- startTmp/endTmp format -- documentation says "string" but does not specify format

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- same libraries, same patterns as prior phases
- Architecture: HIGH -- direct extension of established codebase patterns
- API endpoints: HIGH -- 15 endpoints verified from official Holded developer docs
- Pitfalls: MEDIUM -- startTmp format and response shapes not fully documented
- myId config: MEDIUM -- requirement-driven design, no API precedent

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable API, unlikely to change)
