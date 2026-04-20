import { describe, it, expect } from 'vitest';
import type { KbIndexEntry } from '@/lib/services/kb-index-cache';
import {
  applyKbFilters,
  collectDistinctTypes,
  collectDistinctSubtypes,
  collectDistinctTags,
} from './kb-filters';

function makeEntry(overrides: Partial<KbIndexEntry> = {}): KbIndexEntry {
  return {
    id: 'e1',
    path: 'resources/catpaws/e1.md',
    type: 'resource',
    subtype: 'catpaw',
    title: 'Operador Holded',
    summary: 'CatPaw generalista Holded MCP',
    tags: ['crm', 'holded'],
    audience: ['catbot'],
    status: 'active',
    updated: '2026-04-20T10:00:00Z',
    search_hints: null,
    ...overrides,
  };
}

describe('applyKbFilters', () => {
  const base = [
    makeEntry({ id: 'a', type: 'resource', subtype: 'catpaw', title: 'Alpha Holded', summary: 'CatPaw generalista Holded MCP', tags: ['crm', 'holded'] }),
    makeEntry({ id: 'b', type: 'resource', subtype: 'catbrain', title: 'Beta', summary: 'RAG Beta', tags: ['rag'] }),
    makeEntry({ id: 'c', type: 'rule', subtype: null, title: 'Regla', summary: 'Safety review rule', tags: ['safety', 'review'] }),
    makeEntry({ id: 'd', type: 'rule', subtype: null, title: 'Review only', summary: 'Review wording', tags: ['review'] }),
    makeEntry({ id: 'e', type: 'incident', subtype: null, status: 'deprecated', title: 'Viejo', summary: 'Legacy incident', tags: [] }),
  ];

  it('filters by type', () => {
    const out = applyKbFilters(base, { type: 'rule', tags: [], search: '' });
    expect(out.map((e) => e.id).sort()).toEqual(['c', 'd']);
  });

  it('filters by subtype (dependent on type)', () => {
    const out = applyKbFilters(base, { type: 'resource', subtype: 'catpaw', tags: [], search: '' });
    expect(out.map((e) => e.id)).toEqual(['a']);
  });

  it('filters by tags AND-match', () => {
    const out = applyKbFilters(base, { tags: ['safety', 'review'], search: '' });
    expect(out.map((e) => e.id)).toEqual(['c']);
  });

  it('filters by search case-insensitive across title + summary', () => {
    const out = applyKbFilters(base, { search: 'HOLDED', tags: [] });
    expect(out.map((e) => e.id).sort()).toEqual(['a']);
  });

  it('status filter excludes non-matching when passed, includes all when omitted', () => {
    const activeOnly = applyKbFilters(base, { status: 'active', tags: [], search: '' });
    expect(activeOnly.some((e) => e.id === 'e')).toBe(false);
    const allStatuses = applyKbFilters(base, { tags: [], search: '' });
    expect(allStatuses.some((e) => e.id === 'e')).toBe(true);
  });

  it('reset (empty filters) returns the full array unchanged', () => {
    const out = applyKbFilters(base, { tags: [], search: '' });
    expect(out).toHaveLength(base.length);
  });

  it('audience filter matches when audience is present in entry.audience[]', () => {
    const sample = [
      makeEntry({ id: 'a', audience: ['catbot'] }),
      makeEntry({ id: 'b', audience: ['architect', 'developer'] }),
      makeEntry({ id: 'c', audience: ['developer'] }),
    ];
    const out = applyKbFilters(sample, { audience: 'developer', tags: [], search: '' });
    expect(out.map((e) => e.id).sort()).toEqual(['b', 'c']);
  });
});

describe('collectDistinct helpers', () => {
  const sample = [
    makeEntry({ id: 'a', type: 'resource', subtype: 'catpaw', tags: ['x'] }),
    makeEntry({ id: 'b', type: 'rule', subtype: null, tags: ['y', 'x'] }),
    makeEntry({ id: 'c', type: 'resource', subtype: 'catbrain', tags: ['z', 'x'] }),
  ];

  it('collectDistinctTypes returns sorted unique types', () => {
    expect(collectDistinctTypes(sample)).toEqual(['resource', 'rule']);
  });

  it('collectDistinctSubtypes filters by type when provided', () => {
    expect(collectDistinctSubtypes(sample, 'resource')).toEqual(['catbrain', 'catpaw']);
  });

  it('collectDistinctSubtypes returns all distinct subtypes when no type given', () => {
    expect(collectDistinctSubtypes(sample)).toEqual(['catbrain', 'catpaw']);
  });

  it('collectDistinctTags returns tags sorted by frequency (most common first)', () => {
    const tags = collectDistinctTags(sample);
    expect(tags[0]).toBe('x'); // appears in 3 entries
    expect(tags).toContain('y');
    expect(tags).toContain('z');
  });

  it('collectDistinctTags respects max truncation', () => {
    const tags = collectDistinctTags(sample, 1);
    expect(tags).toEqual(['x']);
  });
});
