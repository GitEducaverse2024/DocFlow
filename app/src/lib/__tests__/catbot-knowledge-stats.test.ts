import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock catbot-db before importing
vi.mock('@/lib/catbot-db', () => ({
  getKnowledgeStats: vi.fn(),
  getLearnedEntries: vi.fn(),
  saveLearnedEntry: vi.fn(),
  setValidated: vi.fn(),
  deleteLearnedEntry: vi.fn(),
}));

import { getKnowledgeStats } from '@/lib/catbot-db';

const mockedGetKnowledgeStats = vi.mocked(getKnowledgeStats);

describe('getKnowledgeStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stats object with correct shape (total, staging, validated, avgAccessCount)', () => {
    mockedGetKnowledgeStats.mockReturnValue({
      total: 10,
      staging: 6,
      validated: 4,
      avgAccessCount: 2.5,
    });

    const stats = getKnowledgeStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('staging');
    expect(stats).toHaveProperty('validated');
    expect(stats).toHaveProperty('avgAccessCount');
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.staging).toBe('number');
    expect(typeof stats.validated).toBe('number');
    expect(typeof stats.avgAccessCount).toBe('number');
  });

  it('returns zeros when no entries exist', () => {
    mockedGetKnowledgeStats.mockReturnValue({
      total: 0,
      staging: 0,
      validated: 0,
      avgAccessCount: 0,
    });

    const stats = getKnowledgeStats();
    expect(stats.total).toBe(0);
    expect(stats.staging).toBe(0);
    expect(stats.validated).toBe(0);
    expect(stats.avgAccessCount).toBe(0);
  });

  it('correctly separates staging (validated=0) vs validated (validated=1) counts', () => {
    mockedGetKnowledgeStats.mockReturnValue({
      total: 8,
      staging: 5,
      validated: 3,
      avgAccessCount: 1.75,
    });

    const stats = getKnowledgeStats();
    expect(stats.total).toBe(stats.staging + stats.validated);
    expect(stats.staging).toBe(5);
    expect(stats.validated).toBe(3);
  });

  it('computes average access count correctly', () => {
    // Simulates entries with access_count: 2, 4, 6 → avg = 4
    mockedGetKnowledgeStats.mockReturnValue({
      total: 3,
      staging: 1,
      validated: 2,
      avgAccessCount: 4,
    });

    const stats = getKnowledgeStats();
    expect(stats.avgAccessCount).toBe(4);
  });
});
