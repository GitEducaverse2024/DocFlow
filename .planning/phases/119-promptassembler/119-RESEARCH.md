# Phase 119: PromptAssembler - Research

**Researched:** 2026-04-08
**Domain:** Dynamic system prompt assembly, token budget management, knowledge tree integration
**Confidence:** HIGH

## Summary

Phase 119 replaces the monolithic `buildSystemPrompt()` function in `route.ts` (~350 lines of hardcoded string concatenation) with a modular `PromptAssembler` that composes the system prompt dynamically from the knowledge tree JSON files created in Phase 118, the existing CatBot config, and the user's current page context. The assembler must enforce a token budget to prevent context window overflow, especially on Libre-tier models with 8K context windows.

The knowledge tree infrastructure is ready: 7 JSON files (catboard, catbrains, catpaw, catflow, canvas, catpower, settings) with zod-validated loader (`knowledge-tree.ts`) and module-level caching. The conversation persistence API is operational. The current `buildSystemPrompt()` contains identity, personality, platform knowledge, stack info, sudo section, Holded section, model intelligence section, tool instructions, Canvas protocol, documentation tools, troubleshooting table, email protocol, and two always-on skills -- all of which must be migrated to or sourced from the knowledge tree.

Additionally, this phase must add a `query_knowledge` tool so CatBot can query the knowledge tree on-demand for information not injected in the prompt, and populate the `sources` arrays in the knowledge JSON files to point to `.planning/` documentation.

**Primary recommendation:** Build PromptAssembler as a pure function module (`catbot-prompt-assembler.ts`) with priority-ordered sections, a simple char-based token estimator (4 chars ~= 1 token), and section truncation. Replace `buildSystemPrompt()` call in route.ts with a single `PromptAssembler.build(ctx)` call. Add `query_knowledge` tool to catbot-tools.ts alongside existing `explain_feature`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROMPT-01 | PromptAssembler reemplaza el buildSystemPrompt() hardcodeado de route.ts con ensamblaje modular desde knowledge tree + perfil usuario + config | Architecture pattern: PromptAssembler.build() with PromptContext input, priority-ordered sections composed from knowledge-tree.ts loader + catbot_config from settings table |
| PROMPT-02 | El prompt se compone dinamicamente segun la pagina actual del usuario, cargando el JSON relevante del knowledge tree | Page-to-area mapping using knowledge JSON `path` field. 7 areas map to routes: / -> catboard, /catbrains -> catbrains, /agents -> catpaw, /catflow -> catflow, /canvas -> canvas, /catpower -> catpower (unused currently), /settings -> settings |
| PROMPT-03 | PromptAssembler tiene un presupuesto de tokens y trunca secciones de menor prioridad si excede el limite del modelo | Token budget system with char-based estimator (no tiktoken dependency needed). Priority tiers: P0 (identity+personality, never cut), P1 (page-specific knowledge, tool instructions), P2 (model intelligence, sudo, Holded), P3 (troubleshooting, secondary instructions). Truncate from P3 upward. |
| PROMPT-04 | El tool query_knowledge permite a CatBot consultar el knowledge tree por path y fulltext cuando necesita informacion no inyectada en el prompt | New tool in catbot-tools.ts. Uses knowledge-tree.ts `loadKnowledgeArea()` + `getAllKnowledgeAreas()` with keyword search across concepts, howto, common_errors, dont fields. Returns matched sections. |
| PROMPT-05 | Los sources en cada JSON del knowledge tree apuntan a los docs en .planning/ para que CatBot pueda profundizar con search_documentation | Populate `sources` array in all 7 knowledge JSON files with relevant .planning/ file paths. Currently all sources arrays are empty. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| knowledge-tree.ts | N/A (custom) | Load and cache knowledge JSON files | Already built in Phase 118 with zod validation and module-level caching |
| better-sqlite3 | existing | Read catbot_config from settings table | Already used throughout the project |
| zod | existing | Schema validation for assembler config | Already used in knowledge-tree.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | N/A | Token counting | Use simple char estimation (length / 4). No external tokenizer needed -- models range from 8K (Gemma) to 200K (Claude), and a ~20% safety margin with char estimation is sufficient for a system prompt assembler. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Char-based token estimation | tiktoken / gpt-tokenizer | Adds ~2MB dependency for marginal accuracy gain on system prompt sizing. Char/4 is standard practice for mixed-model systems. |
| Static section ordering | LLM-driven section selection | Massive complexity increase. Static priorities with page-context switching covers all requirements. |

**Installation:**
```bash
# No new dependencies needed -- all libraries already in project
```

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/services/
  catbot-prompt-assembler.ts     # NEW: PromptAssembler module
  catbot-tools.ts                # MODIFIED: add query_knowledge tool, keep explain_feature

app/src/app/api/catbot/chat/
  route.ts                       # MODIFIED: replace buildSystemPrompt() with PromptAssembler.build()

app/data/knowledge/
  *.json                         # MODIFIED: populate sources arrays (PROMPT-05)

app/src/lib/__tests__/
  catbot-prompt-assembler.test.ts  # NEW: unit tests for assembler
```

### Pattern 1: Priority-Ordered Prompt Sections

**What:** Each prompt section has a priority level (P0-P3). The assembler composes all sections, measures token count, and truncates from lowest priority upward until within budget.

**When to use:** When the total prompt content varies by context (page, sudo, channel) and can exceed model limits.

**Example:**
```typescript
// catbot-prompt-assembler.ts
interface PromptSection {
  id: string;
  priority: 0 | 1 | 2 | 3;  // 0 = never truncate, 3 = first to cut
  content: string;
}

interface PromptContext {
  page?: string;
  channel?: 'web' | 'telegram';
  hasSudo: boolean;
  catbotConfig: {
    model?: string;
    personality?: string;
    allowed_actions?: string[];
    instructions_primary?: string;    // Phase 120 will add these
    instructions_secondary?: string;  // Phase 120 will add these
  };
}

// Token budget defaults (chars, ~4 chars per token)
const MODEL_BUDGETS: Record<string, number> = {
  default: 16000,  // 4K tokens * 4 chars -- safe for 8K Libre models leaving room for conversation
  libre: 16000,    // ~4K tokens of system prompt max
  pro: 32000,      // ~8K tokens
  elite: 64000,    // ~16K tokens
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function build(ctx: PromptContext): string {
  const sections: PromptSection[] = [];

  // P0: Identity + personality (never truncated)
  sections.push({ id: 'identity', priority: 0, content: buildIdentitySection(ctx) });

  // P0: Tool instructions (never truncated -- LLM needs these)
  sections.push({ id: 'tool_instructions', priority: 0, content: buildToolInstructions() });

  // P1: Page-specific knowledge (high value, context-dependent)
  const pageKnowledge = getPageKnowledge(ctx.page);
  if (pageKnowledge) {
    sections.push({ id: 'page_knowledge', priority: 1, content: pageKnowledge });
  }

  // P1: Platform overview (always useful)
  sections.push({ id: 'platform_overview', priority: 1, content: buildPlatformOverview() });

  // P2: Model intelligence, sudo, Holded (conditional)
  sections.push({ id: 'model_intelligence', priority: 2, content: buildModelIntelligenceSection() });
  if (ctx.hasSudo) {
    sections.push({ id: 'sudo', priority: 2, content: buildSudoSection(ctx) });
  }

  // P3: Troubleshooting, secondary instructions, skills protocols
  sections.push({ id: 'troubleshooting', priority: 3, content: buildTroubleshootingTable() });
  sections.push({ id: 'skills_protocols', priority: 3, content: buildSkillsProtocols() });

  // Channel-specific
  if (ctx.channel === 'telegram') {
    sections.push({ id: 'telegram', priority: 1, content: buildTelegramSection() });
  }

  // Assemble within budget
  return assembleWithBudget(sections, getBudget(ctx.catbotConfig.model));
}

function assembleWithBudget(sections: PromptSection[], budgetChars: number): string {
  // Sort by priority (P0 first)
  const sorted = [...sections].sort((a, b) => a.priority - b.priority);

  let result = '';
  let remaining = budgetChars;

  for (const section of sorted) {
    if (section.content.length <= remaining) {
      result += section.content + '\n\n';
      remaining -= section.content.length;
    } else if (section.priority === 0) {
      // P0 sections: always include, even if over budget
      result += section.content + '\n\n';
      remaining -= section.content.length;
    }
    // else: skip this section (truncated)
  }

  return result.trim();
}
```

### Pattern 2: Page-to-Knowledge-Area Mapping

**What:** Map the user's current URL path to the corresponding knowledge tree area, using the `path` field in each JSON file.

**When to use:** Every prompt assembly call.

**Example:**
```typescript
// Uses knowledge-tree.ts from Phase 118
import { loadKnowledgeIndex, loadKnowledgeArea, KnowledgeEntry } from '@/lib/knowledge-tree';

const PAGE_TO_AREA: Record<string, string> = {
  '/': 'catboard',
  '/catbrains': 'catbrains',
  '/agents': 'catpaw',
  '/catflow': 'catflow',
  '/canvas': 'canvas',
  '/skills': 'catpower',
  '/settings': 'settings',
  '/tasks': 'catflow',       // Tasks are part of CatFlow area
  '/connectors': 'catpower', // Connectors are in CatPower area
  '/workers': 'catpaw',      // Workers migrated to CatPaw
};

function getPageKnowledge(page?: string): string | null {
  if (!page) return null;

  // Find area by exact match or prefix match
  const areaId = PAGE_TO_AREA[page]
    || Object.entries(PAGE_TO_AREA).find(([p]) => page.startsWith(p))?.[1];

  if (!areaId) return null;

  try {
    const area = loadKnowledgeArea(areaId);
    return formatKnowledgeForPrompt(area);
  } catch {
    return null;
  }
}

function formatKnowledgeForPrompt(area: KnowledgeEntry): string {
  const parts = [`## Contexto: ${area.name}\n${area.description}`];

  if (area.concepts.length > 0) {
    parts.push(`### Conceptos clave\n${area.concepts.map(c => `- ${c}`).join('\n')}`);
  }
  if (area.howto.length > 0) {
    parts.push(`### Como hacer\n${area.howto.map(h => `- ${h}`).join('\n')}`);
  }
  if (area.dont.length > 0) {
    parts.push(`### No hacer\n${area.dont.map(d => `- ${d}`).join('\n')}`);
  }
  if (area.common_errors.length > 0) {
    parts.push(`### Errores comunes\n${area.common_errors.map(e =>
      `- **${e.error}**: ${e.cause} -> ${e.solution}`
    ).join('\n')}`);
  }

  return parts.join('\n\n');
}
```

### Pattern 3: query_knowledge Tool

**What:** A new CatBot tool that queries the knowledge tree by area path or fulltext search across all areas.

**When to use:** When CatBot needs platform information not in its current system prompt (e.g., user asks about CatBrains while on /settings page).

**Example:**
```typescript
// In catbot-tools.ts -- tool definition
{
  type: 'function',
  function: {
    name: 'query_knowledge',
    description: 'Consulta el arbol de conocimiento de DoCatFlow. Busca informacion sobre areas de la plataforma por path o por texto libre.',
    parameters: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'ID del area (catboard, catbrains, catpaw, catflow, canvas, catpower, settings). Omitir para buscar en todas.' },
        query: { type: 'string', description: 'Texto a buscar en conceptos, howto, errores y reglas' },
      },
    },
  },
}

// Handler
case 'query_knowledge': {
  const area = args.area as string | undefined;
  const query = (args.query as string || '').toLowerCase();

  if (area) {
    try {
      const entry = loadKnowledgeArea(area);
      return { name, result: formatKnowledgeResult(entry, query) };
    } catch {
      return { name, result: { error: `Area '${area}' no encontrada` } };
    }
  }

  // Fulltext search across all areas
  const allAreas = getAllKnowledgeAreas();
  const matches = allAreas
    .map(entry => ({ entry, score: scoreRelevance(entry, query) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return { name, result: matches.map(m => formatKnowledgeResult(m.entry, query)) };
}
```

### Anti-Patterns to Avoid

- **Keeping buildSystemPrompt() alongside PromptAssembler:** The old function MUST be completely removed. Having both creates confusion about which is authoritative. One clean replacement, not a wrapper.
- **Loading all 7 knowledge areas into every prompt:** Token explosion. Only load the page-relevant area + identity sections. Other areas are available via `query_knowledge` tool.
- **Using FEATURE_KNOWLEDGE as fallback:** The `FEATURE_KNOWLEDGE` Record in catbot-tools.ts should be replaced by `query_knowledge` in the `explain_feature` handler, not kept as a parallel data source.
- **Hardcoding model context limits:** Use a tier-based budget (Libre/Pro/Elite) that maps from the model name or alias, not per-model-name hardcoding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Custom BPE tokenizer | `Math.ceil(text.length / 4)` with 20% safety margin | Multi-model system (OpenAI, Anthropic, Ollama local). No single tokenizer works for all. Char estimation with safety margin is industry practice for mixed-model proxies. |
| Knowledge tree querying | Custom search index | Simple keyword scoring over small dataset (7 JSON files, <25KB total) | Dataset is tiny. Full-text search is overkill. Simple `.includes()` + word overlap scoring finds relevant areas in <1ms. |
| Section priority framework | Weighted DAG scheduler | Static priority levels (P0-P3) with linear scan | Only 10-15 sections total. A 4-level priority with linear scan is more readable and debuggable than any graph-based system. |

**Key insight:** The knowledge tree is small (24KB total across 7 files, cached in memory). The system prompt is ~350 lines. The entire problem fits comfortably in simple data structures -- no frameworks or complex algorithms needed.

## Common Pitfalls

### Pitfall 1: Losing Hardcoded Content During Migration
**What goes wrong:** The new PromptAssembler omits sections that were in `buildSystemPrompt()` but don't have a corresponding knowledge tree entry. Skills protocols ("Orquestador CatFlow", "Arquitecto de Agentes"), Canvas execution knowledge, troubleshooting table, and Holded rules are all in the hardcoded function.
**Why it happens:** Developer focuses on knowledge tree sections and forgets the "extra" hardcoded sections that aren't in any JSON file.
**How to avoid:** Create a content audit of buildSystemPrompt() BEFORE writing PromptAssembler. Map every section to its source (knowledge JSON, dynamic DB query, or static text that needs a new home). The audit must cover: identity, personality, platform overview, stack info, current context stats, sudo section, Holded section, model intelligence section, tool instructions, Canvas protocols (EXEC-05, propagation, emails, URLs, connectors table), documentation tools, troubleshooting table, email protocol, Orquestador CatFlow skill, Arquitecto de Agentes skill, and Canvas diagnostics.
**Warning signs:** CatBot stops following Canvas protocols, Holded rules, or skill injection patterns after migration.

### Pitfall 2: Token Budget Not Accounting for Conversation Messages
**What goes wrong:** The system prompt fits in the budget, but adding 20 conversation messages pushes the total past the model's context window.
**Why it happens:** Budget only accounts for system prompt length, not the full request (system + conversation + tool results).
**How to avoid:** Set the system prompt budget to ~50% of the model's context window for Libre models, ~25% for Pro, ~10% for Elite. This leaves ample room for conversation. For Gemma 8K: ~2K tokens for system prompt. For Claude 200K: system prompt size is irrelevant.
**Warning signs:** Long conversations with Libre models start producing garbage or errors.

### Pitfall 3: Dynamic Sections Failing Silently
**What goes wrong:** `getAllAliases()` throws (MID table issue), knowledge JSON file is corrupt, or DB query fails. The assembler returns a minimal prompt missing critical sections, and nobody notices until CatBot behaves weirdly.
**Why it happens:** Current buildSystemPrompt() already has try-catch blocks that silently swallow errors (see model intelligence section).
**How to avoid:** Each section builder should have its own try-catch with fallback content. Log warnings when a section fails to load. The assembler should track which sections were successfully included and expose this for debugging.
**Warning signs:** CatBot responses suddenly change quality without any code change.

### Pitfall 4: Page Mapping Gaps
**What goes wrong:** User is on `/catbrains/abc123` (specific project page) but PAGE_TO_AREA only matches `/catbrains`. Or user is on `/workers` which should map to catpaw but has no entry.
**Why it happens:** Exact path matching misses parameterized routes.
**How to avoid:** Use prefix matching with longest-match-wins strategy. `/catbrains/anything` -> catbrains. `/settings?tab=modelos` -> settings. Test all current routes.
**Warning signs:** CatBot doesn't know about the page the user is currently on.

## Code Examples

### Current buildSystemPrompt() Content Audit

Verified by reading route.ts lines 41-348:

| Section | Lines | Source After Migration | Priority |
|---------|-------|----------------------|----------|
| Identity + Personality | 171-178 | Static text in assembler (or new identity.json) | P0 |
| Platform sections (DoCatFlow overview) | 180-194 | Knowledge tree: all areas summary from _index.json | P1 |
| Stack info | 196-203 | Static text in assembler (server-specific) | P2 |
| Current context (page, stats) | 205-208 | Dynamic: DB queries for counts + context.page | P0 |
| Sudo section | 63-90 | Static template + dynamic status | P2 |
| Holded section | 92-109 | Dynamic: getHoldedTools() + static rules | P2 |
| Model Intelligence section | 111-166 | Dynamic: getAllAliases() + static protocols | P2 |
| Tool instructions | 211-217 | Static text (or knowledge tree tools section) | P0 |
| Canvas protocols (EXEC-05, propagation, etc.) | 219-348 | Knowledge tree: canvas.json + catflow.json | P1 |
| Documentation tools | 236-245 | Static text in assembler | P1 |
| Troubleshooting table | 248-267 | Knowledge tree: common_errors from all areas | P3 |
| Email protocol | 269-273 | Static text in assembler | P3 |
| Orquestador CatFlow skill | 275-285 | Static text in assembler | P1 |
| Arquitecto de Agentes skill | 289-301 | Static text in assembler | P1 |
| Canvas diagnostics | 303-306 | Static text in assembler | P2 |
| Canvas execution knowledge | 308-348 | Knowledge tree: canvas.json concepts | P2 |
| Telegram channel adaptation | 392-403 | Static text, channel-conditional | P1 |

### Page-to-Area Mapping (verified from knowledge JSONs)

```typescript
// Each knowledge JSON has a `path` field:
// catboard.json  -> path: "/"
// catbrains.json -> path: "/catbrains"
// catpaw.json    -> path: "/agents"
// catflow.json   -> path: "/catflow"
// canvas.json    -> path: "/canvas"
// catpower.json  -> path: "/catpower"  (note: /skills and /connectors also map here)
// settings.json  -> path: "/settings"

// Additional routes that need mapping:
// /tasks -> catflow (tasks are CatFlow pipelines)
// /workers -> catpaw (workers migrated to CatPaw)
// /connectors -> catpower (connectors are in CatPower)
// /skills -> catpower (skills are in CatPower)
```

### Token Budget Calculation

```
Current buildSystemPrompt() output: ~38KB total route.ts file, prompt function ~14KB of text
14KB / 4 = ~3,500 tokens for the full hardcoded prompt

Knowledge tree total: ~24KB on disk, but formatted for prompt ~8-10KB
With page-specific loading (1-2 areas): ~4-5KB -> ~1,250 tokens

Target budgets:
- Libre (8K context):   ~2,000 tokens system prompt (leaves 6K for conversation)
- Pro (32K context):    ~6,000 tokens system prompt (leaves 26K for conversation)
- Elite (200K context): ~16,000 tokens system prompt (unlimited in practice)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded buildSystemPrompt() ~300 lines | Dynamic assembly from knowledge tree | Phase 119 (now) | Maintainable, page-aware, budget-controlled |
| FEATURE_KNOWLEDGE flat Record<string,string> | Structured JSON knowledge tree + query_knowledge tool | Phase 118 -> 119 | Rich structured data, searchable, versionable |
| No token budget awareness | Priority-based section truncation | Phase 119 (now) | Safe for Libre models with small context |

**Deprecated/outdated:**
- `FEATURE_KNOWLEDGE` in catbot-tools.ts: replaced by knowledge-tree.ts. The `explain_feature` handler should use `loadKnowledgeArea()` instead.
- `buildSystemPrompt()` in route.ts: replaced by `PromptAssembler.build()`. Function should be deleted entirely.

## Open Questions

1. **Where to put content that's not in knowledge tree JSONs?**
   - What we know: Identity, personality, tool instructions, sudo rules, Holded rules, and skill protocols are currently hardcoded and don't have corresponding knowledge JSON files.
   - What's unclear: Should these become new JSON files (identity.json, tools-instructions.json) or stay as static strings inside the assembler?
   - Recommendation: Keep them as static sections in the assembler for now. They're stable, developer-maintained content. Phase 120 (Config UI) will add `instructions_primary` and `instructions_secondary` from the DB, which is the user-customizable part. Creating JSON files for every tiny section adds complexity without value.

2. **Should explain_feature be replaced or kept alongside query_knowledge?**
   - What we know: `explain_feature` uses `FEATURE_KNOWLEDGE` dict with 25 keys. `query_knowledge` would search the richer knowledge tree.
   - Recommendation: Keep `explain_feature` as a thin wrapper that delegates to `query_knowledge` internally. The LLM already knows to call `explain_feature` -- changing the tool name disrupts existing behavior. Internally, replace `FEATURE_KNOWLEDGE` lookup with `loadKnowledgeArea()` lookup.

3. **How to determine model tier for token budget?**
   - What we know: The model comes as an alias (e.g., "catbot") resolved via `resolveAlias()`. The MID system has tier info (Elite/Pro/Libre).
   - Recommendation: Import `resolveAlias` result and check against known tier patterns, or add a simple helper that maps model name substrings to tiers (gemma/llama/qwen -> Libre, sonnet/gpt-4o/flash -> Pro, opus/gemini-2.5-pro -> Elite). Default to Pro budget if unknown.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROMPT-01 | PromptAssembler.build() produces valid prompt replacing buildSystemPrompt() | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | No - Wave 0 |
| PROMPT-02 | Prompt content changes based on page parameter | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | No - Wave 0 |
| PROMPT-03 | Token budget truncation works: sections cut from P3 upward | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | No - Wave 0 |
| PROMPT-04 | query_knowledge tool returns relevant results by area and fulltext | unit | `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x` | No - Wave 0 |
| PROMPT-05 | Knowledge JSON sources arrays populated with .planning/ paths | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -x` | Partial - exists but no sources test |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/catbot-prompt-assembler.test.ts -x`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green + CatBot manual verification via conversation

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-prompt-assembler.test.ts` -- covers PROMPT-01, PROMPT-02, PROMPT-03, PROMPT-04
- [ ] Test for sources population in knowledge-tree.test.ts -- covers PROMPT-05

## Sources

### Primary (HIGH confidence)
- Direct code analysis: `app/src/app/api/catbot/chat/route.ts` -- current buildSystemPrompt() implementation, 350+ lines
- Direct code analysis: `app/src/lib/knowledge-tree.ts` -- existing loader with zod schemas and caching
- Direct code analysis: `app/src/lib/services/catbot-tools.ts` -- FEATURE_KNOWLEDGE dict (25 keys), explain_feature handler, search_documentation tool
- Direct code analysis: `app/data/knowledge/*.json` -- 7 knowledge files, 24KB total, all sources arrays empty
- Phase 118 summaries: catbot-db.ts, knowledge tree, conversation API all operational

### Secondary (MEDIUM confidence)
- Architecture research: `.planning/research/ARCHITECTURE.md` -- PromptAssembler pattern and target architecture
- Pitfalls research: `.planning/research/PITFALLS.md` -- token explosion (Pitfall 1), backward compatibility (Pitfall 9)
- Feature research: `.planning/research/FEATURES.md` -- dynamic prompt as table stakes feature

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, uses existing knowledge-tree.ts and patterns
- Architecture: HIGH - PromptAssembler pattern validated by architecture research, content audit of buildSystemPrompt() complete
- Pitfalls: HIGH - token explosion and backward compatibility well-documented, concrete mitigation strategies identified
- Token budget: MEDIUM - char/4 estimation is industry standard but untested against actual model limits in this codebase

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, no external API dependencies)
