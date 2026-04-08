import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

const mockGetConversationsByDateRange = vi.fn();
const mockSummaryExists = vi.fn();
const mockSaveSummary = vi.fn().mockReturnValue('sum-id-123');
const mockGetSummaries = vi.fn();
const mockGetActiveUserIds = vi.fn();

vi.mock('@/lib/catbot-db', () => ({
  getConversationsByDateRange: (...args: unknown[]) => mockGetConversationsByDateRange(...args),
  summaryExists: (...args: unknown[]) => mockSummaryExists(...args),
  saveSummary: (...args: unknown[]) => mockSaveSummary(...args),
  getSummaries: (...args: unknown[]) => mockGetSummaries(...args),
  getActiveUserIds: (...args: unknown[]) => mockGetActiveUserIds(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils', () => ({
  generateId: () => 'test-id-123',
}));

// Import after mocks
import { SummaryService } from '@/lib/services/catbot-summary';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(body: Record<string, unknown>, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function makeLLMResponse(content: Record<string, unknown>) {
  return makeFetchResponse({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

function makeConversation(id: string, messages: Record<string, unknown>[], toolsUsed: string[] = []) {
  return {
    id,
    user_id: 'user-1',
    channel: 'web',
    messages: JSON.stringify(messages),
    tools_used: JSON.stringify(toolsUsed),
    token_count: 100,
    model: 'ollama/gemma3:12b',
    page: null,
    started_at: '2026-04-07T10:00:00',
    ended_at: '2026-04-07T10:05:00',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SummaryService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSummaryExists.mockReturnValue(false);
    mockGetActiveUserIds.mockReturnValue(['user-1']);
    process['env']['LITELLM_URL'] = 'http://10.0.0.1:4000';
    process['env']['LITELLM_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // compressDaily
  // -------------------------------------------------------------------------

  describe('compressDaily', () => {
    it('genera resumen con campos estructurados a partir de conversaciones', async () => {
      const conversations = [
        makeConversation('c1', [
          { role: 'user', content: 'Necesito crear un agente' },
          { role: 'assistant', content: 'He creado el agente para ti' },
        ], ['create_agent']),
        makeConversation('c2', [
          { role: 'user', content: 'Muestra el canvas' },
          { role: 'assistant', content: 'Aqui esta el canvas' },
        ], ['get_canvas']),
      ];

      mockGetConversationsByDateRange.mockReturnValue(conversations);

      const llmResult = {
        summary: 'El usuario creo un agente y reviso el canvas',
        topics: ['agentes', 'canvas'],
        tools_used: ['create_agent', 'get_canvas'],
        decisions: ['Usar agente tipo conversacional'],
        pending: ['Configurar canvas con nodos'],
      };

      global.fetch = vi.fn().mockReturnValue(makeLLMResponse(llmResult));

      const result = await SummaryService.compressDaily('2026-04-07', 'user-1');

      expect(result).not.toBeNull();
      expect(mockSaveSummary).toHaveBeenCalledOnce();

      const saved = mockSaveSummary.mock.calls[0][0];
      expect(saved.userId).toBe('user-1');
      expect(saved.periodType).toBe('daily');
      expect(saved.periodStart).toBe('2026-04-07');
      expect(saved.summary).toBe('El usuario creo un agente y reviso el canvas');
      expect(saved.topics).toEqual(['agentes', 'canvas']);
      expect(saved.toolsUsed).toEqual(['create_agent', 'get_canvas']);
      expect(saved.decisions).toEqual(['Usar agente tipo conversacional']);
      expect(saved.pending).toEqual(['Configurar canvas con nodos']);
      expect(saved.conversationCount).toBe(2);
    });

    it('skip si no hay conversaciones — retorna null', async () => {
      mockGetConversationsByDateRange.mockReturnValue([]);

      const result = await SummaryService.compressDaily('2026-04-07', 'user-1');

      expect(result).toBeNull();
      expect(mockSaveSummary).not.toHaveBeenCalled();
    });

    it('skip si resumen ya existe — no llama LLM ni guarda', async () => {
      mockSummaryExists.mockReturnValue(true);
      global.fetch = vi.fn();

      const result = await SummaryService.compressDaily('2026-04-07', 'user-1');

      expect(result).toBeNull();
      expect(mockGetConversationsByDateRange).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockSaveSummary).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // compressWeekly — decision accumulation
  // -------------------------------------------------------------------------

  describe('compressWeekly', () => {
    it('acumula decisions de dailies (Set union)', async () => {
      const dailySummaries = [
        {
          id: 's1', user_id: 'user-1', period_type: 'daily',
          period_start: '2026-04-01', period_end: '2026-04-02',
          summary: 'Dia 1', topics: '[]', tools_used: '[]',
          decisions: '["Decision A","Decision B"]',
          pending: '[]', conversation_count: 2, created_at: '2026-04-02',
        },
        {
          id: 's2', user_id: 'user-1', period_type: 'daily',
          period_start: '2026-04-02', period_end: '2026-04-03',
          summary: 'Dia 2', topics: '[]', tools_used: '[]',
          decisions: '["Decision B","Decision C"]',
          pending: '[]', conversation_count: 3, created_at: '2026-04-03',
        },
        {
          id: 's3', user_id: 'user-1', period_type: 'daily',
          period_start: '2026-04-03', period_end: '2026-04-04',
          summary: 'Dia 3', topics: '[]', tools_used: '[]',
          decisions: '["Decision D"]',
          pending: '[]', conversation_count: 1, created_at: '2026-04-04',
        },
      ];

      mockGetSummaries.mockReturnValue(dailySummaries);

      const llmDecisions = ['Decision nueva LLM'];
      global.fetch = vi.fn().mockReturnValue(makeLLMResponse({
        summary: 'Resumen semanal',
        topics: ['general'],
        tools_used: [],
        decisions: llmDecisions,
        pending: [],
      }));

      const result = await SummaryService.compressWeekly('2026-03-30', 'user-1');

      expect(result).not.toBeNull();
      expect(mockSaveSummary).toHaveBeenCalledOnce();

      const saved = mockSaveSummary.mock.calls[0][0];
      // Must contain ALL decisions: dailies + LLM (union)
      const savedDecisions = saved.decisions as string[];
      expect(savedDecisions).toContain('Decision A');
      expect(savedDecisions).toContain('Decision B');
      expect(savedDecisions).toContain('Decision C');
      expect(savedDecisions).toContain('Decision D');
      expect(savedDecisions).toContain('Decision nueva LLM');
      // No duplicates
      const uniqueDecisions = [...new Set(savedDecisions)];
      expect(savedDecisions.length).toBe(uniqueDecisions.length);
    });
  });

  // -------------------------------------------------------------------------
  // compressMonthly — decision accumulation from weeklies
  // -------------------------------------------------------------------------

  describe('compressMonthly', () => {
    it('acumula decisions de weeklies (Set union)', async () => {
      const weeklySummaries = [
        {
          id: 'w1', user_id: 'user-1', period_type: 'weekly',
          period_start: '2026-03-02', period_end: '2026-03-09',
          summary: 'Semana 1', topics: '[]', tools_used: '[]',
          decisions: '["Dec W1-A","Dec W1-B"]',
          pending: '[]', conversation_count: 10, created_at: '2026-03-09',
        },
        {
          id: 'w2', user_id: 'user-1', period_type: 'weekly',
          period_start: '2026-03-09', period_end: '2026-03-16',
          summary: 'Semana 2', topics: '[]', tools_used: '[]',
          decisions: '["Dec W2-A"]',
          pending: '[]', conversation_count: 8, created_at: '2026-03-16',
        },
      ];

      mockGetSummaries.mockReturnValue(weeklySummaries);

      global.fetch = vi.fn().mockReturnValue(makeLLMResponse({
        summary: 'Resumen mensual',
        topics: ['global'],
        tools_used: [],
        decisions: ['Dec mensual nueva'],
        pending: [],
      }));

      const result = await SummaryService.compressMonthly('2026-03-01', 'user-1');

      expect(result).not.toBeNull();
      const saved = mockSaveSummary.mock.calls[0][0];
      const savedDecisions = saved.decisions as string[];
      expect(savedDecisions).toContain('Dec W1-A');
      expect(savedDecisions).toContain('Dec W1-B');
      expect(savedDecisions).toContain('Dec W2-A');
      expect(savedDecisions).toContain('Dec mensual nueva');
    });
  });

  // -------------------------------------------------------------------------
  // tick — scheduling logic
  // -------------------------------------------------------------------------

  describe('tick', () => {
    it('ejecuta daily siempre, weekly solo lunes, monthly solo dia 1', async () => {
      // Spy on the methods
      const spyDaily = vi.spyOn(SummaryService, 'compressDaily').mockResolvedValue('id-1');
      const spyWeekly = vi.spyOn(SummaryService, 'compressWeekly').mockResolvedValue('id-2');
      const spyMonthly = vi.spyOn(SummaryService, 'compressMonthly').mockResolvedValue('id-3');

      // Case 1: Wednesday (day=3) — only daily
      const wednesday = new Date('2026-04-08T02:00:00Z'); // Wednesday
      vi.setSystemTime(wednesday);
      await SummaryService.tick();
      expect(spyDaily).toHaveBeenCalled();
      expect(spyWeekly).not.toHaveBeenCalled();
      expect(spyMonthly).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Case 2: Monday (day=1) — daily + weekly
      const monday = new Date('2026-04-06T02:00:00Z'); // Monday
      vi.setSystemTime(monday);
      await SummaryService.tick();
      expect(spyDaily).toHaveBeenCalled();
      expect(spyWeekly).toHaveBeenCalled();
      expect(spyMonthly).not.toHaveBeenCalled();

      vi.clearAllMocks();

      // Case 3: 1st of month (Wednesday) — daily + monthly
      const firstOfMonth = new Date('2026-04-01T02:00:00Z'); // Wednesday, April 1
      vi.setSystemTime(firstOfMonth);
      await SummaryService.tick();
      expect(spyDaily).toHaveBeenCalled();
      expect(spyMonthly).toHaveBeenCalled();

      vi.clearAllMocks();

      // Case 4: 1st of month that is Monday — daily + weekly + monthly
      const firstMonday = new Date('2026-06-01T02:00:00Z'); // Monday, June 1
      vi.setSystemTime(firstMonday);
      await SummaryService.tick();
      expect(spyDaily).toHaveBeenCalled();
      expect(spyWeekly).toHaveBeenCalled();
      expect(spyMonthly).toHaveBeenCalled();

      spyDaily.mockRestore();
      spyWeekly.mockRestore();
      spyMonthly.mockRestore();
      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // JSON parse fallback
  // -------------------------------------------------------------------------

  describe('JSON parse fallback', () => {
    it('crea resumen minimo desde metadata si LLM devuelve JSON invalido', async () => {
      const conversations = [
        makeConversation('c1', [
          { role: 'user', content: 'Hola' },
          { role: 'assistant', content: 'Hola!' },
        ], ['search_docs', 'list_agents']),
      ];

      mockGetConversationsByDateRange.mockReturnValue(conversations);

      // LLM returns invalid JSON both times (original + retry)
      global.fetch = vi.fn()
        .mockReturnValueOnce(makeFetchResponse({
          choices: [{ message: { content: 'esto no es JSON valido {{{{' } }],
        }))
        .mockReturnValueOnce(makeFetchResponse({
          choices: [{ message: { content: 'tampoco es JSON :::' } }],
        }));

      const result = await SummaryService.compressDaily('2026-04-07', 'user-1');

      expect(result).not.toBeNull();
      expect(mockSaveSummary).toHaveBeenCalledOnce();

      const saved = mockSaveSummary.mock.calls[0][0];
      // Fallback should still populate from metadata
      expect(saved.toolsUsed).toEqual(['search_docs', 'list_agents']);
      expect(saved.conversationCount).toBe(1);
      expect(saved.summary).toBeTruthy(); // Some fallback summary text
    });
  });
});
