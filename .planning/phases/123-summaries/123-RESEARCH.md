# Phase 123: Summaries - Research

**Researched:** 2026-04-08
**Domain:** Scheduled LLM-based conversation compression with hierarchical summarization
**Confidence:** HIGH

## Summary

Phase 123 implements automatic hierarchical compression of CatBot conversations into daily, weekly, and monthly summaries stored in catbot.db. The core challenge is twofold: (1) building a scheduled background service that calls a Libre tier (zero-cost) LLM to compress conversations, and (2) designing structured summarization prompts that extract and preserve decisions across all compression levels.

The infrastructure is already in place: catbot-db.ts has the `summaries` table with all required fields (summary, topics, tools_used, decisions, pending), CRUD functions (saveSummary, getSummaries), and typed SummaryRow. The `conversation_log` table is populated by route.ts after each conversation. The TaskScheduler in instrumentation.ts provides the scheduling pattern. The only missing piece is catbot-db.ts lacks a date-range query for conversations (getConversationsByDateRange) -- this must be added.

**Primary recommendation:** Build a SummaryService with three compression methods (daily/weekly/monthly), register it as a periodic check in instrumentation.ts using setInterval (separate from TaskScheduler which is for user tasks), and use structured extraction prompts via LiteLLM calling an Ollama Libre model (e.g., ollama/gemma3:12b). Decisions must be accumulated (union, never replaced) at every compression level.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SUMMARY-01 | Scheduler in instrumentation.ts generates daily summaries compressing previous day's conversations | TaskScheduler pattern in instrumentation.ts; setInterval with daily check; LiteLLM + Libre tier model for zero cost |
| SUMMARY-02 | Each daily summary includes summary, topics, tools_used, decisions, pending as structured fields | summaries table already has all these columns; structured extraction prompt with JSON output |
| SUMMARY-03 | Weekly summaries every Monday, monthly on day 1, compressing lower-level summaries | getSummaries(userId, periodType) already supports filtering; compression of summaries into higher-level summaries |
| SUMMARY-04 | Monthly summaries on day 1 compressing weekly summaries | Same pattern as weekly but over weekly summaries |
| SUMMARY-05 | Decisions never lost in compression -- accumulated across all levels | Union-based decision accumulation: collect all decisions from child summaries before LLM compression |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | catbot.db read/write for conversations and summaries | Already in use, catbot-db.ts has all CRUD |
| LiteLLM proxy | (existing at :4000) | Route LLM calls to Ollama models | Already in use for CatBot chat, zero-cost Libre tier |
| node-cron or setInterval | N/A (use setInterval) | Schedule daily/weekly/monthly checks | Project already uses setInterval pattern in TaskScheduler |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @/lib/logger | (existing) | Structured logging for summary operations | Always -- log compression runs, errors, skip reasons |
| @/lib/utils generateId | (existing) | Generate summary IDs | Every saveSummary call |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| setInterval in instrumentation.ts | node-cron | node-cron adds a dependency; setInterval with date checks is simpler and matches existing pattern |
| Ollama Libre model | No LLM (rule-based extraction) | LLM produces far better summaries; Libre tier is zero cost via local Ollama |
| Separate scheduler class | Extend TaskScheduler | TaskScheduler is for user-created tasks in docflow.db; summaries are internal CatBot maintenance -- keep separate |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/
  services/
    catbot-summary.ts          # NEW: SummaryService class
  catbot-db.ts                 # MODIFY: add getConversationsByDateRange()
  __tests__/
    catbot-summary.test.ts     # NEW: unit tests

app/src/
  instrumentation.ts           # MODIFY: register summary scheduler
```

### Pattern 1: SummaryService as Stateless Class with Static Methods
**What:** A service module exporting compression functions (compressDaily, compressWeekly, compressMonthly) and a scheduler starter.
**When to use:** Background processing that reads DB, calls LLM, writes DB.
**Example:**
```typescript
// catbot-summary.ts
import { getConversationsByDateRange, saveSummary, getSummaries } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

const SUMMARY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

export class SummaryService {
  private static intervalId: ReturnType<typeof setInterval> | null = null;

  static start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), SUMMARY_CHECK_INTERVAL);
    // Delay first tick by 2 minutes to let the app fully boot
    setTimeout(() => this.tick(), 120_000);
    logger.info('summary', 'Summary scheduler started');
  }

  static async tick(): Promise<void> {
    const now = new Date();
    // Daily: check if yesterday's summary exists
    await this.maybeCompressDaily(now);
    // Weekly: check on Mondays
    if (now.getDay() === 1) await this.maybeCompressWeekly(now);
    // Monthly: check on day 1
    if (now.getDate() === 1) await this.maybeCompressMonthly(now);
  }

  static async compressDaily(date: Date, userId: string): Promise<string | null> {
    // 1. Get conversations for the date
    // 2. If none, skip
    // 3. Call LLM with structured extraction prompt
    // 4. Parse response, saveSummary with decisions
    // 5. Return summary ID
  }

  static async compressWeekly(weekStart: Date, userId: string): Promise<string | null> {
    // 1. Get daily summaries for the week
    // 2. Collect ALL decisions from daily summaries (union)
    // 3. Call LLM to compress daily summaries into weekly
    // 4. Merge LLM-extracted decisions with accumulated decisions
    // 5. saveSummary with accumulated decisions
  }

  static async compressMonthly(monthStart: Date, userId: string): Promise<string | null> {
    // Same pattern as weekly but over weekly summaries
  }
}
```

### Pattern 2: Structured Extraction Prompt (JSON Output)
**What:** A prompt that forces the LLM to return JSON with specific fields rather than free-form text.
**When to use:** When you need structured data from LLM output.
**Example:**
```typescript
const DAILY_EXTRACTION_PROMPT = `Eres un asistente de compresion de conversaciones. Analiza las siguientes conversaciones de CatBot y extrae un resumen estructurado.

RESPONDE SOLO con JSON valido, sin markdown ni texto adicional:
{
  "summary": "Resumen conciso de 2-3 parrafos de lo que se hizo",
  "topics": ["tema1", "tema2"],
  "tools_used": ["tool_name1", "tool_name2"],
  "decisions": ["decision especifica 1", "decision especifica 2"],
  "pending": ["tarea pendiente 1", "item por resolver"]
}

REGLAS CRITICAS:
- decisions: Incluye TODAS las decisiones tomadas, configuraciones cambiadas, preferencias expresadas. Se especifico (no "se cambio configuracion" sino "se configuro el modelo catbot a gemma3:12b").
- pending: Incluye tareas mencionadas pero no completadas, problemas sin resolver.
- tools_used: Lista los nombres exactos de las herramientas CatBot usadas.
- topics: Categorias generales (ej: "configuracion modelos", "canvas pipeline", "holded integracion").

Conversaciones del dia:
`;
```

### Pattern 3: Decision Accumulation (Never-Lose Strategy)
**What:** At every compression level, collect all decisions from child summaries BEFORE calling the LLM, then merge the LLM's extracted decisions with the accumulated set.
**When to use:** Weekly and monthly compression.
**Example:**
```typescript
static accumulateDecisions(childSummaries: SummaryRow[]): string[] {
  const allDecisions = new Set<string>();
  for (const s of childSummaries) {
    const decisions = JSON.parse(s.decisions) as string[];
    decisions.forEach(d => allDecisions.add(d));
  }
  return Array.from(allDecisions);
}

// In compressWeekly:
const dailySummaries = getSummaries(userId, 'daily')
  .filter(s => inDateRange(s, weekStart, weekEnd));
const accumulatedDecisions = this.accumulateDecisions(dailySummaries);
const llmResult = await callLLM(weeklyPrompt, dailySummaries);
// Merge: LLM may find new decisions + keep all accumulated
const finalDecisions = [...new Set([...accumulatedDecisions, ...llmResult.decisions])];
```

### Pattern 4: LiteLLM Call from Background Service
**What:** Direct HTTP call to LiteLLM proxy using fetch, same pattern as route.ts.
**When to use:** Any server-side LLM call outside the chat endpoint.
**Example:**
```typescript
async function callSummaryLLM(prompt: string, content: string): Promise<SummaryExtraction> {
  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const litellmKey = process['env']['LITELLM_API_KEY'] || 'sk-antigravity-gateway';
  // Use a Libre tier model -- zero cost (Ollama local)
  const model = 'ollama/gemma3:12b';

  const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content },
      ],
      temperature: 0.3, // Low temperature for factual extraction
      response_format: { type: 'json_object' },
    }),
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}
```

### Anti-Patterns to Avoid
- **Running compression on every tick:** Check if summary already exists for the period before compressing. Idempotent -- never create duplicate summaries.
- **Losing decisions during weekly/monthly compression:** ALWAYS accumulate decisions from child summaries before LLM call, then merge. The LLM might miss some; the accumulation ensures none are lost.
- **Blocking the event loop with sync DB reads on large conversation sets:** Use pagination when reading conversations for compression (LIMIT/OFFSET).
- **Hardcoding model name:** Use a configurable model, defaulting to a Libre tier model. The resolveAlias system could be used but adds async complexity for a background job -- simpler to use a direct model key.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scheduling | Custom cron parser | setInterval + date checks | Project pattern, simple, no deps |
| LLM calls | Custom HTTP client | fetch to LiteLLM proxy | Already proven in route.ts |
| JSON parsing from LLM | Regex extraction | `response_format: { type: 'json_object' }` | LiteLLM supports JSON mode for Ollama models |
| Date range queries | Manual date string comparison | SQLite datetime functions | `started_at >= ? AND started_at < ?` with ISO strings works perfectly in SQLite |
| Summary deduplication | Complex overlap detection | Simple period_start + period_type unique check | One summary per period per user, check before creating |

## Common Pitfalls

### Pitfall 1: Summary Compression Losing Critical Decisions
**What goes wrong:** Generic "summarize this" prompts produce vague summaries. Specific decisions disappear.
**Why it happens:** LLM treats all conversation content equally, compressing specifics into generalities.
**How to avoid:** (1) Use structured extraction prompt forcing JSON with explicit `decisions` field. (2) At weekly/monthly level, collect all child decisions BEFORE compression and merge them with LLM output. (3) Never rely solely on LLM to preserve decisions from previous levels.
**Warning signs:** Summaries saying "discussed configuration" instead of "configured catbot model to gemma3:12b".

### Pitfall 2: Duplicate Summaries from Repeated Scheduler Runs
**What goes wrong:** Scheduler runs hourly, creates a daily summary at 2am, then creates another at 3am.
**Why it happens:** No idempotency check.
**How to avoid:** Before creating any summary, check: `SELECT id FROM summaries WHERE user_id = ? AND period_type = ? AND period_start = ?`. If exists, skip.
**Warning signs:** Multiple daily summaries for the same date.

### Pitfall 3: Empty Summaries When No Conversations Exist
**What goes wrong:** Scheduler creates summaries with "No conversations" text for days with zero activity.
**Why it happens:** No early-exit check.
**How to avoid:** If getConversationsByDateRange returns 0 rows, skip summary creation entirely. No summary = no activity. Don't create empty entries.
**Warning signs:** Hundreds of "no activity" summaries in the DB.

### Pitfall 4: LLM Returns Invalid JSON
**What goes wrong:** Despite `response_format: { type: 'json_object' }`, smaller models sometimes return malformed JSON.
**Why it happens:** Libre tier models (gemma3:4b especially) struggle with strict JSON formatting.
**How to avoid:** (1) Use gemma3:12b or larger for summaries (better JSON compliance). (2) Wrap JSON.parse in try-catch with a retry (once). (3) If retry fails, create a minimal summary from conversation metadata (topics from tools_used, no LLM-generated text).
**Warning signs:** Error logs showing JSON parse failures in summary service.

### Pitfall 5: Token Overflow When Compressing Many Conversations
**What goes wrong:** A busy day has 50+ conversations. Concatenating all messages exceeds the Libre model's context window.
**Why it happens:** No content budget for the compression input.
**How to avoid:** (1) Don't send full message arrays -- extract only user messages and tool results. (2) Truncate each conversation to last N messages or first + last. (3) If total content exceeds ~6000 tokens (for 8K context gemma3), split into chunks, summarize each, then merge.
**Warning signs:** LLM returning truncated or incoherent summaries.

### Pitfall 6: Scheduler Interfering with App Boot
**What goes wrong:** SummaryService.start() triggers DB reads and LLM calls during Next.js boot, causing timeouts.
**Why it happens:** Immediate tick on start.
**How to avoid:** Delay the first tick by 2 minutes (setTimeout before first tick). Let the app fully boot, services connect, models load.
**Warning signs:** Build or startup failures with catbot.db or LiteLLM connection errors.

## Code Examples

### Date Range Query for catbot-db.ts (MUST ADD)
```typescript
// Source: catbot-db.ts pattern, new function needed
export function getConversationsByDateRange(
  startDate: string,
  endDate: string,
  userId?: string
): ConversationRow[] {
  if (userId) {
    return catbotDb.prepare(
      `SELECT * FROM conversation_log
       WHERE started_at >= ? AND started_at < ? AND user_id = ?
       ORDER BY started_at ASC`
    ).all(startDate, endDate, userId) as ConversationRow[];
  }
  return catbotDb.prepare(
    `SELECT * FROM conversation_log
     WHERE started_at >= ? AND started_at < ?
     ORDER BY started_at ASC`
  ).all(startDate, endDate) as ConversationRow[];
}
```

### Summary Existence Check (Idempotency)
```typescript
export function summaryExists(
  userId: string,
  periodType: string,
  periodStart: string
): boolean {
  const row = catbotDb.prepare(
    'SELECT id FROM summaries WHERE user_id = ? AND period_type = ? AND period_start = ?'
  ).get(userId, periodType, periodStart);
  return !!row;
}
```

### Getting Distinct User IDs from Conversations
```typescript
export function getActiveUserIds(startDate: string, endDate: string): string[] {
  const rows = catbotDb.prepare(
    `SELECT DISTINCT user_id FROM conversation_log
     WHERE started_at >= ? AND started_at < ?`
  ).all(startDate, endDate) as Array<{ user_id: string }>;
  return rows.map(r => r.user_id);
}
```

### Instrumentation Registration
```typescript
// In instrumentation.ts register()
if (process['env']['NODE_ENV'] !== 'test') {
  try {
    const { SummaryService } = await import('@/lib/services/catbot-summary');
    SummaryService.start();
  } catch (err) {
    console.error('[instrumentation] Failed to start SummaryService:', err);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store all messages forever | Hierarchical compression (day/week/month) | 2025 (Mem0 pattern) | 90%+ token reduction while preserving key facts |
| Free-form summarization | Structured extraction (JSON fields) | 2025 | Decisions, topics, pending preserved as data, not prose |
| Single summary level | Multi-tier with decision accumulation | 2025 | Critical decisions survive any compression level |
| Manual conversation review | Automatic background compression | Standard | Zero user effort, zero cost with Libre models |

## Open Questions

1. **Which Libre model for summaries?**
   - What we know: gemma3:4b, gemma3:12b, gemma3:27b are available as Libre tier in MID
   - What's unclear: Which balances JSON compliance vs speed vs context window
   - Recommendation: Use gemma3:12b -- 12B is large enough for reliable JSON extraction, small enough to run fast on Ollama. Fallback to metadata-only summary if JSON parse fails.

2. **Should summaries be per-user or global?**
   - What we know: summaries table has user_id column, conversation_log has user_id
   - What's unclear: Whether to create one combined summary or per-user summaries
   - Recommendation: Per-user summaries. Iterate over distinct user_ids in the date range. This respects data isolation (Pitfall 10 from PITFALLS.md) and prepares for multi-user Telegram.

3. **Conversation content format for LLM input**
   - What we know: messages column stores full JSON array of all messages (user + assistant + tool calls)
   - What's unclear: How much content to send to the Libre model given limited context windows
   - Recommendation: Extract only user messages and final assistant responses (skip intermediate tool call content). Cap at ~4000 tokens per conversation, truncating from the middle if needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUMMARY-01 | Daily summary scheduler generates summaries from yesterday's conversations | unit | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "compressDaily"` | Wave 0 |
| SUMMARY-02 | Daily summary includes structured fields (summary, topics, tools_used, decisions, pending) | unit | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "structured fields"` | Wave 0 |
| SUMMARY-03 | Weekly summaries compress daily summaries, monthly compress weekly | unit | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "compressWeekly"` | Wave 0 |
| SUMMARY-04 | Monthly summaries generated on day 1 | unit | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "compressMonthly"` | Wave 0 |
| SUMMARY-05 | Decisions accumulated across compression levels, never lost | unit | `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts -t "decisions accumulate"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run src/lib/__tests__/catbot-summary.test.ts`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/catbot-summary.test.ts` -- covers SUMMARY-01 through SUMMARY-05
- [ ] `app/src/lib/services/catbot-summary.ts` -- the service itself
- [ ] `getConversationsByDateRange` in catbot-db.ts -- date-range query needed
- [ ] `summaryExists` in catbot-db.ts -- idempotency check needed
- [ ] `getActiveUserIds` in catbot-db.ts -- multi-user support for scheduler

## Sources

### Primary (HIGH confidence)
- catbot-db.ts direct code analysis -- summaries table schema, CRUD functions, SummaryRow type
- instrumentation.ts direct code analysis -- service registration pattern
- task-scheduler.ts direct code analysis -- setInterval scheduling pattern
- route.ts direct code analysis -- LiteLLM call pattern (fetch to :4000)
- alias-routing.ts direct code analysis -- Libre tier model resolution

### Secondary (MEDIUM confidence)
- PITFALLS.md Pitfall 5 -- Summary compression losing decisions, prevention strategies
- ARCHITECTURE.md Summary Compression Flow -- architectural diagram and data flow
- FEATURES.md -- Hierarchical summarization as differentiator, Mem0 pattern reference

### Tertiary (LOW confidence)
- gemma3:12b JSON compliance -- assumption based on model size; needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in the project (catbot-db.ts, LiteLLM, instrumentation.ts)
- Architecture: HIGH -- clear pattern from existing services, well-defined DB schema
- Pitfalls: HIGH -- well-documented in PITFALLS.md + reinforced by code analysis
- LLM JSON output: MEDIUM -- response_format JSON mode support depends on Ollama/LiteLLM version

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable domain, existing infrastructure)
