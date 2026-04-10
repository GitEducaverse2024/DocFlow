import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock databases — in-memory stubs
// ---------------------------------------------------------------------------

const mockDocflowAll = vi.fn();
const mockDocflowRun = vi.fn();
const mockDocflowGet = vi.fn();
const mockDocflowPrepare = vi.fn().mockReturnValue({
  all: mockDocflowAll,
  run: mockDocflowRun,
  get: mockDocflowGet,
});
const mockDocflowExec = vi.fn();

vi.mock('@/lib/db', () => ({
  default: {
    prepare: (...args: unknown[]) => mockDocflowPrepare(...args),
    exec: (...args: unknown[]) => mockDocflowExec(...args),
  },
}));

const mockCatbotAll = vi.fn();
const mockCatbotRun = vi.fn();
const mockCatbotGet = vi.fn();
const mockCatbotPrepare = vi.fn().mockReturnValue({
  all: mockCatbotAll,
  run: mockCatbotRun,
  get: mockCatbotGet,
});

vi.mock('@/lib/catbot-db', () => ({
  default: {
    prepare: (...args: unknown[]) => mockCatbotPrepare(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/utils', () => ({
  generateId: () => 'test-alert-id',
}));

// Import after mocks
import { AlertService } from '@/lib/services/alert-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  vi.clearAllMocks();
  // Default: no existing alert (dedup check returns undefined)
  mockDocflowGet.mockReturnValue(undefined);
  // Default: cleanup run returns nothing
  mockDocflowRun.mockReturnValue({ changes: 0 });
  mockDocflowAll.mockReturnValue([]);
  mockCatbotAll.mockReturnValue([]);
  mockCatbotGet.mockReturnValue({ cnt: 0 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AlertService', () => {
  beforeEach(() => {
    resetMocks();
  });

  describe('checkKnowledgeGaps', () => {
    it('returns alert when gaps > 20', async () => {
      mockCatbotGet.mockReturnValue({ cnt: 25 });

      await AlertService.checkKnowledgeGaps();

      // Should have called insertAlert (which calls prepare twice: check + insert)
      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });

    it('does not alert when gaps <= 20', async () => {
      mockCatbotGet.mockReturnValue({ cnt: 10 });

      await AlertService.checkKnowledgeGaps();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(false);
    });
  });

  describe('checkStagingEntries', () => {
    it('returns alert when staging > 30', async () => {
      mockCatbotGet.mockReturnValue({ cnt: 35 });

      await AlertService.checkStagingEntries();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });
  });

  describe('checkStuckTasks', () => {
    it('returns alert when tasks running > 1h', async () => {
      mockDocflowAll.mockReturnValue([
        { id: 'task-1', name: 'stuck task', updated_at: '2026-01-01T00:00:00' },
      ]);

      await AlertService.checkStuckTasks();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });
  });

  describe('checkOrphanedRuns', () => {
    it('returns alert when canvas_runs > 2h', async () => {
      mockDocflowAll.mockReturnValue([
        { id: 'run-1', canvas_id: 'c1', started_at: '2026-01-01T00:00:00' },
      ]);

      await AlertService.checkOrphanedRuns();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });
  });

  describe('checkFailingConnectors', () => {
    it('returns alert when connector fails >= 3x/hour', async () => {
      mockDocflowAll.mockReturnValue([
        { connector_id: 'conn-1', error_count: 5 },
      ]);

      await AlertService.checkFailingConnectors();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });
  });

  describe('checkStaleSyncs', () => {
    it('returns alert when drive sync desfasado > 2x interval', async () => {
      mockDocflowAll.mockReturnValue([
        { id: 'sync-1', catbrain_id: 'cb1', sync_interval_minutes: 30, last_synced_at: '2026-01-01T00:00:00' },
      ]);

      await AlertService.checkStaleSyncs();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });
  });

  describe('checkUnreadNotifications', () => {
    it('returns alert when unread > 50', async () => {
      // First call: count query returns 60, second call: dedup check returns undefined (no existing alert)
      mockDocflowGet.mockReturnValueOnce({ cnt: 60 }).mockReturnValueOnce(undefined);

      await AlertService.checkUnreadNotifications();

      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('does not insert duplicate alert when unacknowledged exists', async () => {
      // First call: count query returns 60 (above threshold), second call: dedup check finds existing alert
      mockDocflowGet
        .mockReturnValueOnce({ cnt: 60 })         // notifications count
        .mockReturnValueOnce({ id: 'existing-alert' }); // dedup check finds existing

      await AlertService.checkUnreadNotifications();

      // Should not have INSERT because dedup found existing
      // The get call happens for dedup check, but no insert should follow
      // Since mockDocflowGet returns existing alert, insertAlert skips INSERT
      const insertCalls = mockDocflowPrepare.mock.calls;
      const hasInsert = insertCalls.some((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('INSERT INTO system_alerts')
      );
      expect(hasInsert).toBe(false);
    });
  });

  describe('getAlerts', () => {
    it('returns only unacknowledged alerts when pendingOnly=true', () => {
      const mockAlerts = [
        { id: 'a1', category: 'knowledge', acknowledged: 0 },
      ];
      mockDocflowAll.mockReturnValue(mockAlerts);

      const result = AlertService.getAlerts(true);

      expect(result).toEqual(mockAlerts);
      const selectCall = mockDocflowPrepare.mock.calls.find((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('SELECT') && c[0].includes('system_alerts')
      );
      expect(selectCall).toBeTruthy();
    });

    it('returns all alerts when pendingOnly=false', () => {
      const mockAlerts = [
        { id: 'a1', category: 'knowledge', acknowledged: 0 },
        { id: 'a2', category: 'execution', acknowledged: 1 },
      ];
      mockDocflowAll.mockReturnValue(mockAlerts);

      const result = AlertService.getAlerts(false);

      expect(result).toEqual(mockAlerts);
    });
  });

  describe('acknowledgeAll', () => {
    it('marks all unacknowledged alerts as acknowledged', () => {
      mockDocflowRun.mockReturnValue({ changes: 3 });

      AlertService.acknowledgeAll();

      const updateCall = mockDocflowPrepare.mock.calls.find((c: unknown[]) =>
        typeof c[0] === 'string' && c[0].includes('UPDATE system_alerts') && c[0].includes('acknowledged')
      );
      expect(updateCall).toBeTruthy();
    });
  });
});
