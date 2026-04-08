# Feature Research

**Domain:** AI Assistant Intelligence Engine (CatBot v26.0)
**Researched:** 2026-04-08
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any "intelligent assistant" must have in 2026. Without these, CatBot feels like a 2023 chatbot.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Dynamic system prompt from knowledge base | ChatGPT, Claude, Gemini all adapt context to user's current task. A hardcoded prompt is visibly static. | MEDIUM | Replaces current 300+ line hardcoded `buildSystemPrompt()` in route.ts. Assemble from JSON knowledge tree based on `context.page`. Already have `FEATURE_KNOWLEDGE` flat map as prototype. |
| Editable CatBot config (primary/secondary instructions) | ChatGPT Custom Instructions set the standard. Users expect to tell their assistant "how to behave". | LOW | Existing `catbot_config` in settings table stores `{model, personality, allowed_actions}`. Extend with `primary_instructions` and `secondary_instructions` fields. UI already has CatBot config section in /settings. |
| Conversation persistence server-side | localStorage history is fragile (cleared on browser reset, invisible to Telegram). Every serious assistant persists conversations server-side. | MEDIUM | New `conversation_log` table in catbot.db. Dual-channel: web + Telegram users need unified history. Current localStorage approach means Telegram and web have zero shared context. |
| User profiles with preferences | ChatGPT memory (April 2025+) and Custom Instructions are baseline expectations. Users expect the assistant to "know them". | MEDIUM | `user_profiles` table with `initial_directives`, `communication_style`, `known_context`. Auto-update after conversations by extracting preferences. Single-user simplifies this -- but Telegram multi-user means actual multi-profile needed. |
| Admin protection for user data | Any multi-user system needs access control. Telegram whitelist already exists but data management lacks protection. | LOW | sudo + key gate for managing other users' data. Builds on existing scrypt-based sudo system. |

### Differentiators (Competitive Advantage)

Features that make CatBot genuinely smarter than a generic LLM chat wrapper.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Knowledge Tree (structured platform wiki) | CatBot becomes the single source of truth about DoCatFlow itself. No other self-hosted tool has an assistant that deeply knows its own platform from structured JSON docs. | HIGH | JSON wiki per section (CatBoard, CatBrains, CatPaw, CatFlow, Canvas, CatPower, Settings) with endpoints, tools, howto, dont, common_errors, success_cases. Sources pointing to 80+ existing .md files. This is the backbone -- dynamic prompt, query_knowledge tool, and auto-enrichment all depend on it. |
| User Memory / Recipes (Capa 0) | Instant replay of learned workflows. Mem0-style memory but specialized: when CatBot recognizes a trigger pattern, it short-circuits to a known solution. Zero-latency for repeated tasks. | HIGH | `user_memory` table with `trigger_pattern`, `workflow_steps`, `success_count`. Capa 0 in reasoning protocol checks recipes before engaging LLM. This is the "CatBot gets faster the more you use it" feature. |
| Conversation Summaries (day/week/month compression) | Hierarchical memory compression following Mem0/KVzip patterns. Reduces token cost ~90% while maintaining context across sessions. | MEDIUM | `summaries` table with `period` (day/week/month), `topics`, `tools_used`, `decisions`, `pending`. Automatic compression cron-like trigger. Key insight from research: memory formation (extracting facts) beats raw summarization (compressing everything). |
| Reasoning Protocol (simple/medium/complex) | Adaptive chain-of-thought matching task complexity to reasoning depth. Prevents wasting Elite model tokens on "list my CatBrains" while ensuring deep analysis for complex requests. | MEDIUM | Three levels: **Simple** (execute directly, Capa 0 recipes first), **Medium** (reason then execute), **Complex** (reason, ask clarifying questions, analyze, propose, execute). Builds on existing CATBOT-07 proportionality protocol. The K2-V2 model's 3 reasoning levels and Claude's hybrid reasoning mode validate this approach. |
| Auto-enrichment (CatBot learns from solving problems) | Self-improving knowledge base. When CatBot successfully resolves an issue, it documents the solution as a `learned_entry` in the knowledge tree. The platform's documentation grows organically. | MEDIUM | `knowledge_learned` table. Trigger: successful tool use + positive user feedback or resolution confirmation. Writes back to knowledge tree JSON. Risk: needs quality gate to avoid polluting knowledge with noise. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time conversation sync via WebSocket | "I want to see my Telegram conversation in web instantly" | PROJECT.md explicitly marks WebSocket out of scope. Polling is sufficient. Adds infrastructure complexity for marginal benefit in single-user context. | Polling on conversation_log table (15s interval like notifications). Conversations sync on page load. |
| Full RAG over conversation history | "CatBot should remember everything I ever said" | Embedding every message creates massive vector overhead, poor signal-to-noise, and slow retrieval. Mem0 research shows memory formation beats raw embedding. | Summaries + recipes + user profile. Extract facts, don't embed everything. The hierarchical summary (day/week/month) plus trigger-matched recipes covers 95% of use cases. |
| LLM-powered auto-categorization of every message | "Automatically tag every conversation with topics" | Adds LLM call overhead to every message. At scale, doubles API costs. Topics extracted during summarization are sufficient. | Extract topics during periodic summary compression (batch, not per-message). |
| Editable knowledge tree via UI | "Let me edit the wiki from the browser" | Building a JSON editor UI is a large surface area. Knowledge tree should be curated by the developer, not casually edited. Auto-enrichment handles organic growth. | Knowledge tree files edited in code/filesystem. CatBot auto-enrichment for learned entries. Admin can use CatBot sudo file_operation to edit if needed. |
| Per-conversation model selection | "Let me pick which model CatBot uses for each chat" | Adds UI complexity, confuses non-technical users, and the alias routing system already handles model selection intelligently. | Reasoning protocol determines complexity; alias routing picks appropriate model tier automatically. |
| Unlimited conversation history retention | "Never delete anything" | SQLite bloat, slow queries, diminishing returns on old conversations. | Retention policy: raw messages for 90 days, summaries indefinitely. Configurable in settings. |

## Feature Dependencies

```
[Knowledge Tree (JSON wiki)]
    |
    |--required-by--> [Dynamic System Prompt]
    |                      (assembles prompt sections from tree based on page context)
    |
    |--required-by--> [query_knowledge tool]
    |                      (CatBot queries tree for platform info)
    |
    |--required-by--> [Auto-enrichment]
                           (writes learned_entries back to tree)

[catbot.db schema]
    |
    |--required-by--> [User Profiles]
    |--required-by--> [User Memory / Recipes]
    |--required-by--> [Conversation Log]
    |--required-by--> [Summaries]
    |--required-by--> [Knowledge Learned]

[Conversation Log (server-side)]
    |
    |--required-by--> [Summaries]
    |                      (can't compress what isn't stored)
    |
    |--required-by--> [User Profile auto-update]
    |                      (extracts preferences from conversations)
    |
    |--required-by--> [Auto-enrichment]
                           (needs conversation context to identify learnings)

[User Profiles]
    |
    |--enhances--> [Dynamic System Prompt]
    |                  (injects user preferences into prompt)
    |
    |--enhances--> [Reasoning Protocol]
                       (user complexity preference influences level selection)

[User Memory / Recipes]
    |
    |--enhances--> [Reasoning Protocol]
                       (Capa 0 = check recipes before reasoning)

[Config CatBot ampliada]
    |
    |--enhances--> [Dynamic System Prompt]
                       (primary/secondary instructions injected)

[Admin Protection]
    |
    |--required-by--> [User Profiles management]
    |--required-by--> [User Memory management]
    |--required-by--> [Conversation data management]
```

### Dependency Notes

- **Knowledge Tree is the foundation**: Dynamic prompt, query tool, and auto-enrichment all depend on it. Must be built first.
- **catbot.db schema must exist before any data features**: All user data features (profiles, memory, conversations, summaries) need their tables. Schema creation is Phase 1 work.
- **Conversation Log enables Summaries**: Can't compress conversations that aren't persisted. Log must exist before summary system.
- **Recipes enhance Reasoning Protocol**: Capa 0 (instant replay) is the fast path in reasoning. Recipes should exist before the reasoning protocol is finalized, but reasoning can work without them initially.
- **Config CatBot is independent**: Can be built in parallel with anything since it only extends existing settings infrastructure.

## MVP Definition

### Launch With (v1 -- Core Intelligence)

- [x] catbot.db schema with all tables -- foundation for everything
- [x] Knowledge Tree JSON files for all 7 platform sections -- backbone of intelligence
- [x] Dynamic system prompt assembled from knowledge tree + user context -- replaces hardcoded prompt
- [x] query_knowledge tool -- CatBot can answer "how does Canvas work?"
- [x] Config CatBot ampliada (primary/secondary instructions, personality) -- user customization
- [x] Conversation persistence server-side -- enables all memory features

### Add After Validation (v1.x -- Memory Layer)

- [ ] User Profiles with auto-update -- trigger: conversations are being stored, now extract preferences
- [ ] User Memory / Recipes with trigger matching -- trigger: repeated patterns observed in conversation logs
- [ ] Reasoning Protocol (simple/medium/complex + Capa 0) -- trigger: recipes exist to power Capa 0
- [ ] Admin protection for multi-user data -- trigger: Telegram users generating data that needs isolation

### Future Consideration (v2+ -- Self-Improvement)

- [ ] Conversation Summaries (day/week/month) -- defer: needs volume of conversations first; premature optimization without data
- [ ] Auto-enrichment (learned_entries) -- defer: needs quality gate design, risk of knowledge pollution; better after knowledge tree is stable
- [ ] Summary-based context injection -- defer: requires mature summary system

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Knowledge Tree JSON wiki | HIGH | HIGH | P1 |
| Dynamic system prompt | HIGH | MEDIUM | P1 |
| query_knowledge tool | HIGH | LOW | P1 |
| catbot.db schema | HIGH (enabler) | LOW | P1 |
| Conversation persistence | HIGH | MEDIUM | P1 |
| Config CatBot ampliada | MEDIUM | LOW | P1 |
| User Profiles | HIGH | MEDIUM | P2 |
| Reasoning Protocol | MEDIUM | MEDIUM | P2 |
| User Memory / Recipes | HIGH | HIGH | P2 |
| Admin protection | MEDIUM | LOW | P2 |
| Conversation Summaries | MEDIUM | MEDIUM | P3 |
| Auto-enrichment | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- CatBot becomes page-aware and customizable
- P2: Should have -- CatBot becomes personalized and adaptive
- P3: Nice to have -- CatBot becomes self-improving

## Competitor Feature Analysis

| Feature | ChatGPT (2025-2026) | Claude Projects | DoCatFlow CatBot (v26) |
|---------|---------------------|-----------------|----------------------|
| Memory / user profiles | Two-layer: saved memories + implicit chat insights. Free users get lightweight version. | Project-level context only, no persistent memory across projects. | User profiles per user (web + Telegram) with auto-update from conversations. Scoped to platform context. |
| Custom instructions | Global Custom Instructions + per-GPT instructions | System prompt per project | Primary + secondary instructions, personality text, per-permission-level config (normal + sudo) |
| Knowledge base | Training data + web search + uploaded files | Project files uploaded as context | Structured JSON wiki of the platform itself -- deeply domain-specific, not generic RAG |
| Dynamic context | Automatic based on conversation + memory | Static project context | Page-aware: prompt sections assembled based on user's current UI page |
| Conversation summaries | Long-term memory indexes year of conversations (Jan 2026) | None (stateless between conversations) | Hierarchical: day/week/month compressed summaries with topic extraction |
| Learned workflows | Implicit via memory (remembers preferences over time) | None | Explicit recipes with trigger patterns for instant replay (Capa 0) |
| Reasoning levels | Extended thinking (toggle on/off) | Extended thinking mode | Three-tier protocol: simple (direct execute), medium (reason then execute), complex (full analysis chain) |
| Auto-enrichment | Implicit (memory updates from conversations) | None | Explicit: writes learned_entries to knowledge tree when solving problems |

## Sources

- [State of AI Agent Memory 2026 (Mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026) -- memory architecture patterns, multi-layer systems
- [AI Memory Layer Guide (Mem0, Dec 2025)](https://mem0.ai/blog/ai-memory-layer-guide) -- 90% token reduction, hybrid vector+graph storage
- [LLM Chat History Summarization Guide (Mem0, Oct 2025)](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) -- hierarchical summarization patterns
- [Memory and New Controls for ChatGPT (OpenAI)](https://openai.com/index/memory-and-new-controls-for-chatgpt/) -- two-layer memory system, custom instructions
- [ChatGPT Custom Instructions (OpenAI)](https://openai.com/index/custom-instructions-for-chatgpt/) -- primary/secondary instruction patterns
- [AI Memory vs Context Understanding (Sphere)](https://www.sphereinc.com/blogs/ai-memory-and-context/) -- enterprise memory architecture
- [KVzip Conversation Memory Compression](https://techxplore.com/news/2025-11-ai-tech-compress-llm-chatbot.html) -- 3-4x compression of conversation memory
- [Adaptive Chain-of-Thought Distillation](https://www.mdpi.com/2227-7390/13/22/3646) -- Easy/Medium/Hard reasoning levels
- [K2-V2 Report: 3 Reasoning Levels](https://www.llm360.ai/reports/K2_V2_report.pdf) -- production implementation of tiered reasoning
- [Mem0 GitHub](https://github.com/mem0ai/mem0) -- open-source memory layer architecture reference

---
*Feature research for: CatBot Intelligence Engine (v26.0)*
*Researched: 2026-04-08*
