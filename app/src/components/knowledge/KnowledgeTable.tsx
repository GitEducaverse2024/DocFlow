/**
 * KnowledgeTable — Phase 154 Plan 02 client-side filterable table.
 *
 * Owns the `KbFilterState` via `useState`, applies it through the pure
 * `applyKbFilters` helper from Plan 01, and renders a native `<table>`
 * (shadcn Table is not installed; 128 rows make virtualization
 * unnecessary). Default state is `status: 'active'` (CONTEXT D3).
 */
'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { KbIndexEntry } from '@/lib/services/kb-index-cache';
import { applyKbFilters, type KbFilterState } from '@/lib/kb-filters';
import { formatRelativeTime } from '@/lib/relative-time';
import { KnowledgeFilters } from './KnowledgeFilters';
import { Badge } from '@/components/ui/badge';

interface Props {
  entries: KbIndexEntry[];
}

const TYPE_COLORS: Record<string, string> = {
  resource: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  rule: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
  protocol: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  concept: 'bg-violet-500/20 text-violet-200 border-violet-500/40',
  guide: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  incident: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  runtime: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
  taxonomy: 'bg-teal-500/20 text-teal-200 border-teal-500/40',
  audit: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/60',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
  deprecated: 'bg-zinc-700/40 text-zinc-400 border-zinc-600/60 line-through',
  draft: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  experimental: 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40',
};

export function KnowledgeTable({ entries }: Props) {
  const [state, setState] = useState<KbFilterState>({
    status: 'active',
    tags: [],
    search: '',
  });

  const filtered = useMemo(() => applyKbFilters(entries, state), [entries, state]);

  return (
    <div className="space-y-4">
      <KnowledgeFilters entries={entries} state={state} onChange={setState} />
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 text-xs text-zinc-500 border-b border-zinc-800">
          {filtered.length} de {entries.length} entradas
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-zinc-400">
            <tr>
              <th className="text-left font-medium px-4 py-2">Título</th>
              <th className="text-left font-medium px-3 py-2">Tipo</th>
              <th className="text-left font-medium px-3 py-2">Subtipo</th>
              <th className="text-left font-medium px-3 py-2">Estado</th>
              <th className="text-left font-medium px-3 py-2">Tags</th>
              <th className="text-left font-medium px-3 py-2">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Sin resultados con los filtros actuales.
                </td>
              </tr>
            )}
            {filtered.map((e) => {
              const shownTags = e.tags.slice(0, 3);
              const extraTags = e.tags.length - shownTags.length;
              return (
                <tr
                  key={e.id}
                  className="border-t border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="px-4 py-2 text-zinc-50">
                    <Link href={`/knowledge/${e.id}`} className="hover:text-violet-300">
                      {e.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      className={`${
                        TYPE_COLORS[e.type] ?? 'bg-zinc-700/40 border-zinc-600/60 text-zinc-300'
                      } border font-normal`}
                    >
                      {e.type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {e.subtype ? (
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-normal">
                        {e.subtype}
                      </Badge>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      className={`${
                        STATUS_COLORS[e.status] ?? 'bg-zinc-700/40 border-zinc-600/60 text-zinc-300'
                      } border font-normal`}
                    >
                      {e.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 space-x-1">
                    {shownTags.map((t) => (
                      <span key={t} className="text-xs text-zinc-400">
                        #{t}
                      </span>
                    ))}
                    {extraTags > 0 && (
                      <span className="text-xs text-zinc-500">+{extraTags}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-400 text-xs whitespace-nowrap">
                    {formatRelativeTime(e.updated)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
