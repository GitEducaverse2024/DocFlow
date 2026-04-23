# Phase 55: Reset CatBrain - Research

**Researched:** 2026-03-21
**Domain:** CatBrain data cleanup (API + UI confirmation flow)
**Confidence:** HIGH

## Summary

This phase adds a "Reset" feature that wipes a CatBrain's data (sources, processing runs, Qdrant vectors, physical files) while preserving its configuration (name, description, system prompt, connectors, LLM model, icon). The existing codebase already has all the building blocks: the `DELETE` handler on `/api/catbrains/[id]` shows how to clean up Qdrant + files + DB; the `DeleteProjectDialog` component provides a perfect 2-step confirmation pattern (step 1 warning, step 2 type-name-to-confirm); and the `qdrant` service wraps all calls in `withRetry`.

The work is straightforward: create a new `POST /api/catbrains/[id]/reset` endpoint that performs selective cleanup (not full catbrain deletion), build a `ResetCatBrainDialog` component modeled after `DeleteProjectDialog`, and wire the "Resetear" button in `catbrain-entry-modal.tsx` to open this dialog instead of navigating to the sources step.

**Primary recommendation:** Model the reset endpoint after the existing DELETE handler but only delete sources/processing_runs/files/qdrant while preserving the catbrain row. Model the UI dialog after `DeleteProjectDialog` with added stats display.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RST-01 | POST /api/catbrains/[id]/reset deletes sources, processing_runs, Qdrant collection, physical files | DELETE handler at `[id]/route.ts` lines 72-137 shows exact pattern; `qdrant.deleteCollection()` already exists |
| RST-02 | Reset updates catbrain: rag_enabled=0, rag_collection=NULL, status='draft' | PATCH handler shows field update pattern; RAG DELETE route shows rag field reset pattern |
| RST-03 | Reset does NOT delete catbrain config, system prompt, connectors, LLM model | Catbrains table schema identified; preserved fields documented below |
| RST-04 | Step 1 confirmation modal shows what will be deleted (source count, vector count) | Stats endpoint at `/api/catbrains/[id]/stats` already returns `sources_count` and `vectors_count`; entry modal already fetches these |
| RST-05 | Step 2 requires typing exact CatBrain name to enable final button | `DeleteProjectDialog` implements this exact pattern with normalize+compare |
| RST-06 | Reset button disabled during execution; modal cannot be closed during reset | `DeleteProjectDialog` pattern with `deleting` state controls this |
| RST-07 | After reset completes, user lands on Sources Pipeline phase 1 (empty CatBrain) | Navigation: `router.push(\`/catbrains/${id}?flow=sources-pipeline\`)` |
| RST-08 | If Qdrant unavailable, continue with DB/file cleanup and log error | DELETE handler and RAG DELETE route both use try/catch around Qdrant calls and continue |
| RST-09 | Endpoint uses withRetry for Qdrant calls | `qdrant.deleteCollection()` already wraps in `withRetry` internally |
</phase_requirements>

## DB Schema (Relevant Tables)

### `catbrains` table
```sql
CREATE TABLE IF NOT EXISTS catbrains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  purpose TEXT,
  tech_stack TEXT,
  status TEXT DEFAULT 'draft',          -- RESET TO 'draft'
  agent_id TEXT,
  current_version INTEGER DEFAULT 0,
  rag_enabled INTEGER DEFAULT 0,        -- RESET TO 0
  rag_collection TEXT,                  -- RESET TO NULL
  created_at TEXT,
  updated_at TEXT
);
-- Additional columns (via migrations):
-- bot_created INTEGER DEFAULT 0
-- bot_agent_id TEXT
-- default_model TEXT                   -- PRESERVE
-- rag_indexed_version INTEGER          -- RESET TO NULL
-- rag_indexed_at TEXT                  -- RESET TO NULL
-- rag_model TEXT                       -- RESET TO NULL
-- system_prompt TEXT                   -- PRESERVE
-- mcp_enabled INTEGER DEFAULT 1        -- PRESERVE
-- icon_color TEXT DEFAULT 'violet'     -- PRESERVE
-- search_engine TEXT DEFAULT NULL      -- PRESERVE
-- is_system INTEGER DEFAULT 0          -- PRESERVE
```

**Fields to PRESERVE during reset:** id, name, description, purpose, tech_stack, agent_id, default_model, system_prompt, mcp_enabled, icon_color, search_engine, is_system, bot_created, bot_agent_id, created_at

**Fields to RESET:** status='draft', current_version=0, rag_enabled=0, rag_collection=NULL, rag_indexed_version=NULL, rag_indexed_at=NULL, rag_model=NULL, updated_at=now()

### `sources` table
```sql
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- 'file', 'url', 'youtube', 'note'
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT,               -- Full absolute path: /app/data/projects/{id}/sources/folder/uuid.ext
  file_type TEXT,
  file_size INTEGER,
  url TEXT,
  youtube_id TEXT,
  content_text TEXT,
  status TEXT DEFAULT 'pending',
  extraction_log TEXT,
  created_at TEXT,
  order_index INTEGER DEFAULT 0,
  process_mode TEXT DEFAULT 'process',
  content_updated_at TEXT,
  is_pending_append INTEGER DEFAULT 0
);
```

### `processing_runs` table
```sql
CREATE TABLE IF NOT EXISTS processing_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES catbrains(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  agent_id TEXT,
  status TEXT DEFAULT 'queued',
  input_sources TEXT,
  output_path TEXT,
  output_format TEXT DEFAULT 'md',
  tokens_used INTEGER,
  duration_seconds INTEGER,
  error_log TEXT,
  instructions TEXT,
  started_at TEXT,
  completed_at TEXT,
  worker_id TEXT,
  skill_ids TEXT
);
```

## Architecture Patterns

### Existing DELETE CatBrain Pattern (reference implementation)
**File:** `app/src/app/api/catbrains/[id]/route.ts` lines 72-137

The DELETE handler follows this order:
1. Verify catbrain exists, check `is_system` guard
2. Delete Qdrant collection (try/catch, continue on error)
3. Delete catbrain folder from disk (`fs.rmSync(catbrainDir, { recursive: true })`)
4. Delete bot files from disk
5. Delete from SQLite (CASCADE handles sources + processing_runs)
6. Collect errors array, return with warnings if any

**Key difference for RESET:** Step 5 becomes selective deletes (sources, processing_runs) + catbrain field updates instead of deleting the catbrain row.

### Existing RAG DELETE Pattern
**File:** `app/src/app/api/catbrains/[id]/rag/route.ts`

Uses `qdrant.deleteCollection()` (which internally uses `withRetry`), catches errors and continues, then updates catbrain fields:
```typescript
db.prepare(`UPDATE catbrains SET rag_enabled = 0, rag_collection = NULL, status = 'processed', updated_at = ? WHERE id = ?`)
  .run(new Date().toISOString(), catbrainId);
```

### Existing 2-Step Delete Confirmation Pattern
**File:** `app/src/components/projects/delete-project-dialog.tsx`

This is the **exact pattern** to replicate for the reset dialog:
- State: `step` (1 or 2), `confirmText`, `deleting`
- Step 1: Warning text + Cancel/Continue buttons
- Step 2: Input for typing name + `normalize()` comparison + disabled Delete button
- `normalize()` function: `s.trim().replace(/\s+/g, ' ').normalize('NFC')`
- Uses Dialog from shadcn/ui (not AlertDialog)
- Disables button during execution with `deleting` state

### Entry Modal Wiring
**File:** `app/src/components/catbrains/catbrain-entry-modal.tsx`

Currently the "reset" action navigates to step `'sources'`:
```typescript
{ key: 'reset', icon: AlertTriangle, step: 'sources', ... }
```
This needs to be changed to open the ResetCatBrainDialog instead of navigating.

The entry modal already fetches stats (`sources_count`, `vectors_count`) which the reset dialog needs for step 1.

### Navigation After Reset
**File:** `app/src/app/catbrains/[id]/page.tsx`

Sources Pipeline is shown when `flow === 'sources-pipeline'`:
```typescript
router.push(`/catbrains/${catbrain.id}?flow=sources-pipeline`);
```
This is the same pattern the entry modal uses for "New Sources" action. After reset completes, redirect to this URL.

### File Storage Pattern
Files are stored at: `PROJECTS_PATH/{catbrainId}/sources/`
- `PROJECTS_PATH` = `process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects')`
- Each file: `{sourcesDir}/{uuid}.ext` or `{sourcesDir}/{relativeDir}/{uuid}.ext`
- Each file has a `.meta.json` companion: `{sourcesDir}/{uuid}.meta.json`
- Processing outputs go to `{projectsPath}/{catbrainId}/versions/` (from processing_runs.output_path)

For reset, delete the entire `{projectsPath}/{catbrainId}/` directory and its contents using `fs.rmSync(dir, { recursive: true, force: true })`, same as the DELETE handler.

### Qdrant Service
**File:** `app/src/lib/services/qdrant.ts`

All methods already use `withRetry`. Key method for reset:
```typescript
async deleteCollection(name: string) {
  return withRetry(async () => {
    const res = await fetch(`${QDRANT_URL}/collections/${name}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) { throw ... }
    return res.ok;
  });
}
```
- 404 is treated as success (collection doesn't exist)
- `withRetry` does 3 attempts with exponential backoff

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Qdrant retry logic | Custom retry | `qdrant.deleteCollection()` from `@/lib/services/qdrant` | Already wraps `withRetry`, handles 404 |
| 2-step confirmation | Custom dialog flow | Copy pattern from `DeleteProjectDialog` | Proven UX, same normalize logic |
| Stats fetching | New stats endpoint | Existing `/api/catbrains/[id]/stats` | Already returns sources_count, vectors_count |
| File cleanup | Per-file deletion loop | `fs.rmSync(dir, { recursive: true, force: true })` | Handles nested dirs, meta files, everything |

## Common Pitfalls

### Pitfall 1: Forgetting to reset rag_indexed_version and rag_model
**What goes wrong:** After reset, the catbrain thinks it still has RAG indexed at a version
**How to avoid:** Reset ALL rag-related fields: rag_enabled, rag_collection, rag_indexed_version, rag_indexed_at, rag_model

### Pitfall 2: Not resetting current_version
**What goes wrong:** Processing runs start at old version number after reset
**How to avoid:** Reset `current_version = 0` so next processing starts at version 1

### Pitfall 3: Closing modal during reset execution
**What goes wrong:** User closes modal mid-operation, UI state becomes inconsistent
**How to avoid:** Pass `onOpenChange` handler that checks `deleting` state; when resetting is in progress, prevent close. Use `onInteractOutside={(e) => e.preventDefault()}` on DialogContent.

### Pitfall 4: Entry modal action wiring
**What goes wrong:** Reset button in entry modal navigates away instead of opening confirmation
**How to avoid:** The reset action should NOT use `handleAction(step)`. Instead, it should set state to open the ResetCatBrainDialog, passing catbrain and stats data.

### Pitfall 5: Not handling is_system catbrains
**What goes wrong:** System catbrains get reset
**How to avoid:** Check `is_system` flag in the API endpoint, same guard as DELETE handler

## Code Examples

### Reset API Endpoint Structure
```typescript
// app/src/app/api/catbrains/[id]/reset/route.ts
import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { qdrant } from '@/lib/services/qdrant';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!catbrain) return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
  if (catbrain.is_system === 1) return NextResponse.json({ error: 'Cannot reset system CatBrain' }, { status: 403 });

  const errors: string[] = [];

  // 1. Delete Qdrant collection
  if (catbrain.rag_collection) {
    try {
      await qdrant.deleteCollection(catbrain.rag_collection as string);
    } catch (e) {
      errors.push(`Qdrant: ${(e as Error).message}`);
      logger.error('system', 'Qdrant delete failed during reset', { catbrainId: id, error: (e as Error).message });
    }
  }

  // 2. Delete physical files
  try {
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const catbrainDir = path.join(projectsPath, id);
    if (fs.existsSync(catbrainDir)) {
      fs.rmSync(catbrainDir, { recursive: true, force: true });
    }
  } catch (e) {
    errors.push(`Files: ${(e as Error).message}`);
  }

  // 3. Delete DB records
  db.prepare('DELETE FROM sources WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM processing_runs WHERE project_id = ?').run(id);

  // 4. Reset catbrain fields (preserve config)
  db.prepare(`UPDATE catbrains SET
    status = 'draft', current_version = 0,
    rag_enabled = 0, rag_collection = NULL,
    rag_indexed_version = NULL, rag_indexed_at = NULL, rag_model = NULL,
    updated_at = ?
    WHERE id = ?`
  ).run(new Date().toISOString(), id);

  return NextResponse.json({ success: true, warnings: errors.length > 0 ? errors : undefined });
}
```

### Reset Dialog Component Structure
```typescript
// Modeled after DeleteProjectDialog
// Key additions vs delete dialog:
// - Step 1 shows stats (source count, vector count) from parent
// - onOpenChange blocked during execution
// - After success, navigates to sources-pipeline
```

### Entry Modal Integration
```typescript
// In catbrain-entry-modal.tsx, the reset action should:
// 1. Not call handleAction('sources')
// 2. Instead, set state like: setShowResetDialog(true)
// 3. Pass catbrain + stats to ResetCatBrainDialog
// 4. On reset complete: close entry modal, navigate to sources-pipeline
```

## i18n Keys Needed

### Spanish (es.json) - under `catbrains.reset`
```json
{
  "reset": {
    "title": "Resetear CatBrain",
    "step1Description": "Se eliminaran {sourceCount} fuentes y {vectorCount} vectores. La configuracion, system prompt, conectores y modelo se mantendran.",
    "step1NoVectors": "Se eliminaran {sourceCount} fuentes. No hay vectores RAG. La configuracion se mantendra.",
    "step2Prompt": "Escribe {name} para confirmar el reseteo.",
    "cancel": "Cancelar",
    "continue": "Continuar",
    "confirm": "Resetear CatBrain",
    "resetting": "Reseteando...",
    "success": "CatBrain reseteado correctamente",
    "error": "Error al resetear el CatBrain"
  }
}
```

### English (en.json) - under `catbrains.reset`
```json
{
  "reset": {
    "title": "Reset CatBrain",
    "step1Description": "{sourceCount} sources and {vectorCount} vectors will be deleted. Configuration, system prompt, connectors, and model will be preserved.",
    "step1NoVectors": "{sourceCount} sources will be deleted. No RAG vectors. Configuration will be preserved.",
    "step2Prompt": "Type {name} to confirm the reset.",
    "cancel": "Cancel",
    "continue": "Continue",
    "confirm": "Reset CatBrain",
    "resetting": "Resetting...",
    "success": "CatBrain reset successfully",
    "error": "Error resetting CatBrain"
  }
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual testing (no automated test framework detected) |
| Config file | none |
| Quick run command | `cd ~/docflow/app && npm run build` |
| Full suite command | `cd ~/docflow/app && npm run build` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RST-01 | Reset endpoint deletes sources, runs, qdrant, files | manual | curl POST /api/catbrains/{id}/reset | N/A |
| RST-02 | Reset updates catbrain fields | manual | Verify DB state after reset | N/A |
| RST-03 | Reset preserves config fields | manual | Verify config fields unchanged after reset | N/A |
| RST-04 | Step 1 shows deletion stats | manual | Visual check in browser | N/A |
| RST-05 | Step 2 type-name confirmation | manual | Visual check in browser | N/A |
| RST-06 | Button disabled + modal locked during reset | manual | Visual check in browser | N/A |
| RST-07 | After reset lands on Sources Pipeline phase 1 | manual | Visual check navigation | N/A |
| RST-08 | Qdrant unavailable: continue cleanup | manual | Stop Qdrant, run reset, verify DB/files cleaned | N/A |
| RST-09 | withRetry used for Qdrant | manual-only | Code review: qdrant.deleteCollection() uses withRetry | N/A |

### Sampling Rate
- **Per task commit:** `cd ~/docflow/app && npm run build`
- **Per wave merge:** `cd ~/docflow/app && npm run build`
- **Phase gate:** Build succeeds + manual test checklist

### Wave 0 Gaps
None -- no automated test infrastructure exists in this project. Testing is manual + build verification per MEMORY.md.

## Sources

### Primary (HIGH confidence)
- `app/src/lib/db.ts` - Full DB schema with all tables and migrations
- `app/src/app/api/catbrains/[id]/route.ts` - DELETE handler (reference for cleanup logic)
- `app/src/app/api/catbrains/[id]/rag/route.ts` - RAG DELETE (reference for Qdrant cleanup)
- `app/src/lib/services/qdrant.ts` - Qdrant service with withRetry
- `app/src/lib/retry.ts` - withRetry implementation
- `app/src/components/projects/delete-project-dialog.tsx` - 2-step confirmation pattern
- `app/src/components/catbrains/catbrain-entry-modal.tsx` - Entry modal with reset action
- `app/src/components/catbrains/sources-pipeline.tsx` - Sources pipeline component
- `app/src/app/api/catbrains/[id]/stats/route.ts` - Stats endpoint (sources_count, vectors_count)
- `app/src/app/api/catbrains/[id]/sources/[sid]/route.ts` - Source deletion pattern
- `app/messages/es.json`, `app/messages/en.json` - i18n structure

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new deps needed
- Architecture: HIGH - directly copying existing patterns from same codebase
- Pitfalls: HIGH - identified from actual code review, not speculation

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable -- internal project patterns)
