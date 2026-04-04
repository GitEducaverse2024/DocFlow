# Phase 107: LLM Discovery Engine - Research

**Researched:** 2026-04-04
**Domain:** LLM provider discovery, model inventory, caching, graceful degradation
**Confidence:** HIGH

## Summary

Phase 107 builds a unified Discovery Engine that knows what LLM models are available and operational at any moment. The codebase already has significant building blocks: `ollama.listModels()` fetches Ollama models with metadata, `litellm.getAvailableModels()` gets LiteLLM-routed models with 60s cache, the `/api/settings/models` endpoint aggregates both Ollama and API provider models, and the `/api/settings/api-keys/[provider]/test` endpoint can verify each provider independently. The `api_keys` table stores provider configuration (endpoint, key, test_status, is_active).

The work is to consolidate these scattered pieces into a single `DiscoveryService` with: (1) a unified inventory type combining Ollama metadata + provider model lists, (2) proper TTL cache with manual invalidation, (3) resilient parallel fetching that degrades cleanly per-provider, (4) a CatBot-friendly endpoint returning structured data for system prompt injection, and (5) non-blocking startup (lazy/background refresh).

**Primary recommendation:** Create a `src/lib/services/discovery.ts` service that wraps existing `ollama.ts` and `litellm.ts` plus direct provider API calls, returns a unified `ModelInventory`, caches with configurable TTL, and exposes via `/api/discovery/models` endpoint.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DISC-01 | Auto-discover all installed Ollama models (name, size, pull date) | `ollama.listModels()` already returns name, size_mb, family, parameter_size. Add `modified_at` from Ollama API response. |
| DISC-02 | Verify API providers (OpenAI, Anthropic, Google) with zero/minimal token cost | Existing test functions in `/api/settings/api-keys/[provider]/test/route.ts` use `/v1/models` (OpenAI), `/v1/models` (Anthropic), `/models?key=` (Google) -- all zero-token-cost endpoints. Reuse these patterns. |
| DISC-03 | List concrete models available per active provider | `/api/settings/models/route.ts` already does this with `PROVIDER_MODELS` static list + dynamic Ollama/LiteLLM. Enhance to use actual API responses instead of static lists. |
| DISC-04 | Cacheable inventory with reasonable TTL, force-refreshable | Existing `cacheGet`/`cacheSet`/`cacheInvalidate` in `src/lib/cache.ts`. Design cache key `discovery:inventory` with 5min TTL + invalidation endpoint. |
| DISC-05 | Internal endpoint consumable by CatBot with LLM-readable format | New `/api/discovery/models` endpoint. Add `?format=catbot` param for markdown-formatted summary suitable for system prompt injection. |
| DISC-06 | Clean degradation if Ollama or a provider is down | Use `Promise.allSettled()` pattern already used in `/api/health/route.ts`. Each provider returns partial results or empty. |
| DISC-07 | No hardcoded expected model list -- works with any models present | Ollama already dynamic. For API providers: switch from `PROVIDER_MODELS` static list to actual API model listing responses. |
| DISC-08 | Discovery does NOT block app startup | Do NOT add to `instrumentation.ts`. First request triggers lazy initialization. Background refresh optional via setInterval after first load. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | Read `api_keys` table for provider config | Already in project, stores provider endpoints/keys |
| node fetch | (built-in) | Call Ollama API, provider model list APIs | Already used throughout codebase |
| src/lib/cache.ts | (existing) | In-memory TTL cache | Already used by litellm.ts, settings routes |
| src/lib/retry.ts | (existing) | withRetry for external service calls | Project convention (CODING_RULES) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| src/lib/logger.ts | (existing) | Structured logging | All discovery operations |
| AbortSignal.timeout() | (built-in) | Request timeouts | Every external fetch (5s for discovery, 10s for verification) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory cache | SQLite cache table | Unnecessary complexity -- in-memory is fine for volatile inventory data that refreshes every 5 min |
| Background polling via setInterval | Instrumentation startup | Would violate DISC-08 (no blocking startup). Lazy + optional background is better. |
| LiteLLM as single source | Direct provider APIs | LiteLLM only knows about pre-configured routes, not all models a key can access. Need both. |

## Architecture Patterns

### Recommended Project Structure
```
src/lib/services/
  discovery.ts          # DiscoveryService -- main service
  ollama.ts             # (existing) -- Ollama API client
  litellm.ts            # (existing) -- LiteLLM proxy client
  llm.ts                # (existing) -- Direct provider calls
src/app/api/
  discovery/
    models/
      route.ts          # GET /api/discovery/models -- unified inventory endpoint
    refresh/
      route.ts          # POST /api/discovery/refresh -- force cache invalidation + refresh
```

### Pattern 1: Unified Model Inventory Type
**What:** A single TypeScript interface that normalizes models from all sources.
**When to use:** Every model from every provider gets normalized into this shape.
**Example:**
```typescript
export interface DiscoveredModel {
  id: string;               // Unique: "ollama/gemma3:27b" or "openai/gpt-4o"
  name: string;             // Display name: "Gemma 3 27B" or "GPT-4o"
  provider: 'ollama' | 'openai' | 'anthropic' | 'google' | 'litellm';
  model_id: string;         // Raw model ID: "gemma3:27b" or "gpt-4o"
  is_local: boolean;        // true for Ollama, false for API providers
  size_mb: number | null;   // Ollama only
  parameter_size: string | null; // "27B", "4o", etc
  family: string | null;    // "gemma", "llama", "gpt", "claude"
  quantization: string | null;  // Ollama only: "Q4_K_M"
  is_embedding: boolean;    // true if embedding model
  modified_at: string | null;   // Last pull/update date
}

export interface ProviderStatus {
  provider: string;
  status: 'connected' | 'disconnected' | 'no_key';
  latency_ms: number | null;
  error: string | null;
  model_count: number;
}

export interface ModelInventory {
  models: DiscoveredModel[];
  providers: ProviderStatus[];
  cached_at: string;        // ISO timestamp
  ttl_ms: number;
  is_stale: boolean;        // true if cache expired but serving stale
}
```

### Pattern 2: Parallel Provider Discovery with Graceful Degradation
**What:** Use `Promise.allSettled()` to query all providers in parallel, collect partial results.
**When to use:** Every inventory refresh.
**Example:**
```typescript
// Source: Pattern from existing /api/health/route.ts
async function discoverAll(): Promise<ModelInventory> {
  const providers = await getActiveProviders(); // from api_keys table

  const results = await Promise.allSettled(
    providers.map(p => discoverProvider(p))
  );

  const models: DiscoveredModel[] = [];
  const statuses: ProviderStatus[] = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      models.push(...result.value.models);
      statuses.push({ provider: providers[i].provider, status: 'connected', ...result.value.meta });
    } else {
      statuses.push({ provider: providers[i].provider, status: 'disconnected', latency_ms: null, error: result.reason?.message, model_count: 0 });
    }
  });

  return { models, providers: statuses, cached_at: new Date().toISOString(), ttl_ms: CACHE_TTL, is_stale: false };
}
```

### Pattern 3: Lazy Initialization with Background Refresh
**What:** First request triggers discovery, then optional setInterval refreshes in background.
**When to use:** Satisfy DISC-08 (non-blocking startup).
**Example:**
```typescript
let backgroundTimer: NodeJS.Timeout | null = null;

export async function getInventory(forceRefresh = false): Promise<ModelInventory> {
  if (!forceRefresh) {
    const cached = cacheGet<ModelInventory>('discovery:inventory');
    if (cached) return cached;
  }

  const inventory = await discoverAll();
  cacheSet('discovery:inventory', inventory, CACHE_TTL);

  // Start background refresh after first successful discovery
  if (!backgroundTimer) {
    backgroundTimer = setInterval(async () => {
      try {
        const inv = await discoverAll();
        cacheSet('discovery:inventory', inv, CACHE_TTL);
      } catch { /* silent -- stale cache is fine */ }
    }, CACHE_TTL);
    // Prevent timer from keeping Node alive
    if (backgroundTimer.unref) backgroundTimer.unref();
  }

  return inventory;
}
```

### Pattern 4: CatBot-Friendly Markdown Output
**What:** A formatted text view of the inventory for system prompt injection.
**When to use:** DISC-05 -- CatBot queries inventory to include in context.
**Example:**
```typescript
export function inventoryToMarkdown(inv: ModelInventory): string {
  const lines: string[] = ['# Modelos LLM Disponibles\n'];

  // Group by provider
  const byProvider = groupBy(inv.models, m => m.provider);
  for (const [provider, models] of Object.entries(byProvider)) {
    const status = inv.providers.find(p => p.provider === provider);
    lines.push(`## ${provider} (${status?.status || 'unknown'})`);
    for (const m of models) {
      const meta = [m.parameter_size, m.is_local ? 'local' : 'API', m.is_embedding ? 'embedding' : 'chat'].filter(Boolean).join(', ');
      lines.push(`- **${m.name}** (${m.model_id}) -- ${meta}`);
    }
    lines.push('');
  }

  lines.push(`_Actualizado: ${inv.cached_at}_`);
  return lines.join('\n');
}
```

### Anti-Patterns to Avoid
- **Hardcoded model lists:** `PROVIDER_MODELS` in `/api/settings/models/route.ts` is exactly what DISC-07 forbids. Discovery must query actual APIs.
- **Blocking startup:** Never add Discovery to `instrumentation.ts`. Lazy init only.
- **Single-source dependency:** Don't rely only on LiteLLM proxy for model lists. LiteLLM only knows its configured routes, not all available models on a provider.
- **process.env.VARIABLE:** Always use `process['env']['VARIABLE']` (bracket notation) per project convention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-memory TTL cache | Custom Map+setTimeout | Existing `src/lib/cache.ts` | Already battle-tested in project |
| HTTP retry logic | Manual retry loops | `withRetry` from `src/lib/retry.ts` | Project convention, handles backoff |
| Request timeouts | Manual AbortController | `AbortSignal.timeout(ms)` | Cleaner, already used project-wide |
| Provider endpoint/key lookup | Hardcoded config | `api_keys` SQLite table | Already seeded with all providers |
| Ollama model listing | Raw fetch | `ollama.listModels()` | Already parses metadata, identifies embedding models |

**Key insight:** 80% of the Discovery Engine already exists in scattered code. The work is consolidation + normalization + a proper service interface, NOT building from scratch.

## Common Pitfalls

### Pitfall 1: LiteLLM Returns Routes, Not All Provider Models
**What goes wrong:** Calling `LiteLLM /v1/models` returns only pre-configured proxy routes, not all models the API key has access to.
**Why it happens:** LiteLLM is a proxy; it only knows its config, not the provider's full catalog.
**How to avoid:** Query provider APIs directly for model lists (OpenAI `/v1/models`, Anthropic `/v1/models`, Google `/models`). Use LiteLLM list as a supplementary source.
**Warning signs:** Inventory shows fewer models than expected for a provider.

### Pitfall 2: Ollama Down Crashes App Startup
**What goes wrong:** If Ollama fetch throws and is not caught, it could crash the calling route or block instrumentation.
**Why it happens:** Missing try-catch or not using Promise.allSettled.
**How to avoid:** Always wrap Ollama calls in try-catch, return empty array on failure. Never add to instrumentation.ts.
**Warning signs:** App fails to start when Ollama container is stopped.

### Pitfall 3: Static Provider Model Lists Become Stale
**What goes wrong:** The current `PROVIDER_MODELS` hardcoded list (in settings/models/route.ts) doesn't update when providers add new models.
**Why it happens:** Models are hardcoded as `['openai/gpt-4o', 'openai/gpt-4o-mini']`.
**How to avoid:** Always query the actual provider API. The test endpoint already does this -- reuse those patterns.
**Warning signs:** New models not appearing; user must update code to see them.

### Pitfall 4: Anthropic Models Endpoint Requires Auth Header Differences
**What goes wrong:** Using `Authorization: Bearer` for Anthropic fails. Anthropic uses `x-api-key` header.
**Why it happens:** Not all providers follow OpenAI conventions.
**How to avoid:** Per-provider fetch logic already exists in the test route. Reuse the exact same auth patterns.
**Warning signs:** Anthropic always shows "disconnected" in discovery.

### Pitfall 5: Google API Key in Query Param, Not Header
**What goes wrong:** Google uses `?key=API_KEY` in URL, not an Authorization header.
**Why it happens:** Google's REST API convention differs.
**How to avoid:** Again, existing test functions have the correct patterns. Reuse them.
**Warning signs:** Google models never discovered.

### Pitfall 6: Cache Serves Stale Data After Provider Goes Down
**What goes wrong:** Models from a now-down provider appear "available" until cache expires.
**Why it happens:** Cache TTL hasn't expired yet.
**How to avoid:** Keep TTL reasonable (5 min). Include `cached_at` and `is_stale` in response. Let consumers decide how to handle staleness. Force-refresh endpoint for immediate update.
**Warning signs:** CatBot recommends a model that fails when actually used.

## Code Examples

### Fetching Ollama Models with Full Metadata
```typescript
// Source: Ollama API docs -- /api/tags response
// Existing ollama.listModels() already does this but misses modified_at
const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
const data = await res.json();
// Each model has: name, model, modified_at, size, digest, details{format, family, families, parameter_size, quantization_level}
```

### Zero-Cost Provider Verification (OpenAI)
```typescript
// Source: existing /api/settings/api-keys/[provider]/test/route.ts
const res = await fetch(`${endpoint}/models`, {
  headers: { 'Authorization': `Bearer ${key}` },
  signal: AbortSignal.timeout(10000),
});
// Returns model list -- zero tokens consumed
```

### Zero-Cost Provider Verification (Anthropic)
```typescript
// Source: existing /api/settings/api-keys/[provider]/test/route.ts
const modelsRes = await fetch(`${endpoint}/models`, {
  headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  signal: AbortSignal.timeout(10000),
});
```

### Zero-Cost Provider Verification (Google)
```typescript
// Source: existing /api/settings/api-keys/[provider]/test/route.ts
const res = await fetch(`${endpoint}/models?key=${key}`, {
  signal: AbortSignal.timeout(10000),
});
const data = await res.json();
const models = (data.models || []).map((m: { name: string }) => m.name.replace('models/', ''));
```

### Reading Active Providers from DB
```typescript
// Source: existing pattern in /api/settings/models/route.ts
import db from '@/lib/db';

interface ApiKeyRow {
  provider: string;
  api_key: string | null;
  endpoint: string | null;
  is_active: number;
  test_status: string;
}

function getActiveProviders(): ApiKeyRow[] {
  return db.prepare('SELECT * FROM api_keys WHERE is_active = 1').all() as ApiKeyRow[];
}
```

## State of the Art

| Old Approach (Current) | Current Approach (Target) | Impact |
|------------------------|--------------------------|--------|
| `PROVIDER_MODELS` static hardcoded list | Dynamic API queries per provider | DISC-07 compliance, auto-discovers new models |
| Separate `/api/models` and `/api/settings/models` | Single `/api/discovery/models` | One source of truth for all consumers |
| LiteLLM-only for model list | LiteLLM + direct provider APIs + Ollama | Complete inventory, not just proxy routes |
| No CatBot-readable format | `?format=catbot` markdown output | DISC-05, enables model-aware CatBot |
| 60s cache (litellm.ts) / 5min cache (settings) | Unified 5min cache with force-refresh | Consistent TTL, manual override |

**Deprecated/outdated:**
- `PROVIDER_MODELS` hardcoded map in `/api/settings/models/route.ts` -- replace with dynamic discovery
- `SUGGESTED_MODELS` in `/api/models/route.ts` -- this is embedding-specific, keep it but separate from discovery

## Open Questions

1. **Should Discovery include LiteLLM proxy models as a separate "provider"?**
   - What we know: LiteLLM acts as a gateway with its own route config. Its models may overlap with direct provider models.
   - What's unclear: Whether to show LiteLLM routes alongside or deduplicate with direct provider results.
   - Recommendation: Include LiteLLM as a provider but mark its models as `via_litellm: true`. Deduplicate by model_id if the same model appears from both LiteLLM and a direct provider -- prefer the direct provider entry.

2. **TTL duration -- 5 minutes or shorter?**
   - What we know: Current litellm.ts uses 60s, settings/models uses 5min, health uses 30s.
   - What's unclear: How frequently models actually change in this environment.
   - Recommendation: 5 minutes default. Models don't change often. Force-refresh covers urgent updates. Background refresh prevents truly stale data.

3. **Should embedding models be included in Discovery or filtered out?**
   - What we know: Current `/api/models?type=embedding` handles embedding models separately. CatBot doesn't need embedding models in its context.
   - Recommendation: Include ALL models in inventory (both chat and embedding) with `is_embedding` flag. Let consumers filter. DISC-01 says "all Ollama models installed."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `app/vitest.config.ts` (assumed -- check at Wave 0) |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/discovery.test.ts` |
| Full suite command | `cd /home/deskmath/docflow/app && npm run test:unit` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DISC-01 | Ollama models discovered with name, size, date | unit (mock fetch) | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "ollama"` | Wave 0 |
| DISC-02 | API providers verified with zero-cost calls | unit (mock fetch) | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "provider"` | Wave 0 |
| DISC-03 | Concrete models listed per active provider | unit (mock fetch + db) | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "models per provider"` | Wave 0 |
| DISC-04 | Cache works with TTL and force-refresh | unit | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "cache"` | Wave 0 |
| DISC-05 | CatBot endpoint returns structured/markdown data | unit (mock service) | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "catbot"` | Wave 0 |
| DISC-06 | Degradation when Ollama/provider down | unit (mock failures) | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "degradation"` | Wave 0 |
| DISC-07 | No hardcoded model list, dynamic discovery | unit (verify no static list) | `npx vitest run src/lib/services/__tests__/discovery.test.ts -t "dynamic"` | Wave 0 |
| DISC-08 | Discovery does not block startup | manual + unit | Verify `instrumentation.ts` unchanged; test lazy init | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx vitest run src/lib/services/__tests__/discovery.test.ts`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npm run test:unit`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/services/__tests__/discovery.test.ts` -- covers DISC-01 through DISC-08
- [ ] Verify `vitest.config.ts` exists and can resolve `@/` alias

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/lib/services/ollama.ts`, `src/lib/services/litellm.ts`, `src/app/api/settings/models/route.ts`, `src/app/api/settings/api-keys/[provider]/test/route.ts` -- these ARE the current implementation
- [Ollama API docs](https://docs.ollama.com/api/tags) -- `/api/tags` response format with `modified_at`, `details.family`, `details.parameter_size`, `details.quantization_level`
- [OpenAI Models API](https://developers.openai.com/api/reference/resources/models/methods/list) -- `/v1/models` list endpoint (zero cost)

### Secondary (MEDIUM confidence)
- Anthropic `/v1/models` endpoint -- verified working in existing test code with `x-api-key` + `anthropic-version` headers
- Google `/models?key=` endpoint -- verified working in existing test code

### Tertiary (LOW confidence)
- Background setInterval with `.unref()` in Next.js server -- works in Node.js but may not survive Next.js hot reload in dev. Needs validation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies needed
- Architecture: HIGH -- patterns directly derived from existing codebase code that works
- Pitfalls: HIGH -- identified from actual code review, not theoretical concerns

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain, 30 days)
