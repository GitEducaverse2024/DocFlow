"use client";

import { CheckCircle2, XCircle, MinusCircle, FlaskConical } from 'lucide-react';
import type { TestRun } from '@/hooks/use-test-runner';

interface TestSummaryBarProps {
  latestRun: TestRun | null;
  isRunning: boolean;
}

export function TestSummaryBar({ latestRun, isRunning }: TestSummaryBarProps) {
  if (!latestRun) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <FlaskConical className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-zinc-400">Sin ejecuciones</p>
        <p className="text-xs text-zinc-500 mt-1">Ejecuta los tests para ver un resumen</p>
      </div>
    );
  }

  const { total, passed, failed, skipped } = latestRun;

  const stats = [
    { label: 'Total', value: total, icon: FlaskConical, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { label: 'Pasaron', value: passed, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    { label: 'Fallaron', value: failed, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    { label: 'Omitidos', value: skipped, icon: MinusCircle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  ];

  return (
    <div className="space-y-3">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg border ${stat.border} ${stat.bg} p-4`}
          >
            <div className="flex items-center gap-2 mb-1">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-xs text-zinc-400">{stat.label}</span>
            </div>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Visual coverage bar */}
      {total > 0 && (
        <div className={`flex h-3 rounded-full overflow-hidden bg-zinc-800 ${isRunning ? 'animate-pulse' : ''}`}>
          {passed > 0 && (
            <div
              className="bg-green-500 transition-all duration-300"
              style={{ flexGrow: passed }}
            />
          )}
          {failed > 0 && (
            <div
              className="bg-red-500 transition-all duration-300"
              style={{ flexGrow: failed }}
            />
          )}
          {skipped > 0 && (
            <div
              className="bg-yellow-500 transition-all duration-300"
              style={{ flexGrow: skipped }}
            />
          )}
        </div>
      )}
    </div>
  );
}
