"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Radio,
  Calendar,
  Repeat,
  GitFork,
  Clock,
  Bot,
  FolderKanban,
  Trash2,
  Loader2,
} from 'lucide-react';

export interface CatFlowTask {
  id: string;
  name: string;
  description: string | null;
  status: string;
  steps_count: number;
  steps_completed: number;
  agents: string[];
  project_names: string[];
  created_at: string;
  updated_at: string;
  total_tokens: number;
  total_duration: number;
  listen_mode: number;
  execution_mode: string;
  execution_count: number;
  run_count: number;
  schedule_config: string | null;
}

interface CatFlowCardProps {
  task: CatFlowTask;
  onToggleActive: (id: string, currentStatus: string) => void;
  onFork: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  configuring: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  ready: 'bg-green-500/10 text-green-400 border-green-500/20',
  running: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  paused: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
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

export function CatFlowCard({ task, onToggleActive, onFork, onDelete, isDeleting }: CatFlowCardProps) {
  const t = useTranslations('catflow');

  const progress = task.steps_count > 0
    ? Math.round((task.steps_completed / task.steps_count) * 100)
    : 0;

  const isExecuting = task.status === 'running' || task.status === 'paused';
  const isActive = task.status !== 'draft';
  const statusClass = STATUS_CLASSES[task.status] || STATUS_CLASSES.draft;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group relative">
      {/* Top row: name + status badge + delete button */}
      <div className="flex items-start justify-between mb-2">
        <Link href={`/catflow/${task.id}`} className="flex-1 min-w-0">
          <h3 className="text-zinc-200 font-medium truncate group-hover:text-violet-400 transition-colors">
            {task.name}
          </h3>
        </Link>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <Badge variant="outline" className={`text-xs border ${statusClass}`}>
            {t(`status.${task.status}`)}
          </Badge>
          <Button
            size="icon-xs"
            variant="ghost"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-red-400"
            onClick={() => onDelete(task.id)}
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
      {task.description && (
        <p className="text-zinc-500 text-sm line-clamp-2 mb-3">{task.description}</p>
      )}

      {/* Badge row: listen_mode + schedule + variable */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {task.listen_mode === 1 && (
          <Badge variant="outline" className="text-xs border bg-amber-500/10 text-amber-400 border-amber-500/20">
            <Radio className="w-3 h-3 mr-1" />
            {t('listening')}
          </Badge>
        )}
        {task.execution_mode === 'scheduled' && (
          <Badge variant="outline" className="text-xs border bg-blue-500/10 text-blue-400 border-blue-500/20">
            <Calendar className="w-3 h-3 mr-1" />
            {t('scheduled')}
          </Badge>
        )}
        {task.execution_mode === 'variable' && (
          <Badge variant="outline" className="text-xs border bg-teal-500/10 text-teal-400 border-teal-500/20">
            <Repeat className="w-3 h-3 mr-1" />
            {t('variable', { run: task.run_count, total: task.execution_count })}
          </Badge>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
          <span>{t('card.steps', { completed: task.steps_completed, total: task.steps_count })}</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Agents row */}
      {task.agents && task.agents.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 text-xs text-zinc-500">
          <Bot className="w-3 h-3 shrink-0" />
          <span className="truncate">{task.agents.join(', ')}</span>
        </div>
      )}

      {/* Footer: project names + time ago + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
        <div className="flex items-center gap-1 text-xs text-zinc-500 truncate min-w-0">
          {task.project_names && task.project_names.length > 0 && (
            <>
              <FolderKanban className="w-3 h-3 shrink-0" />
              <span className="truncate">{task.project_names.join(', ')}</span>
              <span className="mx-1">·</span>
            </>
          )}
          <Clock className="w-3 h-3 shrink-0" />
          <span>{timeAgo(task.updated_at, t)}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Switch
            size="sm"
            checked={isActive}
            onCheckedChange={() => onToggleActive(task.id, task.status)}
            disabled={isExecuting}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-zinc-500 hover:text-violet-400"
            onClick={() => onFork(task.id, task.name)}
          >
            <GitFork className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
