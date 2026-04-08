# Pitfalls Research

**Domain:** CatBot Intelligence Engine — AI memory, knowledge management, reasoning protocols added to existing chatbot
**Researched:** 2026-04-08
**Confidence:** HIGH (based on codebase analysis + domain research)

## Critical Pitfalls

### Pitfall 1: System Prompt Token Explosion

**What goes wrong:**
The current CatBot system prompt in `route.ts` is already ~350 lines of hardcoded text including personality, platform knowledge, tool docs, troubleshooting tables, skill protocols, Canvas execution knowledge, Holded rules, Model Intelligence protocols, and routing tables. Adding knowledge tree content, user memory, user profile, conversation summaries, and reasoning protocol instructions on top of this will push the assembled system prompt past model token limits — especially on cheaper/local models with 4K-8K context windows.

**Why it happens:**
Each feature team adds "just a few more lines" to the system prompt. Knowledge tree queries return full entries. User memory injects learned recipes. Summaries add historical context. Nobody tracks the cumulative token count until the LLM starts truncating or erroring.

**How to avoid:**
- Implement a strict token budget manager that assembles the system prompt dynamically with hard caps per section (e.g., personality: 200 tokens, platform knowledge: 500, tools: auto from registered tools, knowledge tree: max 800, user memory: max 400, summaries: max 300, reasoning protocol: max 200).
- Use a tiered injection strategy: always inject personality + tools (required), conditionally inject knowledge/memory only when relevant to the current query.
- Count tokens BEFORE sending to LLM. If over budget, compress or drop lowest-priority sections.
- Move the current hardcoded system prompt sections to the knowledge tree itself — the prompt assembler queries only what's needed.

**Warning signs:**
- LLM responses start ignoring instructions that appear in the middle of the system prompt (lost-in-the-middle effect).
- Local models (Gemma, Llama) start returning garbage or truncated responses.
- Token usage spikes without user conversation getting longer.
- CatBot "forgets" its personality or tool usage rules.

**Phase to address:**
Phase 1 (Knowledge Tree) — this is foundational. The knowledge tree must REPLACE the hardcoded system prompt, not add to it.

---

### Pitfall 2: Dual SQLite Database Transaction Conflicts

**What goes wrong:**
Running `docflow.db` and `catbot.db` as two separate `better-sqlite3` instances in the same Next.js process creates subtle issues: WAL mode conflicts when both try to write simultaneously, no cross-database transaction guarantees, doubled memory for prepared statement caches, and risk of one DB's `busy_timeout` blocking the other's event loop in synchronous `better-sqlite3` calls.

**Why it happens:**
Separating CatBot data into its own DB seems clean architecturally — it isolates concerns. But `better-sqlite3` is synchronous (blocks the Node.js event loop during writes), and having two DB instances doubles the blocking window. The current `db.ts` already uses `pragma('busy_timeout = 5000')` — imagine two databases both waiting 5 seconds.

**How to avoid:**
- Use SQLite ATTACH DATABASE instead of a separate connection. Open `catbot.db` as an attached database on the existing `docflow.db` connection: `db.exec("ATTACH DATABASE '/path/to/catbot.db' AS catbot")`. This gives you one connection, one WAL, one busy_timeout, and cross-database queries with `catbot.table_name` prefix.
- Alternative: use the same `docflow.db` with a `catbot_` table prefix. Simpler, no ATTACH needed, but couples the schemas.
- If using separate connections: ensure both use WAL mode, set `busy_timeout` to at least 5000ms on both, and never hold both open in a long synchronous operation.

**Warning signs:**
- `SQLITE_BUSY` errors appearing in logs during CatBot conversations.
- Next.js API routes timing out (default 60s) during concurrent writes.
- Build-time errors (Next.js parallel page collection triggers DB access).

**Phase to address:**
Phase 1 (catbot.db schema) — decide ATTACH vs separate connections before writing any tables.

---

### Pitfall 3: Knowledge Tree JSON Files Growing Unbounded

**What goes wrong:**
A JSON-based knowledge tree that CatBot auto-enriches (writing `learned_entries` on success) will grow without bound. A single `knowledge.json` file that starts at 10KB becomes 5MB after months of auto-enrichment. Loading it into memory on every request burns RAM, and injecting it into system prompts becomes impossible.

**Why it happens:**
JSON files are easy to prototype with — `JSON.parse(fs.readFileSync(...))`. Auto-enrichment adds entries but never prunes. Nobody implements compaction or relevance scoring on knowledge entries. Old/outdated entries never get removed.

**How to avoid:**
- Store knowledge in SQLite tables (in `catbot.db`), NOT flat JSON files. Use tables: `knowledge_nodes` (id, parent_id, category, key, value, confidence, created_at, updated_at, access_count), `knowledge_edges` (source_id, target_id, relation_type).
- Implement a relevance decay: entries not accessed in 90 days get lower priority, entries contradicted by newer info get flagged.
- Cap auto-enrichment: max 5 new entries per conversation, require minimum confidence score, deduplicate against existing entries before inserting.
- Index by category (endpoints, tools, howto, errors, etc.) so queries retrieve only the relevant subtree, not the whole tree.

**Warning signs:**
- Knowledge file size growing >500KB.
- `query_knowledge` tool taking >200ms to respond.
- Duplicate or contradictory entries appearing in knowledge base.
- CatBot citing outdated knowledge that was corrected in later conversations.

**Phase to address:**
Phase 1 (Knowledge Tree) — schema design must be DB-backed from day one, not JSON.

---

### Pitfall 4: User Memory Trigger Matching That's Too Loose

**What goes wrong:**
User memory "recipes" (learned workflows triggered by pattern matching) fire on unrelated queries, injecting irrelevant context into the conversation. Example: a recipe triggered by "deploy" fires when user says "deploy a new canvas node" — getting the Holded invoice deployment workflow instead of canvas help.

**Why it happens:**
Simple keyword matching (`trigger.includes(keyword)`) catches too many false positives. Regex is brittle and hard to maintain. Semantic similarity thresholds are either too permissive (>0.5 matches everything) or too strict (>0.9 matches nothing).

**How to avoid:**
- Use a two-stage matching: (1) keyword pre-filter to get candidates, (2) LLM-based relevance scoring on the top 3-5 candidates. The LLM call is cheap (use local/Libre tier model) and dramatically improves precision.
- Store triggers as structured objects: `{ keywords: string[], context_required: string[], anti_keywords: string[] }`. Anti-keywords prevent false matches.
- Require a minimum of 2 keyword matches for activation, not just 1.
- Track match accuracy: if a recipe fires and the user's next message ignores it or contradicts it, mark it as a false positive and increase the trigger threshold.

**Warning signs:**
- Users getting confused by CatBot referencing workflows they didn't ask about.
- The same recipe firing on >20% of unrelated queries.
- User memory injection adding >300 tokens of irrelevant context.

**Phase to address:**
Phase 3 (User Memory recipes) — trigger matching design is the core challenge here.

---

### Pitfall 5: Summary Compression That Loses Critical Decisions

**What goes wrong:**
Automated day/week/month summaries compress conversations into generic statements like "discussed Canvas configuration" when the actual decision was "decided to use Gemma for all OUTPUT nodes in Canvas pipelines." The specific decision, the reasoning, and the action items disappear.

**Why it happens:**
Generic summarization prompts ("summarize this conversation") produce generic summaries. The LLM doesn't know which details are decisions vs. chit-chat. Time-based compression (daily/weekly) treats all conversations equally regardless of importance.

**How to avoid:**
- Use structured summarization prompts that explicitly extract: `decisions_made`, `action_items`, `configuration_changes`, `problems_reported`, `solutions_applied`, `preferences_stated`. These fields are preserved verbatim even in compressed summaries.
- Implement importance tagging during the conversation (not after): when CatBot executes a tool that changes state (update_alias_routing, canvas_create, etc.), flag that exchange as "decision" — decisions are never compressed away.
- Keep a separate `decisions` table that's never compressed, only appended to. Summaries reference decision IDs instead of re-describing them.
- Hierarchical compression: daily summaries keep full detail, weekly summaries compress daily ones but preserve decisions, monthly summaries compress weekly ones but still preserve all decisions.

**Warning signs:**
- CatBot asking users about preferences they already stated weeks ago.
- Summaries that all look the same ("discussed platform features, resolved issues").
- Users saying "I already told you this" — the memory exists but was compressed away.

**Phase to address:**
Phase 4 (Summaries) — summarization prompt design and decision extraction must be built together.

---

### Pitfall 6: Auto-Enrichment Writing Garbage to Knowledge Base

**What goes wrong:**
CatBot auto-documents "learned entries" from successful conversations, but the quality gate is too low. Hallucinated information, user-specific preferences stated as platform facts, or incorrect troubleshooting steps get written as canonical knowledge. Over time the knowledge base becomes polluted with unreliable entries.

**Why it happens:**
Success detection is crude — "the user didn't complain, so the answer was correct." LLMs hallucinate confidently, and auto-enrichment treats confident LLM output as ground truth. No human review loop.

**How to avoid:**
- Require confidence scoring on every auto-enrichment entry: only entries where CatBot used a tool AND the tool returned success should be written (not entries based on pure text responses).
- Implement a "staging area" for new knowledge: entries go to `knowledge_pending` first, get promoted to `knowledge_confirmed` only after being validated (either by appearing in 2+ successful conversations, or by admin approval).
- Tag all auto-enriched entries with `source: 'auto'` vs `source: 'curated'`. The system prompt assembler can weight curated entries higher.
- Hard blacklist: never auto-enrich entries about security, credentials, API keys, or permission changes.

**Warning signs:**
- Knowledge entries that contradict official documentation.
- CatBot giving advice that worked once but isn't generally correct.
- Knowledge base growing by >10 entries per day (too aggressive).

**Phase to address:**
Phase 5 (Auto-enrichment) — this should be the LAST feature implemented, after knowledge tree, memory, and summaries are stable.

---

### Pitfall 7: localStorage to DB Migration Losing Conversation History

**What goes wrong:**
Current CatBot stores messages in `localStorage` (max 100 messages, `catbot-messages` key) plus sudo tokens. Migration to `catbot.db` can lose existing history if the migration path is wrong: browser storage isn't accessible from server-side, multi-browser users have different histories, and the `MAX_STORED = 100` truncation means old messages are already lost.

**Why it happens:**
localStorage is client-side, the new DB is server-side. There's no API to "upload" localStorage to the server automatically. Developers plan a migration script but forget that (a) the user might have CatBot open in multiple browsers/tabs, (b) Telegram conversations have no localStorage equivalent, (c) the migration needs to happen transparently without user action.

**How to avoid:**
- Accept that pre-migration localStorage history is expendable — it's only 100 messages, no critical state. Don't build a complex migration, build a clean cutover.
- On first load after upgrade: client detects new `conversation_log` API exists, sends localStorage messages to a one-time `/api/catbot/migrate-history` endpoint, then deletes localStorage. If the endpoint already has messages, skip migration.
- For Telegram: already stateless (no history persistence), so no migration needed — just start writing to `catbot.db`.
- Set a migration deadline: after 2 weeks, remove all localStorage code completely. Don't maintain dual storage.

**Warning signs:**
- Dual-storage bugs: messages appearing in localStorage but not DB, or vice versa.
- Race conditions: user sends message while migration is in progress.
- Memory bloat: keeping both localStorage read/write AND DB read/write active indefinitely.

**Phase to address:**
Phase 2 (conversation_log table) — migration must happen when the conversation DB table ships.

---

### Pitfall 8: Reasoning Protocol Over-Asking Users for Clarification

**What goes wrong:**
A reasoning protocol with "if ambiguous, ask for clarification" logic starts asking clarifying questions on every non-trivial request. "Create a CatPaw for email analysis" triggers "What type of emails? What analysis depth? What output format? Which model tier?" — four questions before doing anything. Users feel interrogated.

**Why it happens:**
The reasoning protocol classifies too many requests as "complex" (requiring clarification). Simple/medium thresholds are set too high. The protocol optimizes for accuracy over velocity, forgetting that users chose a chatbot for speed.

**How to avoid:**
- Default to action with sensible defaults, not questions. The reasoning protocol should: (1) check user profile for known preferences, (2) check user memory for similar past requests, (3) if both miss, use platform defaults and ACT — then offer to adjust.
- Limit clarification questions to MAX 1 per turn. If multiple things are ambiguous, pick the most impactful one and default the rest.
- Classify request complexity based on the number of unknown parameters, not the task type. "Create a CatPaw" has reasonable defaults for everything — it's simple. "Create a CatPaw that integrates with Holded and sends emails based on invoice status" has unknowns — it's complex.
- Track "question fatigue": if CatBot asked a clarification question in the last 2 turns, don't ask another one.

**Warning signs:**
- Average turns-to-action exceeding 3 (user says something, CatBot asks, user clarifies, CatBot asks again...).
- Users responding with "just do it" or "whatever you think is best."
- Decrease in CatBot usage after reasoning protocol ships.

**Phase to address:**
Phase 4 (Reasoning Protocol) — calibrate thresholds with real usage data, not assumptions.

---

### Pitfall 9: Backward Incompatibility with Existing CatBot Tools and Skills

**What goes wrong:**
The new intelligence engine changes how system prompts are assembled (from hardcoded to dynamic), how context is passed to tools (adding user profile, memory, knowledge), and how conversations flow (adding reasoning steps). Existing tools that depend on the current prompt structure break. Skills like "Orquestador CatFlow" and "Arquitecto de Agentes" that are referenced by exact string in the current system prompt stop being injected.

**Why it happens:**
The refactor treats the system prompt as a clean-slate rewrite instead of an incremental migration. Tool signatures change without updating all callers. The dynamic prompt assembler omits sections that were previously hardcoded because they don't have a knowledge tree entry yet.

**How to avoid:**
- Freeze the existing tool API contract: `getToolsForLLM()`, `executeTool()`, `getSudoToolsForLLM()`, `executeSudoTool()`, `getHoldedTools()`, `executeHoldedTool()` must continue to work exactly as-is. New intelligence tools are ADDED, not replacing.
- Migrate hardcoded system prompt sections to knowledge tree entries ONE BY ONE, with a feature flag. The dynamic assembler falls back to the hardcoded version for any section not yet in the knowledge tree.
- Write regression tests: snapshot the current full system prompt, then after migration, assert that all key sections still appear (personality, tool instructions, troubleshooting table, skill protocols, Canvas knowledge).
- The "always-on" skills ("Orquestador CatFlow", "Arquitecto de Agentes") must be migrated to the knowledge tree as `category: 'skill_protocol'` entries with `always_inject: true`.

**Warning signs:**
- CatBot stops using Canvas tools correctly after the update.
- Skill protocols no longer being followed (CatBot creates agents without checking existing ones).
- Holded tools losing their operational rules (asking users for API keys, etc.).
- Troubleshooting table responses disappearing.

**Phase to address:**
Phase 1 (Knowledge Tree) — must include a compatibility layer and regression tests before any hardcoded prompt content is removed.

---

### Pitfall 10: Permission Boundaries Leaking Between Users

**What goes wrong:**
In a single-server app, all users share the same `catbot.db`. User A's memory, preferences, and conversation history become visible to User B through the knowledge tree (auto-enriched from User A's conversations) or through shared summaries. Worse, User A's sudo session could theoretically be hijacked.

**Why it happens:**
The current system is explicitly "single-user" (out of scope: multi-user auth). But `user_profiles` table implies multiple users. Telegram integration already has multiple users (whitelist). The `user_id` field gets used inconsistently or defaults to a shared value.

**How to avoid:**
- Define a clear user identity model NOW, even if auth remains out of scope. Use: `web` (the single web user), `telegram:{chat_id}` (per Telegram user). All tables (`user_profiles`, `user_memory`, `conversation_log`, `summaries`) must have a `user_id` column with this format.
- Knowledge tree entries are GLOBAL (platform knowledge) — never auto-enrich the knowledge tree with user-specific data. User-specific learned patterns go to `user_memory` only.
- Sudo permissions are per-session, per-user. Telegram sudo is already scoped to `chat_id`. Web sudo token in `catbot.db` must also track which user initiated it.
- Summaries are per-user. Never create cross-user summaries.

**Warning signs:**
- CatBot referencing preferences that the current user never stated.
- Telegram user B seeing conversation context from Telegram user A.
- Knowledge tree entries containing user-specific data ("the user prefers...").

**Phase to address:**
Phase 1 (catbot.db schema) — user_id column on every table from the start.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| JSON files for knowledge tree | Fast prototyping, human-readable | Unbounded growth, no indexing, slow queries | Never — use SQLite from day one |
| Single hardcoded system prompt (current) | Works, no abstraction needed | Can't add dynamic sections, token explosion | Only during Phase 1 migration period |
| Keyword-only trigger matching for memory | Simple to implement | False positives frustrate users | MVP only, replace with LLM scoring in Phase 3 |
| No token counting before LLM call | Fewer dependencies | Silently exceeds context window, truncated responses | Never — always count |
| localStorage + DB dual storage | No migration needed | Two sources of truth, sync bugs | Max 2 weeks during migration cutover |
| Auto-enrichment without staging | Knowledge base grows faster | Garbage accumulates, trust erodes | Never — always use staging area |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| better-sqlite3 dual DB | Two separate `new Database()` instances blocking event loop twice | Use ATTACH DATABASE or single DB with prefixed tables |
| LiteLLM token counting | Assuming all models have same tokenizer | Use tiktoken for OpenAI, estimate 4 chars/token for others, always leave 20% buffer |
| Qdrant for memory search | Storing conversation embeddings in same collection as document RAG | Separate collection `catbot_memory` with different embedding strategy (shorter chunks) |
| Telegram bot + DB writes | Writing to catbot.db from long-polling loop on main thread | Use async wrapper or queue writes — long-polling timeout (25s) can overlap with DB writes |
| OpenClaw agent tools | Changing tool signatures breaks OpenClaw function-calling | Freeze existing tool schemas, add new tools alongside |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading full knowledge tree per request | Slow first token, high memory | Query by category + relevance, inject only needed entries | >1000 knowledge entries |
| Scanning all user_memory for trigger matching | Latency spike on each message | Index triggers, pre-filter by user_id + keyword | >200 memory recipes per user |
| Full conversation_log query for summary generation | Summary job blocks event loop | Paginate, run summaries as background job with setTimeout | >1000 conversations in DB |
| Embedding every message for semantic memory search | Ollama overload, slow responses | Only embed messages tagged as "memorable" (decisions, preferences) | >50 messages per session |
| System prompt re-assembly on every message in a conversation | Redundant DB queries per turn | Cache assembled prompt per conversation session, invalidate on relevant data change | >10 turns per conversation |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Auto-enriching knowledge with sudo command outputs | Sensitive server info in knowledge base | Blacklist all sudo tool outputs from auto-enrichment |
| Storing conversation content with API keys/passwords | Credential exposure in conversation_log | Redact known patterns (API key regexes) before storing messages |
| User memory recipes containing credential workflows | "To deploy, use API key X..." gets stored | Never store tool arguments containing `key`, `password`, `token`, `secret` fields |
| Knowledge tree admin endpoints without auth | Anyone can read/modify platform knowledge | Require sudo session for all knowledge tree write endpoints |
| Cross-user summary leakage in Telegram | User A's decisions visible to User B | Strict user_id filtering on ALL query paths, not just the happy path |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| CatBot announces it's "remembering" every interaction | Creepy, breaks conversation flow | Remember silently, only mention when user asks "do you remember..." |
| Reasoning protocol visible to user ("Analyzing complexity... classifying as MEDIUM...") | Feels robotic, adds latency perception | Keep reasoning internal, only show result ("Here's what I'll do:") |
| Knowledge tree errors surfaced as CatBot responses | "I couldn't query my knowledge base" confuses users | Graceful degradation: if knowledge query fails, respond without it, log error internally |
| Asking user to "rate this response" for memory training | Survey fatigue, low participation | Infer quality from user behavior: did they use the result? Did they rephrase? Did they say thanks? |
| Showing summary stats ("I compressed 47 conversations this week") | Nobody cares about internal metrics | Only surface summaries when user asks "what did we discuss last week?" |

## "Looks Done But Isn't" Checklist

- [ ] **Knowledge Tree:** Often missing fallback to hardcoded prompt when tree is empty/corrupt — verify CatBot works with empty knowledge tree
- [ ] **User Memory:** Often missing deduplication — verify same recipe isn't stored 5 times from similar conversations
- [ ] **Summaries:** Often missing decision extraction — verify specific decisions survive weekly compression
- [ ] **Reasoning Protocol:** Often missing Capa 0 (quick-access layer) — verify common requests bypass reasoning entirely
- [ ] **Auto-enrichment:** Often missing rate limiting — verify CatBot can't write >5 entries per conversation
- [ ] **DB Migration:** Often missing Telegram history — verify Telegram conversations also write to conversation_log
- [ ] **Token Budget:** Often missing per-model limits — verify system prompt fits in Gemma's 8K context, not just Claude's 200K
- [ ] **Backward compat:** Often missing skill injection — verify "Orquestador CatFlow" and "Arquitecto de Agentes" still get injected after migration

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Token explosion | LOW | Add token counter, cap sections, redeploy. No data loss. |
| DB transaction conflicts | MEDIUM | Refactor to ATTACH or single DB. May require table migration. |
| Knowledge tree pollution | HIGH | Manual audit of all entries, delete bad ones, tighten auto-enrichment rules. Time-consuming. |
| Trigger matching false positives | LOW | Adjust thresholds, add anti-keywords. Data model unchanged. |
| Summary context loss | HIGH | Lost decisions cannot be recovered. Must re-extract from raw conversation_log if kept. |
| Auto-enrichment garbage | MEDIUM | Purge `source: 'auto'` entries, add staging area, re-enrich from curated data. |
| localStorage migration failure | LOW | Re-read from localStorage if still present, re-attempt migration. Max 100 messages at risk. |
| Reasoning over-asking | LOW | Tune thresholds, add defaults. Config change, no code rewrite. |
| Backward incompatibility | HIGH | Regression test failures mean broken features. Must restore hardcoded sections while fixing dynamic assembly. |
| Permission leakage | HIGH | Audit all queries for user_id filtering, purge leaked data, notify affected users. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Token explosion | Phase 1 (Knowledge Tree) | Assert assembled system prompt <4000 tokens for Libre models, <8000 for Pro |
| Dual DB conflicts | Phase 1 (catbot.db schema) | Load test: 10 concurrent CatBot conversations, zero SQLITE_BUSY errors |
| Knowledge tree unbounded growth | Phase 1 (Knowledge Tree) | Schema review: SQLite tables, not JSON files; auto-enrichment has cap |
| Trigger matching false positives | Phase 3 (User Memory) | Test: 20 diverse queries, <2 false positive recipe triggers |
| Summary context loss | Phase 4 (Summaries) | Test: compress a conversation with 3 decisions, verify all 3 survive in summary |
| Auto-enrichment garbage | Phase 5 (Auto-enrichment) | Review: 50 auto-enriched entries, >90% are accurate and non-duplicate |
| localStorage migration | Phase 2 (conversation_log) | Test: load CatBot with existing localStorage, verify messages appear in DB |
| Reasoning over-asking | Phase 4 (Reasoning Protocol) | Metric: average turns-to-action <2 for simple requests |
| Backward compatibility | Phase 1 (Knowledge Tree) | Regression: snapshot current system prompt, assert all sections present after migration |
| Permission boundaries | Phase 1 (catbot.db schema) | Audit: every SELECT on catbot tables includes WHERE user_id clause |

## Sources

- [Codebase analysis] Current system prompt in `/app/src/app/api/catbot/chat/route.ts` (~350 lines hardcoded)
- [Codebase analysis] localStorage usage in `/app/src/components/catbot/catbot-panel.tsx` (MAX_STORED=100)
- [Codebase analysis] Single DB pattern in `/app/src/lib/db.ts` (better-sqlite3 with WAL)
- [Why Most Chatbots Fail at Memory](https://deeflect.medium.com/why-most-chatbots-fail-at-memory-and-how-to-fix-it-cdc40d219fee) — Memory as afterthought anti-pattern
- [LLM Context Window Limitations](https://atlan.com/know/llm-context-window-limitations/) — Token budget management
- [Context Window Overflow](https://aws.amazon.com/blogs/security/context-window-overflow-breaking-the-barrier/) — AWS on overflow patterns
- [Context Engineering: The New Prompt Engineering](https://www.sitepoint.com/context-engineering-for-agents/) — Dynamic assembly discipline
- [LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) — Summarization best practices
- [Context Window Management Strategies](https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/) — Hierarchical memory tiers
- [Automatic Context Compression in LLM Agents](https://medium.com/the-ai-forum/automatic-context-compression-in-llm-agents-why-agents-need-to-forget-and-how-to-help-them-do-it-43bff14c341d) — Compression vs summarization tradeoffs
- [SQLite ATTACH DATABASE](https://sqlite.org/lang_attach.html) — Official SQLite multi-DB documentation
- [The Context Window Problem: Scaling Agents Beyond Token Limits](https://factory.ai/news/context-window-problem) — Lost-in-the-middle effect, context rot

---
*Pitfalls research for: CatBot Intelligence Engine (v26.0)*
*Researched: 2026-04-08*
