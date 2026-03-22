"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Play,
  Pencil,
  GitFork,
  Download,
  Trash2,
  Loader2,
  Clock,
} from 'lucide-react';

export interface CatFlowCanvas {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  mode: string;
  status: string;
  node_count: number;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

interface CatFlowCardProps {
  canvas: CatFlowCanvas;
  onExecute: (id: string) => void;
  onToggleActive: (id: string, currentStatus: string) => void;
  onFork: (id: string, name: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
  isExecuting?: boolean;
}

const MODE_CLASSES: Record<string, string> = {
  agents: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  catbrains: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  mixed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

function timeAgo(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return t('timeAgo.moment');
  if (diffMin < 60) return t('timeAgo.minutes', { count: diffMin });
  if (diffHr < 24) return t('timeAgo.hours', { count: diffHr });
  if (diffDay < 30) return t('timeAgo.days', { count: diffDay });
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function CatFlowCard({
  canvas,
  onExecute,
  onToggleActive,
  onFork,
  onExport,
  onDelete,
  isDeleting,
  isExecuting,
}: CatFlowCardProps) {
  const t = useTranslations('catflow');

  const isActive = canvas.status !== 'archived';
  const modeClass = MODE_CLASSES[canvas.mode] || MODE_CLASSES.mixed;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group relative">
      {/* Top row: emoji + name + delete */}
      <div className="flex items-start justify-between mb-2">
        <Link href={`/canvas/${canvas.id}`} className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg shrink-0">{canvas.emoji}</span>
          <h3 className="text-zinc-200 font-medium truncate group-hover:text-violet-400 transition-colors">
            {canvas.name}
          </h3>
        </Link>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Badge variant="outline" className={`text-xs border ${modeClass}`}>
            {t(`modes.${canvas.mode}`)}
          </Badge>
          <Button
            size="icon-xs"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400"
            onClick={() => onDelete(canvas.id)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Description */}
      {canvas.description && (
        <p className="text-zinc-500 text-sm line-clamp-2 mb-3">{canvas.description}</p>
      )}

      {/* Node count */}
      <div className="flex items-center gap-1.5 mb-3 text-xs text-zinc-500">
        <span>{t('card.nodes', { count: canvas.node_count || 0 })}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 mb-3">
        <Button
          size="sm"
          onClick={() => onExecute(canvas.id)}
          disabled={isExecuting || !isActive}
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white h-7 px-2.5"
        >
          {isExecuting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1" />
          )}
          {t('card.execute')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.location.href = `/canvas/${canvas.id}`}
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 h-7 px-2.5"
        >
          <Pencil className="w-3.5 h-3.5 mr-1" />
          {t('card.edit')}
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-zinc-500 hover:text-violet-400"
          onClick={() => onFork(canvas.id, canvas.name)}
        >
          <GitFork className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-zinc-500 hover:text-teal-400"
          onClick={() => onExport(canvas.id)}
        >
          <Download className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Footer: time ago + active toggle */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{timeAgo(canvas.updated_at, t)}</span>
        </div>
        <Switch
          size="sm"
          checked={isActive}
          onCheckedChange={() => onToggleActive(canvas.id, canvas.status)}
        />
      </div>
    </div>
  );
}
