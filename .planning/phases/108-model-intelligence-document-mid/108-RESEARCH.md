# Phase 108: Model Intelligence Document (MID) - Research

**Researched:** 2026-04-04
**Domain:** SQLite schema design, CRUD API routes, seed data management, markdown export for LLM consumption
**Confidence:** HIGH

## Summary

Phase 108 builds a "Model Intelligence Document" -- a SQLite-backed knowledge base that stores human-curated intelligence about each LLM model: tier classification (Elite/Pro/Libre), best-use descriptions, capability scores, approximate cost, and provider. This is a data modeling + CRUD phase with no new external dependencies. The project already has well-established patterns for SQLite table creation (in `db.ts`), API route structure (Next.js App Router), and CatBot-readable markdown export (from Phase 107's `inventoryToMarkdown()`).

The key design challenge is creating a schema that serves two consumers simultaneously: (1) humans editing via API/UI, and (2) CatBot consuming a concise markdown document for decision-making. The schema must be flexible enough to accommodate any model (known or future) while being structured enough to generate useful comparisons. The auto-creation hook (MID-05) connects Discovery to MID -- when a new model appears in inventory, a basic MID entry is created automatically.

**Primary recommendation:** Create a `model_intelligence` table in `db.ts` with a `MidService` in `src/lib/services/mid.ts` that handles CRUD + seed data + markdown export + auto-creation from Discovery. Expose via `/api/mid/` REST routes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MID-01 | SQLite table for MID balancing LLM legibility and human editing | Schema design below with TEXT fields for LLM readability + structured columns for programmatic access |
| MID-02 | Each model: tier, best-use description, capabilities, cost, provider | Column design with `tier` (enum-like TEXT), `best_use`, `capabilities`, `cost_tier`, `provider` |
| MID-03 | Seeds for current ecosystem models | Seed data insert pattern matching existing `api_keys` seeding in db.ts |
| MID-04 | Markdown export for CatBot context | `midToMarkdown()` function following `inventoryToMarkdown()` pattern from discovery.ts |
| MID-05 | Auto-create basic entry when Discovery finds new model not in MID | Hook in `getInventory()` or a separate `syncDiscoveryToMid()` function |
| MID-06 | Full CRUD API: list, edit, add manually, mark obsolete/retired | REST routes at `/api/mid/` following existing API patterns with `force-dynamic` |
| MID-07 | Models can be documented even if not currently active | `status` column with values: active, inactive, retired -- independent of Discovery status |
| MID-08 | Scores and descriptions editable by user | All non-key fields updatable via PATCH endpoint |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | Store MID table | Already the project's only DB, all tables live here |
| Next.js App Router | 14 (existing) | API routes for CRUD | Project convention -- all APIs are route handlers |
| src/lib/services/discovery.ts | (Phase 107) | Source of discovered models for auto-creation | Provides `getInventory()` and `DiscoveredModel` types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| src/lib/utils.ts `generateId()` | (existing) | Generate unique IDs for MID entries | Every INSERT operation |
| src/lib/logger.ts | (existing) | Structured logging | Service operations, seed events, errors |
| src/lib/cache.ts | (existing) | Cache markdown export | CatBot format endpoint to avoid regenerating on every call |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single `model_intelligence` table | JSON file on disk | SQLite is the project standard, supports queries, already has migration patterns |
| Capability scores as JSON blob | Separate `model_capabilities` table | JSON blob is simpler, avoids JOIN overhead -- capabilities are always read/written together |
| Markdown generation at request time | Pre-computed stored markdown | On-demand is simpler, data changes infrequently, cache handles perf |

## Architecture Patterns

### Recommended Project Structure
```
src/lib/services/
  mid.ts                    # MidService -- CRUD, seeds, markdown export, auto-create
  discovery.ts              # (existing) -- source of model inventory
src/app/api/
  mid/
    route.ts                # GET (list all) + POST (create new entry)
    [id]/
      route.ts              # GET (single) + PATCH (update) + DELETE (mark retired)
    catbot/
      route.ts              # GET -- markdown export for CatBot context injection
    sync/
      route.ts              # POST -- trigger sync from Discovery (auto-create missing)
```

### Pattern 1: MID Table Schema
**What:** Single table storing all model intelligence with structured + free-text columns.
**When to use:** MID-01, MID-02
**Example:**
```typescript
// In db.ts -- following existing CREATE TABLE IF NOT EXISTS pattern
db.exec(`
  CREATE TABLE IF NOT EXISTS model_intelligence (
    id TEXT PRIMARY KEY,
    model_key TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'Libre',
    best_use TEXT,
    capabilities TEXT,
    cost_tier TEXT DEFAULT 'free',
    cost_notes TEXT,
    scores TEXT,
    status TEXT DEFAULT 'active',
    auto_created INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);
```

**Column rationale:**
- `model_key`: Matches Discovery's `DiscoveredModel.id` format (`provider/model_id`), e.g. `ollama/gemma3:27b`. Used for linking.
- `tier`: TEXT enum -- `Elite`, `Pro`, `Libre`. TEXT not INTEGER for LLM readability in queries.
- `best_use`: Free-text description in Spanish, e.g. "Razonamiento complejo, analisis largo, tareas criticas"
- `capabilities`: JSON string of capability tags, e.g. `["function_calling","thinking","multimodal","128k_context"]`
- `cost_tier`: `free`, `low`, `medium`, `high`, `premium` -- approximate cost bracket
- `cost_notes`: Free text, e.g. "$3/$15 per 1M tokens input/output"
- `scores`: JSON object with numeric scores, e.g. `{"reasoning":9,"coding":8,"creativity":7,"speed":6,"multilingual":8}`
- `status`: `active`, `inactive`, `retired` -- MID-07 compliance
- `auto_created`: Flag to distinguish human-created vs Discovery-created entries

### Pattern 2: Seed Data for Current Ecosystem
**What:** Pre-populate MID with intelligence for known models (MID-03).
**When to use:** First run / table empty.
**Example:**
```typescript
// Following the api_keys seed pattern in db.ts
{
  const count = (db.prepare('SELECT COUNT(*) as c FROM model_intelligence').get() as { c: number }).c;
  if (count === 0) {
    const now = new Date().toISOString();
    const seed = db.prepare(
      `INSERT OR IGNORE INTO model_intelligence 
       (id, model_key, display_name, provider, tier, best_use, capabilities, cost_tier, cost_notes, scores, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    
    // Elite tier
    seed.run(generateId(), 'anthropic/claude-opus-4', 'Claude Opus 4', 'anthropic', 'Elite',
      'Razonamiento complejo, analisis profundo, tareas criticas de alta precision',
      '["function_calling","thinking","200k_context","vision"]',
      'premium', '$15/$75 por 1M tokens', '{"reasoning":10,"coding":9,"creativity":9,"speed":5,"multilingual":9}',
      'active', now, now);
    
    // ... more seeds
  }
}
```

### Pattern 3: Auto-Create from Discovery (MID-05)
**What:** When Discovery finds a model not present in MID, create a basic stub entry.
**When to use:** After each inventory refresh, or on-demand via sync endpoint.
**Example:**
```typescript
export function syncFromDiscovery(inventory: ModelInventory): { created: number; skipped: number } {
  const existing = new Set(
    (db.prepare('SELECT model_key FROM model_intelligence').all() as { model_key: string }[])
      .map(r => r.model_key)
  );

  let created = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const model of inventory.models) {
    if (existing.has(model.id)) {
      skipped++;
      continue;
    }

    const tier = model.is_local ? 'Libre' : 'Pro'; // Sensible default
    db.prepare(
      `INSERT INTO model_intelligence 
       (id, model_key, display_name, provider, tier, best_use, capabilities, status, auto_created, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      generateId(), model.id, model.name, model.provider, tier,
      'Auto-detectado -- pendiente de clasificacion manual',
      JSON.stringify(model.is_embedding ? ['embedding'] : ['chat']),
      'active', now, now
    );
    created++;
  }

  return { created, skipped };
}
```

### Pattern 4: CatBot Markdown Export (MID-04)
**What:** Concise, scannable markdown document with all model intelligence for system prompt injection.
**When to use:** CatBot context injection, similar to Discovery's `?format=catbot`.
**Example:**
```typescript
export function midToMarkdown(): string {
  const models = db.prepare(
    'SELECT * FROM model_intelligence WHERE status != ? ORDER BY tier, display_name'
  ).all('retired') as MidRow[];

  const lines: string[] = ['# Inteligencia de Modelos (MID)\n'];

  const byTier = { Elite: [] as MidRow[], Pro: [] as MidRow[], Libre: [] as MidRow[] };
  for (const m of models) {
    (byTier[m.tier as keyof typeof byTier] || byTier.Pro).push(m);
  }

  for (const [tier, tierModels] of Object.entries(byTier)) {
    if (tierModels.length === 0) continue;
    lines.push(`## ${tier}\n`);
    for (const m of tierModels) {
      lines.push(`### ${m.display_name} (${m.provider})`);
      if (m.best_use) lines.push(`Mejor uso: ${m.best_use}`);
      if (m.cost_notes) lines.push(`Coste: ${m.cost_notes}`);
      if (m.capabilities) {
        const caps = JSON.parse(m.capabilities);
        lines.push(`Capacidades: ${caps.join(', ')}`);
      }
      if (m.scores) {
        const scores = JSON.parse(m.scores);
        const scoreStr = Object.entries(scores).map(([k, v]) => `${k}:${v}/10`).join(' | ');
        lines.push(`Scores: ${scoreStr}`);
      }
      const statusTag = m.status === 'inactive' ? ' [INACTIVO]' : '';
      if (statusTag) lines.push(statusTag);
      lines.push('');
    }
  }

  return lines.join('\n');
}
```

### Anti-Patterns to Avoid
- **Storing capabilities as separate table rows:** Over-normalized. Capabilities are always read together. JSON blob is simpler and matches LLM readability needs.
- **Using Discovery model IDs as MID primary keys:** Discovery IDs can change (model renamed, tag updated). Use separate `id` with `model_key` as UNIQUE lookup.
- **Hardcoding model list without seed mechanism:** Seeds must be conditional (only when table empty) to avoid overwriting user edits on restart.
- **Forgetting `export const dynamic = 'force-dynamic'`:** All MID API routes read DB -- must be dynamic.
- **Using `process.env.X`:** Must use `process['env']['X']` bracket notation per project convention.
- **Using `crypto.randomUUID()`:** Must use `generateId()` from `@/lib/utils` per project convention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique IDs | `crypto.randomUUID()` | `generateId()` from `@/lib/utils` | Project convention, works in all envs |
| DB table creation | Manual SQL scripts | `db.exec()` in db.ts with `CREATE TABLE IF NOT EXISTS` | Project convention, auto-runs on startup |
| Column migrations | DROP/CREATE | `try { db.exec('ALTER TABLE x ADD COLUMN y') } catch {}` | Project convention, safe on restart |
| Markdown formatting | Template engine | String concatenation in service function | Simple, no deps, matches discovery.ts pattern |
| Cache for markdown | Custom TTL logic | `cacheGet`/`cacheSet` from `@/lib/cache.ts` | Already used throughout project |
| HTTP retry | Manual retry | `withRetry` from `@/lib/retry.ts` | Project convention (though MID is mostly DB reads) |

**Key insight:** MID is a pure data-modeling phase. No new libraries needed. Everything uses existing project patterns: table creation in db.ts, service layer in services/, API routes in api/, cache for performance.

## Common Pitfalls

### Pitfall 1: Seed Data Overwrites User Edits
**What goes wrong:** Seeds run on every startup and reset user-modified descriptions/scores back to defaults.
**Why it happens:** Using `INSERT OR REPLACE` instead of `INSERT OR IGNORE`, or re-seeding when rows already exist.
**How to avoid:** Check `COUNT(*) = 0` before seeding (exact pattern from `api_keys` in db.ts). Never reseed after initial population.
**Warning signs:** User edits disappear after Docker restart.

### Pitfall 2: JSON Parse Errors on Capabilities/Scores
**What goes wrong:** `JSON.parse(m.capabilities)` throws when field is null, empty, or malformed.
**Why it happens:** Auto-created entries or manual edits may leave JSON fields in bad state.
**How to avoid:** Always wrap JSON.parse in try-catch with fallback. Validate JSON on write (PATCH endpoint).
**Warning signs:** CatBot markdown export crashes, 500 on list endpoint.

### Pitfall 3: Model Key Mismatch Between Discovery and MID
**What goes wrong:** Discovery uses `ollama/gemma3:27b-it-qat` but MID was seeded with `ollama/gemma3:27b`. Auto-sync never matches.
**Why it happens:** Ollama model names include tags (`:latest`, `:27b-it-qat`), which vary.
**How to avoid:** Use exact Discovery `model.id` as `model_key`. Seeds should use the most common tag format. The sync function compares exact strings.
**Warning signs:** Discovery shows model as "new" even though it's already in MID under a slightly different key.

### Pitfall 4: Markdown Too Long for System Prompt
**What goes wrong:** With 30+ models, the MID markdown becomes too large for CatBot's context window.
**Why it happens:** Each model gets 4-6 lines, multiplied by many models.
**How to avoid:** Keep markdown concise (1-2 lines per model in compact view). Offer `?detail=compact` vs `?detail=full` params. Exclude retired and inactive-by-default.
**Warning signs:** CatBot performance degrades, context truncation.

### Pitfall 5: Concurrent Writes During Auto-Sync
**What goes wrong:** If sync runs while user is editing, SQLite may throw SQLITE_BUSY.
**Why it happens:** WAL mode helps but doesn't eliminate all conflicts.
**How to avoid:** Sync is fast (single transaction). Use `db.transaction()` for batch inserts. `busy_timeout = 5000` already set in db.ts handles short contention.
**Warning signs:** 500 errors on sync endpoint during editing.

## Code Examples

### API Route: List All MID Entries
```typescript
// src/app/api/mid/route.ts
import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status'); // active, inactive, retired, all
  
  let query = 'SELECT * FROM model_intelligence';
  const params: string[] = [];
  
  if (status && status !== 'all') {
    query += ' WHERE status = ?';
    params.push(status);
  } else if (!status) {
    query += " WHERE status != 'retired'";
  }
  
  query += ' ORDER BY tier, display_name';
  
  const rows = db.prepare(query).all(...params);
  return NextResponse.json({ models: rows });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(
    `INSERT INTO model_intelligence 
     (id, model_key, display_name, provider, tier, best_use, capabilities, cost_tier, cost_notes, scores, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, body.model_key, body.display_name, body.provider,
    body.tier || 'Libre', body.best_use || null,
    body.capabilities ? JSON.stringify(body.capabilities) : null,
    body.cost_tier || 'free', body.cost_notes || null,
    body.scores ? JSON.stringify(body.scores) : null,
    body.status || 'active', now, now
  );
  
  return NextResponse.json({ id, created: true });
}
```

### API Route: Update Single Entry (MID-08)
```typescript
// src/app/api/mid/[id]/route.ts
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json();
  const now = new Date().toISOString();
  
  // Build dynamic SET clause for partial updates
  const updates: string[] = [];
  const values: unknown[] = [];
  
  const allowedFields = ['display_name', 'tier', 'best_use', 'capabilities', 'cost_tier', 'cost_notes', 'scores', 'status'];
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      const val = (field === 'capabilities' || field === 'scores') 
        ? JSON.stringify(body[field]) 
        : body[field];
      updates.push(`${field} = ?`);
      values.push(val);
    }
  }
  
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }
  
  updates.push('updated_at = ?');
  values.push(now);
  values.push(params.id);
  
  const result = db.prepare(
    `UPDATE model_intelligence SET ${updates.join(', ')} WHERE id = ?`
  ).run(...values);
  
  return NextResponse.json({ updated: result.changes > 0 });
}
```

## State of the Art

| Old Approach (Current) | New Approach (Phase 108) | Impact |
|------------------------|--------------------------|--------|
| No model intelligence -- all models treated equal | Tiered classification (Elite/Pro/Libre) with capabilities | CatBot can recommend optimal model per task |
| Hardcoded model selection in code | MID-based intelligence document for decision support | Human-curated, editable knowledge base |
| No cost awareness | Cost tiers + notes per model | Can balance quality vs cost |
| New models need code changes to classify | Auto-create MID stub from Discovery | Zero-friction onboarding of new models |

## Open Questions

1. **Exact seed model list for MID-03**
   - What we know: Requirements mention Gemma 4 (E2B/E4B/26B/31B), Claude (Haiku 3.5/Sonnet 4/Opus 4), GPT-4o/4o-mini, Gemini 2.5 Pro/Flash, Llama 3.x, Mistral, Qwen
   - What's unclear: Exact model_key format for each (depends on how Discovery returns them)
   - Recommendation: Use Discovery IDs when possible. For models not yet in Discovery, use conventional `provider/model-name` format. Seeds should cover ~15-20 models.

2. **How much CatBot context budget for MID markdown?**
   - What we know: CatBot already receives Discovery inventory markdown. MID adds another document.
   - What's unclear: Total context budget allocated for model intelligence.
   - Recommendation: Keep MID compact mode under 2KB. Include tier + best_use + key scores only. Full mode available for detailed queries.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `app/vitest.config.ts` |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/mid.test.ts` |
| Full suite command | `cd /home/deskmath/docflow/app && npm run test:unit` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MID-01 | Table created with correct schema | unit (mock db) | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "schema"` | Wave 0 |
| MID-02 | Entry has tier, best_use, capabilities, cost, provider | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "fields"` | Wave 0 |
| MID-03 | Seeds populate known models when table empty | unit (mock db) | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "seed"` | Wave 0 |
| MID-04 | Markdown export produces valid, concise output | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "markdown"` | Wave 0 |
| MID-05 | Auto-create from Discovery for unknown models | unit (mock discovery + db) | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "sync"` | Wave 0 |
| MID-06 | CRUD operations: list, create, update, mark retired | unit (mock db) | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "crud"` | Wave 0 |
| MID-07 | Inactive models preserved in MID | unit | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "inactive"` | Wave 0 |
| MID-08 | Scores/descriptions updatable via PATCH | unit (mock db) | `npx vitest run src/lib/services/__tests__/mid.test.ts -t "update"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/mid.test.ts`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npm run test:unit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/services/__tests__/mid.test.ts` -- covers MID-01 through MID-08
- [ ] Mock patterns: reuse discovery.test.ts mock structure (db, cache, logger)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/lib/db.ts` -- table creation patterns, seed patterns, migration patterns
- Existing codebase: `src/lib/services/discovery.ts` -- `DiscoveredModel` type, `getInventory()`, `inventoryToMarkdown()` patterns
- Existing codebase: `src/app/api/discovery/models/route.ts` -- API route pattern with `?format=catbot`
- Existing codebase: `src/lib/services/__tests__/discovery.test.ts` -- test patterns with vitest mocks

### Secondary (MEDIUM confidence)
- Project conventions: `.claude/skills/docatflow-conventions.md` -- bracket env access, generateId(), force-dynamic, try-catch migrations

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing patterns
- Architecture: HIGH -- direct extension of Phase 107 patterns + existing db.ts patterns
- Pitfalls: HIGH -- identified from actual codebase patterns and SQLite behavior
- Seed data: MEDIUM -- exact model keys depend on Discovery output format at runtime

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain, 30 days)
