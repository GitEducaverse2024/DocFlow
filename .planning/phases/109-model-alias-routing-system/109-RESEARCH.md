# Phase 109: Model Alias Routing System - Research

**Researched:** 2026-04-04
**Domain:** LLM model resolution / routing / fallback with SQLite + TypeScript services
**Confidence:** HIGH

## Summary

Phase 109 replaces all hardcoded `'gemini-main'` references across 8 subsystems with intention-based aliases (e.g., `chat-rag`, `catbot`, `embed`) that resolve intelligently through a multi-layer fallback chain: configured model -> Discovery availability check -> same-tier MID alternative -> CHAT_MODEL env -> error. The codebase already has strong foundations: `litellm.resolveModel()` with 60s cache, Discovery's `getInventory()` with 5-min TTL, and MID's tier/capabilities data. The new service (`alias-routing.ts`) wraps these into a single `resolveAlias(aliasName)` function.

The audit of hardcoded references found ~25+ occurrences of `'gemini-main'` across 15 files (API routes, services, UI components, DB seeds). Only 4 callsites currently use `resolveModel()` -- the other ~20 need migration. The migration is structured by risk level: generation routes (lowest risk) first, Canvas/CatBot/Doc processing (highest complexity) last.

**Primary recommendation:** Create the `model_aliases` table + `alias-routing.ts` service first (Plan 1), then migrate callsites in two batches grouped by complexity (Plans 2 and 3). Each subsystem migration is a find-and-replace of `'gemini-main'` with `await resolveAlias('alias-name')`, with verification after each.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- 8 aliases total, 1:1 with subsystems: `chat-rag`, `process-docs`, `agent-task`, `catbot`, `generate-content`, `embed`, `canvas-agent`, `canvas-format`
- Each alias maps to exactly one subsystem
- Seeds preserve current behavior: all 7 chat aliases -> 'gemini-main', embed -> 'text-embedding-3-small'
- Zero behavior change on day 1
- Chat aliases fallback chain: configured model -> Discovery check -> same-tier MID alternative -> CHAT_MODEL env -> error with clear message
- Same-tier-first matching for fallback
- End of chain = error with clear message, never silent degradation
- Embed alias has simpler chain: configured embedding model -> EMBEDDING_MODEL env -> error
- All resolutions logged in structured JSONL with: alias, requested model, resolved model, fallback used (yes/no), latency
- New SQLite table `model_aliases`: alias (PK), model_key, description, is_active
- Global aliases only for Phase 109. Per-entity model columns continue as direct overrides
- New service: `src/lib/services/alias-routing.ts`
- Migration order by risk: Agent/skill/worker generation -> CatPaw -> Task executor -> Chat RAG -> CatBot -> Canvas (AGENT + OUTPUT) -> Doc processing
- 3 plans: Plan 1 (core infra + audit), Plan 2 (easy migrations), Plan 3 (hard migrations)
- Verification per subsystem: npm run build, app starts, trigger subsystem, check JSONL logs

### Claude's Discretion
- Exact table schema columns beyond alias/model_key/description/is_active
- Internal caching strategy for alias resolution
- How resolveAlias() interacts with existing resolveModel() (wrap, replace, or chain)
- Exact log format fields beyond the required ones
- Whether to add a thin wrapper or modify each callsite directly during migration

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALIAS-01 | Audit completa del codebase: localizar CADA referencia a modelo LLM hardcodeado | Grep audit found ~25+ refs in 15 files -- checklist provided in Architecture Patterns |
| ALIAS-02 | Conjunto minimo de aliases de intencion | 8 aliases locked in CONTEXT.md, table schema researched |
| ALIAS-03 | Funcion de resolucion con Discovery + MID fallback | resolveAlias() design uses existing getInventory() + MID tier queries |
| ALIAS-04 | Registro de cada resolucion en logs | Logger infrastructure (JSONL) already exists, new 'alias' source needed |
| ALIAS-05 | Seeds por defecto que apuntan a modelos usados antes de migracion | Seed function pattern from MID (seedModels) directly reusable |
| ALIAS-06 | Migracion subsistema a subsistema | Integration points mapped with exact file:line references |
| ALIAS-07 | Verificacion manual tras cada subsistema migrado | Verification protocol defined per subsystem |
| ALIAS-08 | Fallback graceful multicapa | Fallback chain design with same-tier MID matching documented |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (project dep) | model_aliases table storage | Already used for all project tables |
| @/lib/cache | in-house | TTL cache for alias resolution | Already used by litellm.ts and discovery.ts |
| @/lib/logger | in-house | JSONL structured logging | Already used across all services |
| @/lib/services/discovery.ts | Phase 107 | Model availability checking | getInventory() returns live model list |
| @/lib/services/mid.ts | Phase 108 | Tier data for same-tier fallback | getAll() returns tier, model_key, status |
| @/lib/services/litellm.ts | existing | LLM proxy interaction | resolveModel() is the current resolution function |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @/lib/retry (withRetry) | in-house | Retry wrapper for external calls | Not needed for alias-routing itself (DB-only), but used by downstream LLM calls |
| @/lib/utils (generateId) | in-house | ID generation | Only if table needs auto-generated IDs (alias is PK so likely not needed) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite table for aliases | In-memory config object | Table is better: queryable, editable via future UI (Phase 111), persistent |
| Wrapping resolveModel() | Replacing resolveModel() | Wrapping is safer: existing callers still work, alias-routing adds layer on top |

## Architecture Patterns

### Recommended Project Structure
```
src/lib/services/
  alias-routing.ts       # NEW: resolveAlias(), seedAliases(), fallback logic
  litellm.ts             # EXISTING: resolveModel() stays, used by alias-routing internally
  discovery.ts           # EXISTING: getInventory() for availability check
  mid.ts                 # EXISTING: getAll() for same-tier fallback
```

### Pattern 1: resolveAlias() wraps existing infrastructure
**What:** New function `resolveAlias(alias: string)` that looks up the alias table, checks Discovery availability, falls back through MID tiers, then env var.
**When to use:** Every time code needs an LLM model identifier.
**Recommendation:** resolveAlias() should WRAP litellm.resolveModel(), not replace it. The chain:

```typescript
// src/lib/services/alias-routing.ts
import db from '@/lib/db';
import { logger } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';
import { getInventory } from '@/lib/services/discovery';
import { getAll as getMidModels } from '@/lib/services/mid';

interface AliasRow {
  alias: string;
  model_key: string;
  description: string;
  is_active: number;
}

interface AliasResolution {
  model: string;
  alias: string;
  fallback_used: boolean;
  fallback_reason?: string;
}

const CACHE_KEY = 'alias:resolved';
const CACHE_TTL = 30_000; // 30s -- shorter than Discovery (5min) to catch config changes

export async function resolveAlias(alias: string): Promise<string> {
  const start = Date.now();
  let fallbackUsed = false;
  let fallbackReason: string | undefined;

  // 1. Look up alias in DB
  const row = db.prepare(
    'SELECT * FROM model_aliases WHERE alias = ? AND is_active = 1'
  ).get(alias) as AliasRow | undefined;

  if (!row) {
    // Unknown alias -- fall through to CHAT_MODEL env
    const envModel = process['env']['CHAT_MODEL'] || '';
    if (envModel) {
      logResolution(alias, 'unknown', envModel, true, 'alias_not_found', Date.now() - start);
      return envModel;
    }
    throw new Error(`No model available for alias "${alias}". Check alias configuration.`);
  }

  const configuredModel = row.model_key;

  // 2. Check Discovery availability
  const inventory = await getInventory();
  const availableIds = new Set(inventory.models.map(m => m.model_id));

  if (availableIds.has(configuredModel)) {
    logResolution(alias, configuredModel, configuredModel, false, undefined, Date.now() - start);
    return configuredModel;
  }

  // 3. Same-tier MID fallback (chat aliases only, not embed)
  if (alias !== 'embed') {
    const midModels = getMidModels({ status: 'active' });
    const configuredMid = midModels.find(m => m.model_key === configuredModel);
    const targetTier = configuredMid?.tier || 'Pro';

    const sameTierAlternatives = midModels
      .filter(m => m.tier === targetTier && m.model_key !== configuredModel)
      .map(m => m.model_key);

    for (const alt of sameTierAlternatives) {
      if (availableIds.has(alt)) {
        logResolution(alias, configuredModel, alt, true, `same_tier_fallback:${targetTier}`, Date.now() - start);
        return alt;
      }
    }
  }

  // 4. Env fallback
  const envKey = alias === 'embed' ? 'EMBEDDING_MODEL' : 'CHAT_MODEL';
  const envModel = process['env'][envKey] || '';
  if (envModel) {
    logResolution(alias, configuredModel, envModel, true, 'env_fallback', Date.now() - start);
    return envModel;
  }

  // 5. Error -- no silent degradation
  logResolution(alias, configuredModel, 'NONE', true, 'no_model_available', Date.now() - start);
  throw new Error(
    `No model available for alias "${alias}". Configured: "${configuredModel}" is down. Check Discovery status.`
  );
}

function logResolution(
  alias: string,
  requested: string,
  resolved: string,
  fallback: boolean,
  reason: string | undefined,
  latencyMs: number,
): void {
  logger.info('system', `Alias resolved: ${alias} -> ${resolved}`, {
    alias,
    requested_model: requested,
    resolved_model: resolved,
    fallback_used: fallback,
    fallback_reason: reason,
    latency_ms: latencyMs,
  });
}
```

### Pattern 2: Seed function follows MID pattern
**What:** `seedAliases()` called from db.ts, only seeds when table is empty.
**When to use:** First startup or fresh DB.

```typescript
export function seedAliases(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM model_aliases').get() as { c: number }).c;
  if (count > 0) return;

  const seed = db.prepare(
    'INSERT OR IGNORE INTO model_aliases (alias, model_key, description, is_active) VALUES (?, ?, ?, 1)'
  );

  seed.run('chat-rag', 'gemini-main', 'Chat RAG conversations');
  seed.run('process-docs', 'gemini-main', 'Document processing');
  seed.run('agent-task', 'gemini-main', 'Agent task execution');
  seed.run('catbot', 'gemini-main', 'CatBot assistant');
  seed.run('generate-content', 'gemini-main', 'Content generation (agents, skills, workers)');
  seed.run('embed', 'text-embedding-3-small', 'Embedding generation');
  seed.run('canvas-agent', 'gemini-main', 'Canvas agent nodes');
  seed.run('canvas-format', 'gemini-main', 'Canvas output/storage formatting');

  logger.info('system', 'Seeded 8 model aliases');
}
```

### Pattern 3: Callsite migration pattern
**What:** Replace hardcoded model strings with resolveAlias() call.
**When to use:** Every subsystem migration.

```typescript
// BEFORE (typical pattern found in codebase):
const model = requestedModel || 'gemini-main';

// AFTER:
import { resolveAlias } from '@/lib/services/alias-routing';
const model = requestedModel || await resolveAlias('catbot');
```

For subsystems with per-entity overrides (CatPaw, CatBrains):
```typescript
// BEFORE:
const rawModel = paw.model || process['env']['CHAT_MODEL'] || 'gemini-main';

// AFTER -- per-entity override bypasses alias:
const rawModel = paw.model || await resolveAlias('agent-task');
// paw.model is a direct override, stays as-is. Only the fallback uses alias.
```

### Anti-Patterns to Avoid
- **Replacing resolveModel() entirely:** resolveModel() checks LiteLLM availability list. Alias routing is a HIGHER-level concept. Keep both -- alias-routing uses Discovery, resolveModel uses LiteLLM /v1/models. They check different things.
- **Caching alias DB lookups for too long:** Alias table is small and SQLite reads are fast (<1ms). Cache TTL should be short (30s) so UI config changes in Phase 111 take effect quickly.
- **Modifying UI components in this phase:** UI components like `catbot-panel.tsx` have `useState('gemini-main')` -- these are DEFAULT values for model selectors, not callsites. The API routes they call are the real migration targets. Leave UI defaults for Phase 111.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model availability checking | Custom health-check per model | `getInventory()` from Discovery | Already handles all providers, cached, parallel |
| Tier-based fallback matching | Manual tier comparison | MID `getAll()` filtered by tier | Already has tier classification for all seeded models |
| Structured logging | Custom log file writer | Existing `logger.info()` with metadata | JSONL format, rotation, /testing viewer already built |
| In-memory caching | Custom Map with expiry | `cacheGet/cacheSet` from @/lib/cache | TTL-based, used by every service in the project |

## Common Pitfalls

### Pitfall 1: Breaking per-entity model overrides
**What goes wrong:** Alias resolution overrides `cat_paws.model` or `catbrains.default_model` columns.
**Why it happens:** Temptation to route EVERYTHING through alias system.
**How to avoid:** Per-entity model columns are DIRECT overrides. If `paw.model` is set, use it directly (validated via Discovery). Only fall back to alias when no per-entity model is configured.
**Warning signs:** CatPaw or CatBrain configured with specific model but using a different one.

### Pitfall 2: Circular dependency between alias-routing and litellm
**What goes wrong:** alias-routing imports litellm, litellm imports alias-routing.
**Why it happens:** If trying to make litellm.resolveModel() call resolveAlias().
**How to avoid:** Keep them as separate layers. alias-routing calls Discovery directly, NOT litellm.resolveModel(). The callsite picks one or the other. New code uses resolveAlias(). Legacy code keeps resolveModel() until migrated.

### Pitfall 3: Forgetting `process['env']` bracket notation
**What goes wrong:** `process.env.CHAT_MODEL` gets inlined at build time by webpack, reads undefined at runtime.
**Why it happens:** Standard Node.js pattern doesn't work in Next.js.
**How to avoid:** Always use `process['env']['CHAT_MODEL']`. This is a project-wide critical rule.

### Pitfall 4: Missing async/await at callsites
**What goes wrong:** resolveAlias() returns a Promise, but callsite uses it synchronously.
**Why it happens:** Original hardcoded `'gemini-main'` was synchronous. The replacement is async.
**How to avoid:** Every `'gemini-main'` replacement MUST add `await`. Most callsites are already in async functions (API routes, service methods), so this is just adding the keyword.

### Pitfall 5: Embed alias fallback using CHAT_MODEL
**What goes wrong:** Embedding model falls back to a chat model, causing API errors.
**Why it happens:** Using same fallback chain for all aliases.
**How to avoid:** Embed alias has its own chain: configured model -> EMBEDDING_MODEL env -> error. Never falls back to CHAT_MODEL. Never does MID tier matching.

### Pitfall 6: Not adding 'alias' or 'alias-routing' as LogSource
**What goes wrong:** TypeScript compilation error because logger source type is a union.
**Why it happens:** LogSource in logger.ts is a fixed union type.
**How to avoid:** Add the new source to the LogSource union in logger.ts, or use existing 'system' source.

## Code Examples

### Complete Hardcoded Reference Audit (ALIAS-01)

Files with `'gemini-main'` that need migration:

**API Routes (migration targets):**
1. `app/api/catbot/chat/route.ts:321` -- `requestedModel || catbotConfig.model || 'gemini-main'` -> resolveAlias('catbot')
2. `app/api/catbrains/[id]/chat/route.ts:92` -- `catbrain.default_model || process['env']['CHAT_MODEL'] || 'gemini-main'` -> resolveAlias('chat-rag')
3. `app/api/agents/generate/route.ts:18` -- `model || 'gemini-main'` -> resolveAlias('generate-content')
4. `app/api/skills/generate/route.ts:15` -- `model || 'gemini-main'` -> resolveAlias('generate-content')
5. `app/api/workers/generate/route.ts:15` -- `model || 'gemini-main'` -> resolveAlias('generate-content')
6. `app/api/catbrains/[id]/process/route.ts:286` -- `body.model || worker.model || 'gemini-main'` -> resolveAlias('process-docs')
7. `app/api/testing/generate/route.ts:100` -- `model: 'gemini-main'` -> resolveAlias('generate-content')
8. `app/api/cat-paws/[id]/chat/route.ts:480` -- `paw.model || process['env']['CHAT_MODEL'] || 'gemini-main'` -> resolveAlias('agent-task')

**Services (migration targets):**
9. `lib/services/canvas-executor.ts:505` -- agent node model -> resolveAlias('canvas-agent')
10. `lib/services/canvas-executor.ts:1366,1393` -- output node model -> resolveAlias('canvas-agent')
11. `lib/services/canvas-executor.ts:1535` -- storage format model -> resolveAlias('canvas-format')
12. `lib/services/canvas-executor.ts:112` -- callLLM helper default -> resolveAlias('canvas-agent')
13. `lib/services/task-executor.ts:22,499,570` -- task step model -> resolveAlias('agent-task')
14. `lib/services/execute-catpaw.ts:465` -- paw execution model -> resolveAlias('agent-task')
15. `lib/services/execute-catbrain.ts:142` -- catbrain processing -> resolveAlias('process-docs')
16. `lib/services/catbot-tools.ts:867` -- create_cat_paw default model -> resolveAlias('agent-task')

**DB Seeds & defaults (keep as-is or update to alias):**
17. `lib/db.ts:256` -- cat_paws table DEFAULT 'gemini-main' (schema default, keep)
18. `lib/db.ts:287,346,407` -- system paw seeds (keep, these are per-entity direct configs)
19. `lib/db.ts:906` -- model_usage_estimates seed (keep, reference data)
20. `lib/db.ts:1175` -- another table DEFAULT (keep)
21. `lib/db.ts:1301,1314` -- more seeds (keep, direct configs)

**UI Components (Phase 111, out of scope for 109):**
22. `components/catbot/catbot-panel.tsx:106` -- useState default (UI only)
23. `components/process/process-panel.tsx:703,771` -- SelectItem fallback (UI only)
24. `components/agents/agent-creator.tsx:393` -- SelectItem value (UI only)
25. `app/settings/page.tsx:820,884` -- default value (UI only)

**litellm.ts:48** -- `resolveModel()` fallback parameter default. Update to use CHAT_MODEL env or keep as compatibility layer.
**catbot-tools.ts:58** -- Schema description text, not runtime. Update description only.
**bundle-importer.ts:144** -- Import default model. Use resolveAlias('generate-content').

### Table Schema
```sql
CREATE TABLE IF NOT EXISTS model_aliases (
  alias TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

Recommendation: Add `created_at` and `updated_at` columns (consistent with all other tables in the project). Keep `alias` as PK (no separate id needed -- alias is the natural key and there are only 8 rows).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `'gemini-main'` everywhere | Intent-based aliases with smart fallback | Phase 109 (now) | Code speaks of intentions, not models |
| litellm.resolveModel() only checks LiteLLM /v1/models | resolveAlias() checks Discovery (all providers) + MID (tier matching) | Phase 109 (now) | Multi-layer availability checking |
| No fallback if model unavailable | Same-tier fallback via MID, then env var | Phase 109 (now) | Resilient to provider outages |

## Open Questions

1. **Should resolveAlias() also validate per-entity overrides via Discovery?**
   - What we know: CONTEXT.md says "All models validated with Discovery -- whether from alias resolution or direct config"
   - What's unclear: Whether to add Discovery validation to existing execute-catpaw/catbrain paths for their per-entity model columns
   - Recommendation: Yes, add Discovery check for per-entity models too, but as a separate concern (the per-entity model goes through Discovery check, not through alias resolution). This can be a simple utility: `validateModelAvailability(model)`.

2. **Cache strategy for alias resolution**
   - What we know: DB reads are <1ms for 8 rows. Discovery cache is 5min. MID data is DB-only.
   - Recommendation: Cache the full alias table in memory with 30s TTL using existing cacheGet/cacheSet. Don't cache the full resolution result (it depends on live Discovery state which already has its own cache).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `app/vitest.config.ts` |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts` |
| Full suite command | `cd /home/deskmath/docflow/app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALIAS-01 | All hardcoded refs identified | manual | Grep audit checklist (no automated test) | N/A |
| ALIAS-02 | 8 aliases exist in DB after seed | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "seed"` | Wave 0 |
| ALIAS-03 | resolveAlias returns correct model + fallback chain | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "resolve"` | Wave 0 |
| ALIAS-04 | Each resolution produces log entry | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "log"` | Wave 0 |
| ALIAS-05 | Seeds match pre-migration defaults | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "seed"` | Wave 0 |
| ALIAS-06 | Subsystems use resolveAlias | integration | `cd /home/deskmath/docflow/app && npm run build` (compile check) | N/A manual |
| ALIAS-07 | Manual verification per subsystem | manual-only | Trigger each subsystem, check JSONL logs | N/A |
| ALIAS-08 | Multi-layer fallback works correctly | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts -t "fallback"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/alias-routing.test.ts`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npx vitest run`
- **Phase gate:** Full suite green + `npm run build` succeeds + manual verification of JSONL logs

### Wave 0 Gaps
- [ ] `src/lib/services/__tests__/alias-routing.test.ts` -- covers ALIAS-02, ALIAS-03, ALIAS-04, ALIAS-05, ALIAS-08
- [ ] Mock pattern: follow existing `discovery.test.ts` and `mid.test.ts` mock patterns (vi.mock for db, cache, logger, discovery, mid)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `litellm.ts`, `discovery.ts`, `mid.ts`, `db.ts`, `cache.ts`, `logger.ts`
- Grep audit of all `'gemini-main'` references across `app/src/`
- Existing test files: `discovery.test.ts`, `mid.test.ts` for mock patterns
- `vitest.config.ts` for test framework configuration

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions from user discussion session
- REQUIREMENTS.md ALIAS-01 through ALIAS-08 specifications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use in the project, no new dependencies
- Architecture: HIGH - pattern directly follows existing service patterns (discovery.ts, mid.ts)
- Pitfalls: HIGH - identified from direct code inspection of actual callsites
- Migration map: HIGH - every reference found via grep, exact file:line documented

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- internal codebase, no external API changes expected)
