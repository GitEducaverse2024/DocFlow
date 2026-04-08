# Phase 122: User Memory (Capa 0) - Research

**Researched:** 2026-04-08
**Domain:** Recipe-based workflow memory with keyword matching and fast-path execution
**Confidence:** HIGH

## Summary

Phase 122 implements the "Capa 0" fast-path layer for CatBot: when CatBot successfully resolves a complex task (2+ tool calls), it auto-saves a "recipe" to `user_memory` in catbot.db. On subsequent interactions, CatBot checks if the user's message matches any stored recipe trigger patterns before engaging the full reasoning protocol. If a match is found, it executes the recipe directly -- skipping knowledge tree lookup and complex reasoning, resulting in noticeably faster responses.

The infrastructure is largely in place from previous phases: `catbot-db.ts` already has the `user_memory` table with `saveMemory()` and `getMemories()` CRUD functions (Phase 118), `PromptAssembler` already injects the reasoning protocol with Capa 0 skip instructions at P1 priority (Phase 121), and `route.ts` already has the post-conversation hook pattern (profile update after tool calls). What's missing is the `MemoryService` orchestration layer (matching, auto-save, success tracking), its integration into `route.ts` (pre-flight match + post-conversation save), a missing `updateRecipeSuccess()` DB function, and CatBot tools to let users inspect/manage their recipes.

**Primary recommendation:** Build a `catbot-memory.ts` MemoryService with 3 core functions: `matchRecipe(userId, query)` for pre-flight matching, `autoSaveRecipe(userId, query, toolResults, conversationId)` for post-conversation save, and `updateSuccess(recipeId)` for success tracking. Integrate into `route.ts` at the existing pre-flight and post-conversation hook points. Use multi-keyword matching with a minimum 2-keyword threshold to avoid false positives (Pitfall 4 from PITFALLS.md).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEMORY-01 | CatBot guarda recipes en user_memory cuando resuelve exitosamente una tarea compleja | MemoryService.autoSaveRecipe() called in post-conversation hook when toolResults.length >= 2 |
| MEMORY-02 | Cada recipe tiene trigger_patterns, steps y preferences | Already in user_memory schema: trigger_patterns (JSON string[]), steps (JSON object[]), preferences (JSON object) |
| MEMORY-03 | Al inicio de cada interaccion, CatBot busca recipes que coincidan (Capa 0) | MemoryService.matchRecipe() called in pre-flight before PromptAssembler.build() |
| MEMORY-04 | Si hay match en Capa 0, CatBot ejecuta recipe directamente sin reasoning complejo | Recipe injected into system prompt as P0 section with explicit execution instructions |
| MEMORY-05 | success_count y last_used se actualizan en cada uso exitoso | New updateRecipeSuccess() DB function + MemoryService.updateSuccess() called after recipe execution |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | user_memory table CRUD | Already used for catbot.db, synchronous, fast for keyword matching |
| vitest | (existing) | TDD for MemoryService | Already configured in app/vitest.config.ts, used for all catbot services |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @/lib/utils (generateId) | (existing) | UUID generation for recipe IDs | Every new recipe save |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Keyword matching in JS | SQLite FTS5 | FTS5 is more powerful but adds schema complexity; <100 recipes per user makes JS matching sufficient |
| LLM-based relevance scoring | Multi-keyword threshold | LLM scoring adds latency to every message; keyword matching is zero-cost and sufficient for MVP |
| Vector embeddings (Qdrant) | Keyword patterns | Explicitly out of scope per REQUIREMENTS.md; overkill for <100 recipes |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  services/
    catbot-memory.ts          # NEW: MemoryService (matchRecipe, autoSaveRecipe, updateSuccess)
  catbot-db.ts                # MODIFIED: add updateRecipeSuccess(), getRecipesByUser() with success ordering
  __tests__/
    catbot-memory.test.ts     # NEW: TDD tests for MemoryService
```

### Pattern 1: Pre-flight Recipe Matching (route.ts integration)

**What:** Before building the system prompt, check if the user's latest message matches a stored recipe. If match found, inject the recipe as a high-priority prompt section so CatBot executes it directly.

**When to use:** Every incoming message in route.ts, before PromptAssembler.build().

**How it works in route.ts:**
```typescript
// Pre-flight: check Capa 0 memory
const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
const matchedRecipe = matchRecipe(userId, lastUserMessage);

// Pass to PromptAssembler via new context field
const systemPrompt = buildPrompt({
  ...existingContext,
  matchedRecipe: matchedRecipe ? {
    trigger: matchedRecipe.trigger_patterns,
    steps: JSON.parse(matchedRecipe.steps),
    preferences: JSON.parse(matchedRecipe.preferences),
    recipeId: matchedRecipe.id,
  } : undefined,
});
```

**Key insight:** The recipe is NOT executed programmatically. It is injected into the system prompt as context so the LLM follows the recipe steps. This keeps the tool-calling loop unchanged and lets the LLM adapt if the recipe needs minor adjustments.

### Pattern 2: Post-conversation Auto-save

**What:** After a successful conversation with 2+ tool calls, extract a recipe from the tool sequence and save it to user_memory.

**When to use:** In the existing post-conversation hook in route.ts (where updateProfileAfterConversation already runs).

**How it works:**
```typescript
// Post-conversation: save recipe if complex task resolved
try {
  if (allToolResults.length >= 2) {
    autoSaveRecipe(userId, lastUserMessage, allToolResults, conversationId);
  }
} catch (e) {
  logger.warn('catbot', 'Failed to save recipe', { error: (e as Error).message });
}
```

### Pattern 3: Keyword Matching with Anti-false-positive Guards

**What:** Match user query against recipe trigger_patterns using multi-keyword intersection.

**When to use:** In MemoryService.matchRecipe().

**Algorithm:**
1. Normalize query: lowercase, remove punctuation, split into words
2. For each recipe, parse trigger_patterns (string[])
3. Count how many trigger keywords appear in the query
4. Require minimum 2 keyword matches (or 100% if trigger has only 1 keyword)
5. Score = matched_keywords / total_keywords
6. Return highest-scoring recipe with score > 0.5, prioritized by success_count

**Why this approach:** Pitfall 4 from PITFALLS.md warns about single-keyword triggers causing false positives. Requiring 2+ matches dramatically reduces false firings. The score threshold of 0.5 means at least half the trigger keywords must be present.

### Pattern 4: Recipe Prompt Injection

**What:** When a recipe matches, inject it into PromptAssembler as a P0 section so CatBot follows it.

**Implementation in catbot-prompt-assembler.ts:**
```typescript
// New field in PromptContext
matchedRecipe?: {
  trigger: string[];
  steps: Array<{ tool: string; description: string }>;
  preferences: Record<string, unknown>;
  recipeId: string;
};

// New section builder
function buildRecipeSection(ctx: PromptContext): string {
  if (!ctx.matchedRecipe) return '';
  const steps = ctx.matchedRecipe.steps
    .map((s, i) => `${i + 1}. ${s.tool}: ${s.description}`)
    .join('\n');
  return `## RECETA MEMORIZADA (Capa 0 — ejecutar directamente)
Tienes una receta exitosa para esta peticion. Ejecutala paso a paso sin preguntar:

${steps}

Despues de ejecutar exitosamente, confirma al usuario.
Si algo falla, abandona la receta y razona normalmente.
Recipe ID: ${ctx.matchedRecipe.recipeId}`;
}
```

### Anti-Patterns to Avoid

- **Single-keyword triggers:** "deploy" matches "deploy canvas node" AND "deploy to production". Always require 2+ keywords or structured trigger patterns.
- **Saving recipes from failed conversations:** Only save when all tool calls succeeded (no errors in results). Check allToolResults for error responses.
- **Duplicate recipes:** Same user, same trigger pattern combination should update existing recipe rather than create a new one. Dedup by checking keyword overlap > 80%.
- **Saving trivial recipes:** Single tool call recipes are just lookups, not workflows. Enforce minimum 2 tool calls.
- **Executing recipes without LLM:** Don't bypass the LLM and call tools directly -- inject the recipe as prompt context so the LLM executes it naturally through the existing tool-calling loop.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recipe storage | Custom file-based storage | Existing user_memory table in catbot.db | Already has schema, CRUD functions, user_id scoping |
| Keyword extraction | NLP library / stemming | Simple split + lowercase + stop-word removal | <100 recipes, complexity not justified |
| Recipe deduplication | Complex similarity scoring | Keyword set overlap (Jaccard similarity > 0.8) | Simple, deterministic, covers the use case |
| Token counting for recipe injection | tiktoken / external lib | Character-based estimation (4 chars/token) | Already used by PromptAssembler budget system |

## Common Pitfalls

### Pitfall 1: False Positive Trigger Matches
**What goes wrong:** Single-keyword triggers like "email" fire on unrelated queries ("explain email connectors" vs "send an email to client X")
**Why it happens:** Over-simplified matching logic
**How to avoid:** Require minimum 2 keyword matches. Use structured trigger_patterns as arrays, not single strings. Include anti-keywords to prevent false matches.
**Warning signs:** Users getting confused by CatBot referencing workflows they didn't ask about

### Pitfall 2: Saving Recipes from Failed/Partial Conversations
**What goes wrong:** A recipe is saved from a conversation where one tool call failed, leading to a broken workflow being replayed
**Why it happens:** Auto-save triggers on tool call count without checking success
**How to avoid:** Check that no tool result contains `error` or `SUDO_REQUIRED` before saving. Only save when the conversation completed naturally (not aborted).

### Pitfall 3: Recipe Injection Bloating the System Prompt
**What goes wrong:** A matched recipe with 8 steps and detailed preferences adds 500+ tokens to an already large prompt, pushing Libre tier models over budget
**How to avoid:** Cap recipe injection at 500 characters. Use P1 priority (not P0) so the budget system can truncate it on Libre models if needed. Keep step descriptions terse.

### Pitfall 4: Race Condition in Success Tracking
**What goes wrong:** The recipe success_count is updated before knowing if the execution actually succeeded
**How to avoid:** Update success_count in the post-conversation hook (after all tool calls complete), not at match time. Pass recipeId through the conversation flow and update only on success.

### Pitfall 5: Stale Recipes After Platform Changes
**What goes wrong:** A recipe references a tool or workflow that changed (e.g., tool renamed, connector removed), causing errors when replayed
**How to avoid:** When a recipe execution fails (tool returns error), decrement success_count. If success_count reaches 0, mark recipe as inactive. This provides natural decay for stale recipes.

## Code Examples

### catbot-db.ts additions needed

```typescript
// Missing function: update recipe success metrics
export function updateRecipeSuccess(id: string): void {
  catbotDb.prepare(`
    UPDATE user_memory
    SET success_count = success_count + 1, last_used = datetime('now')
    WHERE id = ?
  `).run(id);
}

// Missing function: get recipes ordered by success (for matching priority)
export function getRecipesForUser(userId: string, limit = 20): MemoryRow[] {
  return catbotDb.prepare(
    'SELECT * FROM user_memory WHERE user_id = ? ORDER BY success_count DESC, last_used DESC LIMIT ?'
  ).all(userId, limit) as MemoryRow[];
}

// Missing function: find duplicate recipe by trigger overlap
export function findSimilarRecipe(userId: string, triggerPatterns: string[]): MemoryRow | undefined {
  const recipes = getMemories(userId);
  for (const recipe of recipes) {
    const existing = JSON.parse(recipe.trigger_patterns) as string[];
    const overlap = triggerPatterns.filter(t => existing.includes(t)).length;
    const jaccard = overlap / new Set([...triggerPatterns, ...existing]).size;
    if (jaccard > 0.8) return recipe;
  }
  return undefined;
}
```

### MemoryService core functions

```typescript
// catbot-memory.ts

// Normalize query for matching
function normalizeQuery(query: string): string[] {
  const stopWords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'a', 'y', 'o', 'que', 'por', 'para', 'con', 'mi', 'me', 'se']);
  return query
    .toLowerCase()
    .replace(/[^\w\sáéíóúñ]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

// Match recipe against query
export function matchRecipe(userId: string, query: string): MemoryRow | null {
  const queryWords = normalizeQuery(query);
  if (queryWords.length === 0) return null;

  const recipes = getRecipesForUser(userId, 20);
  let bestMatch: MemoryRow | null = null;
  let bestScore = 0;

  for (const recipe of recipes) {
    const triggers = JSON.parse(recipe.trigger_patterns) as string[];
    const matchCount = triggers.filter(t =>
      queryWords.some(w => w.includes(t.toLowerCase()) || t.toLowerCase().includes(w))
    ).length;

    // Require minimum 2 matches (or all if trigger has only 1 keyword)
    const minRequired = Math.min(2, triggers.length);
    if (matchCount < minRequired) continue;

    const score = matchCount / triggers.length;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = recipe;
    }
  }

  return bestMatch;
}

// Extract trigger patterns from user query
function extractTriggerPatterns(query: string, toolResults: ToolResult[]): string[] {
  const queryWords = normalizeQuery(query);
  // Add tool names as additional keywords
  const toolNames = [...new Set(toolResults.map(r => r.name))];
  return [...new Set([...queryWords.slice(0, 5), ...toolNames])];
}

// Auto-save recipe after successful complex interaction
export function autoSaveRecipe(
  userId: string,
  query: string,
  toolResults: ToolResult[],
  conversationId?: string
): string | null {
  // Guard: minimum 2 tool calls
  if (toolResults.length < 2) return null;

  // Guard: no errors in results
  const hasErrors = toolResults.some(r => {
    const result = typeof r.result === 'string' ? r.result : JSON.stringify(r.result);
    return result.includes('"error"') || result.includes('SUDO_REQUIRED');
  });
  if (hasErrors) return null;

  const triggers = extractTriggerPatterns(query, toolResults);

  // Guard: dedup - check if similar recipe exists
  const existing = findSimilarRecipe(userId, triggers);
  if (existing) {
    updateRecipeSuccess(existing.id);
    return existing.id;
  }

  // Build steps from tool sequence
  const steps = toolResults.map(r => ({
    tool: r.name,
    args_keys: Object.keys(r.args || {}),
    description: `Llamar ${r.name}`,
  }));

  return saveMemory({
    userId,
    triggerPatterns: triggers,
    steps,
    sourceConversationId: conversationId,
  });
}
```

### route.ts integration points

```typescript
// Pre-flight (after profile load, before buildPrompt):
const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
const matchedRecipe = matchRecipe(userId, lastUserMessage);

// Pass matchedRecipe to buildPrompt via PromptContext
const systemPrompt = buildPrompt({
  ...ctx,
  matchedRecipe: matchedRecipe ? {
    trigger: JSON.parse(matchedRecipe.trigger_patterns),
    steps: JSON.parse(matchedRecipe.steps),
    preferences: JSON.parse(matchedRecipe.preferences),
    recipeId: matchedRecipe.id,
  } : undefined,
});

// Post-conversation (alongside existing profile update):
try {
  if (allToolResults.length >= 2) {
    autoSaveRecipe(userId, lastUserMessage, allToolResults);
  }
  if (matchedRecipe && !hasErrors) {
    updateRecipeSuccess(matchedRecipe.id);
  }
} catch (e) {
  logger.warn('catbot', 'Memory save/update failed', { error: (e as Error).message });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No memory | Capa 0 recipe matching | Phase 122 | CatBot gets faster for repeated workflows |
| Hardcoded reasoning | 3-level adaptive protocol | Phase 121 | Capa 0 references already in prompt via `buildReasoningProtocol()` |
| No user scoping | user_id on all tables | Phase 118 | Recipes are per-user, never leak between web/telegram users |

## Open Questions

1. **CatBot tools for recipe management**
   - What we know: CLAUDE.md requires every feature to have a corresponding CatBot tool
   - What's unclear: Should there be `list_my_recipes` and `delete_recipe` tools, or is this admin-only via Settings UI?
   - Recommendation: Add `list_my_recipes` (always_allowed) and `forget_recipe` (permission-gated) tools. This satisfies the CatBot-as-oracle testing protocol and lets users manage their own memory.

2. **Recipe injection priority level**
   - What we know: P0 sections are never truncated. P1 can be truncated on Libre models.
   - What's unclear: Should matched recipes be P0 (always present) or P1 (may be truncated)?
   - Recommendation: Use P1. A matched recipe should not take priority over identity and tool instructions. On Libre models, if the recipe doesn't fit, CatBot falls back to normal reasoning -- this is acceptable degradation.

3. **Conversation ID tracking**
   - What we know: `saveConversation()` returns an id, but `route.ts` doesn't currently call it
   - What's unclear: Whether conversation persistence is wired into route.ts (it was part of Phase 118)
   - Recommendation: Check if conversation logging is active in route.ts. If not, recipe source_conversation_id can be null -- it's optional metadata.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts` |
| Full suite command | `cd /home/deskmath/docflow/app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEMORY-01 | autoSaveRecipe saves when 2+ successful tool calls | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "autoSaveRecipe"` | Wave 0 |
| MEMORY-01 | autoSaveRecipe skips when <2 tool calls or errors | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "skip"` | Wave 0 |
| MEMORY-02 | Recipe has trigger_patterns, steps, preferences | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "recipe structure"` | Wave 0 |
| MEMORY-03 | matchRecipe finds matching recipe by keywords | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "matchRecipe"` | Wave 0 |
| MEMORY-03 | matchRecipe returns null for no match | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "no match"` | Wave 0 |
| MEMORY-04 | PromptAssembler injects recipe section when matchedRecipe present | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -t "recipe"` | Wave 0 |
| MEMORY-05 | updateRecipeSuccess increments success_count and last_used | unit | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts -t "updateSuccess"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-memory.test.ts`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npx vitest run`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-memory.test.ts` -- covers MEMORY-01 through MEMORY-05
- [ ] `app/src/lib/services/catbot-memory.ts` -- MemoryService implementation
- [ ] New tests in `catbot-prompt-assembler.test.ts` for matchedRecipe section

## Sources

### Primary (HIGH confidence)
- Direct code analysis: `app/src/lib/catbot-db.ts` -- existing user_memory schema, saveMemory(), getMemories()
- Direct code analysis: `app/src/lib/services/catbot-prompt-assembler.ts` -- PromptContext interface, buildReasoningProtocol() with Capa 0 reference, budget system
- Direct code analysis: `app/src/app/api/catbot/chat/route.ts` -- pre-flight profile load pattern, post-conversation hook pattern
- Direct code analysis: `app/src/lib/services/catbot-user-profile.ts` -- ToolResult interface (reusable), updateProfileAfterConversation pattern
- Phase 121 summary: `121-01-SUMMARY.md` -- confirms reasoning protocol with Capa 0 skip is implemented

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` -- Pitfall 4 (trigger matching false positives), Pitfall 8 (over-asking)
- `.planning/research/ARCHITECTURE.md` -- Pattern 3 (Capa 0 Memory Fast Path), MemoryService design
- `.planning/research/FEATURES.md` -- User Memory feature analysis, anti-feature justification (no vector search)
- `.planning/REQUIREMENTS.md` -- MEMORY-01 through MEMORY-05 requirement definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - follows established patterns from phases 118-121 (service + DB CRUD + route.ts integration + PromptAssembler section)
- Pitfalls: HIGH - well-documented in PITFALLS.md, verified against codebase patterns
- Matching algorithm: MEDIUM - keyword matching is simple but the threshold tuning (0.5 score, 2 keyword minimum) may need adjustment based on real usage

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, internal project)
