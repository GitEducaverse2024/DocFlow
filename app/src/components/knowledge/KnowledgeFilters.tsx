/**
 * KnowledgeFilters — Phase 154 Plan 02 client filter panel.
 *
 * Owns the UI for the filter state (type, subtype, status, audience,
 * tags, search, reset). `type` options are derived DYNAMICALLY from
 * `collectDistinctTypes(entries)` (Conflict 3 — runtime enum drift
 * absorbed automatically). Native `<select>` + `<input>` over Radix
 * Select to sidestep Pitfall 5 ("empty value" edge case).
 */
'use client';
import { useMemo } from 'react';
import type { KbIndexEntry } from '@/lib/services/kb-index-cache';
import {
  type KbFilterState,
  collectDistinctTypes,
  collectDistinctSubtypes,
  collectDistinctTags,
} from '@/lib/kb-filters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  entries: KbIndexEntry[];
  state: KbFilterState;
  onChange: (next: KbFilterState) => void;
}

const STATUSES = ['active', 'deprecated', 'draft', 'experimental'] as const;
const AUDIENCES = ['catbot', 'architect', 'developer', 'user', 'onboarding'] as const;

export function KnowledgeFilters({ entries, state, onChange }: Props) {
  const types = useMemo(() => collectDistinctTypes(entries), [entries]);
  const subtypes = useMemo(
    () => collectDistinctSubtypes(entries, state.type),
    [entries, state.type],
  );
  const topTags = useMemo(() => collectDistinctTags(entries, 25), [entries]);

  const setField = <K extends keyof KbFilterState>(key: K, value: KbFilterState[K]) => {
    onChange({ ...state, [key]: value });
  };

  const toggleTag = (tag: string) => {
    const has = state.tags.includes(tag);
    onChange({
      ...state,
      tags: has ? state.tags.filter((t) => t !== tag) : [...state.tags, tag],
    });
  };

  const reset = () => onChange({ tags: [], search: '' });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col text-xs text-zinc-400">
          Tipo
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-100 text-sm mt-1"
            value={state.type ?? ''}
            onChange={(e) => setField('type', e.target.value || undefined)}
          >
            <option value="">Todos</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-zinc-400">
          Subtipo
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-100 text-sm mt-1"
            value={state.subtype ?? ''}
            onChange={(e) => setField('subtype', e.target.value || undefined)}
            disabled={subtypes.length === 0}
          >
            <option value="">Todos</option>
            {subtypes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-zinc-400">
          Estado
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-100 text-sm mt-1"
            value={state.status ?? ''}
            onChange={(e) => setField('status', e.target.value || undefined)}
          >
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-zinc-400">
          Audiencia
          <select
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-100 text-sm mt-1"
            value={state.audience ?? ''}
            onChange={(e) => setField('audience', e.target.value || undefined)}
          >
            <option value="">Todas</option>
            {AUDIENCES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-zinc-400 flex-1 min-w-[200px]">
          Búsqueda
          <Input
            className="mt-1"
            placeholder="Buscar en título y resumen…"
            value={state.search}
            onChange={(e) => setField('search', e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <Button variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {topTags.map((tag) => {
          const active = state.tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                active
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
