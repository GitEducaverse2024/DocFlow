import {
  getConversationsByDateRange,
  summaryExists,
  saveSummary,
  getSummaries,
  getActiveUserIds,
} from '@/lib/catbot-db';
import type { ConversationRow, SummaryRow } from '@/lib/catbot-db';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUMMARY_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const BOOT_DELAY = 120_000; // 2 min — avoid interfering with startup
const MODEL = 'ollama/gemma3:12b';
const TEMPERATURE = 0.3;
const MAX_CHARS_PER_CONVERSATION = 4000;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const DAILY_EXTRACTION_PROMPT = `Eres un asistente que resume conversaciones de un dia.
Extrae un resumen estructurado en JSON con estos campos exactos:
{
  "summary": "resumen conciso de las conversaciones del dia",
  "topics": ["tema1", "tema2"],
  "tools_used": ["tool1", "tool2"],
  "decisions": ["decision tomada 1", "decision tomada 2"],
  "pending": ["tarea pendiente 1"]
}
Solo devuelve JSON valido, sin texto adicional.`;

const WEEKLY_PROMPT = `Eres un asistente que comprime resumenes diarios en uno semanal.
Extrae un resumen estructurado en JSON con estos campos exactos:
{
  "summary": "resumen conciso de la semana",
  "topics": ["tema1", "tema2"],
  "tools_used": ["tool1", "tool2"],
  "decisions": ["decision nueva identificada"],
  "pending": ["tarea pendiente"]
}
Solo devuelve JSON valido, sin texto adicional.`;

const MONTHLY_PROMPT = `Eres un asistente que comprime resumenes semanales en uno mensual.
Extrae un resumen estructurado en JSON con estos campos exactos:
{
  "summary": "resumen conciso del mes",
  "topics": ["tema1", "tema2"],
  "tools_used": ["tool1", "tool2"],
  "decisions": ["decision nueva identificada"],
  "pending": ["tarea pendiente"]
}
Solo devuelve JSON valido, sin texto adicional.`;

// ---------------------------------------------------------------------------
// SummaryService
// ---------------------------------------------------------------------------

export class SummaryService {
  private static intervalId: ReturnType<typeof setInterval> | null = null;
  private static timeoutId: ReturnType<typeof setTimeout> | null = null;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  static start(): void {
    logger.info('SummaryService', 'Starting with boot delay', { delayMs: BOOT_DELAY });
    this.timeoutId = setTimeout(() => {
      this.tick().catch(err =>
        logger.error('SummaryService', 'Tick error', { error: String(err) })
      );
      this.intervalId = setInterval(() => {
        this.tick().catch(err =>
          logger.error('SummaryService', 'Tick error', { error: String(err) })
        );
      }, SUMMARY_CHECK_INTERVAL);
    }, BOOT_DELAY);
  }

  static stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.intervalId = null;
    this.timeoutId = null;
  }

  // -----------------------------------------------------------------------
  // Tick — main scheduling logic
  // -----------------------------------------------------------------------

  static async tick(): Promise<void> {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    const dayOfWeek = now.getDay(); // 0=Sunday, 1=Monday
    const dayOfMonth = now.getDate();

    // Get active users from yesterday
    const startOfDay = dateStr + 'T00:00:00';
    const endOfDay = dateStr + 'T23:59:59';
    const userIds = getActiveUserIds(startOfDay, endOfDay);

    logger.info('SummaryService', 'Tick', {
      date: dateStr,
      dayOfWeek,
      dayOfMonth,
      activeUsers: userIds.length,
    });

    // Daily — always
    for (const userId of userIds) {
      await this.compressDaily(dateStr, userId);
    }

    // Weekly — only on Mondays
    if (dayOfWeek === 1) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStartStr = weekStart.toISOString().slice(0, 10);
      for (const userId of userIds) {
        await this.compressWeekly(weekStartStr, userId);
      }
    }

    // Monthly — only on 1st
    if (dayOfMonth === 1) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthStartStr = monthStart.toISOString().slice(0, 10);
      for (const userId of userIds) {
        await this.compressMonthly(monthStartStr, userId);
      }
    }
  }

  // -----------------------------------------------------------------------
  // compressDaily
  // -----------------------------------------------------------------------

  static async compressDaily(date: string, userId: string): Promise<string | null> {
    // Idempotency check
    if (summaryExists(userId, 'daily', date)) {
      logger.info('SummaryService', 'Daily summary already exists, skipping', { date, userId });
      return null;
    }

    const startOfDay = date + 'T00:00:00';
    const endOfDay = date + 'T23:59:59';
    const conversations = getConversationsByDateRange(startOfDay, endOfDay, userId);

    if (conversations.length === 0) {
      logger.info('SummaryService', 'No conversations for daily, skipping', { date, userId });
      return null;
    }

    const content = this.extractConversationContent(conversations);
    const allToolsUsed = this.collectToolsFromConversations(conversations);

    // Try LLM extraction
    let parsed = await this.callAndParseLLM(DAILY_EXTRACTION_PROMPT, content);

    // Fallback to metadata if LLM fails
    if (!parsed) {
      logger.warn('SummaryService', 'LLM failed, using metadata fallback', { date, userId });
      parsed = {
        summary: `Resumen automatico: ${conversations.length} conversacion(es) el ${date}`,
        topics: [],
        tools_used: allToolsUsed,
        decisions: [],
        pending: [],
      };
    }

    const nextDay = new Date(date + 'T00:00:00Z');
    nextDay.setDate(nextDay.getDate() + 1);
    const periodEnd = nextDay.toISOString().slice(0, 10);

    const id = saveSummary({
      userId,
      periodType: 'daily',
      periodStart: date,
      periodEnd,
      summary: parsed.summary,
      topics: parsed.topics,
      toolsUsed: parsed.tools_used,
      decisions: parsed.decisions,
      pending: parsed.pending,
      conversationCount: conversations.length,
    });

    logger.info('SummaryService', 'Daily summary created', { id, date, userId, conversations: conversations.length });
    return id;
  }

  // -----------------------------------------------------------------------
  // compressWeekly
  // -----------------------------------------------------------------------

  static async compressWeekly(weekStart: string, userId: string): Promise<string | null> {
    if (summaryExists(userId, 'weekly', weekStart)) {
      return null;
    }

    const weekEnd = new Date(weekStart + 'T00:00:00Z');
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // Get daily summaries for this week range
    const allDailies = getSummaries(userId, 'daily');
    const dailiesInRange = allDailies.filter(
      s => s.period_start >= weekStart && s.period_start < weekEndStr
    );

    if (dailiesInRange.length === 0) {
      return null;
    }

    // Accumulate decisions from all dailies (Set union)
    const accumulatedDecisions = this.accumulateDecisions(dailiesInRange);

    const content = dailiesInRange.map(s => s.summary).join('\n\n---\n\n');

    let parsed = await this.callAndParseLLM(WEEKLY_PROMPT, content);

    if (!parsed) {
      parsed = {
        summary: `Resumen semanal automatico: ${dailiesInRange.length} dia(s) desde ${weekStart}`,
        topics: [],
        tools_used: [],
        decisions: [],
        pending: [],
      };
    }

    // Merge: accumulated from dailies + new from LLM (Set union, no dupes)
    const mergedDecisions = [...new Set([...accumulatedDecisions, ...parsed.decisions])];

    const id = saveSummary({
      userId,
      periodType: 'weekly',
      periodStart: weekStart,
      periodEnd: weekEndStr,
      summary: parsed.summary,
      topics: parsed.topics,
      toolsUsed: parsed.tools_used,
      decisions: mergedDecisions,
      pending: parsed.pending,
      conversationCount: dailiesInRange.reduce((acc, s) => acc + s.conversation_count, 0),
    });

    logger.info('SummaryService', 'Weekly summary created', { id, weekStart, userId });
    return id;
  }

  // -----------------------------------------------------------------------
  // compressMonthly
  // -----------------------------------------------------------------------

  static async compressMonthly(monthStart: string, userId: string): Promise<string | null> {
    if (summaryExists(userId, 'monthly', monthStart)) {
      return null;
    }

    const monthDate = new Date(monthStart + 'T00:00:00Z');
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);

    // Get weekly summaries for this month range
    const allWeeklies = getSummaries(userId, 'weekly');
    const weekliesInRange = allWeeklies.filter(
      s => s.period_start >= monthStart && s.period_start < monthEndStr
    );

    if (weekliesInRange.length === 0) {
      return null;
    }

    // Accumulate decisions from all weeklies
    const accumulatedDecisions = this.accumulateDecisions(weekliesInRange);

    const content = weekliesInRange.map(s => s.summary).join('\n\n---\n\n');

    let parsed = await this.callAndParseLLM(MONTHLY_PROMPT, content);

    if (!parsed) {
      parsed = {
        summary: `Resumen mensual automatico desde ${monthStart}`,
        topics: [],
        tools_used: [],
        decisions: [],
        pending: [],
      };
    }

    const mergedDecisions = [...new Set([...accumulatedDecisions, ...parsed.decisions])];

    const id = saveSummary({
      userId,
      periodType: 'monthly',
      periodStart: monthStart,
      periodEnd: monthEndStr,
      summary: parsed.summary,
      topics: parsed.topics,
      toolsUsed: parsed.tools_used,
      decisions: mergedDecisions,
      pending: parsed.pending,
      conversationCount: weekliesInRange.reduce((acc, s) => acc + s.conversation_count, 0),
    });

    logger.info('SummaryService', 'Monthly summary created', { id, monthStart, userId });
    return id;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  static accumulateDecisions(summaries: SummaryRow[]): string[] {
    const allDecisions = new Set<string>();
    for (const s of summaries) {
      try {
        const decisions = JSON.parse(s.decisions) as string[];
        for (const d of decisions) {
          allDecisions.add(d);
        }
      } catch {
        // Skip invalid JSON
      }
    }
    return [...allDecisions];
  }

  static extractConversationContent(conversations: ConversationRow[]): string {
    const parts: string[] = [];
    for (const conv of conversations) {
      try {
        const messages = JSON.parse(conv.messages) as Array<{ role: string; content: string }>;
        const userMsgs = messages.filter(m => m.role === 'user');
        const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');

        let text = userMsgs.map(m => `Usuario: ${m.content}`).join('\n');
        if (lastAssistant) {
          text += `\nAsistente: ${lastAssistant.content}`;
        }

        // Truncate per conversation
        if (text.length > MAX_CHARS_PER_CONVERSATION) {
          text = text.slice(0, MAX_CHARS_PER_CONVERSATION) + '...';
        }
        parts.push(text);
      } catch {
        // Skip conversations with invalid messages JSON
      }
    }
    return parts.join('\n\n---\n\n');
  }

  private static collectToolsFromConversations(conversations: ConversationRow[]): string[] {
    const tools = new Set<string>();
    for (const conv of conversations) {
      try {
        const parsed = JSON.parse(conv.tools_used) as string[];
        for (const t of parsed) tools.add(t);
      } catch {
        // Skip invalid JSON
      }
    }
    return [...tools];
  }

  private static async callAndParseLLM(
    systemPrompt: string,
    content: string,
  ): Promise<SummaryLLMResult | null> {
    const litellmUrl = process['env']['LITELLM_URL'];
    const litellmKey = process['env']['LITELLM_API_KEY'];

    if (!litellmUrl) {
      logger.warn('SummaryService', 'LITELLM_URL not set, cannot call LLM');
      return null;
    }

    // Try up to 2 times (original + 1 retry)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${litellmUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(litellmKey ? { Authorization: `Bearer ${litellmKey}` } : {}),
          },
          body: JSON.stringify({
            model: MODEL,
            temperature: TEMPERATURE,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content },
            ],
          }),
        });

        if (!response.ok) {
          logger.warn('SummaryService', 'LLM response not ok', {
            status: response.status,
            attempt,
          });
          continue;
        }

        const json = await response.json();
        const rawContent = json?.choices?.[0]?.message?.content;
        if (!rawContent) continue;

        const parsed = JSON.parse(rawContent) as SummaryLLMResult;

        // Validate required fields
        if (typeof parsed.summary === 'string') {
          return {
            summary: parsed.summary,
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
            tools_used: Array.isArray(parsed.tools_used) ? parsed.tools_used : [],
            decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
            pending: Array.isArray(parsed.pending) ? parsed.pending : [],
          };
        }
      } catch (err) {
        logger.warn('SummaryService', 'LLM parse attempt failed', {
          attempt,
          error: String(err),
        });
      }
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SummaryLLMResult {
  summary: string;
  topics: string[];
  tools_used: string[];
  decisions: string[];
  pending: string[];
}
