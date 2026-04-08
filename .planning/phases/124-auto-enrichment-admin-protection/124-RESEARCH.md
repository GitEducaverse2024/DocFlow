# Phase 124: Auto-enrichment + Admin Protection - Research

**Researched:** 2026-04-08
**Domain:** CatBot auto-learning from interactions + multi-user data isolation
**Confidence:** HIGH

## Summary

Phase 124 is the final phase of v26.0 and covers two related capabilities: (1) CatBot writing learned_entries to the knowledge_learned table when it successfully solves problems, with a staging/validation gate before entries are injected into the prompt, and (2) protecting user data so CatBot never leaks data between users, with sudo-gated operations for sensitive admin tasks.

The knowledge_learned table already exists in catbot.db (Phase 118) with full CRUD via saveLearnedEntry/getLearnedEntries. The query_knowledge tool (Phase 119) already searches the static knowledge tree but does NOT yet include learned_entries. User profiles with user_id isolation (Phase 121) and the sudo system are already operational. The work is primarily: (a) a new save_learned_entry tool, (b) staging validation logic, (c) extending query_knowledge to include validated learned entries, (d) user_id enforcement on all tools that accept user_id, and (e) new sudo-gated admin tools for cross-user data management.

**Primary recommendation:** Split into 3 plans: (1) LearnedEntryService + save_learned_entry tool with staging logic, (2) query_knowledge extension + validation promotion, (3) admin protection: user_id enforcement + sudo admin tools + confirmation pattern.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LEARN-01 | CatBot writes learned_entry with knowledge_path, category, content, learned_from | knowledge_learned table exists with exact schema; saveLearnedEntry CRUD exists; need new CatBot tool |
| LEARN-02 | Each learned_entry has knowledge_path, category (best_practice/pitfall/troubleshoot), content, learned_from (usage/development) | Schema matches: knowledge_path TEXT, category TEXT, content TEXT, learned_from TEXT DEFAULT 'usage' |
| LEARN-03 | Learned entries pass through staging -- not injected until validated by repeated use or admin confirmation | validated INTEGER DEFAULT 0 column exists; need promotion logic (access_count threshold or admin validate tool) |
| LEARN-04 | query_knowledge includes validated learned_entries alongside static knowledge tree | query_knowledge tool exists in catbot-tools.ts; needs extension to call getLearnedEntries({validated: true}) |
| ADMIN-01 | CatBot never reveals data of one user to another | Current tools accept user_id as LLM arg with default 'web:default'; need to enforce caller's userId from route.ts context |
| ADMIN-02 | Only with active sudo: view other profiles, delete user data, export data | get_user_profile currently always_allowed with arbitrary user_id; need sudo gate for cross-user access |
| ADMIN-03 | Deleting user data requires explicit confirmation (same pattern as Holded safe delete) | Holded safe delete pattern: CatBot proposes deletion, waits for user confirmation, then executes |
</phase_requirements>

## Standard Stack

### Core (Already Exists)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| better-sqlite3 | existing | catbot.db with knowledge_learned table | READY - table + CRUD exist |
| catbot-tools.ts | existing | Tool definitions + execution | MODIFY - add save_learned_entry, extend query_knowledge |
| catbot-sudo-tools.ts | existing | Sudo-gated tools | MODIFY - add admin data management tools |
| catbot-db.ts | existing | CRUD for knowledge_learned | READY - saveLearnedEntry, getLearnedEntries exist |

### New (To Create)
| Module | Purpose | Pattern |
|--------|---------|---------|
| LearnedEntryService | Staging logic, validation promotion, rate limiting | Follow catbot-memory.ts pattern (pure functions, TDD) |

### No New Dependencies
This phase requires zero new npm packages. All work is service logic + tool wiring using existing infrastructure.

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  services/
    catbot-learned.ts          # NEW: LearnedEntryService (staging, validation, rate limiting)
  __tests__/
    catbot-learned.test.ts     # NEW: TDD tests for LearnedEntryService
  services/
    catbot-tools.ts            # MODIFY: add save_learned_entry tool, extend query_knowledge
    catbot-sudo-tools.ts       # MODIFY: add admin_list_profiles, admin_delete_user_data, admin_validate_learned
  app/api/catbot/chat/route.ts # MODIFY: pass userId to executeTool for enforcement
```

### Pattern 1: Staging with Confidence Threshold
**What:** learned_entries start with validated=0, confidence=0.5. They get promoted to validated=1 when either: (a) access_count reaches threshold (e.g., 3 queries matched the entry), or (b) admin explicitly validates via sudo tool.
**Why:** Prevents knowledge pollution (Pitfall 6 from research). Auto-enrichment without quality gate is the #1 risk.
**Implementation:**
```typescript
// catbot-learned.ts
const VALIDATION_THRESHOLD = 3; // access_count needed for auto-validation
const MAX_ENTRIES_PER_CONVERSATION = 3; // rate limit

export function saveLearnedEntryWithStaging(entry: {
  knowledgePath: string;
  category: 'best_practice' | 'pitfall' | 'troubleshoot';
  content: string;
  learnedFrom: 'usage' | 'development';
}): string | null {
  // Deduplicate: check if similar content exists for same path+category
  const existing = getLearnedEntries({ knowledgePath: entry.knowledgePath });
  const isDuplicate = existing.some(e => 
    e.category === entry.category && contentSimilarity(e.content, entry.content) > 0.8
  );
  if (isDuplicate) return null;
  
  return saveLearnedEntry(entry); // validated=0 by default
}

export function promoteIfReady(entryId: string): boolean {
  // Check access_count >= threshold
  const entry = getLearnedEntry(entryId);
  if (entry && entry.access_count >= VALIDATION_THRESHOLD) {
    setValidated(entryId, true);
    return true;
  }
  return false;
}
```

### Pattern 2: User-Scoped Tool Execution
**What:** Pass the caller's userId from route.ts into executeTool, and enforce it instead of trusting the LLM's user_id argument.
**Why:** ADMIN-01 requires CatBot never reveals data of one user to another. Currently tools like get_user_profile accept user_id as an LLM argument -- the LLM could be prompted to query another user's data.
**Implementation:**
```typescript
// In route.ts: pass userId to executeTool
const toolResult = await executeTool(toolName, toolArgs, baseUrl, { userId, sudoActive });

// In catbot-tools.ts: enforce userId on data-scoped tools
export async function executeTool(
  name: string, args: Record<string, unknown>, baseUrl: string,
  context?: { userId: string; sudoActive: boolean }
): Promise<ToolCallResult> {
  // For user-scoped tools, override LLM's user_id with caller's userId
  const USER_SCOPED_TOOLS = ['get_user_profile', 'update_user_profile', 'list_my_recipes', 
    'forget_recipe', 'list_my_summaries', 'get_summary'];
  
  if (USER_SCOPED_TOOLS.includes(name) && context?.userId) {
    // If LLM tries to access different user's data, require sudo
    const requestedUserId = (args.user_id as string) || context.userId;
    if (requestedUserId !== context.userId && !context.sudoActive) {
      return { name, result: { error: 'SUDO_REQUIRED', message: 'Acceder a datos de otro usuario requiere sudo activo.' } };
    }
    args.user_id = requestedUserId;
  }
  // ... rest of execution
}
```

### Pattern 3: Safe Delete with Confirmation (Holded Pattern)
**What:** Destructive operations on user data (delete profile, clear conversations, etc.) require the LLM to first propose the action, then wait for explicit user confirmation before executing.
**Why:** ADMIN-03 mandates the Holded safe delete pattern.
**Implementation:** The tool returns a confirmation prompt instead of executing. The LLM must relay this to the user and only call the tool again with `confirmed: true`.
```typescript
// In sudo tools:
case 'admin_delete_user_data': {
  const targetUserId = args.user_id as string;
  const confirmed = args.confirmed as boolean;
  const dataTypes = args.data_types as string[]; // ['profile', 'conversations', 'recipes', 'summaries']
  
  if (!confirmed) {
    // Count what would be deleted
    const counts = countUserData(targetUserId);
    return { name, result: {
      action: 'CONFIRM_REQUIRED',
      message: `Vas a eliminar datos de ${targetUserId}:\n` +
        `- Perfil: ${counts.profile ? 'si' : 'no'}\n` +
        `- Conversaciones: ${counts.conversations}\n` +
        `- Recetas: ${counts.recipes}\n` +
        `- Resumenes: ${counts.summaries}\n` +
        `\nPara confirmar, vuelve a llamar con confirmed=true.`
    }};
  }
  // Execute deletion
  deleteUserData(targetUserId, dataTypes);
  return { name, result: { success: true, message: `Datos de ${targetUserId} eliminados.` } };
}
```

### Anti-Patterns to Avoid
- **Auto-enriching from pure text responses:** Only enrich when CatBot used a tool AND the tool returned success. Text-only responses may contain hallucinations.
- **No rate limiting on auto-enrichment:** Cap at 3 entries per conversation to prevent knowledge flooding.
- **Trusting LLM user_id args for data access:** The LLM picks user_id from context but could be manipulated. Always enforce from route.ts.
- **Auto-enriching sudo tool outputs:** NEVER write learned entries about credentials, server configs, or API keys. Blacklist all sudo tool outputs from auto-enrichment.
- **Enriching with user-specific data as platform knowledge:** "The user prefers X" is NOT platform knowledge -- it belongs in the user profile, not knowledge_learned.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content deduplication | Custom NLP similarity | Simple Jaccard on tokenized words (same as recipe dedup in Phase 122) | Works well for short content strings; threshold 0.8 proven |
| Rate limiting per conversation | Global counter | In-memory Map<conversationId, count> reset per request | Conversations are short-lived; no persistence needed |
| Validation promotion | Complex ML scoring | Simple access_count threshold (3) | Straightforward, debuggable, admin-overridable |

## Common Pitfalls

### Pitfall 1: Knowledge Pollution from Aggressive Auto-Enrichment
**What goes wrong:** CatBot writes too many learned entries, including hallucinated or context-specific information that doesn't generalize.
**Why it happens:** Success detection is crude ("tool returned something") and no quality gate exists.
**How to avoid:** (1) Only enrich when tool returned success AND involved 2+ tools (complex resolution), (2) max 3 entries per conversation, (3) staging with access_count promotion, (4) deduplicate before inserting.
**Warning signs:** knowledge_learned growing >10 entries/day, contradictory entries appearing.

### Pitfall 2: User Data Leakage via LLM Tool Arguments
**What goes wrong:** LLM calls get_user_profile with another user's ID, leaking their data in the response.
**Why it happens:** Tools currently accept user_id as a free-form LLM argument. The LLM could be tricked via prompt injection or simply hallucinate a different user_id.
**How to avoid:** Enforce caller's userId from route.ts. Only allow cross-user access with sudo active.
**Warning signs:** CatBot referencing preferences the current user never stated.

### Pitfall 3: Token Budget Impact from Learned Entries
**What goes wrong:** query_knowledge returns learned entries that inflate the prompt or tool response beyond budget.
**Why it happens:** No cap on how many learned entries are returned per query.
**How to avoid:** Limit learned entries to top 5 per query, cap total content to 500 chars. Use same char capping pattern as profile directives (Phase 121).

### Pitfall 4: executeTool Signature Change Breaking Existing Callers
**What goes wrong:** Adding a context parameter to executeTool breaks the 20+ existing call sites.
**Why it happens:** Tight coupling between route.ts and executeTool signature.
**How to avoid:** Make context parameter optional with default behavior unchanged: `context?: { userId: string; sudoActive: boolean }`. When undefined, tools behave exactly as before.

### Pitfall 5: save_learned_entry Tool Being Abused
**What goes wrong:** Users directly ask CatBot to "learn" incorrect information.
**Why it happens:** The tool is available without restriction.
**How to avoid:** (1) Permission-gate save_learned_entry (require manage_knowledge action or empty allowedActions), (2) entries always start as staging (validated=0), (3) admin validation provides the quality gate.

## Code Examples

### Extending query_knowledge to Include Learned Entries
```typescript
// In catbot-tools.ts, case 'query_knowledge':
case 'query_knowledge': {
  try {
    const area = args.area as string | undefined;
    const query = args.query as string | undefined;

    // Existing: search static knowledge tree
    // ... (existing code unchanged) ...

    // NEW: append validated learned entries
    const learnedEntries = getLearnedEntries({ 
      knowledgePath: area, 
      validated: true 
    });
    
    // Score and filter learned entries by query relevance
    const relevantLearned = query 
      ? learnedEntries.filter(e => 
          e.content.toLowerCase().includes(query.toLowerCase()) ||
          e.category.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5)
      : learnedEntries.slice(0, 5);

    if (relevantLearned.length > 0) {
      // Increment access_count for matched entries
      for (const entry of relevantLearned) {
        incrementAccessCount(entry.id);
        promoteIfReady(entry.id);
      }
      
      // Append to result
      result.learned_entries = relevantLearned.map(e => ({
        category: e.category,
        content: e.content.substring(0, 200),
        learned_from: e.learned_from,
        confidence: e.confidence,
      }));
    }

    return { name, result };
  }
}
```

### save_learned_entry Tool Definition
```typescript
{
  type: 'function',
  function: {
    name: 'save_learned_entry',
    description: 'Guarda un aprendizaje en la base de conocimiento. Usa esto cuando resuelvas un problema y la solucion sea reutilizable. La entrada pasa por staging y no se inyecta en el prompt hasta ser validada.',
    parameters: {
      type: 'object',
      properties: {
        knowledge_path: { type: 'string', description: 'Area del knowledge tree (catboard, catbrains, catpaw, catflow, canvas, catpower, settings)' },
        category: { type: 'string', enum: ['best_practice', 'pitfall', 'troubleshoot'], description: 'Tipo de aprendizaje' },
        content: { type: 'string', description: 'Contenido del aprendizaje (max 500 chars)' },
        learned_from: { type: 'string', enum: ['usage', 'development'], description: 'Origen del aprendizaje' },
      },
      required: ['knowledge_path', 'category', 'content'],
    },
  },
}
```

### Admin Sudo Tools
```typescript
// New sudo tools for admin data management
{
  name: 'admin_list_profiles',
  description: 'Lista todos los perfiles de usuario en catbot.db. Solo disponible con sudo activo.',
  parameters: { type: 'object', properties: {} },
  sudo_required: true,
},
{
  name: 'admin_delete_user_data',
  description: 'Elimina datos de un usuario especifico. Requiere confirmacion explicita.',
  parameters: {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'ID del usuario cuyos datos se eliminaran' },
      data_types: { type: 'array', items: { type: 'string', enum: ['profile', 'conversations', 'recipes', 'summaries'] } },
      confirmed: { type: 'boolean', description: 'true para confirmar la eliminacion' },
    },
    required: ['user_id'],
  },
  sudo_required: true,
},
{
  name: 'admin_validate_learned',
  description: 'Valida o rechaza un learned_entry en staging. Las entries validadas se incluyen en query_knowledge.',
  parameters: {
    type: 'object',
    properties: {
      entry_id: { type: 'string', description: 'ID del learned_entry' },
      action: { type: 'string', enum: ['validate', 'reject'], description: 'Accion a tomar' },
    },
    required: ['entry_id', 'action'],
  },
  sudo_required: true,
},
{
  name: 'admin_list_learned',
  description: 'Lista learned_entries. Sin filtro muestra todas; con validated=false muestra las pendientes de validacion.',
  parameters: {
    type: 'object',
    properties: {
      validated: { type: 'boolean', description: 'Filtrar por estado de validacion' },
      knowledge_path: { type: 'string', description: 'Filtrar por area' },
    },
  },
  sudo_required: true,
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No auto-learning | Phase 124 adds staging-based learning | v26.0 | CatBot accumulates domain knowledge over time |
| No user data isolation | Phase 121 added user_id; Phase 124 enforces it | v26.0 | Safe for multi-user (web + Telegram) |
| Tools trust LLM user_id | Phase 124 enforces route.ts userId | Now | Prevents data leakage |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via `npm test` in app/) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-learned.test.ts` |
| Full suite command | `cd /home/deskmath/docflow/app && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEARN-01 | save_learned_entry writes to knowledge_learned | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "save"` | Wave 0 |
| LEARN-02 | Entry has knowledge_path, category, content, learned_from | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "schema"` | Wave 0 |
| LEARN-03 | Entries start as staging (validated=0), promoted by access_count or admin | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "staging"` | Wave 0 |
| LEARN-04 | query_knowledge includes validated learned_entries | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "query"` | Wave 0 |
| ADMIN-01 | Tools enforce userId, never cross-user leakage | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "isolation"` | Wave 0 |
| ADMIN-02 | Cross-user profile view requires sudo | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "sudo"` | Wave 0 |
| ADMIN-03 | Delete requires explicit confirmation | unit | `npx vitest run src/lib/__tests__/catbot-learned.test.ts -t "confirm"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /home/deskmath/docflow/app && npx vitest run src/lib/__tests__/catbot-learned.test.ts`
- **Per wave merge:** `cd /home/deskmath/docflow/app && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-learned.test.ts` -- covers LEARN-01 through LEARN-04, ADMIN-01 through ADMIN-03
- [ ] No new framework install needed -- Vitest already configured

## Key Existing Infrastructure

### Already Built (DO NOT Re-implement)
| Component | Location | What It Provides |
|-----------|----------|-----------------|
| knowledge_learned table | catbot-db.ts L90-101 | Schema with knowledge_path, category, content, learned_from, confidence, validated, access_count |
| saveLearnedEntry() | catbot-db.ts L402-420 | INSERT with id, knowledge_path, category, content, learned_from |
| getLearnedEntries() | catbot-db.ts L422-442 | SELECT with optional knowledgePath + validated filters |
| LearnedRow type | catbot-db.ts L165-176 | Full TypeScript interface |
| query_knowledge tool | catbot-tools.ts L196-228 (def), L1196-1228 (handler) | Searches static knowledge tree; needs extension |
| getToolsForLLM() | catbot-tools.ts L961-993 | Permission filtering; add new tools here |
| executeTool() | catbot-tools.ts L1047+ | Tool dispatch; add new cases here |
| Sudo system | catbot-sudo-tools.ts | SUDO_TOOLS array + executeSudoTool; add admin tools here |
| route.ts userId | route.ts L87 | userId already resolved; needs to be passed to executeTool |

### DB Functions Needed (Not Yet Built)
| Function | Purpose | Add To |
|----------|---------|--------|
| incrementAccessCount(id) | Bump access_count when learned entry is queried | catbot-db.ts |
| setValidated(id, validated) | Promote/demote learned entry | catbot-db.ts |
| deleteLearnedEntry(id) | For admin rejection | catbot-db.ts |
| getAllProfiles() | For admin_list_profiles | catbot-db.ts |
| deleteUserData(userId, types) | For admin_delete_user_data | catbot-db.ts |
| countUserData(userId) | For confirmation step | catbot-db.ts |

## Open Questions

1. **Auto-enrichment trigger in route.ts**
   - What we know: Recipe auto-save triggers post-conversation when 2+ tools used (route.ts L269-270)
   - What's unclear: Should auto-enrichment trigger similarly in route.ts, or should CatBot explicitly call save_learned_entry?
   - Recommendation: Explicit tool call only. CatBot decides when to learn; no automatic post-conversation enrichment. This is simpler, more predictable, and avoids Pitfall 1.

2. **Learned entries in PromptAssembler**
   - What we know: LEARN-03 says entries are not injected in prompt until validated. LEARN-04 says query_knowledge includes them.
   - What's unclear: Should validated entries also be injected in PromptAssembler (like knowledge tree sections)?
   - Recommendation: No. Validated entries are only surfaced via query_knowledge tool. This keeps the prompt budget clean and avoids unbounded growth.

## Sources

### Primary (HIGH confidence)
- catbot-db.ts (direct code analysis) -- knowledge_learned schema, CRUD functions
- catbot-tools.ts (direct code analysis) -- query_knowledge implementation, tool permission system
- catbot-sudo-tools.ts (direct code analysis) -- sudo tool pattern, execution gate
- route.ts (direct code analysis) -- userId resolution, tool execution flow
- REQUIREMENTS.md (project spec) -- LEARN-01 through LEARN-04, ADMIN-01 through ADMIN-03
- PITFALLS.md (project research) -- Pitfall 6 (auto-enrichment garbage), Pitfall 10 (permission boundaries)

### Secondary (MEDIUM confidence)
- Phase 121 summary -- user_id enforcement patterns, profile service design
- Phase 119 summary -- query_knowledge tool design, scoring approach
- Phase 122 decisions -- Jaccard similarity (0.8 threshold), recipe dedup pattern

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries exist, no new deps
- Architecture: HIGH -- follows established patterns from Phases 118-122
- Pitfalls: HIGH -- directly from project PITFALLS.md research + codebase analysis

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, no external dependencies)
