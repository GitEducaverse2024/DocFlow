"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  Plus,
  Zap,
  ChevronDown,
  Radio,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CatFlowCard } from './catflow-card';
import { ForkDialog } from './fork-dialog';
import type { CatFlowTask } from './catflow-card';

interface TaskTemplate {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  category: string;
  steps_config: string | null;
  required_agents: string | null;
  times_used: number;
  created_at: string;
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

type FilterKey = 'all' | 'active' | 'scheduled' | 'listening' | 'draft';

function getTemplateStepCount(template: TaskTemplate): number {
  if (!template.steps_config) return 0;
  try {
    const steps = JSON.parse(template.steps_config);
    return Array.isArray(steps) ? steps.length : 0;
  } catch {
    return 0;
  }
}

export function CatFlowPageContent() {
  const router = useRouter();
  const t = useTranslations('catflow');
  const [tasks, setTasks] = useState<CatFlowTask[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [forkTarget, setForkTarget] = useState<{ id: string; name: string } | null>(null);
  const [listenSectionOpen, setListenSectionOpen] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, templatesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/tasks/templates'),
      ]);
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data);
      }
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } catch {
      toast.error(t('toasts.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Listening tasks for bottom section (always from full list, not filtered)
  const listeningTasks = useMemo(() => tasks.filter(tk => tk.listen_mode === 1), [tasks]);

  // Filter counts
  const counts = useMemo(() => ({
    all: tasks.length,
    active: tasks.filter(tk => ['ready', 'running', 'paused', 'completed'].includes(tk.status)).length,
    scheduled: tasks.filter(tk => tk.execution_mode === 'scheduled').length,
    listening: tasks.filter(tk => tk.listen_mode === 1).length,
    draft: tasks.filter(tk => tk.status === 'draft').length,
  }), [tasks]);

  const filteredTasks = useMemo(() => tasks.filter(tk => {
    if (filter === 'all') return true;
    if (filter === 'active') return ['ready', 'running', 'paused', 'completed'].includes(tk.status);
    if (filter === 'scheduled') return tk.execution_mode === 'scheduled';
    if (filter === 'listening') return tk.listen_mode === 1;
    if (filter === 'draft') return tk.status === 'draft';
    return true;
  }), [tasks, filter]);

  const filters: { key: FilterKey; labelKey: string }[] = [
    { key: 'all', labelKey: 'filters.all' },
    { key: 'active', labelKey: 'filters.active' },
    { key: 'scheduled', labelKey: 'filters.scheduled' },
    { key: 'listening', labelKey: 'filters.listening' },
    { key: 'draft', labelKey: 'filters.draft' },
  ];

  // --- Handlers ---

  const handleToggleActive = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'draft' ? 'ready' : 'draft';
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setTasks(prev => prev.map(tk => tk.id === id ? { ...tk, status: newStatus } : tk));
      toast.success(t(newStatus === 'ready' ? 'toasts.activated' : 'toasts.deactivated'));
    } catch {
      toast.error(t('toasts.toggleError'));
    }
  };

  const handleToggleListenMode = async (id: string, currentMode: number) => {
    const newMode = currentMode === 1 ? 0 : 1;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listen_mode: newMode }),
      });
      if (!res.ok) throw new Error();
      setTasks(prev => prev.map(tk => tk.id === id ? { ...tk, listen_mode: newMode } : tk));
      toast.success(t(newMode === 1 ? 'toasts.listenEnabled' : 'toasts.listenDisabled'));
    } catch {
      toast.error(t('toasts.toggleError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    if (!confirm(t('card.deleteConfirm'))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(t('toasts.deleted'));
      setTasks(prev => prev.filter(tk => tk.id !== id));
    } catch {
      toast.error(t('toasts.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<Zap className="w-6 h-6" />}
        action={
          <Button
            onClick={() => router.push('/catflow/new')}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('newCatflow')}
          </Button>
        }
      />

      {/* Filter buttons */}
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {filters.map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
            className={filter === f.key
              ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
              : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50'}
          >
            {t(f.labelKey)} ({counts[f.key]})
          </Button>
        ))}
      </div>

      {/* CatFlow Card Grid */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-20 border border-zinc-800 border-dashed rounded-lg">
          <Zap className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">
            {filter === 'all' ? t('list.emptyAll') : t('list.emptyFiltered')}
          </h2>
          {filter === 'all' && (
            <>
              <p className="text-zinc-500 max-w-md mx-auto mb-6">
                {t('list.emptyDescription')}
              </p>
              <Button
                onClick={() => router.push('/catflow/new')}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('list.createFirst')}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map(task => (
            <CatFlowCard
              key={task.id}
              task={task}
              onToggleActive={handleToggleActive}
              onFork={(id, name) => setForkTarget({ id, name })}
              onDelete={handleDelete}
              isDeleting={deletingId === task.id}
            />
          ))}
        </div>
      )}

      {/* Collapsible "CatFlows a la escucha" section */}
      {listeningTasks.length > 0 && (
        <div className="mt-10">
          <button
            onClick={() => setListenSectionOpen(prev => !prev)}
            className="flex items-center gap-2 text-zinc-200 font-semibold mb-3 hover:text-violet-400 transition-colors"
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", !listenSectionOpen && "-rotate-90")} />
            <Radio className="w-4 h-4 text-amber-400" />
            {t('listenSection.title')} ({listeningTasks.length})
          </button>

          {listenSectionOpen && (
            <div className="space-y-2 pl-6">
              {listeningTasks.map(task => (
                <div key={task.id} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <Radio className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                    <Link href={`/catflow/${task.id}`} className="text-zinc-200 text-sm truncate hover:text-violet-400">
                      {task.name}
                    </Link>
                    <Badge variant="outline" className={STATUS_CLASSES[task.status] || STATUS_CLASSES.draft}>
                      {t(`status.${task.status}`)}
                    </Badge>
                  </div>
                  <Switch
                    size="sm"
                    checked={task.listen_mode === 1}
                    onCheckedChange={() => handleToggleListenMode(task.id, task.listen_mode)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Templates Section */}
      {templates.length > 0 && (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-zinc-200">{t('templates.title')}</h2>
            <p className="text-zinc-500 text-sm mt-1">{t('templates.description')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map(tmpl => {
              const stepCount = getTemplateStepCount(tmpl);
              return (
                <div
                  key={tmpl.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="text-3xl mb-2">{tmpl.emoji}</div>
                  <h3 className="font-medium text-zinc-200 mb-1">{tmpl.name}</h3>
                  {tmpl.description && (
                    <p className="text-sm text-zinc-500 line-clamp-2 mb-3">{tmpl.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">{t('templates.steps', { count: stepCount })}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/catflow/new?template=${tmpl.id}`)}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 h-7"
                    >
                      {t('templates.useTemplate')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fork Dialog */}
      <ForkDialog
        open={!!forkTarget}
        onOpenChange={(open) => { if (!open) setForkTarget(null); }}
        taskId={forkTarget?.id || null}
        taskName={forkTarget?.name || ''}
        onForked={() => { fetchData(); }}
      />
    </div>
  );
}
