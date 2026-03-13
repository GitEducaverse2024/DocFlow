"use client";

import { useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Play, ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';
import type { TestRun, TestResult } from '@/hooks/use-test-runner';

interface TestSectionListProps {
  latestRun: TestRun | null;
  isRunning: boolean;
  onRunSection: (section: string) => void;
}

interface SectionData {
  name: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  totalDuration: number;
}

function extractSectionName(filePath: string): string {
  // e.g. /app/e2e/specs/projects.spec.ts -> projects
  const match = filePath.match(/([^/]+)\.spec\./);
  if (match) return match[1];
  // fallback: last segment without extension
  const parts = filePath.split('/');
  const last = parts[parts.length - 1];
  return last.replace(/\.spec\.\w+$/, '').replace(/\.\w+$/, '');
}

function groupTestsBySection(results: TestResult[]): SectionData[] {
  const map = new Map<string, TestResult[]>();

  for (const test of results) {
    const section = extractSectionName(test.file);
    if (!map.has(section)) map.set(section, []);
    map.get(section)!.push(test);
  }

  const sections: SectionData[] = Array.from(map.entries()).map(([name, tests]) => ({
    name,
    tests,
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: tests.filter((t) => t.status === 'skipped').length,
    totalDuration: tests.reduce((sum, t) => sum + t.duration, 0),
  }));

  return sections.sort((a, b) => a.name.localeCompare(b.name));
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'passed':
      return <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
    case 'skipped':
      return <MinusCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
    default:
      return <MinusCircle className="w-4 h-4 text-zinc-500 flex-shrink-0" />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function TestSectionList({ latestRun, isRunning, onRunSection }: TestSectionListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!latestRun || !latestRun.results_json || latestRun.results_json.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <FlaskConical className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
        <p className="text-zinc-400">Ejecuta los tests para ver resultados</p>
      </div>
    );
  }

  const sections = groupTestsBySection(latestRun.results_json);

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isExpanded = expanded === section.name;
        const hasFailures = section.failed > 0;

        return (
          <div
            key={section.name}
            className={`rounded-lg border ${hasFailures ? 'border-red-500/30' : 'border-zinc-800'} bg-zinc-900/50 overflow-hidden`}
          >
            {/* Section header */}
            <button
              onClick={() => setExpanded(isExpanded ? null : section.name)}
              className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/50 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              )}

              <span className="font-medium text-zinc-200 capitalize flex-1">
                {section.name}
              </span>

              {/* Per-section counts */}
              <div className="flex items-center gap-3 text-xs">
                {section.passed > 0 && (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> {section.passed}
                  </span>
                )}
                {section.failed > 0 && (
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3 h-3" /> {section.failed}
                  </span>
                )}
                {section.skipped > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400">
                    <MinusCircle className="w-3 h-3" /> {section.skipped}
                  </span>
                )}
                <span className="text-zinc-500">
                  {formatDuration(section.totalDuration)}
                </span>
              </div>

              {/* Per-section run button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRunSection(section.name);
                }}
                disabled={isRunning}
                className="ml-2 p-1.5 rounded-md bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={`Ejecutar ${section.name}`}
              >
                <Play className="w-3 h-3" />
              </button>
            </button>

            {/* Expanded test list */}
            {isExpanded && (
              <div className="border-t border-zinc-800">
                {section.tests.map((test, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-800/30 transition-colors"
                  >
                    <StatusIcon status={test.status} />
                    <span className={`flex-1 ${test.status === 'failed' ? 'text-red-300' : 'text-zinc-300'}`}>
                      {test.title}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatDuration(test.duration)}
                    </span>
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
