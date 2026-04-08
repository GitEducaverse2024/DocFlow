# Phase 118: Foundation -- catbot.db + Knowledge Tree - Research

**Researched:** 2026-04-08
**Domain:** SQLite database creation, JSON knowledge tree, localStorage-to-DB migration
**Confidence:** HIGH

## Summary

Phase 118 is a pure-addition phase: no existing code is modified. It creates catbot.db as a separate SQLite database with 5 tables, populates a JSON knowledge tree in `app/data/knowledge/`, wires conversation persistence to the new DB replacing localStorage, and migrates any existing localStorage history. The existing `db.ts` pattern (better-sqlite3, WAL mode, busy_timeout, CREATE TABLE IF NOT EXISTS) provides a clear template to follow.

The main complexity lies in (1) the knowledge tree content extraction -- FEATURE_KNOWLEDGE has ~25 entries and `buildSystemPrompt()` has ~350 lines of hardcoded content that must be decomposed into 7+ JSON files with the required schema, and (2) the localStorage migration which requires a client-side detection + one-time upload to a new API endpoint. The DB schema itself is straightforward.

**Primary recommendation:** Follow the exact `db.ts` pattern for catbot-db.ts. Keep the knowledge tree as flat JSON files (one per platform area) with validated schema. Wire conversation logging through a new `/api/catbot/conversations` endpoint. Use a client-side migration hook that POSTs localStorage messages once and then clears them.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | catbot.db with 5 tables: user_profiles, user_memory, conversation_log, summaries, knowledge_learned | DB schema pattern from db.ts; table schemas from ARCHITECTURE.md research |
| INFRA-02 | catbot-db.ts exposes CRUD functions following db.ts pattern | Direct replication of db.ts module pattern with CRUD exports |
| INFRA-03 | Knowledge tree JSON files in app/data/knowledge/ covering 7 areas + _index.json | Content extracted from FEATURE_KNOWLEDGE (25 entries) + buildSystemPrompt() sections |
| INFRA-04 | Each JSON follows schema: id, name, path, description, endpoints, tools, concepts, howto, dont, common_errors, success_cases, sources | Schema defined in REQUIREMENTS.md; validated with TypeScript interface |
| INFRA-05 | Seed content migrates FEATURE_KNOWLEDGE + hardcoded system prompt sections to JSON | Full inventory of current hardcoded content documented below |
| INFRA-06 | Conversations persist in conversation_log instead of localStorage | New API endpoint + modification to catbot-panel.tsx storage layer |
| INFRA-07 | Transparent localStorage-to-DB migration (import once, then clean) | Client-side migration hook with one-time POST + localStorage.removeItem |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (already installed) | SQLite driver for catbot.db | Same as existing db.ts -- synchronous, WAL mode, proven pattern |
| Node.js fs/path | built-in | Read JSON knowledge tree files | No dependencies needed for JSON file reading |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | (already installed) | Validate knowledge tree JSON schema | On load of each JSON file to catch malformed content |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate catbot.db | ATTACH DATABASE on docflow.db | ATTACH is cleaner for cross-DB queries but adds coupling. Roadmap decision: separate DB for lifecycle isolation. Follow the decision. |
| JSON files for knowledge tree | SQLite tables for knowledge | Roadmap decision: JSON for versionability/diffability. Auto-enrichment (Phase 124) writes to knowledge_learned TABLE, not to JSON files. Follow the decision. |

**Installation:**
No new packages needed. All dependencies already exist in the project.

## Architecture Patterns

### Recommended File Structure
```
app/src/lib/
  catbot-db.ts                          # NEW: catbot.db connection + migrations + CRUD

app/src/app/api/catbot/
  conversations/route.ts                # NEW: GET/POST conversation log
  conversations/migrate/route.ts        # NEW: POST one-time localStorage migration

app/data/
  catbot.db                             # NEW: created at runtime by catbot-db.ts
  knowledge/                            # NEW: JSON knowledge tree (committed to git)
    _index.json                         # Index of all knowledge files
    catboard.json                       # CatBoard dashboard knowledge
    catbrains.json                      # CatBrains knowledge
    catpaw.json                         # CatPaw/Agentes knowledge
    catflow.json                        # CatFlow + Canvas knowledge
    canvas.json                         # Canvas visual editor knowledge
    catpower.json                       # Skills + Connectors + Templates
    settings.json                       # Settings + Centro de Modelos knowledge
```

### Pattern 1: catbot-db.ts Module (follows db.ts exactly)

**What:** A separate module exporting the catbot database instance with inline CREATE TABLE IF NOT EXISTS migrations.
**When to use:** Always -- this is the only way to access catbot.db.
**Example:**
```typescript
// Source: Existing pattern from app/src/lib/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from './logger';

const catbotDbPath = process['env']['CATBOT_DB_PATH']
  || path.join(process.cwd(), 'data', 'catbot.db');

const dbDir = path.dirname(catbotDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const catbotDb = new Database(catbotDbPath);

try {
  catbotDb.pragma('journal_mode = WAL');
  catbotDb.pragma('busy_timeout = 5000');
} catch {
  // Build-time: DB may be locked by parallel imports
}

catbotDb.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (...);
  CREATE TABLE IF NOT EXISTS user_memory (...);
  CREATE TABLE IF NOT EXISTS conversation_log (...);
  CREATE TABLE IF NOT EXISTS summaries (...);
  CREATE TABLE IF NOT EXISTS knowledge_learned (...);
`);

// CRUD functions exported as named exports
export function getConversation(id: string) { ... }
export function saveConversation(conv: ConversationInput) { ... }
// etc.

export default catbotDb;
```

**Critical conventions from project skills:**
- `process['env']['CATBOT_DB_PATH']` -- bracket notation, NEVER dot notation
- `export const dynamic = 'force-dynamic'` on any API route that reads env vars
- IDs via `generateId()` from `@/lib/utils`, NOT `crypto.randomUUID()`
- New columns via try-catch `ALTER TABLE` for future migrations

### Pattern 2: Knowledge Tree JSON Schema

**What:** Each JSON file follows the INFRA-04 schema with consistent structure.
**Example:**
```typescript
// TypeScript interface for validation
interface KnowledgeEntry {
  id: string;           // unique key, e.g. "catbrains"
  name: string;         // display name, e.g. "CatBrains"
  path: string;         // URL path, e.g. "/catbrains"
  description: string;  // 1-2 paragraph description
  endpoints: string[];  // relevant API endpoints
  tools: string[];      // CatBot tools related to this area
  concepts: string[];   // key concepts user should know
  howto: string[];      // step-by-step guides
  dont: string[];       // anti-patterns, things NOT to do
  common_errors: Array<{ error: string; cause: string; solution: string }>;
  success_cases: string[];  // example successful interactions
  sources: string[];    // paths to .planning/ docs for deep-dive
}

interface KnowledgeIndex {
  version: string;
  updated: string;
  areas: Array<{ id: string; file: string; name: string; description: string }>;
}
```

### Pattern 3: Conversation Persistence API

**What:** New API endpoints that the client calls to save/load conversations instead of localStorage.
**When to use:** Every conversation start and every message exchange.
**Key design decisions:**
- Conversation ID generated server-side on first POST
- Messages stored as JSON blob in conversation_log.messages column
- Client sends full message array on each save (simpler than incremental)
- GET returns conversations list, GET with ID returns single conversation

### Pattern 4: localStorage Migration Hook

**What:** Client-side code that detects localStorage history and migrates it once.
**When to use:** On CatBot panel mount, after conversation API is available.
**Example:**
```typescript
// In catbot-panel.tsx, on component mount
async function migrateLocalStorageOnce() {
  const stored = localStorage.getItem('docatflow_catbot_messages');
  if (!stored) return; // Nothing to migrate

  try {
    const messages = JSON.parse(stored);
    if (messages.length === 0) return;

    const res = await fetch('/api/catbot/conversations/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (res.ok) {
      localStorage.removeItem('docatflow_catbot_messages');
    }
  } catch {
    // Migration failed -- keep localStorage as fallback, retry next load
  }
}
```

### Anti-Patterns to Avoid
- **Putting catbot tables in docflow.db:** Roadmap explicitly decided separate DB for lifecycle isolation. Don't merge.
- **Loading all knowledge JSON on every request:** Cache in memory at module level. JSON files change only on deploy.
- **Complex migration with transaction coordination:** localStorage migration is best-effort. Max 50 messages, not critical data. Simple POST, delete on success.
- **Using `crypto.randomUUID()` for IDs:** Project convention requires `generateId()` from `@/lib/utils`.
- **Forgetting `export const dynamic = 'force-dynamic'`** on new API routes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation | Custom if/else validators | zod (already installed) | Type-safe, composable, good error messages |
| UUID generation | crypto.randomUUID() | generateId() from @/lib/utils | Project convention, works in all environments |
| SQLite migrations | Custom version tracking | CREATE TABLE IF NOT EXISTS + try-catch ALTER | Existing project pattern, simple and proven |

## Common Pitfalls

### Pitfall 1: Dual SQLite Busy Timeout
**What goes wrong:** Two separate better-sqlite3 instances (db.ts + catbot-db.ts) both with busy_timeout=5000. If both block on writes simultaneously, Node.js event loop stalls for up to 10 seconds.
**Why it happens:** better-sqlite3 is synchronous. Two DB instances double the blocking window.
**How to avoid:** Keep busy_timeout=5000 on both (matching db.ts). This is acceptable for single-user workload. CatBot writes (conversation_log) are small and fast. Monitor for SQLITE_BUSY errors in logs.
**Warning signs:** SQLITE_BUSY errors, API route timeouts, slow CatBot responses.

### Pitfall 2: Build-Time Database Access
**What goes wrong:** Next.js imports catbot-db.ts during build for page collection. If catbot.db is locked or directory doesn't exist, build fails.
**Why it happens:** Same issue as current db.ts -- parallel imports during `next build`.
**How to avoid:** Wrap pragma calls in try-catch (same as db.ts pattern). Ensure directory creation before Database constructor.

### Pitfall 3: Knowledge Tree Content Gaps
**What goes wrong:** FEATURE_KNOWLEDGE has 25+ entries but the requirement is 7 JSON files by platform area. Some entries (gmail, holded, searxng, linkedin) don't map cleanly to the 7 areas.
**Why it happens:** FEATURE_KNOWLEDGE is organized by topic, not by platform section.
**How to avoid:** Map entries to areas: gmail/holded/searxng/linkedin/mcp -> catpower.json (connectors are part of CatPower). catflow/iterator/reglas_canvas -> catflow.json. centro_de_modelos/modelos/enrutamiento -> settings.json. Create a mapping table before writing JSON files.

### Pitfall 4: Message Format Mismatch
**What goes wrong:** localStorage stores `Message[]` with fields `{role, content, tool_calls, actions, timestamp, sudo_required}`. The new conversation_log stores `ChatMessage[]` with `{role, content, tool_calls, tool_call_id}`. Migration must handle the format difference.
**Why it happens:** Client Message interface is richer than server ChatMessage. Tool call results are stored differently.
**How to avoid:** Store the client Message format in conversation_log.messages (it's a JSON blob). Don't try to normalize to server format during migration.

### Pitfall 5: Backward Compatibility During Transition
**What goes wrong:** If conversation API fails or is not yet deployed, CatBot becomes non-functional (no message persistence at all).
**Why it happens:** Removing localStorage before the API is reliable.
**How to avoid:** Keep localStorage as fallback. Read from DB first; if empty or error, fall back to localStorage. Only remove localStorage AFTER successful migration. Set a flag `docatflow_catbot_migrated` in localStorage to track migration status.

## Code Examples

### catbot.db Schema (from ARCHITECTURE.md research, adapted to REQUIREMENTS.md)

```sql
-- INFRA-01: 5 required tables
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,                    -- 'web:default' or 'telegram:{chat_id}'
  display_name TEXT,
  channel TEXT DEFAULT 'web',             -- 'web' | 'telegram'
  personality_notes TEXT,
  communication_style TEXT,
  preferred_format TEXT,
  known_context TEXT DEFAULT '{}',        -- JSON
  initial_directives TEXT,
  interaction_count INTEGER DEFAULT 0,
  last_seen TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_memory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,                  -- FK concept to user_profiles.id
  trigger_patterns TEXT NOT NULL,         -- JSON array of keywords/phrases
  steps TEXT NOT NULL,                    -- JSON array of workflow steps
  preferences TEXT DEFAULT '{}',          -- JSON: format, tone, resources
  source_conversation_id TEXT,
  success_count INTEGER DEFAULT 0,
  last_used TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversation_log (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'web:default',
  channel TEXT DEFAULT 'web',
  messages TEXT NOT NULL,                 -- JSON array of Message objects
  tools_used TEXT DEFAULT '[]',           -- JSON array of tool names
  token_count INTEGER DEFAULT 0,
  model TEXT,
  page TEXT,                              -- page context when conversation started
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'web:default',
  period_type TEXT NOT NULL,              -- 'daily' | 'weekly' | 'monthly'
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  summary TEXT NOT NULL,
  topics TEXT DEFAULT '[]',
  tools_used TEXT DEFAULT '[]',
  decisions TEXT DEFAULT '[]',
  pending TEXT DEFAULT '[]',
  conversation_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_learned (
  id TEXT PRIMARY KEY,
  knowledge_path TEXT NOT NULL,           -- which knowledge area this belongs to
  category TEXT NOT NULL,                 -- 'best_practice' | 'pitfall' | 'troubleshoot'
  content TEXT NOT NULL,
  learned_from TEXT DEFAULT 'usage',      -- 'usage' | 'development'
  confidence REAL DEFAULT 0.5,
  validated INTEGER DEFAULT 0,            -- 0=staging, 1=validated
  access_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Knowledge Tree JSON Example (catbrains.json)

```json
{
  "id": "catbrains",
  "name": "CatBrains",
  "path": "/catbrains",
  "description": "Los CatBrains son el nucleo de DoCatFlow. Subes documentos (PDF, URLs, YouTube, notas), los procesas con IA para generar documentos estructurados, y luego indexas el resultado en un RAG para poder chatear con el contenido.",
  "endpoints": [
    "GET /api/catbrains",
    "POST /api/catbrains",
    "GET /api/catbrains/[id]",
    "POST /api/catbrains/[id]/sources",
    "POST /api/catbrains/[id]/process",
    "POST /api/catbrains/[id]/rag/index"
  ],
  "tools": [
    "list_catbrains",
    "create_catbrain",
    "search_documentation"
  ],
  "concepts": [
    "Fuentes: PDF, URL, YouTube, notas de texto",
    "Procesamiento: LLM genera documento estructurado a partir de las fuentes",
    "RAG: indexacion en Qdrant con embeddings de Ollama para chat"
  ],
  "howto": [
    "Para crear un CatBrain: ir a /catbrains > Nuevo CatBrain > subir fuentes > procesar > indexar RAG",
    "Para chatear con un CatBrain: abrir el CatBrain > pestaña RAG > chatear"
  ],
  "dont": [
    "No procesar sin fuentes subidas",
    "No indexar RAG sin haber procesado primero"
  ],
  "common_errors": [
    {
      "error": "collection does not exist",
      "cause": "Proyecto no procesado o coleccion RAG borrada",
      "solution": "Ir al proyecto > pestaña RAG > re-procesar"
    },
    {
      "error": "Qdrant connection refused",
      "cause": "Contenedor Qdrant no esta corriendo",
      "solution": "Verificar en CatBoard. docker compose up -d docflow-qdrant"
    }
  ],
  "success_cases": [
    "Usuario sube 5 PDFs, procesa, indexa RAG, y chatea obteniendo respuestas con citas"
  ],
  "sources": [
    ".planning/knowledge/user-guide.md",
    ".planning/codebase/catbrains-routes.md"
  ]
}
```

### FEATURE_KNOWLEDGE to Knowledge Area Mapping

| FEATURE_KNOWLEDGE Key | Target JSON File |
|----------------------|-----------------|
| catbrains, proyectos, rag | catbrains.json |
| agentes, catpaws, workers | catpaw.json |
| tareas | catflow.json |
| catflow, iterator, reglas_canvas | catflow.json |
| canvas (from buildSystemPrompt) | canvas.json |
| conectores, gmail, holded, mcp, openclaw, linkedin, searxng, websearch | catpower.json |
| skills, templates, catpower | catpower.json |
| catboard, dashboard | catboard.json |
| centro_de_modelos, modelos, enrutamiento, cattools | settings.json |

### buildSystemPrompt() Sections to Migrate

| Section in route.ts | Target JSON File | Notes |
|---------------------|-----------------|-------|
| Personality (lines 171-178) | _index.json or identity section | Global, always injected |
| Platform knowledge (lines 180-194) | Distributed across all JSONs | Each area gets its own description |
| Stack del servidor (lines 196-203) | settings.json | Infrastructure knowledge |
| Contexto actual (lines 205-208) | Dynamic, not in JSON | Assembled at runtime by PromptAssembler (Phase 119) |
| Sudo section (lines 64-91) | settings.json sudo subsection | Only injected when sudo active |
| Holded section (lines 94-109) | catpower.json holded subsection | Conditional on holded tools presence |
| Model Intelligence (lines 112-166) | settings.json model_intelligence | Dynamic routing data stays in code |
| Tool instructions (lines 211-218) | Distributed by area | Each tool documented in its area's JSON |
| Canvas protocol (lines 220-348) | canvas.json + catflow.json | Large section, split by topic |
| Troubleshooting table (lines 256-267) | Distributed in common_errors | Each error goes to the relevant area JSON |
| Skill protocols (lines 275-301) | catpaw.json or catpower.json | Always-on skills |
| Canvas execution knowledge (lines 308-348) | canvas.json | Advanced execution patterns |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage for CatBot messages | Server-side SQLite persistence | This phase | Messages survive browser clear, shared across channels |
| FEATURE_KNOWLEDGE flat Record | Structured JSON knowledge tree | This phase | Queryable, schema-validated, extensible |
| Hardcoded buildSystemPrompt() | Content in JSON files (consumed by PromptAssembler in Phase 119) | Phase 118 creates content, 119 consumes it | Separation of content from assembly logic |

## Open Questions

1. **Conversation granularity: one row per conversation or per message?**
   - What we know: Current localStorage stores all messages in a flat array (max 50). The schema stores `messages TEXT` as JSON blob per conversation.
   - Recommendation: One row per conversation session. A "session" starts when user sends first message and ends after inactivity (client can track this). Simpler, matches localStorage mental model.

2. **How to detect "new conversation" vs "continuation"?**
   - What we know: Current CatBot has no conversation boundaries -- it's a single running chat. Settings page has a "clear history" button.
   - Recommendation: For Phase 118, treat all messages as one ongoing conversation per user. Don't introduce conversation splitting yet. Save the full message array on each interaction. Phase 119+ can add conversation boundaries.

3. **Knowledge tree: should `_index.json` be auto-generated or hand-maintained?**
   - Recommendation: Hand-maintained initially (7 entries). Auto-generation is premature for a static set of files.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (already configured) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run --reporter=verbose` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | catbot.db creates 5 tables on import | unit | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "creates tables"` | No -- Wave 0 |
| INFRA-02 | CRUD functions work for all tables | unit | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "CRUD"` | No -- Wave 0 |
| INFRA-03 | Knowledge JSON files exist and parse | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "files exist"` | No -- Wave 0 |
| INFRA-04 | Each JSON passes schema validation | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "schema"` | No -- Wave 0 |
| INFRA-05 | FEATURE_KNOWLEDGE keys covered by JSON tree | unit | `cd app && npx vitest run src/lib/__tests__/knowledge-tree.test.ts -t "coverage"` | No -- Wave 0 |
| INFRA-06 | Conversation save/load API works | integration | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "conversation"` | No -- Wave 0 |
| INFRA-07 | Migration endpoint imports and clears | integration | `cd app && npx vitest run src/lib/__tests__/catbot-db.test.ts -t "migrate"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd app && npx vitest run && cd .. && npm run build --prefix app`
- **Phase gate:** Full vitest suite green + `npm run build` succeeds

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-db.test.ts` -- covers INFRA-01, INFRA-02, INFRA-06, INFRA-07
- [ ] `app/src/lib/__tests__/knowledge-tree.test.ts` -- covers INFRA-03, INFRA-04, INFRA-05
- [ ] No new framework installs needed (vitest already configured)

## Sources

### Primary (HIGH confidence)
- [Codebase] `app/src/lib/db.ts` -- exact pattern to replicate for catbot-db.ts (Database constructor, WAL, busy_timeout, CREATE TABLE IF NOT EXISTS)
- [Codebase] `app/src/lib/services/catbot-tools.ts` lines 789-923 -- FEATURE_KNOWLEDGE with 25 entries to migrate
- [Codebase] `app/src/app/api/catbot/chat/route.ts` lines 42-348 -- buildSystemPrompt() full content to decompose
- [Codebase] `app/src/components/catbot/catbot-panel.tsx` lines 40-64 -- localStorage pattern (STORAGE_KEY, MAX_STORED=50, loadMessages/saveMessages)
- [Project] `.planning/research/ARCHITECTURE.md` -- target architecture, schema, file structure
- [Project] `.planning/research/PITFALLS.md` -- dual SQLite, migration, backward compat pitfalls
- [Project] `.planning/REQUIREMENTS.md` -- INFRA-01 through INFRA-07 exact requirements

### Secondary (MEDIUM confidence)
- [Project] `.planning/research/FEATURES.md` -- feature prioritization and dependency analysis
- [Project] `.planning/STATE.md` -- roadmap decisions (separate DB, JSON files, no ATTACH)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, exact replication of existing patterns
- Architecture: HIGH -- db.ts pattern is proven, knowledge tree schema defined in requirements
- Pitfalls: HIGH -- dual SQLite and migration issues well-documented in PITFALLS.md research

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, no external dependencies)
