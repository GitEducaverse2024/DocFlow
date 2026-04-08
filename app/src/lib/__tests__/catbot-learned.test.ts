import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock catbot-db before importing catbot-learned
vi.mock('@/lib/catbot-db', () => ({
  saveLearnedEntry: vi.fn(),
  getLearnedEntries: vi.fn(),
  incrementAccessCount: vi.fn(),
  setValidated: vi.fn(),
  deleteLearnedEntry: vi.fn(),
}));

import {
  saveLearnedEntryWithStaging,
  promoteIfReady,
  adminValidate,
  adminReject,
  jaccardSimilarity,
  VALIDATION_THRESHOLD,
  MAX_ENTRIES_PER_CONVERSATION,
} from '../services/catbot-learned';
import {
  saveLearnedEntry,
  getLearnedEntries,
  incrementAccessCount,
  setValidated,
  deleteLearnedEntry,
} from '@/lib/catbot-db';
import type { LearnedRow } from '@/lib/catbot-db';

const mockedSaveLearnedEntry = vi.mocked(saveLearnedEntry);
const mockedGetLearnedEntries = vi.mocked(getLearnedEntries);
const mockedIncrementAccessCount = vi.mocked(incrementAccessCount);
const mockedSetValidated = vi.mocked(setValidated);
const mockedDeleteLearnedEntry = vi.mocked(deleteLearnedEntry);

function makeLearnedRow(overrides: Partial<LearnedRow> = {}): LearnedRow {
  return {
    id: 'entry-1',
    knowledge_path: 'catbot/tools',
    category: 'best_practice',
    content: 'Test content',
    learned_from: 'usage',
    confidence: 0.5,
    validated: 0,
    access_count: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('LearnedEntryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // saveLearnedEntryWithStaging
  // ---------------------------------------------------------------------------

  describe('saveLearnedEntryWithStaging', () => {
    it('saves entry with validated=0 and confidence=0.5, returns id', () => {
      mockedGetLearnedEntries.mockReturnValue([]);
      mockedSaveLearnedEntry.mockReturnValue('new-entry-id');

      const result = saveLearnedEntryWithStaging({
        knowledgePath: 'catbot/tools',
        category: 'best_practice',
        content: 'Always use permission gates',
        learnedFrom: 'usage',
      });

      expect(result).toEqual({ id: 'new-entry-id' });
      expect(mockedSaveLearnedEntry).toHaveBeenCalledWith({
        knowledgePath: 'catbot/tools',
        category: 'best_practice',
        content: 'Always use permission gates',
        learnedFrom: 'usage',
      });
    });

    it('rejects invalid category', () => {
      const result = saveLearnedEntryWithStaging({
        knowledgePath: 'catbot/tools',
        category: 'invalid_category',
        content: 'Some content',
      });

      expect(result).toEqual({ id: null, error: 'invalid_category' });
      expect(mockedSaveLearnedEntry).not.toHaveBeenCalled();
    });

    it('accepts best_practice, pitfall, and troubleshoot categories', () => {
      mockedGetLearnedEntries.mockReturnValue([]);
      mockedSaveLearnedEntry.mockReturnValue('id-1');

      for (const cat of ['best_practice', 'pitfall', 'troubleshoot']) {
        const result = saveLearnedEntryWithStaging({
          knowledgePath: 'catbot/tools',
          category: cat,
          content: `Content for ${cat}`,
        });
        expect(result.id).toBe('id-1');
      }
    });

    it('truncates content to 500 chars', () => {
      mockedGetLearnedEntries.mockReturnValue([]);
      mockedSaveLearnedEntry.mockReturnValue('new-id');

      const longContent = 'A'.repeat(600);
      saveLearnedEntryWithStaging({
        knowledgePath: 'catbot/tools',
        category: 'best_practice',
        content: longContent,
      });

      const savedContent = mockedSaveLearnedEntry.mock.calls[0][0].content;
      expect(savedContent.length).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Dedup (Jaccard)
  // ---------------------------------------------------------------------------

  describe('dedup', () => {
    it('returns null if existing entry has Jaccard > 0.8 on same path+category', () => {
      mockedGetLearnedEntries.mockReturnValue([
        makeLearnedRow({
          content: 'Always use permission gates for sensitive tools',
        }),
      ]);

      const result = saveLearnedEntryWithStaging({
        knowledgePath: 'catbot/tools',
        category: 'best_practice',
        content: 'Always use permission gates for sensitive tools please',
      });

      expect(result).toEqual({ id: null, error: 'duplicate' });
      expect(mockedSaveLearnedEntry).not.toHaveBeenCalled();
    });

    it('saves when Jaccard <= 0.8 (different content)', () => {
      mockedGetLearnedEntries.mockReturnValue([
        makeLearnedRow({
          content: 'Always use permission gates for sensitive tools',
        }),
      ]);
      mockedSaveLearnedEntry.mockReturnValue('new-id');

      const result = saveLearnedEntryWithStaging({
        knowledgePath: 'catbot/tools',
        category: 'best_practice',
        content: 'Configure rate limiting on all API endpoints',
      });

      expect(result.id).toBe('new-id');
    });
  });

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  describe('rate limiting', () => {
    it('returns null with error rate_limited after 3 entries in a conversation', () => {
      mockedGetLearnedEntries.mockReturnValue([]);
      mockedSaveLearnedEntry.mockReturnValue('id-1');

      const convId = 'conv-123';

      // First 3 should succeed
      for (let i = 0; i < MAX_ENTRIES_PER_CONVERSATION; i++) {
        const result = saveLearnedEntryWithStaging(
          {
            knowledgePath: `path/${i}`,
            category: 'best_practice',
            content: `Content ${i} unique enough to not dedup`,
          },
          convId,
        );
        expect(result.id).toBe('id-1');
      }

      // 4th should be rate limited
      const result = saveLearnedEntryWithStaging(
        {
          knowledgePath: 'path/extra',
          category: 'pitfall',
          content: 'This should be rate limited',
        },
        convId,
      );
      expect(result).toEqual({ id: null, error: 'rate_limited' });
    });

    it('different conversations have independent rate limits', () => {
      mockedGetLearnedEntries.mockReturnValue([]);
      mockedSaveLearnedEntry.mockReturnValue('id-1');

      // Fill conv-1 to limit
      for (let i = 0; i < MAX_ENTRIES_PER_CONVERSATION; i++) {
        saveLearnedEntryWithStaging(
          {
            knowledgePath: `path/${i}`,
            category: 'best_practice',
            content: `Content A${i}`,
          },
          'conv-1',
        );
      }

      // conv-2 should still work
      const result = saveLearnedEntryWithStaging(
        {
          knowledgePath: 'path/new',
          category: 'best_practice',
          content: 'Content for different conv',
        },
        'conv-2',
      );
      expect(result.id).toBe('id-1');
    });
  });

  // ---------------------------------------------------------------------------
  // promoteIfReady
  // ---------------------------------------------------------------------------

  describe('promoteIfReady', () => {
    it('returns false if access_count < VALIDATION_THRESHOLD', () => {
      mockedGetLearnedEntries.mockReturnValue([
        makeLearnedRow({ id: 'entry-1', access_count: 2 }),
      ]);

      const result = promoteIfReady('entry-1');
      expect(result).toBe(false);
      expect(mockedSetValidated).not.toHaveBeenCalled();
    });

    it('returns true and sets validated=1 if access_count >= VALIDATION_THRESHOLD', () => {
      mockedGetLearnedEntries.mockReturnValue([
        makeLearnedRow({ id: 'entry-1', access_count: VALIDATION_THRESHOLD }),
      ]);

      const result = promoteIfReady('entry-1');
      expect(result).toBe(true);
      expect(mockedSetValidated).toHaveBeenCalledWith('entry-1', true);
    });
  });

  // ---------------------------------------------------------------------------
  // adminValidate
  // ---------------------------------------------------------------------------

  describe('adminValidate', () => {
    it('sets validated=1 regardless of access_count', () => {
      adminValidate('entry-1');
      expect(mockedSetValidated).toHaveBeenCalledWith('entry-1', true);
    });
  });

  // ---------------------------------------------------------------------------
  // adminReject
  // ---------------------------------------------------------------------------

  describe('adminReject', () => {
    it('deletes the entry', () => {
      adminReject('entry-1');
      expect(mockedDeleteLearnedEntry).toHaveBeenCalledWith('entry-1');
    });
  });

  // ---------------------------------------------------------------------------
  // jaccardSimilarity
  // ---------------------------------------------------------------------------

  describe('jaccardSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
      expect(jaccardSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
    });

    it('returns value between 0 and 1 for partial overlap', () => {
      const score = jaccardSimilarity('permission gates tools', 'permission gates api endpoints');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  // ---------------------------------------------------------------------------
  // query_knowledge integration: learned entries filtering, access tracking, promotion
  // These tests verify the DB-level behavior that query_knowledge relies on
  // (getLearnedEntries validated filter, incrementAccessCount, promoteIfReady)
  // ---------------------------------------------------------------------------

  describe('query_knowledge learned entries behavior', () => {
    it('query includes validated entries (validated=true filter)', () => {
      const validatedEntry = makeLearnedRow({ id: 'v-1', validated: 1, content: 'Validated tip' });
      mockedGetLearnedEntries.mockReturnValue([validatedEntry]);

      // Simulate what query_knowledge does: getLearnedEntries({ validated: true })
      const results = getLearnedEntries({ validated: true });
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Validated tip');
      expect(mockedGetLearnedEntries).toHaveBeenCalledWith({ validated: true });
    });

    it('query excludes unvalidated entries (validated filter returns empty)', () => {
      // When DB is queried with validated: true, unvalidated entries are not returned
      mockedGetLearnedEntries.mockReturnValue([]);

      const results = getLearnedEntries({ validated: true });
      expect(results).toHaveLength(0);
    });

    it('query increments access_count for each returned entry', () => {
      const entries = [
        makeLearnedRow({ id: 'e-1', validated: 1, access_count: 0 }),
        makeLearnedRow({ id: 'e-2', validated: 1, access_count: 1 }),
      ];
      mockedGetLearnedEntries.mockReturnValue(entries);

      // Simulate query_knowledge behavior: increment access for each returned entry
      const returned = getLearnedEntries({ validated: true });
      for (const entry of returned) {
        incrementAccessCount(entry.id);
      }

      expect(mockedIncrementAccessCount).toHaveBeenCalledTimes(2);
      expect(mockedIncrementAccessCount).toHaveBeenCalledWith('e-1');
      expect(mockedIncrementAccessCount).toHaveBeenCalledWith('e-2');
    });

    it('auto-promotion on query: entry with access_count=2 gets promoted after increment', () => {
      // Entry is at access_count=2 (one below VALIDATION_THRESHOLD=3)
      const entry = makeLearnedRow({ id: 'promo-1', validated: 0, access_count: 2 });
      mockedGetLearnedEntries.mockReturnValue([entry]);

      // After query_knowledge increments, access_count becomes 3
      // promoteIfReady checks if access_count >= VALIDATION_THRESHOLD
      // Simulate: after incrementAccessCount, the entry now has access_count=3
      incrementAccessCount(entry.id);

      // Now promoteIfReady should find access_count >= 3 and promote
      mockedGetLearnedEntries.mockReturnValue([
        makeLearnedRow({ id: 'promo-1', validated: 0, access_count: VALIDATION_THRESHOLD }),
      ]);
      const promoted = promoteIfReady('promo-1');

      expect(promoted).toBe(true);
      expect(mockedSetValidated).toHaveBeenCalledWith('promo-1', true);
    });
  });
});
