# Architecture Research: CatBot Intelligence Engine

**Domain:** AI chatbot intelligence layer for existing DoCatFlow platform
**Researched:** 2026-04-08
**Confidence:** HIGH

## System Overview — Current vs Target

### Current CatBot Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Web UI / Telegram                            │
│  ┌─────────────┐  ┌─────────────────────┐                       │
│  │ CatBot Panel│  │ Telegram Bot Service │                       │
│  └──────┬──────┘  └──────────┬──────────┘                       │
│         └──────────┬─────────┘                                  │
├────────────────────┼────────────────────────────────────────────┤
│              POST /api/catbot/chat                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ route.ts (~350 lines)                                     │   │
│  │ - buildSystemPrompt() — hardcoded ~300 lines              │   │
│  │ - FEATURE_KNOWLEDGE — Record<string,string> in tools.ts   │   │
│  │ - Tool-calling loop (max 8 iterations)                    │   │
│  │ - Streaming via SSE                                       │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                       │
│  ┌──────────────────────┴───────────────────────────────────┐   │
│  │ catbot-tools.ts (2500+ lines, ~40 tools)                  │   │
│  │ catbot-sudo-tools.ts (5 sudo tools)                       │   │
│  │ catbot-holded-tools.ts (MCP bridge tools)                 │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                       │
├─────────────────────────┼───────────────────────────────────────┤
│                    docflow.db (SQLite)                           │
│  settings.catbot_config = { model, personality, allowed_actions} │
│  settings.catbot_sudo = { enabled, hash, duration, actions }    │
│  (No conversation log, no user profiles, no memory)             │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture (v26.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Web UI / Telegram                            │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────────┐   │
│  │ CatBot Panel│  │ Telegram Bot│  │ Settings > CatBot     │   │
│  │             │  │             │  │ (expanded config UI)  │   │
│  └──────┬──────┘  └──────┬──────┘  └───────────────────────┘   │
│         └──────────┬─────┘                                      │
├────────────────────┼────────────────────────────────────────────┤
│              POST /api/catbot/chat                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ route.ts (SLIMMED — delegates to services)                │   │
│  │ - Loads user profile from catbot.db                       │   │
│  │ - Calls PromptAssembler.build() for dynamic system prompt │   │
│  │ - Calls MemoryService.match() for Capa 0 shortcuts       │   │
│  │ - Tool-calling loop (unchanged)                           │   │
│  │ - Post-conversation: profile update + conversation log    │   │
│  └──────────────┬────────────────────┬──────────────────────┘   │
│                 │                    │                           │
│  ┌──────────────┴──┐  ┌─────────────┴───────────────────────┐   │
│  │ Existing tools   │  │ NEW services                         │   │
│  │ (unchanged)      │  │ ┌────────────────────────────────┐  │   │
│  │                  │  │ │ KnowledgeService               │  │   │
│  │                  │  │ │ - reads JSON knowledge tree     │  │   │
│  │                  │  │ │ - query_knowledge tool          │  │   │
│  │                  │  │ └────────────────────────────────┘  │   │
│  │                  │  │ ┌────────────────────────────────┐  │   │
│  │                  │  │ │ PromptAssembler                │  │   │
│  │                  │  │ │ - replaces buildSystemPrompt() │  │   │
│  │                  │  │ │ - composes from knowledge tree │  │   │
│  │                  │  │ └────────────────────────────────┘  │   │
│  │                  │  │ ┌────────────────────────────────┐  │   │
│  │                  │  │ │ UserProfileService              │  │   │
│  │                  │  │ │ - CRUD on catbot.db profiles    │  │   │
│  │                  │  │ └────────────────────────────────┘  │   │
│  │                  │  │ ┌────────────────────────────────┐  │   │
│  │                  │  │ │ MemoryService                  │  │   │
│  │                  │  │ │ - recipe matching + auto-save   │  │   │
│  │                  │  │ └────────────────────────────────┘  │   │
│  │                  │  │ ┌────────────────────────────────┐  │   │
│  │                  │  │ │ SummaryService                 │  │   │
│  │                  │  │ │ - scheduled compression        │  │   │
│  │                  │  │ └────────────────────────────────┘  │   │
│  └──────────────────┘  └────────────────────────────────────┘   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  docflow.db (UNCHANGED)     │  catbot.db (NEW — separate file)  │
│  settings, catbrains, etc.  │  user_profiles                    │
│                              │  user_memory (recipes)            │
│                              │  conversation_log                 │
│                              │  summaries                        │
│                              │  knowledge_learned                │
├──────────────────────────────┴──────────────────────────────────┤
│  app/data/knowledge/ (NEW — JSON files on disk)                 │
│  platform.json, tools.json, howto.json, errors.json, etc.       │
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `catbot-db.ts` | Connection + migrations for catbot.db | NEW |
| `KnowledgeService` | Read/query JSON knowledge tree, provide to prompt assembler and query_knowledge tool | NEW |
| `PromptAssembler` | Build dynamic system prompt from knowledge tree + user profile + config | NEW (replaces `buildSystemPrompt()`) |
| `UserProfileService` | CRUD user profiles in catbot.db, auto-update after conversations | NEW |
| `MemoryService` | Store/match user recipes (Capa 0 fast-path), auto-save on success | NEW |
| `ConversationLogger` | Log conversations to catbot.db, feed summary service | NEW |
| `SummaryService` | Compress conversation logs daily/weekly/monthly | NEW |
| `catbot-tools.ts` | Existing 40+ tools — gains `query_knowledge` tool | MODIFIED (add 1 tool) |
| `route.ts` | Chat endpoint — delegates to new services | MODIFIED (slimmed) |
| Settings UI (CatBot tab) | Config panel — expanded with instructions, permissions | MODIFIED |

## Recommended New File Structure

```
app/src/lib/
├── catbot-db.ts                     # NEW: catbot.db connection + migrations
├── services/
│   ├── catbot-tools.ts              # EXISTING: add query_knowledge tool
│   ├── catbot-sudo-tools.ts         # EXISTING: unchanged
│   ├── catbot-holded-tools.ts       # EXISTING: unchanged
│   ├── catbot-knowledge.ts          # NEW: KnowledgeService
│   ├── catbot-prompt-assembler.ts   # NEW: PromptAssembler
│   ├── catbot-user-profile.ts       # NEW: UserProfileService
│   ├── catbot-memory.ts             # NEW: MemoryService
│   ├── catbot-conversation-log.ts   # NEW: ConversationLogger
│   └── catbot-summary.ts           # NEW: SummaryService

app/data/
├── docflow.db                       # EXISTING: unchanged
├── catbot.db                        # NEW: CatBot intelligence data
└── knowledge/                       # NEW: JSON knowledge tree
    ├── platform.json                # Platform sections, navigation, features
    ├── tools.json                   # All CatBot tools with usage guides
    ├── howto.json                   # How-to workflows (step-by-step)
    ├── dont.json                    # Anti-patterns, forbidden actions
    ├── errors.json                  # Common errors + troubleshooting
    ├── success_cases.json           # Successful interaction patterns
    └── sources.json                 # Data source types, formats, processing

app/src/app/api/catbot/
├── chat/route.ts                    # EXISTING: slimmed, delegates to services
├── knowledge/route.ts               # NEW: GET knowledge tree, POST learned entries
├── profiles/route.ts                # NEW: GET/PUT user profiles
└── memory/route.ts                  # NEW: GET/POST user memory recipes
```

### Structure Rationale

- **`catbot-db.ts` at lib/ level:** Mirrors `db.ts` pattern. Separate connection because catbot.db has its own lifecycle, migrations, and backup policy. Avoids schema coupling with docflow.db.
- **`catbot-*.ts` service naming:** All new services prefixed with `catbot-` to group naturally in file explorer and clarify ownership. Keeps existing files untouched.
- **Knowledge as JSON on disk (not DB):** Knowledge tree is developer-curated, version-controlled content. JSON files are readable, diffable, and editable by humans. The KnowledgeService reads them at startup with cache. Learned entries go to catbot.db, not back to JSON.
- **API routes for new data:** Profiles, memory, and knowledge need UI endpoints for the expanded Settings panel. Follow existing `/api/catbot/*` namespace.

## Architectural Patterns

### Pattern 1: Separate SQLite Database (catbot.db)

**What:** A second better-sqlite3 connection to `app/data/catbot.db`, with its own WAL mode, migrations table, and schema.
**When to use:** When data has different lifecycle, backup needs, or would bloat the main DB.
**Trade-offs:** Adds a second DB connection (trivial overhead for SQLite), but cleanly separates CatBot intelligence data from platform data. No foreign key constraints across databases (by design — CatBot data is self-contained).

**Example:**
```typescript
// catbot-db.ts
import Database from 'better-sqlite3';
import path from 'path';

const catbotDbPath = process['env']['CATBOT_DB_PATH']
  || path.join(process.cwd(), 'data', 'catbot.db');

const catbotDb = new Database(catbotDbPath);
catbotDb.pragma('journal_mode = WAL');
catbotDb.pragma('busy_timeout = 5000');

// Migrations
catbotDb.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT PRIMARY KEY DEFAULT 'default',
    display_name TEXT,
    preferences TEXT DEFAULT '{}',        -- JSON: language, verbosity, timezone
    initial_directives TEXT,               -- User-written "always do X"
    known_context TEXT DEFAULT '{}',       -- JSON: learned facts about user
    interaction_count INTEGER DEFAULT 0,
    last_seen TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_memory (
    id TEXT PRIMARY KEY,
    trigger_pattern TEXT NOT NULL,         -- What query triggers this recipe
    recipe TEXT NOT NULL,                  -- The successful workflow/answer
    source_conversation_id TEXT,           -- Which conversation created it
    use_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 1.0,
    created_at TEXT DEFAULT (datetime('now')),
    last_used TEXT
  );

  CREATE TABLE IF NOT EXISTS conversation_log (
    id TEXT PRIMARY KEY,
    channel TEXT DEFAULT 'web',            -- 'web' | 'telegram'
    user_profile_id TEXT DEFAULT 'default',
    messages TEXT NOT NULL,                -- JSON array of messages
    tools_used TEXT DEFAULT '[]',          -- JSON array of tool names
    token_count INTEGER DEFAULT 0,
    model TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at TEXT
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    period_type TEXT NOT NULL,             -- 'daily' | 'weekly' | 'monthly'
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    topics TEXT DEFAULT '[]',             -- JSON array of topics
    decisions TEXT DEFAULT '[]',          -- JSON array of decisions made
    pending TEXT DEFAULT '[]',            -- JSON array of pending items
    summary_text TEXT NOT NULL,
    conversation_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS knowledge_learned (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,                -- matches knowledge tree categories
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT DEFAULT 'auto',            -- 'auto' | 'user' | 'admin'
    confidence REAL DEFAULT 0.8,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

export default catbotDb;
```

### Pattern 2: Dynamic Prompt Assembly from Knowledge Tree

**What:** Replace the 300-line hardcoded `buildSystemPrompt()` with a `PromptAssembler` that reads sections from the knowledge tree and composes them based on context.
**When to use:** When system prompt content grows beyond maintainability and needs to vary by context (page, user, channel).
**Trade-offs:** Slightly more complex than a string template, but dramatically more maintainable. Knowledge tree becomes the single source of truth.

**Example:**
```typescript
// catbot-prompt-assembler.ts
import { KnowledgeService } from './catbot-knowledge';
import { UserProfileService } from './catbot-user-profile';

interface PromptContext {
  page?: string;
  channel?: 'web' | 'telegram';
  hasSudo: boolean;
  userId?: string;
  catbotConfig: { model?: string; personality?: string; instructions_primary?: string; instructions_secondary?: string };
}

export class PromptAssembler {
  static build(ctx: PromptContext): string {
    const sections: string[] = [];

    // 1. Identity (from knowledge tree or config)
    sections.push(KnowledgeService.getSection('identity'));

    // 2. Custom personality from config (if set)
    if (ctx.catbotConfig.instructions_primary) {
      sections.push(`## Instrucciones primarias\n${ctx.catbotConfig.instructions_primary}`);
    }

    // 3. Platform knowledge (always included)
    sections.push(KnowledgeService.getSection('platform'));

    // 4. Page-specific context
    if (ctx.page) {
      const pageKnowledge = KnowledgeService.getForPage(ctx.page);
      if (pageKnowledge) sections.push(pageKnowledge);
    }

    // 5. Tools documentation (from knowledge tree, not hardcoded)
    sections.push(KnowledgeService.getSection('tools'));

    // 6. User profile context
    if (ctx.userId) {
      const profile = UserProfileService.get(ctx.userId);
      if (profile?.initial_directives) {
        sections.push(`## Directivas del usuario\n${profile.initial_directives}`);
      }
      if (profile?.known_context) {
        sections.push(`## Contexto conocido del usuario\n${JSON.stringify(profile.known_context)}`);
      }
    }

    // 7. Sudo, Holded, Model Intelligence (existing sections, loaded from knowledge tree)
    if (ctx.hasSudo) sections.push(KnowledgeService.getSection('sudo'));
    sections.push(KnowledgeService.getSection('model_intelligence'));

    // 8. Channel-specific rules
    if (ctx.channel === 'telegram') {
      sections.push(KnowledgeService.getSection('telegram_rules'));
    }

    // 9. Secondary instructions (lower priority)
    if (ctx.catbotConfig.instructions_secondary) {
      sections.push(`## Instrucciones secundarias\n${ctx.catbotConfig.instructions_secondary}`);
    }

    return sections.join('\n\n');
  }
}
```

### Pattern 3: Capa 0 — Memory Fast Path

**What:** Before sending a query to the LLM, check `user_memory` for a matching recipe. If found with high confidence, inject as context or return directly.
**When to use:** For repeated workflows the user has successfully completed before.
**Trade-offs:** Saves tokens and latency for known patterns. Risk of stale recipes if platform changes — mitigated by success_rate tracking and confidence decay.

**Example:**
```typescript
// catbot-memory.ts — match phase (called before LLM)
export class MemoryService {
  static findMatch(query: string): MemoryRecipe | null {
    // Simple keyword matching with TF-IDF-like scoring
    // Not vector search — these are short trigger patterns, keyword match is sufficient
    const recipes = catbotDb.prepare(
      `SELECT * FROM user_memory WHERE success_rate > 0.5 ORDER BY use_count DESC LIMIT 20`
    ).all();

    for (const recipe of recipes) {
      if (matchesTrigger(query, recipe.trigger_pattern)) {
        // Bump use_count
        catbotDb.prepare('UPDATE user_memory SET use_count = use_count + 1, last_used = datetime("now") WHERE id = ?')
          .run(recipe.id);
        return recipe;
      }
    }
    return null;
  }

  // Called after successful tool execution — auto-saves the workflow
  static autoSave(query: string, toolSequence: string[], result: unknown): void {
    // Only save if tool sequence is 2+ steps (simple lookups aren't worth saving)
    if (toolSequence.length < 2) return;
    // ...store in user_memory with trigger_pattern derived from query
  }
}
```

### Pattern 4: Post-Conversation Profile Update

**What:** After each conversation ends (no more messages for N seconds, or explicit end), update the user profile with any new facts learned.
**When to use:** To build progressive understanding of the user without explicit configuration.
**Trade-offs:** Requires an LLM call to extract facts — small cost per conversation. Alternative: extract from tool call patterns (cheaper, less nuanced).

**Implementation strategy:** Use tool call patterns (zero cost) for most updates, reserve LLM extraction for long/complex conversations only.

## Data Flow

### Current Chat Flow (Before)

```
User Message
    |
    v
POST /api/catbot/chat
    |
    v
buildSystemPrompt() ──── hardcoded 300 lines
    |
    v
[system + messages] → LiteLLM → streaming response
    |
    v
Tool calls → catbot-tools.ts → results → LiteLLM loop
    |
    v
Final response → SSE to client
(nothing persisted about the conversation)
```

### Target Chat Flow (After)

```
User Message
    |
    v
POST /api/catbot/chat
    |
    ├──→ UserProfileService.get(userId) ──→ catbot.db
    |
    ├──→ MemoryService.findMatch(query)
    |    |
    |    ├── HIT → inject recipe as context hint
    |    └── MISS → continue normally
    |
    ├──→ PromptAssembler.build(context)
    |    |
    |    ├── KnowledgeService.getSection() ──→ JSON files (cached)
    |    ├── UserProfile.directives
    |    ├── CatBot config (from docflow.db settings)
    |    └── Dynamic sections (sudo, channel, page)
    |
    v
[assembled system prompt + messages] → LiteLLM → streaming response
    |
    v
Tool calls → catbot-tools.ts (+ query_knowledge) → results → LiteLLM loop
    |
    v
Final response → SSE to client
    |
    ├──→ ConversationLogger.save() ──→ catbot.db
    ├──→ MemoryService.autoSave() ──→ catbot.db (if 2+ tools used successfully)
    └──→ UserProfileService.update() ──→ catbot.db (from tool call patterns)
```

### Summary Compression Flow (Background)

```
Scheduled (via instrumentation.ts)
    |
    v
SummaryService.compressDaily()
    |
    ├── Read today's conversation_log entries from catbot.db
    ├── Extract: topics, decisions, pending items
    ├── LLM call to compress (using Libre tier — zero cost)
    └── Write summary to catbot.db.summaries
    |
    v
SummaryService.compressWeekly() (if 7 daily summaries exist)
    |
    v
SummaryService.compressMonthly() (if 4 weekly summaries exist)
```

### Knowledge Query Flow (New Tool)

```
User asks CatBot a question about the platform
    |
    v
LLM decides to call query_knowledge tool
    |
    v
KnowledgeService.query(query)
    |
    ├── Search JSON knowledge tree (keyword match + category filter)
    ├── Search knowledge_learned table in catbot.db
    └── Merge results, rank by relevance
    |
    v
Return to LLM as tool result → incorporated in response
```

## Integration Points — What Changes in Existing Code

### Modified Files (Minimal Touches)

| File | Change | Risk |
|------|--------|------|
| `app/src/lib/services/catbot-tools.ts` | Add `query_knowledge` tool definition + handler (~50 lines). Replace `FEATURE_KNOWLEDGE` usage with `KnowledgeService.query()` in `explain_feature` handler | LOW — additive only |
| `app/src/app/api/catbot/chat/route.ts` | Replace `buildSystemPrompt()` call with `PromptAssembler.build()`. Add pre-flight memory match. Add post-response logging + profile update | MEDIUM — core flow changes |
| `app/src/app/settings/page.tsx` | Expand CatBot config section with: primary/secondary instructions textareas, personality free text, normal+sudo permission toggles | LOW — UI only |
| `app/src/instrumentation.ts` | Add SummaryService.startScheduler() call | LOW — additive |

### Untouched Files

| File | Why Untouched |
|------|---------------|
| `catbot-sudo-tools.ts` | No intelligence changes needed |
| `catbot-holded-tools.ts` | No intelligence changes needed |
| `db.ts` (docflow.db) | Schema unchanged — catbot data in separate DB |
| All other API routes | No CatBot intelligence coupling |
| Telegram bot service | Already calls `/api/catbot/chat` — gets intelligence for free |

### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/catbot/knowledge` | GET | Return knowledge tree structure (for Settings UI) |
| `/api/catbot/knowledge` | POST | Add learned entry (admin) |
| `/api/catbot/profiles` | GET | Get user profile |
| `/api/catbot/profiles` | PUT | Update user profile (directives, preferences) |
| `/api/catbot/memory` | GET | List user memory recipes |
| `/api/catbot/memory` | DELETE | Remove a recipe |
| `/api/catbot/config` | GET/PUT | Extended CatBot config (instructions, permissions) |

## Anti-Patterns

### Anti-Pattern 1: Putting CatBot Data in docflow.db

**What people do:** Add 5 new tables to the existing docflow.db
**Why it's wrong:** docflow.db is already large (600KB + 4MB WAL). CatBot conversation logs will grow fast (each conversation = full message JSON). Mixing concerns makes backup/restore harder. Schema migrations to docflow.db risk breaking existing features.
**Do this instead:** Separate catbot.db with its own connection. If catbot.db corrupts, platform still works. Can backup/rotate independently.

### Anti-Pattern 2: Vector Search for User Memory

**What people do:** Embed user memory recipes in Qdrant for semantic matching.
**Why it's wrong:** Overkill. User memory recipes are short trigger patterns (10-30 words). Keyword matching with simple scoring is faster, simpler, and doesn't require embedding calls. Adding Qdrant dependency to the chat hot path adds latency.
**Do this instead:** Simple keyword/pattern matching in SQLite. If fuzzy matching is needed later, use SQLite FTS5 (already available in better-sqlite3).

### Anti-Pattern 3: LLM-Powered Profile Extraction on Every Conversation

**What people do:** Call an LLM after every conversation to extract user facts.
**Why it's wrong:** Expensive (tokens), slow, and most conversations don't contain new user facts.
**Do this instead:** Extract from tool call patterns (zero cost) — if user always creates agents in department "marketing", infer preference. Reserve LLM extraction for explicit "remember this" commands.

### Anti-Pattern 4: Monolithic Knowledge File

**What people do:** Put all knowledge in a single huge JSON file.
**Why it's wrong:** Hard to edit, hard to diff in git, and loads everything into memory even when only a section is needed.
**Do this instead:** Split by category (platform.json, tools.json, howto.json, etc.). KnowledgeService loads and caches per-category. Easy to add/edit individual categories.

### Anti-Pattern 5: Making buildSystemPrompt() Even Bigger

**What people do:** Keep adding sections to the hardcoded prompt function.
**Why it's wrong:** Already 300+ lines. Adding user profile, knowledge tree, and config sections would make it 500+ lines of string concatenation. Untestable, unmaintainable.
**Do this instead:** PromptAssembler composes from discrete sources. Each source is independently testable.

## Scaling Considerations

| Concern | Current (single user) | If multi-user added later |
|---------|----------------------|---------------------------|
| catbot.db size | One profile, ~50 conversations/day max. Trivial. | Add user_id foreign keys. Still SQLite-friendly for <100 users. |
| Knowledge tree | ~10 JSON files, loaded once, cached in memory | Same — knowledge is shared, not per-user |
| Summary compression | 1 daily run compressing ~50 conversations | Per-user summaries, still batched daily |
| Memory recipes | ~100 recipes max for single user | Per-user partitioning via user_id column |

### First Bottleneck: Conversation Log Growth

**What breaks:** After months of daily use, conversation_log table grows large (messages stored as JSON blobs).
**Fix:** Summary compression is the mitigation — once compressed, raw logs can be pruned (keep last 30 days). Add a `pruned_at` column and a cleanup job.

### Second Bottleneck: System Prompt Size

**What breaks:** Full knowledge tree + user profile + all protocols could exceed model context limits.
**Fix:** PromptAssembler should track token count and truncate lower-priority sections. Page-specific knowledge should be loaded selectively, not all-at-once.

## Suggested Build Order

Based on dependency analysis:

```
Phase 1: Foundation (catbot.db + Knowledge Tree)
  ├── catbot-db.ts with schema
  ├── JSON knowledge files (extract from current hardcoded content)
  ├── KnowledgeService (read/query)
  └── No existing code changes yet — pure additions

Phase 2: Dynamic Prompt Assembly
  ├── PromptAssembler (composes from knowledge tree)
  ├── MODIFY route.ts: replace buildSystemPrompt() with PromptAssembler.build()
  ├── MODIFY catbot-tools.ts: query_knowledge tool + replace FEATURE_KNOWLEDGE
  └── First breaking change — old hardcoded prompt replaced

Phase 3: Config UI Expansion
  ├── Expand Settings CatBot section
  ├── Primary/secondary instructions textareas
  ├── Personality free text
  ├── Permission toggles (normal + sudo)
  └── New API endpoint /api/catbot/config

Phase 4: User Profiles + Conversation Logging
  ├── UserProfileService (CRUD)
  ├── ConversationLogger
  ├── MODIFY route.ts: load profile pre-flight, log post-response
  ├── Profile management in Settings UI
  └── Depends on Phase 1 (catbot.db)

Phase 5: User Memory (Recipes)
  ├── MemoryService (match + auto-save)
  ├── MODIFY route.ts: pre-flight memory match
  ├── Memory management UI (view/delete recipes)
  └── Depends on Phase 4 (conversation logging feeds auto-save)

Phase 6: Summaries + Auto-Enrichment
  ├── SummaryService (daily/weekly/monthly compression)
  ├── Scheduler in instrumentation.ts
  ├── Auto-enrichment: knowledge_learned writes
  ├── Admin protection for data management
  └── Depends on Phase 4 (conversation_log as input)
```

**Phase ordering rationale:**
- Phase 1 is pure addition — no risk to existing functionality
- Phase 2 is the highest-risk change (replacing the system prompt builder) — do it early while the change surface is small
- Phase 3 is independent of 4-6 but benefits from Phase 2 (config feeds PromptAssembler)
- Phases 4-6 build on each other linearly (profiles -> memory -> summaries)

## Sources

- Direct code analysis: `app/src/app/api/catbot/chat/route.ts` (current system prompt, chat flow)
- Direct code analysis: `app/src/lib/services/catbot-tools.ts` (tool definitions, FEATURE_KNOWLEDGE)
- Direct code analysis: `app/src/lib/db.ts` (existing database pattern)
- Direct code analysis: `app/src/instrumentation.ts` (scheduler pattern)
- Direct code analysis: `app/src/app/settings/page.tsx` (current CatBot config UI)
- Project spec: `.planning/PROJECT.md` v26.0 requirements

---
*Architecture research for: CatBot Intelligence Engine (v26.0)*
*Researched: 2026-04-08*
