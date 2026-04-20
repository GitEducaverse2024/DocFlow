/**
 * KnowledgeDetail — Phase 154 Plan 02 client markdown + metadata view.
 *
 * Renders body via canonical ReactMarkdown + remarkGfm + prose wrapper
 * (process-panel.tsx:513-517 pattern; 7 uses across the repo). Shows
 * deprecated banner when `frontmatter.status === 'deprecated'`,
 * related_resolved table, and collapsible metadata section.
 */
'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { GetKbEntryResult } from '@/lib/services/kb-index-cache';
import { formatRelativeTime } from '@/lib/relative-time';

interface Props {
  entry: GetKbEntryResult;
  title: string;
}

function pickString(fm: Record<string, unknown>, key: string): string | null {
  const v = fm[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function pickSummary(fm: Record<string, unknown>): string | null {
  const s = fm['summary'];
  if (typeof s === 'string') return s;
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    const obj = s as Record<string, unknown>;
    if (typeof obj['es'] === 'string') return obj['es'] as string;
    if (typeof obj['en'] === 'string') return obj['en'] as string;
  }
  return null;
}

export function KnowledgeDetail({ entry, title }: Props) {
  const [metaOpen, setMetaOpen] = useState(false);
  const fm = entry.frontmatter;
  const status = pickString(fm, 'status') ?? 'unknown';
  const type = pickString(fm, 'type') ?? '—';
  const subtype = pickString(fm, 'subtype');
  const version = pickString(fm, 'version');
  const updatedAt = pickString(fm, 'updated_at') ?? pickString(fm, 'updated');
  const createdAt = pickString(fm, 'created_at');
  const summary = pickSummary(fm);
  const deprecatedReason = pickString(fm, 'deprecated_reason');
  const supersededBy = pickString(fm, 'superseded_by');
  const changeLog = Array.isArray(fm['change_log']) ? (fm['change_log'] as unknown[]) : [];
  const tags = Array.isArray(fm['tags']) ? (fm['tags'] as string[]) : [];

  return (
    <article className="space-y-6">
      {status === 'deprecated' && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-100">
            <div className="font-medium">Este recurso está deprecado.</div>
            {deprecatedReason && (
              <div className="mt-1 text-amber-200/80">Razón: {deprecatedReason}</div>
            )}
            {supersededBy && (
              <div className="mt-1">
                Reemplazado por:{' '}
                <Link
                  href={`/knowledge/${supersededBy}`}
                  className="text-amber-300 underline"
                >
                  {supersededBy}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-zinc-50">{title}</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge className="bg-violet-500/20 text-violet-200 border border-violet-500/40 font-normal">
            {type}
          </Badge>
          {subtype && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-400 font-normal">
              {subtype}
            </Badge>
          )}
          <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-normal">
            {status}
          </Badge>
          {tags.map((t) => (
            <span key={t} className="text-xs text-zinc-400">
              #{t}
            </span>
          ))}
        </div>
        {summary && <p className="text-zinc-300">{summary}</p>}
      </header>

      <section>
        <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Contenido</h2>
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body}</ReactMarkdown>
        </div>
      </section>

      {entry.related_resolved.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-zinc-500 mb-3">Relaciones</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-950 text-zinc-400">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Tipo</th>
                  <th className="text-left font-medium px-3 py-2">ID</th>
                  <th className="text-left font-medium px-3 py-2">Título</th>
                  <th className="text-left font-medium px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entry.related_resolved.map((r) => (
                  <tr key={`${r.type}-${r.id}`} className="border-t border-zinc-800">
                    <td className="px-4 py-2 text-zinc-300">{r.type}</td>
                    <td className="px-3 py-2 text-zinc-400 font-mono text-xs">{r.id}</td>
                    <td className="px-3 py-2 text-zinc-200">{r.title ?? '—'}</td>
                    <td className="px-3 py-2">
                      {r.path && (
                        <Link
                          href={`/knowledge/${r.id}`}
                          className="text-violet-300 text-xs hover:underline"
                        >
                          Ver entry
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <button
          type="button"
          onClick={() => setMetaOpen((v) => !v)}
          className="flex items-center gap-1 text-sm uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
        >
          {metaOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Metadata
        </button>
        {metaOpen && (
          <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2 text-sm text-zinc-300">
            {version && (
              <div>
                <span className="text-zinc-500">Versión:</span> {version}
              </div>
            )}
            {createdAt && (
              <div>
                <span className="text-zinc-500">Creado:</span> {createdAt}
              </div>
            )}
            {updatedAt && (
              <div>
                <span className="text-zinc-500">Actualizado:</span> {updatedAt} (
                {formatRelativeTime(updatedAt)})
              </div>
            )}
            {changeLog.length > 0 && (
              <div>
                <div className="text-zinc-500 mb-1">Change log:</div>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                  {changeLog.map((entry_, idx) => (
                    <li key={idx}>
                      {typeof entry_ === 'string' ? entry_ : JSON.stringify(entry_)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </article>
  );
}
