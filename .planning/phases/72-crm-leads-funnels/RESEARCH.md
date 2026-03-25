# Phase 72: CRM Leads & Funnels - Research

**Researched:** 2026-03-23
**Domain:** Holded CRM API (Funnels, Leads, Notes, Tasks, Events)
**Confidence:** HIGH

## Summary

The Holded CRM API lives at `https://api.holded.com/api/crm/v1` and provides full CRUD for funnels, leads, events, plus sub-resources on leads (notes, tasks, stages, dates). The API follows the same auth pattern as the invoicing module: API key in a `key` header, JSON request/response bodies, and standard `{ status, info, id }` mutation responses.

The existing `holded-mcp` codebase already has the CRM base URL configured in `holded-client.ts` (`MODULE_BASE_URLS.crm`), the `HoldedClient.request()` method accepts a `module` parameter, and the validation/tool pattern is well-established. New CRM tools can follow the exact same structure as `contacts.ts` and `documents.ts`.

**Primary recommendation:** Add new tool files (`tools/funnels.ts`, `tools/leads.ts`, `tools/events.ts`) following the existing pattern, register them in `index.ts`, and add Zod schemas in `validation.ts`. All CRM endpoints use `module: 'crm'` in client calls.

---

## Holded CRM API -- Complete Endpoint Reference

### Authentication

All requests require the API key in a `key` header:
```
key: YOUR_API_KEY
Content-Type: application/json
```

### Base URL

```
https://api.holded.com/api/crm/v1
```

Already configured in `holded-client.ts` as `MODULE_BASE_URLS.crm`.

---

## 1. Funnels API

### GET /funnels -- List All Funnels

**No query parameters.**

**Response:** `200 OK` -- Array of Funnel objects

```json
[
  {
    "id": "5acb866012d56e00100540e7",
    "name": "Marketing funnel",
    "stages": [
      {
        "stageId": "5acb866012d56e00100540e2",
        "key": "leadin",
        "name": "Lead In",
        "desc": ""
      },
      {
        "stageId": "5acb866012d56e00100540e3",
        "key": "contacted",
        "name": "Contacted",
        "desc": ""
      }
    ],
    "won": { "num": 2, "value": 3490093 },
    "leads": { "num": 1, "value": 2343546 },
    "lost": { "num": 1, "value": 2334454 },
    "recentWon": ["5acb866f12d56e000a3b0c23"],
    "recentLeads": ["5acb873c12d56e001d137e62"],
    "recentLost": ["5acb86e512d56e0016586e32"],
    "labels": [
      {
        "labelId": "5acb87b312d56e001b10afa3",
        "labelName": "Marketing",
        "labelColor": "#33ffff"
      }
    ],
    "preferences": { "emails": [] },
    "customFields": []
  }
]
```

### GET /funnels/{funnelId} -- Get Single Funnel

**Path params:** `funnelId` (string, required)

**Response:** `200 OK` -- Same Funnel object shape as above (single object, not array).

### POST /funnels -- Create Funnel

**Request body:**
| Field | Type | Required |
|-------|------|----------|
| name | string | Yes |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

### PUT /funnels/{funnelId} -- Update Funnel

**Request body:**
| Field | Type | Required |
|-------|------|----------|
| name | string | No |
| stages | array | No |
| labels | array | No |
| preferences | object | No |
| customFields | array | No |

**Response:** `200 OK` -- `{ status, info, id }`

### DELETE /funnels/{funnelId} -- Delete Funnel

**Response:** `200 OK` -- `{ status, info, id }`

### Funnel Object Shape

```typescript
interface Funnel {
  id: string;
  name: string;
  stages: FunnelStage[];
  won: { num: number; value: number };
  leads: { num: number; value: number };
  lost: { num: number; value: number };
  recentWon: string[];    // lead IDs
  recentLeads: string[];  // lead IDs
  recentLost: string[];   // lead IDs
  labels: FunnelLabel[];
  preferences: { emails: unknown[] };
  customFields: unknown[];
}

interface FunnelStage {
  stageId: string;
  key: string;      // e.g. "leadin", "contacted"
  name: string;     // display name
  desc: string;
}

interface FunnelLabel {
  labelId: string;
  labelName: string;
  labelColor: string;  // hex color e.g. "#33ffff"
}
```

---

## 2. Leads API

### GET /leads -- List All Leads

**No query parameters documented** (no server-side pagination/filtering).

**Response:** `200 OK` -- Array of Lead objects

```json
[
  {
    "id": "5ab27cc411aff3003e655fb3",
    "userId": "5ab13e373697ac00e305444d",
    "funnelId": "5ab13e373697ac00e305333b",
    "contactId": "5aaa65e05b706400300ad246",
    "contactName": "Gumersindo supply",
    "name": "Gumersindo",
    "person": 0,
    "personName": "",
    "value": 48000,
    "potential": 100,
    "dueDate": 1521646788,
    "stageId": "5ab13e373697ac00e3053336",
    "createdAt": 1521646788,
    "updatedAt": 1521659747,
    "customfields": [
      { "field": "New", "value": "custom field" }
    ],
    "status": 0,
    "events": [
      {
        "eventId": "5ab2863c11aff300532c40b3",
        "type": "note",
        "title": "Lunch!",
        "desc": "My note",
        "createdAt": 1521649212,
        "userId": "5a05cc5a60cea100094baf22"
      }
    ],
    "tasks": [
      {
        "taskId": "5acb8f0112d56e00201fed93",
        "taskName": "call",
        "taskStatus": 1
      }
    ],
    "files": ["config.ini"]
  }
]
```

**QUIRK:** The example response uses `customfields` (lowercase 'f') in the list response but `customFields` (camelCase) in the get-single response. Handle both casing variants.

### GET /leads/{leadId} -- Get Single Lead

**Path params:** `leadId` (string, required)

**Response:** `200 OK` -- Single Lead object (same shape as list item).

### POST /leads -- Create Lead

**Request body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| funnelId | string | **Yes** | Target funnel |
| contactId | string | No | Existing contact ID |
| contactName | string | No | Used if creating new contact |
| name | string | No | Lead name |
| value | integer | No | Monetary value |
| potential | integer | No | Potential percentage (0-100) |
| dueDate | integer | No | Unix timestamp |
| stageId | string | No | Stage ID **or exact stage name**. If name matches multiple stages, oldest is selected. |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

**IMPORTANT:** `stageId` accepts either a stage ID or the exact stage name string. This is useful for creating leads by stage name without needing to look up stage IDs first.

### PUT /leads/{leadId} -- Update Lead

**Request body (partial update -- only included fields are changed):**
| Field | Type | Notes |
|-------|------|-------|
| name | string | Lead name |
| value | integer | Monetary value |
| dueDate | integer | Unix timestamp |
| customFields | array | `[{ field, value }]` |
| status | integer | Lead status |

**Response:** `200 OK` -- `{ status, info, id }`

### DELETE /leads/{leadId} -- Delete Lead

**Response:** `200 OK`
```json
{ "status": 1, "info": "Successfully deleted", "id": "5aba68b1c5d438006425ad45" }
```

### PUT /leads/{leadId}/stages -- Update Lead Stage

**Request body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| stageId | string | Yes | Stage ID **or exact stage name** |

**Response:** `200 OK` -- `{ status, info, id }`

### PUT /leads/{leadId}/dates -- Update Lead Creation Date

**Request body:**
| Field | Type | Required |
|-------|------|----------|
| createdAt | integer | Yes (Unix timestamp) |

**Response:** `200 OK` -- `{ status, info, id }`

### Lead Object Shape

```typescript
interface Lead {
  id: string;
  userId: string;
  funnelId: string;
  contactId: string;
  contactName: string;
  name: string;
  person: number;        // 0 or 1
  personName: string;
  value: number;         // monetary value
  potential: number;     // percentage 0-100
  dueDate: number;       // unix timestamp
  stageId: string;
  createdAt: number;     // unix timestamp
  updatedAt: number;     // unix timestamp
  customFields: Array<{ field: string; value: string }>;  // NOTE: may be "customfields" in list response
  status: number;        // 0 = active, 1 = won, 2 = lost (inferred)
  events: LeadEvent[];
  tasks: LeadTask[];
  files: string[];       // filenames
}

interface LeadEvent {
  eventId: string;
  type: string;      // "note", activity kind, etc.
  title: string;
  desc: string;
  createdAt: number;
  userId: string;
}

interface LeadTask {
  taskId: string;
  taskName: string;
  taskStatus: number;  // 0 = pending, 1 = completed (inferred)
}
```

---

## 3. Lead Notes API

### POST /leads/{leadId}/notes -- Create Note

**Request body:**
| Field | Type | Required |
|-------|------|----------|
| title | string | Yes |
| desc | string | No |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

### PUT /leads/{leadId}/notes -- Update Note

**Request body (partial update):**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| noteId | string | Yes | ID of note to update |
| title | string | No | New title |
| desc | string | No | New description |

**Response:** `200 OK` -- `{ status, info, id }`

**QUIRK:** The `noteId` is passed in the request body, NOT as a path parameter. The URL is always `/leads/{leadId}/notes` for both create and update.

---

## 4. Lead Tasks API

### POST /leads/{leadId}/tasks -- Create Task

**Request body:**
| Field | Type | Required |
|-------|------|----------|
| name | string | Yes |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

### PUT /leads/{leadId}/tasks -- Update Task

**Request body (partial update):**
| Field | Type | Required |
|-------|------|----------|
| taskId | string | Yes |
| name | string | No |

**Response:** `200 OK`

**QUIRK:** Like notes, the `taskId` is in the body, not the URL path.

### DELETE /leads/{leadId}/tasks -- Delete Task

**Request body:**
| Field | Type | Required |
|-------|------|----------|
| taskId | string | Yes |

**Response:** `200 OK`
```json
{ "status": 1, "info": "Successfully deleted", "id": "5aba68b1c5d438006425ad45" }
```

**QUIRK:** DELETE with a request body. The `taskId` is sent as JSON body in the DELETE request. The `HoldedClient.delete()` method currently does NOT support a body parameter -- this will need to be extended or a workaround used (e.g., use `request('DELETE', endpoint, body, undefined, 'crm')`).

---

## 5. Events API

### GET /events -- List All Events

**No query parameters documented.**

**Response:** `200 OK` -- Array of Event objects

### POST /events -- Create Event

**Request body:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | string | Yes | Event title |
| contactId | string | No | Associated contact |
| contactName | string | No | Contact name |
| kind | string | No | Activity type (see below) |
| desc | string | No | Description |
| startDate | integer | No | Unix timestamp |
| duration | integer | No | Duration in seconds |
| status | integer | No | 0 = pending, 1 = done |
| tags | string[] | No | Tags/labels |
| locationDesc | string | No | Location text |
| leadId | string | No | Associated lead |
| funnelId | string | No | Associated funnel |
| userId | string | No | User who created it |

**Response:** `201 Created`
```json
{ "status": 1, "info": "Created", "id": "5ac4f2cec839ea004e18a463" }
```

### GET /events/{eventId} -- Get Single Event

**Response:** `200 OK`
```json
{
  "id": "5ab11f1a3697ac00cd0a6423",
  "name": "Coffe with P",
  "contactId": "5ab11f1a3697ac00cd0a6423",
  "contactName": "Patrick",
  "kind": "coffee",
  "desc": "meeting to talk about the incoming events",
  "startDate": 1522228026,
  "endDate": 15222229430,
  "status": 0,
  "tags": ["tig", "tag"],
  "locationDesc": "c/ Llacuna, 12",
  "leadId": "5acb873c12d56e001d137e62",
  "funnelId": "5acb866012d56e00100540e7"
}
```

### PUT /events/{eventId} -- Update Event

Same body fields as Create. Partial update -- only included fields are changed.

**Response:** `200 OK` -- `{ status, info, id }`

### DELETE /events/{eventId} -- Delete Event

**Response:** `200 OK` -- `{ status, info, id }`

### Event Kind Values

Holded provides **5 default activity types**. The `kind` field is a free-text string whose value corresponds to the activity type name configured in Settings > CRM > Activity Types. Default values are:

| Kind | Description |
|------|-------------|
| `meeting` | Meeting |
| `call` | Phone call |
| `flight` | Flight/travel |
| `lunch` | Lunch |
| `dinner` | Dinner |

**Note:** These are the 5 defaults. Custom activity types can be created in the Holded UI, so the `kind` field can contain any custom string. The API examples use `"coffee"` and `"dinner"` as kind values.

**Confidence:** MEDIUM -- The exact string values for default kinds (lowercase "meeting", "call", etc.) are inferred from the UI labels. The API docs only show `"coffee"` and `"dinner"` examples, which suggests these are user-defined activity type names rather than fixed enum values.

### Event Object Shape

```typescript
interface CrmEvent {
  id: string;
  name: string;
  contactId: string;
  contactName: string;
  kind: string;         // activity type name (free text)
  desc: string;
  startDate: number;    // unix timestamp
  endDate: number;      // unix timestamp (startDate + duration)
  status: number;       // 0 = pending, 1 = done
  tags: string[];
  locationDesc: string;
  leadId: string;
  funnelId: string;
}
```

---

## 6. Contact Resolution Patterns

Leads reference contacts via `contactId`. The relationship patterns:

1. **Existing contact:** Pass `contactId` when creating a lead. The `contactName` will be populated from the contact record.

2. **New contact via lead:** Pass `contactName` (without `contactId`) when creating a lead. Holded may auto-create a contact. (This behavior is documented but not fully verified -- LOW confidence).

3. **Contact lookup:** Use the existing invoicing `GET /contacts` endpoint (already implemented in `contacts.ts`) to find contacts by phone, mobile, or customId. Then pass the `contactId` to CRM endpoints.

4. **Contact types:** Contacts in the invoicing module have a `type` field that can be `'client' | 'supplier' | 'lead' | 'debtor' | 'creditor'`. CRM leads can link to any contact type.

**IMPORTANT:** Contacts live in the **invoicing** module (`/api/invoicing/v1/contacts`), while CRM leads live in the **CRM** module (`/api/crm/v1/leads`). They are cross-referenced by `contactId`, which is shared across modules.

---

## API Quirks and Limitations

### 1. No Server-Side Pagination on List Endpoints
Neither `GET /leads` nor `GET /events` nor `GET /funnels` documents query parameters for pagination. The API returns ALL records. Client-side pagination is needed for large datasets (the existing `contacts.ts` already implements this pattern).

### 2. Inconsistent Field Casing
The list leads response uses `customfields` (lowercase) while the get-single-lead response uses `customFields` (camelCase). Normalize on access.

### 3. DELETE with Body
The `DELETE /leads/{leadId}/tasks` endpoint requires a JSON body with `taskId`. The current `HoldedClient.delete()` does not accept a body parameter. Either:
- Extend `delete()` to accept an optional body
- Use `request('DELETE', endpoint, body, undefined, 'crm')` directly

### 4. Sub-resource IDs in Body, Not Path
For notes and tasks, the target ID (`noteId`, `taskId`) goes in the request body rather than the URL path. This is unusual but consistent across all sub-resource update/delete operations.

### 5. stageId Accepts Names
Both `POST /leads` and `PUT /leads/{leadId}/stages` accept either a stage ID or the exact stage name in the `stageId` field. If multiple stages match the name, the oldest is selected.

### 6. Unix Timestamps
All date fields (`dueDate`, `createdAt`, `updatedAt`, `startDate`, `endDate`) are Unix timestamps (seconds, not milliseconds).

### 7. Standard Mutation Response
All create/update/delete operations return the same shape:
```json
{ "status": 1, "info": "Created|Updated|Successfully deleted", "id": "..." }
```

### 8. Rate Limiting
The same 150ms minimum delay between requests applies (already handled by `HoldedClient`). CRM endpoints share the same API key rate limits as invoicing endpoints.

---

## Implementation Guidance for holded-mcp

### New Files Needed

```
holded-mcp/src/
  tools/
    funnels.ts     # Funnel CRUD tools
    leads.ts       # Lead CRUD + notes + tasks + stages tools
    events.ts      # Event CRUD tools
```

### Pattern to Follow

Follow `contacts.ts` exactly:
1. Import `HoldedClient` and validation schemas
2. Export a `get{X}Tools(client)` function returning tool definitions
3. Each tool has: `description`, `inputSchema`, `readOnlyHint`/`destructiveHint`, `handler`
4. Use `client.get('/endpoint', queryParams, 'crm')` (pass `'crm'` as module)
5. Use `withValidation()` wrapper for input validation

### Client Extension Needed

The `HoldedClient.delete()` method needs to support an optional body parameter for the task deletion endpoint:

```typescript
// Current:
async delete<T>(endpoint: string, module?: HoldedModule): Promise<T>

// Needed:
async delete<T>(endpoint: string, body?: unknown, module?: HoldedModule): Promise<T>
```

### Registration in index.ts

```typescript
import { getFunnelTools } from './tools/funnels.js';
import { getLeadTools } from './tools/leads.js';
import { getEventTools } from './tools/events.js';

const allTools = {
  ...getDocumentTools(client),
  ...getContactTools(client),
  // ... existing tools ...
  ...getFunnelTools(client),
  ...getLeadTools(client),
  ...getEventTools(client),
};
```

### Rate Limiter Configuration

Add CRM-specific tool limits in `index.ts`:
```typescript
const rateLimiter = new RateLimiter({
  // ... existing config ...
  toolLimits: {
    // ... existing limits ...
    list_funnels: { maxRequests: 200, windowMs: 60000 },
    list_leads: { maxRequests: 200, windowMs: 60000 },
    list_events: { maxRequests: 200, windowMs: 60000 },
    get_funnel: { maxRequests: 200, windowMs: 60000 },
    get_lead: { maxRequests: 200, windowMs: 60000 },
    get_event: { maxRequests: 200, windowMs: 60000 },
    create_lead: { maxRequests: 20, windowMs: 60000 },
    update_lead: { maxRequests: 30, windowMs: 60000 },
    delete_lead: { maxRequests: 10, windowMs: 60000 },
    create_event: { maxRequests: 20, windowMs: 60000 },
    update_event: { maxRequests: 30, windowMs: 60000 },
    delete_event: { maxRequests: 10, windowMs: 60000 },
  },
});
```

---

## Sources

### Primary (HIGH confidence)
- [Holded API Reference -- Main](https://developers.holded.com/reference) -- endpoint listing
- [List Funnels](https://developers.holded.com/reference/list-funnels-1) -- funnel list response shape
- [Get Funnel](https://developers.holded.com/reference/get-funnel-1) -- funnel detail response shape
- [Create Funnel](https://developers.holded.com/reference/create-funnel-1) -- funnel create request/response
- [List Leads](https://developers.holded.com/reference/list-leads-1) -- lead list response shape
- [Create Lead](https://developers.holded.com/reference/create-lead-1) -- lead create request/response
- [Get Lead](https://developers.holded.com/reference/get-lead-1) -- lead detail response
- [Update Lead](https://developers.holded.com/reference/update-lead-1) -- lead update request/response
- [Delete Lead](https://developers.holded.com/reference/delete-lead-1) -- lead delete response
- [Update Lead Stage](https://developers.holded.com/reference/update-lead-stage-1) -- stage update
- [Create Lead Note](https://developers.holded.com/reference/create-lead-note-1) -- note create
- [Update Lead Note](https://developers.holded.com/reference/update-lead-note-1) -- note update
- [Create Lead Task](https://developers.holded.com/reference/create-lead-task-1) -- task create
- [Update Lead Task](https://developers.holded.com/reference/update-lead-task-1) -- task update
- [Delete Lead Task](https://developers.holded.com/reference/delete-lead-task-1) -- task delete
- [Create Event](https://developers.holded.com/reference/create-event-1) -- event create
- [Get Event](https://developers.holded.com/reference/get-event-1) -- event detail
- [List Events](https://developers.holded.com/reference/list-events-1) -- event list

### Secondary (MEDIUM confidence)
- [Holded CRM Configuration](https://help.holded.com/en/articles/6984735-configure-the-crm) -- activity types info
- [Create and manage activities](https://help.holded.com/en/articles/6972428-create-and-manage-activities) -- default activity types

### Existing Codebase (HIGH confidence)
- `/home/deskmath/holded-mcp/src/holded-client.ts` -- CRM base URL, request pattern, rate limiting
- `/home/deskmath/holded-mcp/src/tools/contacts.ts` -- tool definition pattern to follow
- `/home/deskmath/holded-mcp/src/validation.ts` -- Zod validation pattern
- `/home/deskmath/holded-mcp/src/index.ts` -- tool registration and rate limiter config
