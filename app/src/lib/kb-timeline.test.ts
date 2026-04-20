import { describe, it, expect } from 'vitest';
import { aggregateChangesByDay } from './kb-timeline';

describe('aggregateChangesByDay', () => {
  it('aggregates changes per day sorted ascending', () => {
    const changes = [
      { id: 'a', updated: '2026-04-20T10:00:00Z' },
      { id: 'b', updated: '2026-04-20T11:00:00Z' },
      { id: 'c', updated: '2026-04-19T08:00:00Z' },
    ];
    expect(aggregateChangesByDay(changes)).toEqual([
      { day: '2026-04-19', count: 1 },
      { day: '2026-04-20', count: 2 },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(aggregateChangesByDay([])).toEqual([]);
  });

  it('handles SQL format "YYYY-MM-DD HH:MM:SS" dates', () => {
    const changes = [{ id: 'a', updated: '2026-04-20 14:27:55' }];
    expect(aggregateChangesByDay(changes)).toEqual([{ day: '2026-04-20', count: 1 }]);
  });

  it('skips entries with malformed dates', () => {
    const changes = [
      { id: 'a', updated: '2026-04-20T10:00:00Z' },
      { id: 'b', updated: 'not-a-date' },
      { id: 'c', updated: '' },
    ];
    expect(aggregateChangesByDay(changes)).toEqual([{ day: '2026-04-20', count: 1 }]);
  });
});
