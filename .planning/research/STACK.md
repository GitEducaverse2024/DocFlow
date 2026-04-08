# Stack Research: CatBot Intelligence Engine

**Domain:** AI assistant intelligence layer (knowledge management, user memory, conversation compression, reasoning protocol)
**Researched:** 2026-04-08
**Confidence:** HIGH

## Executive Decision: Zero New Dependencies

The CatBot Intelligence Engine requires **no new npm packages**. Every capability maps to existing stack components or Node.js built-ins. This is the single most important finding of this research.

**Rationale:** The features (separate SQLite DB, JSON file I/O, scheduled compression, dynamic prompt assembly, pattern matching) are all well within the capabilities of `better-sqlite3` + Node.js `fs` + the existing `TaskScheduler` pattern. Adding libraries would increase attack surface and maintenance burden for zero gain.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| better-sqlite3 | ^12.6.2 (already installed) | catbot.db — independent database for user_profiles, user_memory, conversation_log, summaries, knowledge_learned | Already the project's DB engine. Separate DB file = separate `new Database()` instance with its own WAL. No schema conflicts with docflow.db. Proven pattern in codebase. |
| Node.js fs (built-in) | Node 20 (Docker) | JSON knowledge tree read/write | Already used in 10+ service files (canvas-executor, drive-polling, content-extractor, etc.). No wrapper library needed. |
| Node.js path (built-in) | Node 20 | Knowledge tree file path resolution | Standard usage throughout codebase. |

### Supporting Libraries (All Already Installed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid | ^13.0.0 | Generate IDs for conversation_log, summaries, memory entries | Already used project-wide via `generateId()` in `@/lib/utils`. |
| better-sqlite3 | ^12.6.2 | JSON1 extension (built-in to better-sqlite3) for querying JSON columns | Use `json_extract()` in SQL for querying trigger patterns, topic arrays, metadata stored as JSON columns. |

### Development Tools (All Already Installed)

| Tool | Purpose | Notes |
|------|---------|-------|
| vitest | ^4.1.0 | Unit tests for compression logic, trigger matching, prompt assembly | Already configured. Use for testing CatBot intelligence services. |
| Playwright | ^1.58.2 | E2E tests for Settings UI changes (CatBot config expansion) | Existing Page Object Model pattern. |
| TypeScript | ^5 | Type definitions for knowledge tree schema, user profiles, memory entries | Strict types for all new interfaces. |

## Architecture: Separate catbot.db

### Why a Separate Database File

1. **Schema isolation**: catbot.db tables (user_profiles, conversation_log, summaries, knowledge_learned, user_memory) have no foreign keys to docflow.db tables
2. **Independent lifecycle**: catbot.db can be backed up, reset, or migrated without touching docflow.db
3. **No contention**: conversation logging is write-heavy; separate WAL avoids impacting docflow.db reads
4. **Proven pattern**: docflow already uses env-configurable DB path (`DATABASE_PATH`); catbot.db gets `CATBOT_DATABASE_PATH`

### Implementation Pattern

```typescript
// src/lib/catbot-db.ts — follows exact pattern of src/lib/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const catbotDbPath = process['env']['CATBOT_DATABASE_PATH'] 
  || path.join(process.cwd(), 'data', 'catbot.db');

const catbotDbDir = path.dirname(catbotDbPath);
if (!fs.existsSync(catbotDbDir)) {
  fs.mkdirSync(catbotDbDir, { recursive: true });
}

const catbotDb = new Database(catbotDbPath);
catbotDb.pragma('journal_mode = WAL');
catbotDb.pragma('busy_timeout = 5000');

// Schema initialization here
catbotDb.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (...);
  CREATE TABLE IF NOT EXISTS user_memory (...);
  CREATE TABLE IF NOT EXISTS conversation_log (...);
  CREATE TABLE IF NOT EXISTS summaries (...);
  CREATE TABLE IF NOT EXISTS knowledge_learned (...);
`);

export default catbotDb;
```

**Key point:** Use `process['env']` bracket notation (not `process.env.X`) to prevent webpack inlining at build time. This is a critical project pattern documented in MEMORY.md.

## Knowledge Tree: JSON Files

### Why JSON Files (Not SQLite)

1. **Human-editable**: Operators can directly edit knowledge tree entries in a text editor
2. **Git-trackable**: Knowledge tree changes show up in diffs, can be version-controlled
3. **Hierarchical structure**: JSON naturally represents the tree (endpoints > tools > howto > dont > errors > success_cases > sources)
4. **Seed-able**: Ship default knowledge tree in the repo, user customizations overlay

### File Structure

```
data/catbot-knowledge/
  platform.json        # DoCatFlow sections, endpoints, navigation
  tools.json           # CatBot tools reference (auto-generated from tool definitions)
  howto.json            # How-to guides (user-facing)
  dont.json             # Anti-patterns, things to avoid
  errors.json           # Known errors and solutions (replaces hardcoded troubleshooting table)
  success_cases.json    # Successful interaction patterns
  sources.json          # External knowledge sources
```

### Read/Write Pattern

```typescript
// Synchronous reads (knowledge tree is small, <100KB total)
const tree = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

// Atomic writes (write to temp, rename)
const tmpPath = filePath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
fs.renameSync(tmpPath, filePath);
```

**No need for chokidar/file watchers.** Knowledge tree is read on each prompt assembly (cached in memory with TTL, same pattern as existing `getAvailableModels()` 60s cache).

## Trigger Matching for User Memory

### Why Custom Matching (No NLP Library)

1. **Triggers are structured**: User memory "recipes" have explicit trigger phrases/patterns defined at save time
2. **Volume is small**: Dozens of recipes per user, not thousands
3. **LLM does the heavy lifting**: The reasoning protocol decides WHEN to check memory; the matching just finds candidates

### Matching Strategy (Capa 0 Fast Path)

```typescript
// Simple keyword + prefix matching — sufficient for structured triggers
function findMatchingRecipes(userMessage: string, recipes: UserMemory[]): UserMemory[] {
  const normalized = userMessage.toLowerCase();
  return recipes.filter(recipe => {
    return recipe.triggers.some(trigger => {
      const t = trigger.toLowerCase();
      // Exact phrase match
      if (normalized.includes(t)) return true;
      // Word-start match for shorter triggers
      if (t.length >= 4 && normalized.split(/\s+/).some(w => w.startsWith(t))) return true;
      return false;
    });
  });
}
```

**No need for fuse.js, lunr, or any fuzzy matching library.** Triggers are explicitly defined strings, not free-text search. If fuzzy matching is later needed, SQLite FTS5 (built into better-sqlite3) is the upgrade path, not an npm package.

## Summary Compression: Scheduled Task

### Integration Point: Existing TaskScheduler

The `TaskScheduler` singleton in `src/lib/services/task-scheduler.ts` already runs a `setInterval` tick every 60 seconds, started from `instrumentation.ts`. Summary compression hooks into this exact pattern.

```typescript
// Add to TaskScheduler.tick() or create a parallel CatBotScheduler
// following the same singleton + setInterval + tick() pattern
class CatBotScheduler {
  async tick(): Promise<void> {
    await this.compressDailySummaries();   // conversations > 24h old
    await this.compressWeeklySummaries();   // daily summaries > 7 days old
    await this.compressMonthlySummaries();  // weekly summaries > 30 days old
  }
}
```

**Compression uses LLM calls** (via existing `streamLiteLLM` or non-streaming `litellm.ts`), so it should run during low-traffic hours. Add a time-of-day check in the tick.

### Why Not node-cron, Bree, or BullMQ

1. **node-cron**: Adds a dependency for something a 3-line time check in tick() handles
2. **Bree/BullMQ**: Over-engineered for single-server, single-process scheduling that already works via setInterval
3. **Existing pattern works**: TaskScheduler has been reliable since v2.0 across tasks and canvases

## Dynamic System Prompt Assembly

### Current State

The `buildSystemPrompt()` function in `route.ts` (lines 41-199+) is a single monolithic function that concatenates hardcoded strings. This is the primary thing being replaced.

### New Pattern

```typescript
// src/lib/services/catbot-prompt-builder.ts
export function buildSystemPrompt(context: PromptContext): string {
  const sections: string[] = [];
  
  // 1. Core personality (from catbot config in settings, already in DB)
  sections.push(loadPersonality(context));
  
  // 2. Knowledge tree sections (from JSON files)
  sections.push(loadKnowledgeSection('platform'));
  sections.push(loadKnowledgeSection('tools'));
  sections.push(loadKnowledgeSection('errors'));
  
  // 3. User profile context (from catbot.db)
  sections.push(loadUserContext(context.userId));
  
  // 4. Matched recipes (Capa 0, from user_memory)
  if (context.matchedRecipes.length > 0) {
    sections.push(formatRecipes(context.matchedRecipes));
  }
  
  // 5. Recent summary context (from summaries table)
  sections.push(loadRecentSummary(context.userId));
  
  // 6. Existing dynamic sections (model intelligence, sudo, holded)
  // These remain as-is, just extracted into their own functions
  
  return sections.filter(Boolean).join('\n\n');
}
```

**This is a refactor, not a new library.** The prompt builder reads from JSON files and catbot.db, assembles a string. No templating engine needed (Handlebars, EJS, etc.) because the templates are simple string concatenation with conditional sections.

## Installation

```bash
# No new packages needed. Zero npm install commands.
# All capabilities come from:
#   - better-sqlite3 ^12.6.2 (installed)
#   - Node.js fs, path (built-in)
#   - uuid ^13.0.0 (installed)
#   - vitest ^4.1.0 (installed, for tests)
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Separate catbot.db file | Tables in docflow.db | Never — isolation is critical for independent lifecycle and avoiding schema coupling |
| JSON files for knowledge tree | SQLite tables | If knowledge tree exceeds ~1MB or needs complex queries. Currently <100KB expected, so JSON is simpler and human-editable |
| Custom keyword trigger matching | fuse.js fuzzy search | If users report poor recipe matching. Upgrade path: SQLite FTS5 first (free), fuse.js only if needed |
| TaskScheduler tick extension | node-cron | Never in this project — existing setInterval pattern is proven and sufficient |
| String concatenation for prompts | Handlebars/EJS/Mustache | Never — prompt assembly is simple conditional sections, a templating engine adds complexity for no benefit |
| SQLite JSON1 for structured queries | Separate columns per field | Use JSON1 (`json_extract`) for metadata/tags; use proper columns for frequently queried fields (user_id, created_at, type) |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Prisma / Drizzle / TypeORM | Project uses raw better-sqlite3 everywhere. An ORM would create two data access patterns and add build complexity. | Raw better-sqlite3 with typed helper functions (existing pattern) |
| Redis / Memcached | Single-server app, in-memory Maps and TTL caches already used (model cache, telegram sessions). No distributed state needed. | In-memory Map with TTL (existing pattern) |
| LangChain / LlamaIndex | Massive dependencies for conversation management that this project does manually and intentionally. The whole point is custom intelligence, not framework abstractions. | Custom prompt builder + direct LiteLLM calls (existing pattern) |
| chokidar (file watcher) | Knowledge tree is read on demand with TTL cache. No need for file system events. | TTL-cached reads (existing pattern from getAvailableModels) |
| fuse.js / lunr (search) | Trigger matching is keyword-based on small datasets (<100 entries). Full-text search is overkill. | Simple string matching; upgrade to SQLite FTS5 if needed |
| node-cron / Bree / BullMQ | TaskScheduler with setInterval is proven across 4 scheduling use cases. Adding a job queue for single-server is over-engineering. | Extend existing TaskScheduler pattern |
| Handlebars / EJS / Nunjucks | System prompt assembly is string concatenation with conditions. No loops, no complex templates, no user-facing rendering. | String template literals (existing pattern) |
| zod (for JSON validation) | Not in current dependencies. JSON knowledge tree has a fixed schema validated by TypeScript interfaces at compile time. Runtime validation adds bundle size for internal-only data. | TypeScript interfaces + defensive parsing with try/catch (existing pattern) |

## Stack Patterns by Variant

**If conversation volume grows beyond 10K entries/month:**
- Add SQLite FTS5 virtual table on conversation_log for full-text search
- because FTS5 is built into better-sqlite3, zero cost to enable

**If knowledge tree exceeds 1MB total:**
- Migrate from JSON files to SQLite table with JSON1 columns
- because fs.readFileSync becomes a bottleneck at that size

**If multiple users are added (currently single-user):**
- user_profiles and user_memory tables already have user_id columns
- No architecture change needed, just populate the field

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| better-sqlite3 ^12.6.2 | Node 20 (Docker), Node 22 (host) | Already verified working in both environments. JSON1 extension included by default. |
| better-sqlite3 ^12.6.2 | node:20-slim Docker image | Requires glibc (Debian). Do NOT use Alpine. Already documented in MEMORY.md. |
| next 14.2.35 | New API routes for catbot intelligence | No version constraint. New routes follow existing patterns. |

## Integration Points Summary

| New Component | Integrates With | How |
|---------------|----------------|-----|
| catbot-db.ts | instrumentation.ts | Import and initialize at startup (same as db.ts) |
| catbot-prompt-builder.ts | /api/catbot/chat/route.ts | Replaces current `buildSystemPrompt()` function |
| catbot-scheduler.ts | instrumentation.ts | Start alongside TaskScheduler, DrivePolling, TelegramBot |
| knowledge tree JSON files | data/catbot-knowledge/ | Read by prompt builder, written by auto-enrichment tool |
| query_knowledge tool | catbot-tools.ts | New tool added to existing TOOLS array |
| User memory matching | /api/catbot/chat/route.ts | Run before LLM call, inject matched recipes into prompt |

## Sources

- Codebase analysis: `/home/deskmath/docflow/app/src/lib/db.ts` — existing database pattern (HIGH confidence)
- Codebase analysis: `/home/deskmath/docflow/app/src/lib/services/task-scheduler.ts` — existing scheduling pattern (HIGH confidence)
- Codebase analysis: `/home/deskmath/docflow/app/src/app/api/catbot/chat/route.ts` — current prompt assembly (HIGH confidence)
- Codebase analysis: `/home/deskmath/docflow/app/package.json` — current dependency inventory (HIGH confidence)
- better-sqlite3 documentation — JSON1 extension included by default since v7.x (HIGH confidence)
- Project MEMORY.md — critical patterns (bracket env access, node:20-slim, WAL mode) (HIGH confidence)

---
*Stack research for: CatBot Intelligence Engine*
*Researched: 2026-04-08*
