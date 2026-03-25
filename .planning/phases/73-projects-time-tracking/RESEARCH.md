# Phase 73: Projects & Time Tracking - Research

**Researched:** 2026-03-23
**Domain:** Holded Projects API (Projects, Tasks, Time Tracking / Registros Horarios)
**Confidence:** HIGH

## Summary

The Holded Projects API lives at `https://api.holded.com/api/projects/v1` and provides full CRUD for projects, tasks (as top-level resources within projects), and time tracking entries (nested under projects). The API follows the same auth pattern as all other Holded modules: API key in a `key` header, JSON request/response bodies, and standard `{ status, info, id }` mutation responses.

The existing `holded-mcp` codebase already has the Projects base URL configured in `holded-client.ts` (`MODULE_BASE_URLS.projects = 'https://api.holded.com/api/projects/v1'`), the `HoldedClient.request()` method accepts a `module: 'projects'` parameter, and the tool pattern is well-established. New Projects tools can follow the exact same structure as `contacts.ts`, `documents.ts`, `leads.ts`, etc.

**Key insight:** Time tracking entries are the central feature of this phase. They are sub-resources of projects (`/projects/{projectId}/times`) with full CRUD. There is also a cross-project listing endpoint (`/projects/times`) that supports date range filtering -- this is critical for building time reports and dashboards.

**Primary recommendation:** Add new tool files (`tools/projects.ts`, `tools/project-tasks.ts`, `tools/time-tracking.ts`) following the existing pattern, register them in `index.ts`, and add Zod schemas in `validation.ts`. All endpoints use `module: 'projects'` in client calls.

---

## Holded Projects API -- Complete Endpoint Reference

### Authentication

All requests require the API key in a `key` header:
```
key: YOUR_API_KEY
Content-Type: application/json
```

### Base URL

```
https://api.holded.com/api/projects/v1
```

Already configured in `holded-client.ts` as `MODULE_BASE_URLS.projects`.

---

## 1. Projects API

### GET /projects -- List All Projects

**No query parameters documented.**

**Response:** `200 OK` -- Array of Project objects

```json
[
  {
    "id": "5ab390311d6d82002432ec5a",
    "name": "Building 301",
    "desc": "Building 301 in Barcelona",
    "tags": ["tag", "tog", "tug"],
    "category": 0,
    "contactId": "5aaa51ab5b70640028340186",
    "contactName": "DIvero",
    "date": 0,
    "dueDate": 0,
    "status": 2,
    "lists": [
      {
        "listId": "5ab390311d6d82002432ec52",
        "key": "pending",
        "name": "Pending",
        "desc": "nan"
      }
    ],
    "billable": 1,
    "expenses": {
      "docId": "string",
      "type": "string",
      "subtotal": 0,
      "desc": "string",
      "invoiceNum": "string",
      "total": 0,
      "contactId": "string",
      "contactName": "string",
      "date": 0,
      "dueDate": 0
    },
    "estimates": [
      {
        "docId": "string",
        "type": "string",
        "subtotal": 0,
        "invoiceNum": "string",
        "total": 0
      }
    ],
    "sales": [
      {
        "docId": "string",
        "type": "string",
        "subtotal": 0,
        "invoiceNum": "string",
        "total": 0
      }
    ],
    "timeTracking": {
      "timeId": "string",
      "time": 0,
      "costHour": 0,
      "total": 0
    },
    "price": 2345,
    "numberOfTasks": 6,
    "completedTasks": 3,
    "labels": [
      {
        "labelId": "string",
        "labelName": "string",
        "labelColor": "#10cf91"
      }
    ]
  }
]
```

**NOTE:** The list response may include `expenses`, `estimates`, `sales`, `timeTracking` as summary objects/arrays. The example response in the docs sometimes omits these nested objects, returning only the flat fields. Handle both cases (fields may be absent).

### GET /projects/{projectId} -- Get Single Project

**Path params:** `projectId` (string, required)

**Response:** `200 OK` -- Single Project object. Same shape as list item but always includes nested objects (`lists`, `labels`, etc.).

**QUIRK:** In the list response, labels use `labelId`/`labelName`/`labelColor`. In the single-project response, labels use `id`/`name`/`color`. Normalize on access.

```json
{
  "id": "5ab390311d6d82002432ec5a",
  "name": "Building 301",
  "desc": "Bulding 301 in Barcelona",
  "tags": ["tag", "tog", "tug"],
  "category": 0,
  "contactId": "5aaa51ab5b70640028340186",
  "contactName": "DIvero",
  "date": 0,
  "dueDate": 0,
  "status": 2,
  "lists": [
    {
      "id": "5ab390311d6d82002432ec52",
      "key": "pending",
      "name": "Pending",
      "desc": "nan"
    }
  ],
  "billable": 1,
  "price": 2345,
  "numberOfTasks": 6,
  "completedTasks": 3,
  "labels": [
    {
      "id": "5ab390311d6d82002432ec55",
      "name": "New",
      "color": "#10cf91"
    }
  ]
}
```

### POST /projects -- Create Project

**Request body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | **Yes** | Project name |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

**NOTE:** Only `name` is documented as a creation field. Other fields (desc, tags, contactId, date, dueDate, status, billable, price, labels) likely need to be set via a subsequent PUT update. This is consistent with other Holded create endpoints (e.g., funnels) that accept minimal fields on creation.

### PUT /projects/{projectId} -- Update Project

**Request body (partial update -- only included fields are changed):**
| Field | Type | Notes |
|-------|------|-------|
| name | string | Project name |
| desc | string | Project description |
| tags | string[] | Tags array |
| contactName | string | Associated contact name |
| date | integer | Start date (Unix timestamp) |
| dueDate | integer | Due date (Unix timestamp) |
| status | integer | Project status |
| lists | array | Task lists with id, key, name, desc |
| billable | integer | 0 = not billable, 1 = billable |
| price | integer | Project price |
| labels | array | Labels with id, name, color |

**Response:** `200 OK`
```json
{ "status": 1, "info": "Updated", "id": "5ab390311d6d82002432ec5a" }
```

### DELETE /projects/{projectId} -- Delete Project

**Response:** `200 OK`
```json
{ "status": 1, "info": "Successfully deleted", "id": "5aba68b1c5d438006425ad45" }
```

### GET /projects/{projectId}/summary -- Get Project Summary

**Path params:** `projectId` (string, required)

**Response:** `200 OK` -- Financial and progress summary

```json
{
  "name": "Building",
  "desc": "Building in Barcelona",
  "projectEvolution": {
    "tasks": {
      "total": 6,
      "completed": 3
    },
    "dueDate": 0
  },
  "profitability": {
    "sales": 1117.18,
    "expenses": {
      "documents": 200,
      "personnel": 15603.33,
      "total": 15803.33
    },
    "profit": -14686.15
  },
  "economicStatus": {
    "sales": 1117.18,
    "quoted": 34433,
    "difference": -33315.82,
    "estimatePrice": 3453456,
    "billed": 1351.79,
    "collected": 290,
    "remaining": 1061.79
  }
}
```

### Project Object Shape

```typescript
interface HoldedProject {
  id: string;
  name: string;
  desc: string;
  tags: string[];
  category: number;
  contactId: string;
  contactName: string;
  date: number;         // Unix timestamp (start date)
  dueDate: number;      // Unix timestamp
  status: number;       // 0 = active?, 1 = ?, 2 = in example
  lists: ProjectList[];
  billable: number;     // 0 or 1
  expenses?: ProjectDocRef | ProjectDocRef[];
  estimates?: ProjectDocRef[];
  sales?: ProjectDocRef[];
  timeTracking?: ProjectTimeRef | ProjectTimeRef[];
  price: number;
  numberOfTasks: number;
  completedTasks: number;
  labels: ProjectLabel[];
}

interface ProjectList {
  listId?: string;   // "listId" in list response
  id?: string;       // "id" in single-project response
  key: string;       // e.g. "pending"
  name: string;      // e.g. "Pending"
  desc: string;
}

interface ProjectLabel {
  // List response uses labelId/labelName/labelColor
  labelId?: string;
  labelName?: string;
  labelColor?: string;
  // Single-project response uses id/name/color
  id?: string;
  name?: string;
  color?: string;
}

interface ProjectDocRef {
  docId: string;
  type: string;
  subtotal: number;
  desc?: string;
  invoiceNum: string;
  total: number;
  contactId?: string;
  contactName?: string;
  date?: number;
  dueDate?: number;
}

interface ProjectTimeRef {
  timeId: string;
  time: number;       // duration in seconds
  costHour: number;
  total: number;
}

interface ProjectSummary {
  name: string;
  desc: string;
  projectEvolution: {
    tasks: { total: number; completed: number };
    dueDate: number;
  };
  profitability: {
    sales: number;
    expenses: {
      documents: number;
      personnel: number;
      total: number;
    };
    profit: number;
  };
  economicStatus: {
    sales: number;
    quoted: number;
    difference: number;
    estimatePrice: number;
    billed: number;
    collected: number;
    remaining: number;
  };
}
```

---

## 2. Tasks API (Project Tasks)

Tasks are top-level resources under the projects module. They belong to a project and are placed within a project list (column/stage). They are **not** the same as CRM lead tasks.

### GET /tasks -- List All Tasks

**No query parameters documented.** Returns tasks across ALL projects.

**Response:** `200 OK` -- Array of Task objects

```json
[
  {
    "id": "5ab3df6e1d6d82008c5777a4",
    "projectId": "5ab390311d6d82002432ec5a",
    "listId": "5ab390311d6d82002432ec53",
    "name": "Business plan",
    "desc": "business plan for the new project",
    "labels": ["5ab390311d6d82002432ec58", "5ab390311d6d82002432ec59"],
    "comments": [
      {
        "commentId": "5ab3df8c1d6d820088525aa3",
        "createdAt": 1521737612,
        "userId": "5a05cc5a60cea100094baf22",
        "message": "no comments"
      }
    ],
    "date": 1521737582,
    "dueDate": 1521673200,
    "userId": "5a05cc5a60cea100094baf22",
    "createdAt": 1521737582,
    "updatedAt": 1521737582,
    "status": 0,
    "billable": 0,
    "featured": 1
  }
]
```

### GET /tasks/{taskId} -- Get Single Task

**Path params:** `taskId` (string, required)

**Response:** `200 OK` -- Same Task object shape as above (single object).

### POST /tasks -- Create Task

**Request body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| projectId | string | **Yes** | Parent project ID |
| listId | string | **Yes** | Target list/column ID within project |
| name | string | **Yes** | Task name |
| desc | string | No | Task description |
| labels | string[] | No | Array of label IDs |
| date | integer | No | Task date (Unix timestamp) |
| dueDate | integer | No | Due date (Unix timestamp) |
| userId | string | No | Assigned user ID |
| status | integer | No | Task status (0 = open, 1 = completed) |
| billable | integer | No | 0 or 1 |
| featured | integer | No | 0 or 1 |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

**IMPORTANT:** Creating a task requires both `projectId` and `listId`. You must first fetch the project to get available `lists[]` and use a valid `listId`.

### PUT /tasks/{taskId} -- Update Task

**NOT DOCUMENTED.** The Holded API reference does not include a PUT endpoint for tasks. The available operations are: list, get, create, and delete only.

**Workaround:** To update a task, you may need to delete and recreate it, or this endpoint exists but is undocumented. Test with `PUT /tasks/{taskId}` using the same body fields as create (minus projectId/listId) -- it may work even without docs.

**Confidence:** LOW -- absence from docs does not necessarily mean absence from API. Flag for testing.

### DELETE /tasks/{taskId} -- Delete Task

**Path params:** `taskId` (string, required)

**Response:** `200 OK`
```json
{ "status": 1, "info": "Successfully deleted", "id": "5aba68b1c5d438006425ad45" }
```

### Task Object Shape

```typescript
interface ProjectTask {
  id: string;
  projectId: string;
  listId: string;           // column/stage within project
  name: string;
  desc: string;
  labels: string[];         // array of label IDs (NOT label objects)
  comments: TaskComment[];
  date: number;             // Unix timestamp
  dueDate: number;          // Unix timestamp
  userId: string;           // assigned user
  createdAt: number;        // Unix timestamp
  updatedAt: number;        // Unix timestamp
  status: number;           // 0 = open, 1 = completed (inferred)
  billable: number;         // 0 or 1
  featured: number;         // 0 or 1
}

interface TaskComment {
  commentId: string;
  createdAt: number;        // Unix timestamp
  userId: string;
  message: string;
}
```

---

## 3. Time Tracking API (Registros Horarios) -- KEY FEATURE

Time entries are sub-resources of projects. Full CRUD is available. There is also a cross-project listing endpoint for reporting.

### GET /projects/{projectId}/times -- List Time Entries for Project

**Path params:** `projectId` (string, required)

**No query parameters documented.**

**Response:** `200 OK` -- Array of TimeEntry objects

```json
[
  {
    "timeId": "5ab3d2611d6d82005c4d2082",
    "duration": 45300,
    "desc": "timetracking project",
    "costHour": 35,
    "userId": "5a05cc5a60cea100094baf22",
    "taskId": "5ab3cb7d1d6d8200440d4683",
    "total": 440.41666666667
  }
]
```

### GET /projects/{projectId}/times/{timeTrackingId} -- Get Single Time Entry

**Path params:**
- `projectId` (string, required)
- `timeTrackingId` (string, required)

**Response:** `200 OK` -- Single TimeEntry object (same shape as above).

### POST /projects/{projectId}/times -- Create Time Entry

**Path params:** `projectId` (string, required)

**Request body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| duration | integer | **Yes** | Duration in **seconds** |
| costHour | integer | **Yes** | Cost per hour rate |
| desc | string | No | Description |
| userId | string | No | User who performed the work |
| taskId | string | No | Associated task ID |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

**Example request:**
```json
{
  "duration": 45300,
  "desc": "new timetracking",
  "costHour": 35,
  "userId": "5a05cc5a60cea100094baf22",
  "taskId": "5ab3cb7d1d6d8200440d4683"
}
```

**IMPORTANT:** `duration` is in seconds. 45300 seconds = 12 hours 35 minutes. The `total` in the response is calculated as `(duration / 3600) * costHour`. For the example: `(45300 / 3600) * 35 = 440.4167`.

### PUT /projects/{projectId}/times/{timeTrackingId} -- Update Time Entry

**Path params:**
- `projectId` (string, required)
- `timeTrackingId` (string, required)

**Request body (partial update -- only included fields are changed):**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| duration | integer | No* | Duration in seconds |
| costHour | integer | No* | Cost per hour |
| desc | string | No | Description |
| userId | string | No | User ID |
| taskId | string | No | Task ID |

*Docs say "only the params included in the operation will update the time tracking", but the create endpoint marks duration and costHour as required. For safety, always include duration and costHour on updates.

**Response:** `200 OK`
```json
{ "status": 1, "info": "Updated", "id": "5ac4f2cec839ea004e18a463" }
```

### DELETE /projects/{projectId}/times/{timeTrackingId} -- Delete Time Entry

**Path params:**
- `projectId` (string, required)
- `timeTrackingId` (string, required)

**Response:** `200 OK`
```json
{ "status": 1, "info": "Successfully deleted", "id": "5aba68b1c5d438006425ad45" }
```

### GET /projects/times -- List ALL Time Entries Across Projects

**THIS IS THE KEY REPORTING ENDPOINT.**

**Query parameters:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| start | integer | No | Start date filter (Unix timestamp) |
| end | integer | No | End date filter (Unix timestamp) |
| archived | boolean | No | Include archived projects |

**Response:** `200 OK` -- Array of project objects, each containing their time entries

```json
[
  {
    "id": "5ab390311d6d82002432ec5a",
    "name": "Building",
    "timeTracking": [
      {
        "timeId": "5ab3d2611d6d82005c4d2082",
        "duration": 45300,
        "desc": "timetracking test",
        "costHour": 35,
        "userId": "5a05cc5a60cea100094baf22",
        "taskId": "5ab3cb7d1d6d8200440d4683",
        "total": 440.41666666667
      }
    ]
  }
]
```

**NOTE:** The docs state this endpoint lists "time trackings in projects not archived from 18 months on" -- meaning by default it excludes archived projects and only returns entries from the last 18 months. Use `start`/`end` params and `archived=true` to control this.

**QUIRK:** The response groups time entries by project. Each element has `id` (projectId), `name` (project name), and `timeTracking[]` (array of time entries). This is different from the per-project endpoint which returns a flat array of time entries.

### Time Entry Object Shape

```typescript
interface TimeEntry {
  timeId: string;
  duration: number;      // seconds
  desc: string;
  costHour: number;      // hourly rate
  userId: string;        // who tracked the time
  taskId: string;        // associated task (optional in create)
  total: number;         // calculated: (duration / 3600) * costHour
}

// Response shape for GET /projects/times (cross-project listing)
interface ProjectTimesGroup {
  id: string;            // project ID
  name: string;          // project name
  timeTracking: TimeEntry[];
}
```

---

## 4. Team / Employee Time Tracking (Reference Only)

There is a SEPARATE time tracking system under the Team module (`/api/team/v1`) for employee clock-in/clock-out. This is distinct from project time tracking:

| Feature | Projects Time Tracking | Team Time Tracking |
|---------|----------------------|-------------------|
| Base URL | `/api/projects/v1` | `/api/team/v1` |
| Purpose | Track time spent on project tasks | Employee attendance/clock |
| Key fields | duration, costHour, taskId | startTmp, endTmp |
| Granularity | Manual entry (duration-based) | Clock in/out (timestamp-based) |

The Team endpoints (`/employees/times/{id}`, GET/PUT) use `startTmp`/`endTmp` fields and are for HR purposes. They are NOT the same as project time tracking entries. Phase 73 focuses on **project** time tracking only.

---

## API Quirks and Limitations

### 1. No Server-Side Pagination on List Endpoints
Neither `GET /projects` nor `GET /tasks` documents query parameters for pagination. The API returns ALL records. Client-side pagination is needed for large datasets (the existing `contacts.ts` already implements this pattern).

### 2. Inconsistent Label Shapes Between List and Detail
The list projects response uses `labelId`/`labelName`/`labelColor` for labels, while the get-single-project response uses `id`/`name`/`color`. Similarly, list uses `listId` for list IDs while detail uses `id`. Normalize on access with a helper.

### 3. No Task Update Endpoint (Undocumented)
The API docs show GET, POST, and DELETE for tasks but no PUT/update endpoint. This may exist undocumented (test it) or tasks may need delete+recreate workflows.

### 4. Task Creation Requires listId
Creating a task requires both `projectId` and `listId`. The `listId` references one of the project's `lists[]` entries (columns on a kanban board). You must first fetch the project to discover valid list IDs.

### 5. Duration in Seconds, Not Milliseconds
Time tracking `duration` is in **seconds**. 1 hour = 3600. This differs from JavaScript's Date.now() which returns milliseconds. Always convert.

### 6. Total is Server-Calculated
The `total` field in time entries is calculated server-side as `(duration / 3600) * costHour`. It is read-only and cannot be set directly. Useful for validation.

### 7. Cross-Project Times Endpoint Returns Grouped Data
`GET /projects/times` returns data grouped by project (`[{ id, name, timeTracking: [...] }]`), not a flat array. This needs to be flattened client-side for reporting.

### 8. 18-Month Default Window on Cross-Project Listing
`GET /projects/times` only returns non-archived projects from the last 18 months by default. Use `start`, `end`, and `archived` params to override.

### 9. No Bulk/Batch Operations
There are no batch endpoints for time entries. Each entry must be created/updated/deleted individually. For bulk imports, implement sequential API calls with the 150ms rate limit delay.

### 10. Unix Timestamps Everywhere
All date fields (`date`, `dueDate`, `createdAt`, `updatedAt`) are Unix timestamps in **seconds** (not milliseconds). Use `Math.floor(Date.now() / 1000)` for current time.

### 11. Standard Mutation Response
All create/update/delete operations return the same shape:
```json
{ "status": 1, "info": "Created|Updated|Successfully deleted", "id": "..." }
```

### 12. Rate Limiting
The same 150ms minimum delay between requests applies (already handled by `HoldedClient`). Project endpoints share the same API key rate limits as all other modules.

---

## Date Helper Utilities

Since Holded uses Unix timestamps (seconds) throughout, and the DocFlow frontend/Node.js uses milliseconds, a utility module is recommended:

```typescript
// utils/date-helpers.ts

/** Convert JS Date or ms timestamp to Holded Unix timestamp (seconds) */
export function toHoldedTimestamp(date: Date | number): number {
  if (date instanceof Date) {
    return Math.floor(date.getTime() / 1000);
  }
  // If already in seconds range (< year 2100 in ms), assume seconds
  if (date < 4102444800) return date;
  return Math.floor(date / 1000);
}

/** Convert Holded Unix timestamp (seconds) to JS Date */
export function fromHoldedTimestamp(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/** Convert Holded duration (seconds) to human-readable string */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/** Convert hours and minutes to Holded duration (seconds) */
export function toDurationSeconds(hours: number, minutes: number = 0): number {
  return (hours * 3600) + (minutes * 60);
}

/** Calculate total cost from duration and hourly rate */
export function calculateTotal(durationSeconds: number, costHour: number): number {
  return (durationSeconds / 3600) * costHour;
}
```

---

## Implementation Guidance for holded-mcp

### New Files Needed

```
holded-mcp/src/
  tools/
    projects.ts          # Project CRUD + summary tools
    project-tasks.ts     # Task CRUD tools (project tasks, NOT CRM tasks)
    time-tracking.ts     # Time entry CRUD + cross-project listing
  utils/
    date-helpers.ts      # Unix timestamp conversion utilities
```

### Pattern to Follow

Follow `contacts.ts` / `leads.ts` exactly:
1. Import `HoldedClient` and validation schemas
2. Export a `get{X}Tools(client)` function returning tool definitions
3. Each tool has: `description`, `inputSchema`, `readOnlyHint`/`destructiveHint`, `handler`
4. Use `client.get('/endpoint', queryParams, 'projects')` (pass `'projects'` as module)
5. Use `withValidation()` wrapper for input validation

### Tool Definitions

#### projects.ts -- 6 tools

| Tool Name | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| `list_projects` | GET | `/projects` | List all projects |
| `get_project` | GET | `/projects/{projectId}` | Get single project |
| `create_project` | POST | `/projects` | Create project (name only) |
| `update_project` | PUT | `/projects/{projectId}` | Update project fields |
| `delete_project` | DELETE | `/projects/{projectId}` | Delete project |
| `get_project_summary` | GET | `/projects/{projectId}/summary` | Financial/progress summary |

#### project-tasks.ts -- 3-4 tools

| Tool Name | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| `list_project_tasks` | GET | `/tasks` | List all tasks (cross-project). Client-side filter by projectId. |
| `get_project_task` | GET | `/tasks/{taskId}` | Get single task |
| `create_project_task` | POST | `/tasks` | Create task (requires projectId + listId) |
| `delete_project_task` | DELETE | `/tasks/{taskId}` | Delete task |

**NOTE:** Name these tools with `project_` prefix to distinguish from CRM lead tasks. The `list_project_tasks` tool should accept an optional `projectId` filter parameter and filter client-side, since the API returns all tasks across all projects.

#### time-tracking.ts -- 6 tools

| Tool Name | Method | Endpoint | Notes |
|-----------|--------|----------|-------|
| `list_time_entries` | GET | `/projects/{projectId}/times` | List time entries for a project |
| `list_all_time_entries` | GET | `/projects/times` | Cross-project listing with date filters |
| `get_time_entry` | GET | `/projects/{projectId}/times/{timeTrackingId}` | Get single entry |
| `create_time_entry` | POST | `/projects/{projectId}/times` | Create time entry |
| `update_time_entry` | PUT | `/projects/{projectId}/times/{timeTrackingId}` | Update time entry |
| `delete_time_entry` | DELETE | `/projects/{projectId}/times/{timeTrackingId}` | Delete time entry |

### Registration in index.ts

```typescript
import { getProjectTools } from './tools/projects.js';
import { getProjectTaskTools } from './tools/project-tasks.js';
import { getTimeTrackingTools } from './tools/time-tracking.js';

const allTools = {
  ...getDocumentTools(client),
  ...getContactTools(client),
  // ... existing tools ...
  ...getProjectTools(client),
  ...getProjectTaskTools(client),
  ...getTimeTrackingTools(client),
};
```

### Validation Schemas (validation.ts additions)

```typescript
// Project schemas
export const projectIdSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
});

export const updateProjectSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  name: z.string().optional(),
  desc: z.string().optional(),
  tags: z.array(z.string()).optional(),
  contactName: z.string().optional(),
  date: z.number().int().optional(),
  dueDate: z.number().int().optional(),
  status: z.number().int().optional(),
  billable: z.number().int().min(0).max(1).optional(),
  price: z.number().optional(),
});

// Task schemas
export const taskIdSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
});

export const createProjectTaskSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  listId: z.string().min(1, 'List ID is required'),
  name: z.string().min(1, 'Task name is required'),
  desc: z.string().optional(),
  labels: z.array(z.string()).optional(),
  date: z.number().int().optional(),
  dueDate: z.number().int().optional(),
  userId: z.string().optional(),
  status: z.number().int().optional(),
  billable: z.number().int().min(0).max(1).optional(),
  featured: z.number().int().min(0).max(1).optional(),
});

// Time tracking schemas
export const timeEntryIdSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  timeTrackingId: z.string().min(1, 'Time tracking ID is required'),
});

export const createTimeEntrySchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  duration: z.number().int().positive('Duration must be positive (in seconds)'),
  costHour: z.number().min(0, 'Cost per hour must be non-negative'),
  desc: z.string().optional(),
  userId: z.string().optional(),
  taskId: z.string().optional(),
});

export const updateTimeEntrySchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  timeTrackingId: z.string().min(1, 'Time tracking ID is required'),
  duration: z.number().int().positive().optional(),
  costHour: z.number().min(0).optional(),
  desc: z.string().optional(),
  userId: z.string().optional(),
  taskId: z.string().optional(),
});

export const listAllTimesSchema = z.object({
  start: z.number().int().optional(),     // Unix timestamp filter
  end: z.number().int().optional(),       // Unix timestamp filter
  archived: z.boolean().optional(),
});
```

### Rate Limiter Configuration

Add project-specific tool limits in `index.ts`:
```typescript
const rateLimiter = new RateLimiter({
  // ... existing config ...
  toolLimits: {
    // ... existing limits ...
    list_projects: { maxRequests: 200, windowMs: 60000 },
    get_project: { maxRequests: 200, windowMs: 60000 },
    get_project_summary: { maxRequests: 200, windowMs: 60000 },
    create_project: { maxRequests: 20, windowMs: 60000 },
    update_project: { maxRequests: 30, windowMs: 60000 },
    delete_project: { maxRequests: 10, windowMs: 60000 },
    list_project_tasks: { maxRequests: 200, windowMs: 60000 },
    get_project_task: { maxRequests: 200, windowMs: 60000 },
    create_project_task: { maxRequests: 30, windowMs: 60000 },
    delete_project_task: { maxRequests: 10, windowMs: 60000 },
    list_time_entries: { maxRequests: 200, windowMs: 60000 },
    list_all_time_entries: { maxRequests: 100, windowMs: 60000 },
    get_time_entry: { maxRequests: 200, windowMs: 60000 },
    create_time_entry: { maxRequests: 30, windowMs: 60000 },
    update_time_entry: { maxRequests: 30, windowMs: 60000 },
    delete_time_entry: { maxRequests: 10, windowMs: 60000 },
  },
});
```

---

## Cross-Module Relationships

### Projects <-> Contacts (invoicing module)
Projects reference contacts via `contactId`/`contactName`. The `contactId` is the same ID used in the invoicing contacts module (`/api/invoicing/v1/contacts`). Use existing `list_contacts`/`get_contact` tools to resolve contact details.

### Projects <-> Documents (invoicing module)
Projects can have linked expenses, estimates, and sales documents. The `docId` in `expenses`/`estimates`/`sales` arrays references invoicing documents. Use existing `get_document` tool to fetch full document details.

### Tasks <-> Users (team module)
Tasks have a `userId` for assignment. User IDs come from the team module. The existing employee endpoints (if implemented) can resolve user names.

### Time Entries <-> Tasks
Time entries can optionally reference a `taskId`. This links the time tracked to a specific project task. When creating time entries, first list project tasks to let the user select which task they worked on.

---

## Sources

### Primary (HIGH confidence)
- [List Projects](https://developers.holded.com/reference/list-projects) -- project list response shape
- [Get Project](https://developers.holded.com/reference/get-project) -- project detail response shape
- [Create Project](https://developers.holded.com/reference/create-project) -- project create request/response
- [Update Project](https://developers.holded.com/reference/update-project) -- project update request/response
- [Delete Project](https://developers.holded.com/reference/delete-project) -- project delete response
- [Project Summary](https://developers.holded.com/reference/get_projects-projectid-summary) -- summary response shape
- [List Tasks](https://developers.holded.com/reference/list-tasks) -- task list response shape
- [Get Task](https://developers.holded.com/reference/get-task) -- task detail response shape
- [Create Task](https://developers.holded.com/reference/create-task) -- task create request/response
- [Delete Task](https://developers.holded.com/reference/delete-task) -- task delete response
- [List Project Times](https://developers.holded.com/reference/get-project-times) -- time entries per project
- [Get Time Entry](https://developers.holded.com/reference/getprojecttimes) -- single time entry
- [Create Time Entry](https://developers.holded.com/reference/create-project-time) -- time entry create
- [Update Time Entry](https://developers.holded.com/reference/update-project-time) -- time entry update
- [Delete Time Entry](https://developers.holded.com/reference/delete-project-time) -- time entry delete
- [List All Times](https://developers.holded.com/reference/list-times) -- cross-project time listing

### Team Module (Reference Only)
- [Get Employee Time](https://developers.holded.com/reference/gettime) -- team/HR time tracking (separate system)
- [Update Employee Time](https://developers.holded.com/reference/updatetime) -- team/HR time tracking (separate system)

### Existing Codebase (HIGH confidence)
- `/home/deskmath/holded-mcp/src/holded-client.ts` -- Projects base URL, request pattern, rate limiting, `delete()` already supports body param
- `/home/deskmath/holded-mcp/src/tools/contacts.ts` -- tool definition pattern to follow
- `/home/deskmath/holded-mcp/src/tools/leads.ts` -- CRM tool pattern (same structure)
- `/home/deskmath/holded-mcp/src/validation.ts` -- Zod validation pattern
- `/home/deskmath/holded-mcp/src/index.ts` -- tool registration and rate limiter config
