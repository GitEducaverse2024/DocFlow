# Phase 128: Sistema de Alertas + Memoria de Conversacion CatBot - Research

**Researched:** 2026-04-09
**Domain:** Alert service (periodic health checks) + Conversation memory (windowed context management for LLM)
**Confidence:** HIGH

## Summary

Phase 128 has two distinct subsystems: (1) a periodic alert service that runs every 5 minutes, queries multiple tables across docflow.db and catbot.db for anomalous conditions, stores consolidated alerts, and presents them via an AlertDialog on dashboard load; and (2) a conversation memory system that windows CatBot's message context to 10 recent messages + up to 30 compacted older messages, shared between web and Telegram channels, with sudo not breaking the conversation thread.

Both subsystems build on well-established patterns in the codebase. The alert service follows the SummaryService pattern (singleton class in instrumentation.ts with setInterval). The conversation memory modifies route.ts message preparation and the Telegram bot's message forwarding, plus adds a compaction function that uses the same LLM compaction pattern from catbot-summary.ts.

**Primary recommendation:** Implement alerts as a standalone AlertService registered in instrumentation.ts (same pattern as SummaryService), store alerts in a new `system_alerts` table in docflow.db, and implement conversation memory as a `buildConversationWindow()` function in a new `catbot-conversation-memory.ts` service that both route.ts and telegram-bot.ts call before sending to the LLM.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ALERTS-01 | AlertDialog consolidado por categoria al cargar dashboard | AlertDialog component ya existe en shadcn/ui. Dashboard es app/page.tsx (client component). Nuevo API endpoint `/api/alerts` + frontend AlertDialog wrapper. |
| ALERTS-02 | Servicio de alertas cada 5min detectando 7 condiciones | AlertService singleton en instrumentation.ts, consulta docflow.db (tasks, canvas_runs, connectors, drive_sync_jobs, notifications) y catbot.db (knowledge_gaps, knowledge_learned). |
| CONVMEM-01 | Web mantiene 10 recientes + 30 compactados | Modificar route.ts linea 470 donde `apiMessages = newMessages.map(...)` envia TODO. Nuevo buildConversationWindow() que compacta. |
| CONVMEM-02 | Sudo no pierde contexto de conversacion | Actualmente catbot-panel.tsx preserva messages en state. El sudo flow no limpia mensajes. Solo hay que asegurar que buildConversationWindow() opera sobre el thread completo incluyendo pre-sudo messages. |
| CONVMEM-03 | Telegram mantiene contexto equivalente al web | telegram-bot.ts linea 505 envia `messages: [{ role: 'user', content: text }]` — solo 1 mensaje. Necesita acumular mensajes por chatId y aplicar mismo buildConversationWindow(). |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | existing | Alert storage in docflow.db | Ya usado en todo el proyecto |
| shadcn/ui AlertDialog | existing | Modal obligatorio de alertas | Ya existe en app/src/components/ui/alert-dialog.tsx |
| next-intl | existing | i18n para alertas y UI | Patron establecido |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | existing | Iconos por categoria de alerta | AlertTriangle, Brain, Zap, Plug, Bell |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLite table para alertas | In-memory Map | No persiste entre reinicios, pierde historial |
| LLM compaction | Simple truncation | Truncation pierde contexto critico, LLM preserva semantica |
| Per-request compaction | Pre-computed compaction cache | Pre-computed es mas complejo pero ahorra latencia; per-request es mas simple y suficiente dado que solo ocurre 1x por request |

## Architecture Patterns

### Recommended Project Structure
```
app/src/lib/services/
  alert-service.ts          # AlertService singleton (5min interval)
  catbot-conversation-memory.ts  # buildConversationWindow() + compactMessages()
app/src/app/api/alerts/
  route.ts                  # GET pending alerts, POST dismiss
app/src/components/system/
  alert-dialog-wrapper.tsx  # AlertDialog que aparece en dashboard
```

### Pattern 1: AlertService Singleton (same as SummaryService)
**What:** Class with static start/stop/tick methods, registered in instrumentation.ts
**When to use:** Periodic background checks
**Example:**
```typescript
// Source: catbot-summary.ts pattern
export class AlertService {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static INTERVAL = 5 * 60 * 1000; // 5 min

  static start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), this.INTERVAL);
    // First tick after 30s delay (avoid startup contention)
    setTimeout(() => this.tick(), 30_000);
  }

  static async tick(): Promise<void> {
    const alerts = [];
    // Check each condition against DB
    // Insert new alerts into system_alerts table
  }
}
```

### Pattern 2: Conversation Window Builder
**What:** Function that takes full message history and returns windowed messages for LLM
**When to use:** Before every LLM call in route.ts and telegram-bot.ts
**Example:**
```typescript
export function buildConversationWindow(
  messages: ChatMessage[],
  opts?: { recentCount?: number; compactCount?: number }
): ChatMessage[] {
  const recent = 10;
  const compactable = 30;

  if (messages.length <= recent) return messages;

  const recentMsgs = messages.slice(-recent);
  const olderMsgs = messages.slice(
    Math.max(0, messages.length - recent - compactable),
    messages.length - recent
  );

  if (olderMsgs.length === 0) return recentMsgs;

  const compacted = compactMessages(olderMsgs); // sync or cached
  return [
    { role: 'system', content: `[Contexto previo resumido]: ${compacted}` },
    ...recentMsgs,
  ];
}
```

### Pattern 3: Telegram Conversation Accumulation
**What:** In-memory Map<number, ChatMessage[]> in TelegramBotService to accumulate per-chat messages
**When to use:** handleCatBotMessage in telegram-bot.ts
**Example:**
```typescript
private chatHistories: Map<number, ChatMessage[]> = new Map();

private async handleCatBotMessage(chatId: number, text: string): Promise<void> {
  const history = this.chatHistories.get(chatId) || [];
  history.push({ role: 'user', content: text });

  // Apply same windowing as web
  const windowed = buildConversationWindow(history);

  const response = await fetch(baseUrl + '/api/catbot/chat', {
    body: JSON.stringify({
      messages: windowed,
      // ... existing params
    }),
  });

  // After response, append assistant reply
  const data = await response.json();
  if (data.reply) {
    history.push({ role: 'assistant', content: data.reply });
  }
  // Cap total stored to prevent memory leak
  this.chatHistories.set(chatId, history.slice(-100));
}
```

### Anti-Patterns to Avoid
- **LLM call per compaction request:** Compaction should be cached, not called on every message. Use a simple hash or message count threshold to decide when to re-compact.
- **Blocking dashboard load on alert check:** Alert data should be fetched client-side after render, not blocking SSR.
- **Storing compacted summaries in DB per message:** Overkill. In-memory compaction cache keyed by last-message-id is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal dialog | Custom overlay | shadcn AlertDialog | Already in project, handles accessibility, focus trap |
| Scheduled checks | Custom cron | instrumentation.ts setInterval pattern | Established pattern with SummaryService, TaskScheduler |
| Message truncation | Char-count slice | LLM-based compaction via ollama/gemma3:12b | Preserves semantic meaning; SummaryService proves this pattern works |

## Common Pitfalls

### Pitfall 1: Dual-DB Queries in Alert Service
**What goes wrong:** AlertService queries both docflow.db (tasks, canvas_runs, connectors, drive_sync_jobs, notifications) and catbot.db (knowledge_gaps, knowledge_learned). Importing both can cause SQLITE_BUSY.
**Why it happens:** Two separate SQLite DBs with WAL mode; concurrent reads can contend.
**How to avoid:** Both DBs already have `busy_timeout = 5000`. Use synchronous queries (better-sqlite3 is sync by nature). Wrap tick() in try-catch per condition so one failing check doesn't block others.
**Warning signs:** SQLITE_BUSY errors in logs during alert tick.

### Pitfall 2: Compaction Latency on First Message After Many
**What goes wrong:** If user has 40 messages and sends message 41, compaction of 30 messages via LLM takes 5-10 seconds, blocking the response.
**Why it happens:** Compaction calls ollama/gemma3:12b synchronously before sending to main LLM.
**How to avoid:** Cache compacted result. Re-compact only when older messages actually change (hash check). For first compaction, accept the latency but parallelize: start compaction while assembling prompt.
**Warning signs:** First message in a long conversation takes noticeably longer.

### Pitfall 3: Telegram Memory Leak
**What goes wrong:** chatHistories Map grows unbounded if many Telegram users interact.
**Why it happens:** Messages accumulate per chat_id with no eviction.
**How to avoid:** Cap per-chat history at 100 messages. Add TTL eviction (clear chats inactive > 24h). Current Telegram bot is single-admin so practical risk is low.
**Warning signs:** Node.js heap growing over time in production.

### Pitfall 4: Sudo Breaks Conversation Thread
**What goes wrong:** When sudo is entered in web chat, the frontend might clear messages or the backend might lose context.
**Why it happens:** sudoPromptVisible state might interfere with message flow.
**How to avoid:** Currently in catbot-panel.tsx, sudo is handled as a password input that sets sudoToken — it does NOT clear messages. The fix is primarily ensuring buildConversationWindow() is called AFTER sudo validation and includes all pre-sudo messages. No frontend changes needed for CONVMEM-02 specifically.
**Warning signs:** User says "sudo" and CatBot forgets what they were talking about.

### Pitfall 5: Alert Spam
**What goes wrong:** Same alert fires every 5 minutes indefinitely.
**Why it happens:** No dedup or acknowledge tracking.
**How to avoid:** Alert table should have `acknowledged` flag + `acknowledged_at`. Service only inserts new alert if no unacknowledged alert exists for same category+key. "Entendido" click marks all current alerts as acknowledged.
**Warning signs:** Dashboard shows hundreds of duplicate alerts.

### Pitfall 6: Compacted Context Format Confuses LLM
**What goes wrong:** LLM doesn't understand the compacted summary and ignores it or gets confused.
**Why it happens:** Compacted text injected without clear framing.
**How to avoid:** Use explicit framing: `[Resumen de conversacion previa (mensajes 1-30)]: {compacted}`. Mark as system message. Keep format consistent with SummaryService output format.

## Code Examples

### Alert Conditions SQL Queries
```typescript
// Source: Direct from codebase DB schema analysis

// knowledge_gaps > 20 (catbot.db)
const gapsCount = catbotDb.prepare(
  "SELECT COUNT(*) as cnt FROM knowledge_gaps WHERE resolved = 0"
).get() as { cnt: number };

// staging entries > 30 (catbot.db)
const stagingCount = catbotDb.prepare(
  "SELECT COUNT(*) as cnt FROM knowledge_learned WHERE validated = 0"
).get() as { cnt: number };

// tasks stuck > 1h (docflow.db)
const stuckTasks = db.prepare(`
  SELECT COUNT(*) as cnt FROM tasks
  WHERE status = 'running'
  AND updated_at < datetime('now', '-1 hour')
`).get() as { cnt: number };

// canvas_runs orphaned > 2h (docflow.db)
const orphanedRuns = db.prepare(`
  SELECT COUNT(*) as cnt FROM canvas_runs
  WHERE status IN ('running', 'pending')
  AND started_at < datetime('now', '-2 hours')
`).get() as { cnt: number };

// connector failing > 3x/hour (docflow.db - connector_logs)
const failingConnectors = db.prepare(`
  SELECT connector_id, COUNT(*) as fail_count
  FROM connector_logs
  WHERE status = 'error'
  AND created_at > datetime('now', '-1 hour')
  GROUP BY connector_id
  HAVING fail_count >= 3
`).all() as Array<{ connector_id: string; fail_count: number }>;

// drive sync out of date > 2x interval (docflow.db)
const staleSyncs = db.prepare(`
  SELECT id, folder_name, sync_interval_minutes, last_synced_at
  FROM drive_sync_jobs
  WHERE is_active = 1
  AND last_synced_at < datetime('now', '-' || (sync_interval_minutes * 2) || ' minutes')
`).all();

// notifications unread > 50 (docflow.db)
const unreadCount = db.prepare(
  "SELECT COUNT(*) as cnt FROM notifications WHERE read = 0"
).get() as { cnt: number };
```

### System Alerts Table Schema
```sql
-- In docflow.db (alerts are system-wide, not CatBot-specific)
CREATE TABLE IF NOT EXISTS system_alerts (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'knowledge', 'execution', 'integration', 'notification'
  alert_key TEXT NOT NULL, -- e.g. 'knowledge_gaps_high', 'task_stuck'
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'warning',
  details TEXT, -- JSON with specifics
  acknowledged INTEGER DEFAULT 0,
  acknowledged_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### AlertDialog Frontend Pattern
```tsx
// Source: shadcn/ui AlertDialog already in project
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function AlertDialogWrapper() {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/alerts?pending=true')
      .then(r => r.json())
      .then(data => {
        if (data.alerts?.length > 0) {
          setAlerts(data.alerts);
          setOpen(true);
        }
      });
  }, []);

  const handleAcknowledge = async () => {
    await fetch('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ action: 'acknowledge_all' }),
    });
    setOpen(false);
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Alertas del Sistema</AlertDialogTitle>
          <AlertDialogDescription>
            {/* Group by category and render */}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleAcknowledge}>
            Entendido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

### Conversation Compaction via LLM
```typescript
// Source: Pattern from catbot-summary.ts
const COMPACTION_PROMPT = `Eres un asistente que resume conversaciones previas.
Resume los siguientes mensajes en un parrafo conciso, preservando:
- Temas discutidos
- Decisiones tomadas
- Acciones ejecutadas (tools)
- Contexto relevante para continuar la conversacion
Maximo 300 palabras. Solo texto, sin formato JSON.`;

async function compactMessages(messages: ChatMessage[]): Promise<string> {
  const content = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')
    .slice(0, 4000); // Cap input

  const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
  const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer sk-antigravity-gateway' },
    body: JSON.stringify({
      model: 'ollama/gemma3:12b',
      messages: [
        { role: 'system', content: COMPACTION_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '[No se pudo resumir la conversacion previa]';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Send all messages to LLM | Window 10 recent + compact 30 older | Phase 128 | Reduces token usage, enables longer conversations |
| No system health alerts | Periodic 5min checks with consolidated UI | Phase 128 | Admin visibility into system health |
| Telegram sends 1 message only | Telegram accumulates per-chat history | Phase 128 | Telegram CatBot has conversation context |

## Open Questions

1. **Compaction caching strategy**
   - What we know: LLM compaction is expensive (2-5s). Cannot block every message.
   - What's unclear: Best cache invalidation — by message count? By hash?
   - Recommendation: Cache by conversation-id + message-count-of-compacted-range. Re-compact only when new messages enter the compactable window.

2. **Alert retention period**
   - What we know: Alerts accumulate in system_alerts table.
   - What's unclear: How long to keep acknowledged alerts.
   - Recommendation: Keep 30 days, auto-cleanup in AlertService tick.

3. **connector_logs table existence**
   - What we know: connectors table exists. Need to verify connector_logs schema.
   - What's unclear: Exact column names for error tracking.
   - Recommendation: Verify connector_logs schema during planning. If no logs table, use `test_status = 'failed'` + `last_tested` as proxy.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | app/vitest.config.ts |
| Quick run command | `cd app && npx vitest run --reporter=verbose` |
| Full suite command | `cd app && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALERTS-01 | AlertDialog renders with grouped alerts | unit | `cd app && npx vitest run src/lib/__tests__/alert-service.test.ts -x` | No - Wave 0 |
| ALERTS-02 | AlertService detects 7 conditions | unit | `cd app && npx vitest run src/lib/__tests__/alert-service.test.ts -x` | No - Wave 0 |
| CONVMEM-01 | buildConversationWindow returns 10+compact | unit | `cd app && npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts -x` | No - Wave 0 |
| CONVMEM-02 | Sudo preserves conversation context | unit | `cd app && npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts -x` | No - Wave 0 |
| CONVMEM-03 | Telegram chat history accumulation | unit | `cd app && npx vitest run src/lib/__tests__/catbot-conversation-memory.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd app && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd app && npx vitest run`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `app/src/lib/__tests__/alert-service.test.ts` -- covers ALERTS-01, ALERTS-02
- [ ] `app/src/lib/__tests__/catbot-conversation-memory.test.ts` -- covers CONVMEM-01, CONVMEM-02, CONVMEM-03

## Sources

### Primary (HIGH confidence)
- Codebase analysis: catbot-db.ts (conversation_log, knowledge_gaps, knowledge_learned schemas)
- Codebase analysis: db.ts (tasks, canvas_runs, connectors, drive_sync_jobs, notifications schemas)
- Codebase analysis: catbot-summary.ts (SummaryService singleton + LLM compaction pattern)
- Codebase analysis: telegram-bot.ts (handleCatBotMessage sends single message, no history)
- Codebase analysis: catbot-panel.tsx (sendMessage sends all messages, no windowing)
- Codebase analysis: route.ts (llmMessages built from all userMessages)
- Codebase analysis: alert-dialog.tsx (shadcn AlertDialog component exists)
- Codebase analysis: instrumentation.ts (service registration pattern)

### Secondary (MEDIUM confidence)
- None needed -- all implementation patterns are directly observable in existing codebase

### Tertiary (LOW confidence)
- Compaction latency estimate (2-5s for ollama/gemma3:12b) -- based on SummaryService observed patterns, not measured specifically for short compaction

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project
- Architecture: HIGH - directly follows SummaryService, TaskScheduler, and route.ts patterns
- Pitfalls: HIGH - identified from code analysis of existing dual-DB, Telegram, and message flow patterns

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable patterns, no external dependencies)
