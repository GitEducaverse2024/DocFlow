/**
 * Integration tests for GET /api/intent-jobs (list user's pipeline jobs).
 * Phase 130 Plan 05 Task 2.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockListJobsByUser = vi.fn();
  return { mockListJobsByUser };
});
const { mockListJobsByUser } = mocks;

vi.mock('@/lib/catbot-db', () => ({
  listJobsByUser: mocks.mockListJobsByUser,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from '@/app/api/intent-jobs/route';

describe('GET /api/intent-jobs', () => {
  beforeEach(() => {
    mockListJobsByUser.mockReset();
  });

  it('returns 401 when neither session nor user_id query param is provided', async () => {
    const req = new Request('http://localhost/api/intent-jobs');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(mockListJobsByUser).not.toHaveBeenCalled();
  });

  it('returns jobs for the user identified by ?user_id= query param', async () => {
    mockListJobsByUser.mockReturnValue([
      {
        id: 'job-1',
        intent_id: null,
        user_id: 'web:u1',
        channel: 'web',
        channel_ref: null,
        pipeline_phase: 'awaiting_approval',
        tool_name: 'execute_catflow',
        tool_args: '{}',
        canvas_id: 'canvas-xyz',
        status: 'pending',
        progress_message: JSON.stringify({ message: 'Listo para aprobar', goal: 'Build a pipeline' }),
        result: null,
        error: null,
        created_at: '2026-04-10T10:00:00',
        updated_at: '2026-04-10T10:05:00',
        completed_at: null,
      },
      {
        id: 'job-2',
        intent_id: null,
        user_id: 'web:u1',
        channel: 'telegram',
        channel_ref: null,
        pipeline_phase: 'running',
        tool_name: 'execute_catflow',
        tool_args: '{}',
        canvas_id: 'canvas-abc',
        status: 'running',
        progress_message: JSON.stringify({ message: 'Ejecutando...' }),
        result: null,
        error: null,
        created_at: '2026-04-10T11:00:00',
        updated_at: '2026-04-10T11:10:00',
        completed_at: null,
      },
    ]);

    const req = new Request('http://localhost/api/intent-jobs?user_id=web:u1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(2);

    // listJobsByUser called with the correct user id
    expect(mockListJobsByUser).toHaveBeenCalledWith('web:u1', expect.objectContaining({ limit: 50 }));
  });

  it('parses progress_message as a structured object, not a JSON string', async () => {
    mockListJobsByUser.mockReturnValue([
      {
        id: 'job-1',
        intent_id: null,
        user_id: 'web:u1',
        channel: 'web',
        channel_ref: null,
        pipeline_phase: 'awaiting_approval',
        tool_name: 'execute_catflow',
        tool_args: '{}',
        canvas_id: 'canvas-xyz',
        status: 'pending',
        progress_message: JSON.stringify({ message: 'Listo', goal: 'Goal A' }),
        result: null,
        error: null,
        created_at: '2026-04-10T10:00:00',
        updated_at: '2026-04-10T10:05:00',
        completed_at: null,
      },
    ]);

    const req = new Request('http://localhost/api/intent-jobs?user_id=web:u1');
    const res = await GET(req);
    const body = await res.json();
    expect(body.jobs[0].progress_message).toEqual({ message: 'Listo', goal: 'Goal A' });
    expect(body.jobs[0].pipeline_phase).toBe('awaiting_approval');
    expect(body.jobs[0].canvas_id).toBe('canvas-xyz');
  });

  it('scopes the query strictly to the provided user_id', async () => {
    mockListJobsByUser.mockReturnValue([]);
    const req = new Request('http://localhost/api/intent-jobs?user_id=web:other');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(0);
    // Only the requested user_id was ever passed to the repository
    expect(mockListJobsByUser).toHaveBeenCalledTimes(1);
    expect(mockListJobsByUser).toHaveBeenCalledWith('web:other', expect.anything());
  });

  it('handles invalid progress_message JSON gracefully (returns empty object)', async () => {
    mockListJobsByUser.mockReturnValue([
      {
        id: 'job-1',
        intent_id: null,
        user_id: 'web:u1',
        channel: 'web',
        channel_ref: null,
        pipeline_phase: 'running',
        tool_name: null,
        tool_args: null,
        canvas_id: null,
        status: 'running',
        progress_message: 'not-json-at-all',
        result: null,
        error: null,
        created_at: '2026-04-10T10:00:00',
        updated_at: '2026-04-10T10:05:00',
        completed_at: null,
      },
    ]);
    const req = new Request('http://localhost/api/intent-jobs?user_id=web:u1');
    const res = await GET(req);
    const body = await res.json();
    expect(body.jobs[0].progress_message).toEqual({});
  });
});
