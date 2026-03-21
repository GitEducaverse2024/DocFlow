"use client";

import { useRef, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Plus, Minus } from 'lucide-react';

interface LogEntry {
  ts: string;
  level: string;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

interface LogViewerProps {
  entries: LogEntry[];
  loading: boolean;
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8); // HH:MM:SS
  } catch {
    return ts.slice(11, 19) || ts;
  }
}

const levelStyles: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-400',
  warn: 'bg-amber-500/10 text-amber-400',
  error: 'bg-red-500/10 text-red-400',
};

export function LogViewer({ entries, loading }: LogViewerProps) {
  const t = useTranslations('testing');
  const containerRef = useRef<HTMLDivElement>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Auto-scroll to bottom when entries change
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        {t('logs.empty')}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="max-h-[600px] overflow-y-auto rounded-lg border border-zinc-800"
    >
      {entries.map((entry, idx) => {
        const isExpanded = expandedIdx === idx;
        const hasMeta = entry.metadata && Object.keys(entry.metadata).length > 0;
        const rowBg = idx % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/50';

        return (
          <div key={`${entry.ts}-${idx}`} className={rowBg}>
            <div className="flex items-center gap-2 px-3 py-1.5 min-h-[32px]">
              {/* Timestamp */}
              <span className="text-zinc-500 font-mono text-xs w-20 shrink-0">
                {formatTime(entry.ts)}
              </span>

              {/* Level badge */}
              <span
                className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded w-16 text-center shrink-0 ${
                  levelStyles[entry.level] || 'bg-zinc-700/50 text-zinc-400'
                }`}
              >
                {entry.level}
              </span>

              {/* Source badge */}
              <span className="bg-violet-500/10 text-zinc-300 text-[10px] px-1.5 py-0.5 rounded w-24 text-center shrink-0">
                {entry.source}
              </span>

              {/* Message */}
              <span
                className="text-zinc-200 text-sm truncate flex-1"
                title={entry.message}
              >
                {entry.message}
              </span>

              {/* Metadata toggle */}
              {hasMeta && (
                <button
                  onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  className="text-zinc-500 hover:text-zinc-300 shrink-0"
                >
                  {isExpanded ? (
                    <Minus className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                </button>
              )}
            </div>

            {/* Expanded metadata */}
            {isExpanded && hasMeta && (
              <div className="px-3 pb-2 pl-[calc(5rem+0.5rem)]">
                <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-2 overflow-x-auto">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
