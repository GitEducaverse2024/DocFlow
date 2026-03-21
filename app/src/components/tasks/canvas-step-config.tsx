"use client";

import { ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CanvasStepConfigProps {
  canvasName: string;
  canvasEmoji: string;
  nodeCount: number;
  updatedAt: string;
  onEdit: () => void;
  onChange: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  return new Date(dateStr).toLocaleDateString();
}

export function CanvasStepConfig({
  canvasName,
  canvasEmoji,
  nodeCount,
  updatedAt,
  onEdit,
  onChange,
  t,
}: CanvasStepConfigProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      {/* Title */}
      <div className="flex items-center gap-2">
        <span className="text-lg">{canvasEmoji}</span>
        <span className="text-sm font-medium text-zinc-200">{canvasName}</span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
          {t('wizard.pipeline.canvasSheet.nodes', { count: nodeCount })}
        </Badge>
        <span className="text-xs text-zinc-500">
          {relativeDate(updatedAt)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="border-zinc-700 text-zinc-300 hover:text-violet-400 hover:border-violet-500"
        >
          <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
          {t('wizard.pipeline.canvasStep.editLink')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onChange}
          className="text-zinc-400 hover:text-zinc-200"
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          {t('wizard.pipeline.canvasStep.change')}
        </Button>
      </div>
    </div>
  );
}
