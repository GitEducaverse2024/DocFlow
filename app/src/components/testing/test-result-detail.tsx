"use client";

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Camera, Code2 } from 'lucide-react';
import type { TestResult } from '@/hooks/use-test-runner';

interface TestResultDetailProps {
  result: TestResult;
  screenshot?: string;
  code?: string;
}

export function TestResultDetail({ result, screenshot, code }: TestResultDetailProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-1 ml-8 rounded-md border border-red-500/20 bg-zinc-950/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-300 hover:bg-zinc-800/30 transition-colors"
      >
        {expanded ? (
          <ChevronUp className="w-3 h-3 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        )}
        <span>Ver detalles del error</span>
      </button>

      {expanded && (
        <div className="space-y-3 p-3 border-t border-zinc-800">
          {/* Error message */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-red-400 font-medium">
              <AlertTriangle className="w-3 h-3" />
              Error
            </div>
            <div className="rounded-md bg-red-950/40 border border-red-500/20 p-3 overflow-x-auto">
              <pre className="text-xs font-mono text-red-200 whitespace-pre-wrap break-words">
                {result.error || 'Error no disponible'}
              </pre>
            </div>
          </div>

          {/* Screenshot */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-zinc-400 font-medium">
              <Camera className="w-3 h-3" />
              Screenshot
            </div>
            {screenshot ? (
              <div className="rounded-md border border-zinc-700 overflow-hidden">
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt="Screenshot del error"
                  className="max-w-full h-auto"
                />
              </div>
            ) : (
              <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-500 italic">
                [Screenshot no disponible]
              </div>
            )}
          </div>

          {/* Test code */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-zinc-400 font-medium">
              <Code2 className="w-3 h-3" />
              Codigo del test
            </div>
            {code ? (
              <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 overflow-x-auto">
                <pre className="text-xs font-mono text-zinc-300">
                  <code>{code}</code>
                </pre>
              </div>
            ) : (
              <div className="rounded-md bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-500 italic">
                [Codigo no disponible — {result.file}]
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
