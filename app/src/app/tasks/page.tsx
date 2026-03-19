"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ClipboardList, Plus, Clock, Bot, FolderKanban } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { toast } from 'sonner';

interface EnrichedTask {
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
}

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

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  draft: { label: 'Borrador', badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  configuring: { label: 'Configurando', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ready: { label: 'Listo', badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  running: { label: 'Ejecutando', badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse' },
  paused: { label: 'Pausado', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  completed: { label: 'Completado', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Fallido', badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHr < 24) return `hace ${diffHr}h`;
  if (diffDay < 30) return `hace ${diffDay}d`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function getTemplateStepCount(template: TaskTemplate): number {
  if (!template.steps_config) return 0;
  try {
    const steps = JSON.parse(template.steps_config);
    return Array.isArray(steps) ? steps.length : 0;
  } catch {
    return 0;
  }
}

type FilterKey = 'all' | 'running' | 'completed' | 'draft';

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, templatesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/tasks/templates'),
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runningStatuses = ['running', 'paused', 'configuring', 'ready'];

  const counts = {
    all: tasks.length,
    running: tasks.filter(t => runningStatuses.includes(t.status)).length,
    completed: tasks.filter(t => t.status === 'completed').length,
    draft: tasks.filter(t => t.status === 'draft').length,
  };

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true;
    if (filter === 'running') return runningStatuses.includes(t.status);
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'draft') return t.status === 'draft';
    return true;
  });

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'running', label: 'En curso' },
    { key: 'completed', label: 'Completadas' },
    { key: 'draft', label: 'Borradores' },
  ];

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
        title="Tareas"
        description="Gestiona pipelines de procesamiento multi-agente."
        icon={<ClipboardList className="w-6 h-6" />}
        action={
          <Button
            onClick={() => router.push('/tasks/new')}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva tarea
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-1 mb-6">
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
            {f.label} ({counts[f.key]})
          </Button>
        ))}
      </div>

      {/* Task Cards */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-20 border border-zinc-800 border-dashed rounded-lg">
          <ClipboardList className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">
            {filter === 'all' ? 'No hay tareas' : 'No se encontraron tareas con este filtro'}
          </h2>
          {filter === 'all' && (
            <>
              <p className="text-zinc-500 max-w-md mx-auto mb-6">
                Crea tu primera tarea para comenzar a procesar documentos con pipelines multi-agente.
              </p>
              <Button
                onClick={() => router.push('/tasks/new')}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Crear primera tarea
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map(task => {
            const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;
            const progress = task.steps_count > 0
              ? Math.round((task.steps_completed / task.steps_count) * 100)
              : 0;

            return (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors group block"
              >
                {/* Status badge */}
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-zinc-200 font-medium truncate group-hover:text-violet-400 transition-colors flex-1 mr-2">
                    {task.name}
                  </h3>
                  <Badge variant="outline" className={`text-xs border shrink-0 ${statusCfg.badgeClass}`}>
                    {statusCfg.label}
                  </Badge>
                </div>

                {/* Description */}
                {task.description && (
                  <p className="text-zinc-500 text-sm line-clamp-2 mb-3">{task.description}</p>
                )}

                {/* Progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>{task.steps_completed}/{task.steps_count} pasos</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Agents */}
                {task.agents.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {task.agents.map(agent => (
                      <span
                        key={agent}
                        className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded flex items-center gap-1"
                      >
                        <Bot className="w-3 h-3" />
                        {agent}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50 text-xs text-zinc-500">
                  <div className="flex items-center gap-1 truncate">
                    {task.project_names.length > 0 && (
                      <>
                        <FolderKanban className="w-3 h-3 shrink-0" />
                        <span className="truncate">{task.project_names.join(', ')}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{timeAgo(task.updated_at)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Templates Section */}
      {templates.length > 0 && (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-zinc-200">Plantillas</h2>
            <p className="text-zinc-500 text-sm mt-1">Comienza rapido con una plantilla pre-configurada.</p>
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
                    <span className="text-xs text-zinc-500">{stepCount} pasos</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push(`/tasks/new?template=${tmpl.id}`)}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 h-7"
                    >
                      Usar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
