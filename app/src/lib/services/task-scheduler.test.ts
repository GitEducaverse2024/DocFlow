import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock db before importing scheduler
vi.mock('@/lib/db', () => ({
  default: { prepare: vi.fn() },
}));

// Mock executeTaskWithCycles
vi.mock('./task-executor', () => ({
  executeTaskWithCycles: vi.fn(),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock schedule-utils
vi.mock('@/lib/schedule-utils', () => ({
  calculateNextExecutionFromDate: vi.fn(),
}));

import { TaskScheduler } from './task-scheduler';
import db from '@/lib/db';
import { executeTaskWithCycles } from './task-executor';
import { calculateNextExecutionFromDate } from '@/lib/schedule-utils';

const mockPrepare = db.prepare as ReturnType<typeof vi.fn>;
const mockExecute = executeTaskWithCycles as ReturnType<typeof vi.fn>;
const mockCalcNext = calculateNextExecutionFromDate as ReturnType<typeof vi.fn>;

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    scheduler = new TaskScheduler();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('start/stop', () => {
    it('start() is idempotent — calling twice does not create double intervals', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      mockPrepare.mockReturnValue({ all: () => [] });

      scheduler.start();
      scheduler.start();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it('stop() clears the interval', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      mockPrepare.mockReturnValue({ all: () => [] });

      scheduler.start();
      scheduler.stop();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it('stop() is safe to call when not started', () => {
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe('tick()', () => {
    it('finds due schedules and triggers execution', async () => {
      const dueSchedule = {
        schedule_id: 'sched-1',
        task_id: 'task-1',
        next_run_at: '2026-03-01T09:00:00Z',
        task_status: 'completed',
        schedule_config: '{"time":"09:00","days":"always","is_active":true}',
      };

      const mockRunReset = vi.fn();
      const mockRunReady = vi.fn();

      mockPrepare
        .mockReturnValueOnce({ all: () => [dueSchedule] })  // SELECT due
        .mockReturnValueOnce({ run: mockRunReset })          // UPDATE task_steps
        .mockReturnValueOnce({ run: mockRunReady });         // UPDATE tasks status

      mockExecute.mockResolvedValue(undefined);
      mockCalcNext.mockReturnValue(new Date('2026-03-02T09:00:00Z'));

      // Mock for updateNextRun (called after executeTaskWithCycles resolves)
      mockPrepare
        .mockReturnValueOnce({ get: () => ({ schedule_config: dueSchedule.schedule_config }) })
        .mockReturnValueOnce({ run: vi.fn() })   // UPDATE task_schedules
        .mockReturnValueOnce({ run: vi.fn() });  // UPDATE tasks next_run_at

      await scheduler.tick();

      expect(mockRunReset).toHaveBeenCalledWith('task-1');
      expect(mockExecute).toHaveBeenCalledWith('task-1');

      // Wait for the fire-and-forget promise
      await vi.waitFor(() => {
        expect(mockCalcNext).toHaveBeenCalled();
      });
    });

    it('is a no-op when no active schedules exist', async () => {
      mockPrepare.mockReturnValueOnce({ all: () => [] });

      await scheduler.tick();

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('skips tasks in running status via SQL WHERE clause', async () => {
      // The SQL WHERE filters out running tasks, so db returns empty
      mockPrepare.mockReturnValueOnce({ all: () => [] });

      await scheduler.tick();

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('skips schedules with future next_run_at via SQL WHERE clause', async () => {
      // The SQL WHERE filters next_run_at <= now, so future schedules are excluded
      mockPrepare.mockReturnValueOnce({ all: () => [] });

      await scheduler.tick();

      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('handles execution errors gracefully and still updates next_run', async () => {
      const dueSchedule = {
        schedule_id: 'sched-1',
        task_id: 'task-1',
        next_run_at: '2026-03-01T09:00:00Z',
        task_status: 'completed',
        schedule_config: '{"time":"09:00","days":"always","is_active":true}',
      };

      mockPrepare
        .mockReturnValueOnce({ all: () => [dueSchedule] })
        .mockReturnValueOnce({ run: vi.fn() })   // reset steps
        .mockReturnValueOnce({ run: vi.fn() });  // set ready

      mockExecute.mockRejectedValue(new Error('execution failed'));
      mockCalcNext.mockReturnValue(new Date('2026-03-02T09:00:00Z'));

      // Mock for updateNextRun after error
      mockPrepare
        .mockReturnValueOnce({ get: () => ({ schedule_config: dueSchedule.schedule_config }) })
        .mockReturnValueOnce({ run: vi.fn() })
        .mockReturnValueOnce({ run: vi.fn() });

      await scheduler.tick();

      // Wait for the catch handler to run
      await vi.waitFor(() => {
        expect(mockCalcNext).toHaveBeenCalled();
      });
    });
  });

  describe('updateNextRun()', () => {
    it('calculates and stores next valid run', () => {
      const nextDate = new Date('2026-03-02T09:00:00Z');
      mockCalcNext.mockReturnValue(nextDate);

      const mockRunSchedules = vi.fn();
      const mockRunTasks = vi.fn();

      mockPrepare
        .mockReturnValueOnce({ get: () => ({ schedule_config: '{"time":"09:00","days":"always","is_active":true}' }) })
        .mockReturnValueOnce({ run: mockRunSchedules })
        .mockReturnValueOnce({ run: mockRunTasks });

      scheduler.updateNextRun('task-1', 'sched-1');

      expect(mockRunSchedules).toHaveBeenCalledWith(
        nextDate.toISOString(),
        expect.any(String),
        expect.any(String),
        'sched-1'
      );
      expect(mockRunTasks).toHaveBeenCalledWith(
        nextDate.toISOString(),
        expect.any(String),
        'task-1'
      );
    });

    it('deactivates schedule when no more valid runs exist', () => {
      mockCalcNext.mockReturnValue(null);

      const mockRunDeactivate = vi.fn();
      const mockRunTaskNull = vi.fn();

      mockPrepare
        .mockReturnValueOnce({ get: () => ({ schedule_config: '{"time":"09:00","days":"always","end_date":"2026-01-01","is_active":true}' }) })
        .mockReturnValueOnce({ run: mockRunDeactivate })
        .mockReturnValueOnce({ run: mockRunTaskNull });

      scheduler.updateNextRun('task-1', 'sched-1');

      expect(mockRunDeactivate).toHaveBeenCalledWith(
        expect.any(String),
        'sched-1'
      );
      expect(mockRunTaskNull).toHaveBeenCalledWith(
        expect.any(String),
        'task-1'
      );
    });

    it('does nothing when task has no schedule_config', () => {
      mockPrepare.mockReturnValueOnce({ get: () => ({ schedule_config: null }) });

      scheduler.updateNextRun('task-1', 'sched-1');

      expect(mockCalcNext).not.toHaveBeenCalled();
    });

    it('does nothing when task is not found', () => {
      mockPrepare.mockReturnValueOnce({ get: () => undefined });

      scheduler.updateNextRun('task-1', 'sched-1');

      expect(mockCalcNext).not.toHaveBeenCalled();
    });
  });
});
