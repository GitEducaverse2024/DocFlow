"use client";

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  History,
} from 'lucide-react';
import type { TestRun, TestResult } from '@/hooks/use-test-runner';
import { TestResultDetail } from '@/components/testing/test-result-detail';

interface TestRunHistoryProps {
  runs: TestRun[];
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'hace unos segundos';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHour < 24) return `hace ${diffHour}h`;
  return `hace ${diffDay}d`;
}

function getStatusConfig(status: string): { label: string; bgClass: string; textClass: string } {
  switch (status) {
    case 'passed':
      return { label: 'Pasaron', bgClass: 'bg-green-600/20', textClass: 'text-green-400' };
    case 'failed':
      return { label: 'Fallaron', bgClass: 'bg-red-600/20', textClass: 'text-red-400' };
    case 'timedout':
    case 'interrupted':
      return { label: 'Interrumpido', bgClass: 'bg-amber-600/20', textClass: 'text-amber-400' };
    default:
      return { label: status, bgClass: 'bg-zinc-600/20', textClass: 'text-zinc-400' };
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'passed':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
    case 'skipped':
      return <MinusCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
    default:
      return <MinusCircle className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />;
  }
}

export function TestRunHistory({ runs }: TestRunHistoryProps) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  if (!runs || runs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <History className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-zinc-400">Sin historial de ejecuciones</p>
      </div>
    );
  }

  const displayRuns = runs.slice(0, 10);

  return (
    <div className="space-y-1">
      {displayRuns.map((run, idx) => {
        const isExpanded = expandedRun === run.id;
        const statusCfg = getStatusConfig(run.status);
        const typeLabel = run.section ? run.section : 'Completa';

        return (
          <div
            key={run.id}
            className={`rounded-lg border border-zinc-800 overflow-hidden ${
              idx % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-950'
            }`}
          >
            {/* Run header */}
            <button
              onClick={() => setExpandedRun(isExpanded ? null : run.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/40 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              )}

              {/* Time */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 w-28 flex-shrink-0">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(run.created_at)}
              </div>

              {/* Type badge */}
              <span className="px-2 py-0.5 rounded text-xs bg-zinc-700/50 text-zinc-300 capitalize flex-shrink-0">
                {typeLabel}
              </span>

              {/* Status badge */}
              <span className={`px-2 py-0.5 rounded text-xs ${statusCfg.bgClass} ${statusCfg.textClass} flex-shrink-0`}>
                {statusCfg.label}
              </span>

              {/* Aggregate counts */}
              <div className="flex items-center gap-2 ml-auto text-xs">
                <span className="text-zinc-500">{run.total} total</span>
                {run.passed > 0 && (
                  <span className="text-green-400">{run.passed} ok</span>
                )}
                {run.failed > 0 && (
                  <span className="text-red-400">{run.failed} fail</span>
                )}
                {run.skipped > 0 && (
                  <span className="text-yellow-400">{run.skipped} skip</span>
                )}
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-500">{run.duration_seconds}s</span>
              </div>
            </button>

            {/* Expanded results */}
            {isExpanded && run.results_json && run.results_json.length > 0 && (
              <div className="border-t border-zinc-800">
                {run.results_json.map((result: TestResult, rIdx: number) => (
                  <div key={rIdx}>
                    <div className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-800/30 transition-colors">
                      <StatusIcon status={result.status} />
                      <span className={`flex-1 ${result.status === 'failed' ? 'text-red-300' : 'text-zinc-300'}`}>
                        {result.title}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {result.duration < 1000
                          ? `${Math.round(result.duration)}ms`
                          : `${(result.duration / 1000).toFixed(1)}s`}
                      </span>
                    </div>
                    {result.status === 'failed' && (
                      <TestResultDetail result={result} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
