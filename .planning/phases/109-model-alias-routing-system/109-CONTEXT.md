# Phase 109: Model Alias Routing System - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace all hardcoded model references (`'gemini-main'`) with intention-based aliases that resolve intelligently using Discovery + MID with multi-layer fallback. The code speaks of intentions (chat-rag, process-docs, catbot...) instead of concrete models. Per-entity overrides (cat_paws.model, catbrains.default_model) continue working as direct overrides that bypass alias resolution.

</domain>

<decisions>
## Implementation Decisions

### Alias set & naming
- 8 aliases total, 1:1 with subsystems: `chat-rag`, `process-docs`, `agent-task`, `catbot`, `generate-content`, `embed`, `canvas-agent`, `canvas-format`
- Each alias maps to exactly one subsystem -- simple, predictable
- Seeds preserve current behavior exactly: all 7 chat aliases -> 'gemini-main', embed -> 'text-embedding-3-small'
- Zero behavior change on day 1 -- differentiation comes later via UI (Phase 111)

### Fallback strategy
- Chat aliases fallback chain: configured model -> Discovery check -> same-tier MID alternative -> CHAT_MODEL env -> error with clear message
- Same-tier-first matching: if Pro model is down, try another Pro before escalating to Elite or downgrading to Libre
- End of chain = error with clear message ("No model available for alias X. Check Discovery status."), never silent degradation to random model
- Embed alias has own simpler chain: configured embedding model -> EMBEDDING_MODEL env -> error. No MID tier matching for embeddings.
- All resolutions logged in structured JSONL (existing logger infrastructure). Each log: alias, requested model, resolved model, fallback used (yes/no), latency. Visible in /testing logs view.

### Migration order
- By risk level: least critical first, most complex last
- Order: Agent/skill/worker generation -> CatPaw execution -> Task executor -> Chat RAG -> CatBot -> Canvas (AGENT + OUTPUT) -> Doc processing
- 3 plans grouped by complexity:
  - Plan 1: Core infra -- alias table, alias-routing.ts service, seeds, resolveAlias(), audit of all hardcoded refs (ALIAS-01)
  - Plan 2: Easy migrations -- generation routes + CatPaw + Task executor (already use resolveModel)
  - Plan 3: Hard migrations -- CatBot + Chat RAG + Canvas + Doc processing
- Verification per subsystem: npm run build succeeds, app starts, trigger subsystem once, check JSONL logs show correct alias resolution
- Audit (ALIAS-01) is part of Plan 1 as a task that produces a checklist for Plans 2 and 3

### Storage & config model
- New SQLite table `model_aliases`: alias (PK), model_key, description, is_active. Clean, queryable, consistent with Discovery + MID tables pattern.
- Global aliases only for Phase 109. Per-entity model columns (cat_paws.model, catbrains.default_model) continue as direct overrides.
- All models validated with Discovery -- whether from alias resolution or direct config. Consistent behavior, catches down providers early.
- New service file: `src/lib/services/alias-routing.ts` -- houses resolveAlias(), seeds, fallback logic. Calls Discovery + MID + litellm.ts.

### Claude's Discretion
- Exact table schema columns beyond alias/model_key/description/is_active
- Internal caching strategy for alias resolution
- How resolveAlias() interacts with existing resolveModel() (wrap, replace, or chain)
- Exact log format fields beyond the required ones
- Whether to add a thin wrapper or modify each callsite directly during migration

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `litellm.ts:resolveModel()`: Already validates model availability with 60s cache. Foundation for alias resolution.
- `litellm.ts:getAvailableModels()`: Queries LiteLLM /v1/models, cached. Used by resolveModel.
- `discovery.ts:discoverAll()`: Phase 107 parallel provider discovery with 5-min TTL cache. Source of truth for model availability.
- `mid.ts`: Phase 108 model intelligence -- tier (Elite/Pro/Libre), capabilities, scores. Needed for same-tier fallback matching.
- `mid.ts:midToMarkdown()`: Exports MID as markdown for CatBot injection.
- Logger infrastructure: JSONL structured logging with /testing visualization.

### Established Patterns
- Service files in `src/lib/services/` with singleton pattern and lazy initialization
- SQLite tables created in `db.ts` with seed functions called on first startup
- `process['env']['VARIABLE']` bracket notation for env vars
- API routes export `dynamic = 'force-dynamic'`
- Settings stored as key/value in `settings` table

### Integration Points
- 8 subsystems to migrate (see Migration order above):
  - `app/api/catbot/chat/route.ts:321` -- CatBot (no resolveModel call currently)
  - `app/api/catbrains/[id]/chat/route.ts:92` -- Chat RAG (no resolveModel)
  - `lib/services/execute-catpaw.ts:465` -- CatPaw (already calls resolveModel)
  - `lib/services/task-executor.ts:22` -- Task executor (already calls resolveModel)
  - `lib/services/canvas-executor.ts:505,1535` -- Canvas AGENT + OUTPUT nodes (no resolveModel)
  - `app/api/agents/generate/route.ts:18` -- Agent generation (no resolveModel)
  - `app/api/skills/generate/route.ts` -- Skill generation (no resolveModel)
  - `app/api/workers/generate/route.ts` -- Worker generation (no resolveModel)
- Only CatPaw exec and Task executor currently call resolveModel() -- 6 others need migration

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 109-model-alias-routing-system*
*Context gathered: 2026-04-04*
