/**
 * Integration tests for /api/intent-jobs/[id]/approve, /reject, /approve-catpaws
 * Phase 130 Plan 04 Tasks 3-4.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockGetIntentJob = vi.fn();
const mockUpdateIntentJob = vi.fn();
const mockRun = vi.fn();
const mockPrepare = vi.fn((sql: string) => {
  void sql;
  return { run: mockRun, get: vi.fn(), all: vi.fn(() => []) };
});

vi.mock('@/lib/catbot-db', () => ({
  getIntentJob: mockGetIntentJob,
  updateIntentJob: mockUpdateIntentJob,
}));
vi.mock('@/lib/db', () => ({ default: { prepare: mockPrepare } }));
vi.mock('@/lib/utils', () => ({ generateId: vi.fn(() => 'id-fixed-123') }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { POST as approvePOST } from '@/app/api/intent-jobs/[id]/approve/route';
import { POST as rejectPOST } from '@/app/api/intent-jobs/[id]/reject/route';
import { POST as approveCatpawsPOST } from '@/app/api/intent-jobs/[id]/approve-catpaws/route';

describe('POST /api/intent-jobs/[id]/approve', () => {
  beforeEach(() => {
    mockGetIntentJob.mockReset();
    mockUpdateIntentJob.mockReset();
    mockRun.mockReset();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('200 when job in awaiting_approval with canvas_id; kicks canvas execute', async () => {
    mockGetIntentJob.mockReturnValue({
      id: 'job-123',
      pipeline_phase: 'awaiting_approval',
      canvas_id: 'canvas-xyz',
      progress_message: '{}',
      user_id: 'u1',
    });
    const req = new Request('http://localhost/api/intent-jobs/job-123/approve', { method: 'POST' });
    const res = await approvePOST(req, { params: { id: 'job-123' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockUpdateIntentJob).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({ pipeline_phase: 'running', status: 'running' }),
    );
    // fire-and-forget fetch to canvas execute
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchCalls = (global.fetch as any).mock.calls;
    expect(fetchCalls.some((c: unknown[]) => String(c[0]).includes('/api/canvas/canvas-xyz/execute'))).toBe(true);
  });

  it('400 when job is in wrong phase', async () => {
    mockGetIntentJob.mockReturnValue({
      id: 'job-123',
      pipeline_phase: 'running',
      canvas_id: 'canvas-xyz',
      progress_message: '{}',
      user_id: 'u1',
    });
    const res = await approvePOST(
      new Request('http://localhost/api/intent-jobs/job-123/approve', { method: 'POST' }),
      { params: { id: 'job-123' } },
    );
    expect(res.status).toBe(400);
  });

  it('404 when job not found', async () => {
    mockGetIntentJob.mockReturnValue(undefined);
    const res = await approvePOST(
      new Request('http://localhost/api/intent-jobs/nope/approve', { method: 'POST' }),
      { params: { id: 'nope' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/intent-jobs/[id]/reject', () => {
  beforeEach(() => {
    mockGetIntentJob.mockReset();
    mockUpdateIntentJob.mockReset();
  });

  it('200 and transitions to cancelled', async () => {
    mockGetIntentJob.mockReturnValue({
      id: 'job-abc',
      pipeline_phase: 'awaiting_approval',
      progress_message: '{}',
      user_id: 'u1',
    });
    const res = await rejectPOST(
      new Request('http://localhost/api/intent-jobs/job-abc/reject', { method: 'POST' }),
      { params: { id: 'job-abc' } },
    );
    expect(res.status).toBe(200);
    expect(mockUpdateIntentJob).toHaveBeenCalledWith(
      'job-abc',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('404 when job not found', async () => {
    mockGetIntentJob.mockReturnValue(undefined);
    const res = await rejectPOST(
      new Request('http://localhost/api/intent-jobs/nope/reject', { method: 'POST' }),
      { params: { id: 'nope' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/intent-jobs/[id]/approve-catpaws', () => {
  beforeEach(() => {
    mockGetIntentJob.mockReset();
    mockUpdateIntentJob.mockReset();
    mockRun.mockReset();
    mockPrepare.mockClear();
  });

  it('200 when job in awaiting_user; inserts CatPaws and flips to architect_retry', async () => {
    mockGetIntentJob.mockReturnValue({
      id: 'job-456',
      pipeline_phase: 'awaiting_user',
      progress_message: JSON.stringify({
        goal: 'g',
        tasks: [],
        cat_paws_needed: [{ name: 'Foo', system_prompt: 'do foo' }],
      }),
      user_id: 'u1',
    });

    const req = new Request('http://localhost/api/intent-jobs/job-456/approve-catpaws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catpaws: [{ name: 'Bar', system_prompt: 'do bar' }] }),
    });
    const res = await approveCatpawsPOST(req, { params: { id: 'job-456' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created.length).toBe(1);

    // INSERT INTO cat_paws was prepared
    const prepareSqls = mockPrepare.mock.calls.map(c => String(c[0]));
    expect(prepareSqls.some(s => /INSERT INTO cat_paws/i.test(s))).toBe(true);

    // updateIntentJob flipped phase
    expect(mockUpdateIntentJob).toHaveBeenCalledWith(
      'job-456',
      expect.objectContaining({ pipeline_phase: 'architect_retry' }),
    );
  });

  it('400 when job is not in awaiting_user phase', async () => {
    mockGetIntentJob.mockReturnValue({
      id: 'job-456',
      pipeline_phase: 'awaiting_approval',
      progress_message: '{}',
      user_id: 'u1',
    });
    const req = new Request('http://localhost/api/intent-jobs/job-456/approve-catpaws', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catpaws: [{ name: 'X', system_prompt: 'y' }] }),
    });
    const res = await approveCatpawsPOST(req, { params: { id: 'job-456' } });
    expect(res.status).toBe(400);
  });
});
