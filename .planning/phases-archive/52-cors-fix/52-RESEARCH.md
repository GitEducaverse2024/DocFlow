# Phase 52: CORS Fix — Research

## Problem Statement

API calls from CatBrain pages to `/api/agents` trigger CORS errors because the route handlers import and call cat-paws handler functions directly. While this works server-side, the Next.js routing context can cause redirect issues when the browser follows responses that reference Docker-internal addresses (0.0.0.0:3000).

## Current Architecture

### /api/agents routes (alias layer)

**`/api/agents/route.ts`** — Imports GET/POST from `/api/cat-paws/route` and calls them directly:
```typescript
import { GET as catPawsGET, POST as catPawsPOST } from '../cat-paws/route';
export async function GET(request: Request) { return catPawsGET(request); }
export async function POST(request: Request) { return catPawsPOST(request); }
```

**`/api/agents/[id]/route.ts`** — Imports GET/PATCH/DELETE from `/api/cat-paws/[id]/route`:
```typescript
import { GET as cpGET, PATCH as cpPATCH, DELETE as cpDEL } from '../../cat-paws/[id]/route';
export async function GET(req, ctx) { return cpGET(req, ctx); }
// ... same for PATCH, DELETE
```

**Real implementation routes (NOT aliases — keep as-is):**
- `/api/agents/create/route.ts` — Creates custom_agents in SQLite + registers in OpenClaw
- `/api/agents/generate/route.ts` — LLM-powered agent config generation
- `/api/agents/[id]/files/route.ts` — Reads agent workspace files

### /api/cat-paws routes (real implementation)

- `/api/cat-paws/route.ts` — GET (list with JOIN counts), POST (create)
- `/api/cat-paws/[id]/route.ts` — GET (detail with relations), PATCH (update), DELETE

### Frontend fetch calls to /api/agents

| File | Line | Call | Action Needed |
|------|------|------|---------------|
| `catbrains/new/page.tsx` | 61 | `fetch('/api/agents')` | Change to `/api/cat-paws` |
| `process/process-panel.tsx` | 117 | `fetch('/api/agents')` | Change to `/api/cat-paws` |
| `process/version-history.tsx` | 82 | `fetch('/api/agents')` | Change to `/api/cat-paws` |
| `projects/project-settings-sheet.tsx` | 97 | `fetch('/api/agents')` | Change to `/api/cat-paws` |
| `agents/agent-creator.tsx` | 237,281,299,316 | `/api/agents/generate`, `/api/agents/create` | Keep — these are real endpoints |

### Frontend fetch calls to /api/workers

| File | Line | Call | Action Needed |
|------|------|------|---------------|
| `process/version-history.tsx` | 83 | `fetch('/api/workers')` | Change to `/api/cat-paws?mode=processor` |

## Solution Approach

### Option A: Inline the cat-paws logic (duplicate code) ❌
Duplicates DB queries. Maintenance burden.

### Option B: Keep direct function import but fix response handling ⚠️
Current approach already does this — the issue is that Next.js route context (URL, headers) from the original request may not translate correctly when the handler runs under a different route path.

### Option C: Replace alias routes with direct cat-paws fetches in frontend ✅ **RECOMMENDED**
The simplest fix: update all frontend `fetch('/api/agents')` calls to `fetch('/api/cat-paws')` and remove or simplify the alias routes. The alias routes for `/api/agents` list/detail only exist as backward compatibility — since v10.0 (CatPaw unification), the canonical endpoint is `/api/cat-paws`.

**Why this is best:**
1. Zero risk of redirect/CORS — no alias layer involved
2. Single source of truth — `/api/cat-paws` is the real API
3. Simpler codebase — fewer intermediate routes
4. The `/api/agents/create`, `/api/agents/generate`, `/api/agents/[id]/files` routes remain untouched (they have real logic)

### Scope of Changes

**Frontend changes (update fetch URLs):**
1. `catbrains/new/page.tsx:61` — `/api/agents` → `/api/cat-paws`
2. `process/process-panel.tsx:117` — `/api/agents` → `/api/cat-paws`
3. `process/version-history.tsx:82` — `/api/agents` → `/api/cat-paws`
4. `process/version-history.tsx:83` — `/api/workers` → `/api/cat-paws?mode=processor`
5. `projects/project-settings-sheet.tsx:97` — `/api/agents` → `/api/cat-paws`

**Backend changes (simplify alias routes):**
6. `/api/agents/route.ts` — Remove GET/POST aliases (or redirect properly with NextResponse.rewrite)
7. `/api/agents/[id]/route.ts` — Remove GET/PATCH/DELETE aliases (or rewrite)

**Keep untouched:**
- `/api/agents/create/route.ts` — Real implementation
- `/api/agents/generate/route.ts` — Real implementation
- `/api/agents/[id]/files/route.ts` — Real implementation
- `/api/cat-paws/*` — Already correct

## Risk Assessment

- **Low risk**: All changes are URL string replacements in fetch calls
- **Backward compatibility**: The `/api/agents/create` and `/api/agents/generate` endpoints remain functional
- **Testing**: Verify CatBrain detail page loads agents list, process panel works, version history works

## Requirements Coverage

| Requirement | Solution |
|-------------|----------|
| CORS-01: /api/agents GET returns JSON without redirect | Frontend calls /api/cat-paws directly; alias route simplified |
| CORS-02: /api/agents/[id] works without redirect | Frontend calls /api/cat-paws/[id] directly; alias route simplified |
| CORS-03: No fetch to /api/agents in catbrains pages | All catbrains page fetches updated to /api/cat-paws |
