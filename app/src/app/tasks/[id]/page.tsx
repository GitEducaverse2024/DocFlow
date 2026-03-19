"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Loader2, ArrowLeft, Bot, ShieldCheck, GitMerge,
  ChevronDown, ChevronRight, Copy, Download, Play,
  XCircle, Clock, Coins, CheckCircle2, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --------------- Types ---------------

interface TaskStepDetail {
  id: string;
  task_id: string;
  order_index: number;
  type: 'agent' | 'checkpoint' | 'merge';
  name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_model: string | null;
  instructions: string | null;
  context_mode: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  output: string | null;
  tokens_used: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  human_feedback: string | null;
}

interface TaskDetail {
  id: string;
  name: string;
  description: string | null;
  expected_output: string | null;
  status: 'draft' | 'configuring' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';
  linked_projects: string | null;
  result_output: string | null;
  total_tokens: number;
  total_duration: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps: TaskStepDetail[];
}

interface StatusStep {
  id: string;
  order_index: number;
  type: string;
  name: string | null;
  agent_name: string | null;
  status: string;
  tokens_used: number;
  duration_seconds: number;
  output_preview: string | null;
}

interface StatusResponse {
  status: string;
  current_step_index: number;
  elapsed_time: number;
  total_tokens: number;
  total_duration: number;
  steps: StatusStep[];
}

// --------------- Constants ---------------

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  draft: { label: 'Borrador', badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  configuring: { label: 'Configurando', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ready: { label: 'Listo', badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  running: { label: 'Ejecutando', badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse' },
  paused: { label: 'Pausado', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  completed: { label: 'Completado', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Fallido', badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const STEP_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending: { label: 'Pendiente', badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  running: { label: 'Ejecutando', badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse' },
  completed: { label: 'Completado', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Fallido', badgeClass: 'bg-red-500/10 text-red-400 border-red-500/20' },
  skipped: { label: 'Omitido', badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
};

// --------------- Helpers ---------------

function formatTokens(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function getStepIcon(type: string) {
  switch (type) {
    case 'checkpoint': return ShieldCheck;
    case 'merge': return GitMerge;
    default: return Bot;
  }
}

function getStepTypeName(type: string): string {
  switch (type) {
    case 'checkpoint': return 'Checkpoint';
    case 'merge': return 'Merge';
    default: return 'Agente';
  }
}

// --------------- Component ---------------

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showOutputDialog, setShowOutputDialog] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reExecuting, setReExecuting] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousStatusRef = useRef<string>('');

  // --------------- Data fetching ---------------

  const fetchFullTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setTask(data);
      previousStatusRef.current = data.status;
    } catch {
      toast.error('Error al cargar la tarea');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`);
      if (!res.ok) return;
      const status: StatusResponse = await res.json();

      setTask(prev => {
        if (!prev) return prev;

        // Merge status into task
        const updatedSteps = prev.steps.map(step => {
          const statusStep = status.steps.find(s => s.id === step.id);
          if (!statusStep) return step;
          return {
            ...step,
            status: statusStep.status as TaskStepDetail['status'],
            tokens_used: statusStep.tokens_used,
            duration_seconds: statusStep.duration_seconds,
            output: statusStep.output_preview !== null && step.output === null
              ? statusStep.output_preview
              : step.output,
          };
        });

        return {
          ...prev,
          status: status.status as TaskDetail['status'],
          total_tokens: status.total_tokens,
          total_duration: status.total_duration,
          steps: updatedSteps,
        };
      });

      // If task just completed or failed, re-fetch full data and stop polling
      if (status.status === 'completed' || status.status === 'failed') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        // Re-fetch to get full outputs
        const fullRes = await fetch(`/api/tasks/${taskId}`);
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          setTask(fullData);
        }
      }
    } catch {
      // Silently fail polling
    }
  }, [taskId]);

  // --------------- Polling lifecycle ---------------

  useEffect(() => {
    fetchFullTask();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchFullTask]);

  useEffect(() => {
    if (!task) return;

    const shouldPoll = task.status === 'running' || task.status === 'paused';

    if (shouldPoll && !intervalRef.current) {
      intervalRef.current = setInterval(pollStatus, 2000);
    } else if (!shouldPoll && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [task?.status, pollStatus]);

  // --------------- Actions ---------------

  const handleApprove = async (stepId: string) => {
    setApproving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success('Checkpoint aprobado, continuando ejecucion');
    } catch {
      toast.error('Error al aprobar checkpoint');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (stepId: string) => {
    if (!feedback.trim()) {
      toast.error('Se requiere feedback para rechazar');
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success('Checkpoint rechazado, re-ejecutando con feedback');
      setFeedback('');
    } catch {
      toast.error('Error al rechazar checkpoint');
    } finally {
      setRejecting(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success('Tarea cancelada');
      await fetchFullTask();
    } catch {
      toast.error('Error al cancelar tarea');
    } finally {
      setCancelling(false);
    }
  };

  const handleReExecute = async () => {
    setReExecuting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/execute`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success('Tarea re-lanzada');
      await fetchFullTask();
    } catch {
      toast.error('Error al re-ejecutar tarea');
    } finally {
      setReExecuting(false);
    }
  };

  const handleCopyResult = async () => {
    if (!task?.result_output) return;
    try {
      await navigator.clipboard.writeText(task.result_output);
      toast.success('Resultado copiado al portapapeles');
    } catch {
      toast.error('Error al copiar');
    }
  };

  const handleDownloadResult = () => {
    if (!task?.result_output) return;
    const blob = new Blob([task.result_output], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${task.name || 'resultado'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyStepOutput = async (output: string) => {
    try {
      await navigator.clipboard.writeText(output);
      toast.success('Contenido copiado al portapapeles');
    } catch {
      toast.error('Error al copiar');
    }
  };

  const toggleStep = (stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  // --------------- Computed ---------------

  const completedSteps = task?.steps.filter(s => s.status === 'completed').length ?? 0;
  const totalSteps = task?.steps.length ?? 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const isActive = task?.status === 'running' || task?.status === 'paused';
  const isCompleted = task?.status === 'completed';
  const isFailed = task?.status === 'failed';

  // --------------- Render ---------------

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-zinc-200 mb-2">Tarea no encontrada</h2>
        <Link href="/tasks" className="text-violet-400 hover:text-violet-300 text-sm">
          Volver a tareas
        </Link>
      </div>
    );
  }

  const taskStatusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.draft;

  // Find dialog step
  const dialogStep = showOutputDialog ? task.steps.find(s => s.id === showOutputDialog) : null;

  // Find the active checkpoint step (type=checkpoint, status=running)
  const activeCheckpoint = task.steps.find(s => s.type === 'checkpoint' && s.status === 'running');
  // Previous step output for checkpoint display
  const checkpointPrevStep = activeCheckpoint
    ? task.steps.find(s => s.order_index === activeCheckpoint.order_index - 1)
    : null;

  return (
    <div className={`max-w-4xl mx-auto p-8 ${isActive ? 'pb-28' : ''}`}>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/tasks"
          className="text-sm text-zinc-400 hover:text-zinc-200 flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a tareas
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-zinc-50 truncate">{task.name}</h1>
              <Badge variant="outline" className={`shrink-0 text-xs border ${taskStatusCfg.badgeClass}`}>
                {taskStatusCfg.label}
              </Badge>
            </div>
            {task.description && (
              <p className="text-zinc-400 text-sm mt-1">{task.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelling}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                {cancelling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <XCircle className="w-4 h-4 mr-1" />}
                Cancelar
              </Button>
            )}
            {(isCompleted || isFailed) && (
              <Button
                size="sm"
                onClick={handleReExecute}
                disabled={reExecuting}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {reExecuting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                Re-ejecutar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Failed banner */}
      {isFailed && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">La tarea ha fallado. Revisa el paso con error y re-ejecuta cuando estes listo.</p>
          </div>
        </div>
      )}

      {/* Completion result */}
      {isCompleted && task.result_output && (
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-lg mb-8">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Resultado final
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadResult}
                className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
              >
                <Download className="w-4 h-4 mr-1" />
                Descargar .md
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyResult}
                className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copiar
              </Button>
              <Button
                size="sm"
                onClick={handleReExecute}
                disabled={reExecuting}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white h-8 px-3"
              >
                {reExecuting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                Re-ejecutar
              </Button>
            </div>
          </div>
          <div className="p-4 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {task.result_output}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Pipeline View */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">Pipeline</h2>

        <div className="space-y-0">
          {task.steps.map((step, idx) => {
            const StepIcon = getStepIcon(step.type);
            const stepStatusCfg = STEP_STATUS_CONFIG[step.status] || STEP_STATUS_CONFIG.pending;
            const isRunning = step.status === 'running';
            const isExpanded = expandedSteps.has(step.id);
            const isCheckpointActive = step.type === 'checkpoint' && step.status === 'running';
            const hasOutput = !!step.output;
            const showPreview = !isCompleted && hasOutput && !isExpanded;
            const showExpanded = isExpanded || (isCompleted && isExpanded);
            const isFailed = step.status === 'failed';

            // Connecting line color between steps
            const showLine = idx < task.steps.length - 1;
            const lineColor = step.status === 'completed' && task.steps[idx + 1]?.status === 'completed'
              ? 'bg-emerald-500'
              : 'bg-zinc-700';

            return (
              <div key={step.id}>
                {/* Step Card */}
                <div
                  className={`bg-zinc-900 border rounded-lg transition-colors ${
                    isRunning ? 'border-l-2 border-l-violet-500 border-zinc-800' :
                    isFailed ? 'border-red-500/30' :
                    'border-zinc-800'
                  }`}
                >
                  {/* Step Header */}
                  <div
                    className={`flex items-center gap-3 px-4 py-3 ${
                      (isCompleted || hasOutput) ? 'cursor-pointer hover:bg-zinc-800/50' : ''
                    }`}
                    onClick={() => {
                      if (isCompleted || hasOutput) toggleStep(step.id);
                    }}
                  >
                    <StepIcon className={`w-5 h-5 shrink-0 ${
                      step.status === 'completed' ? 'text-emerald-400' :
                      isRunning ? 'text-violet-400' :
                      isFailed ? 'text-red-400' :
                      'text-zinc-500'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200 truncate">
                          {step.name || `${getStepTypeName(step.type)} ${idx + 1}`}
                        </span>
                        {step.agent_name && (
                          <span className="text-xs text-zinc-500 truncate">
                            {step.agent_name}
                            {step.agent_model ? ` / ${step.agent_model}` : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {step.tokens_used > 0 && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Coins className="w-3 h-3" />
                          {formatTokens(step.tokens_used)}
                        </span>
                      )}
                      {step.duration_seconds > 0 && (
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(step.duration_seconds)}
                        </span>
                      )}
                      <Badge variant="outline" className={`text-xs border ${stepStatusCfg.badgeClass}`}>
                        {isRunning && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                        {stepStatusCfg.label}
                      </Badge>
                      {(hasOutput || step.status === 'completed') && (
                        isExpanded
                          ? <ChevronDown className="w-4 h-4 text-zinc-500" />
                          : <ChevronRight className="w-4 h-4 text-zinc-500" />
                      )}
                    </div>
                  </div>

                  {/* Output Preview (non-completed pipeline, not expanded) */}
                  {showPreview && !isCheckpointActive && (
                    <div className="px-4 pb-3">
                      <div className="relative max-h-[200px] overflow-hidden">
                        <div className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words">
                          {step.output!.slice(0, 500)}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-zinc-900 pointer-events-none" />
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowOutputDialog(step.id); }}
                        className="text-xs text-violet-400 hover:text-violet-300 mt-1"
                      >
                        Ver completo
                      </button>
                    </div>
                  )}

                  {/* Expanded Output (completed pipeline or manually expanded) */}
                  {showExpanded && hasOutput && !isCheckpointActive && (
                    <div className="px-4 pb-4 border-t border-zinc-800 mt-0 pt-3">
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {step.output!}
                        </ReactMarkdown>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-800/50">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowOutputDialog(step.id); }}
                          className="text-xs text-violet-400 hover:text-violet-300"
                        >
                          Ver completo
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyStepOutput(step.output!); }}
                          className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> Copiar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Checkpoint UI (active checkpoint) */}
                  {isCheckpointActive && (
                    <div className="px-4 pb-4 border-t border-zinc-800 mt-0 pt-3 space-y-4">
                      {/* Previous step output */}
                      {checkpointPrevStep?.output && (
                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                          <p className="text-xs text-zinc-500 mb-2 font-medium">
                            Resultado del paso anterior: {checkpointPrevStep.name || `Paso ${checkpointPrevStep.order_index + 1}`}
                          </p>
                          <div className="prose prose-invert prose-sm max-w-none max-h-[300px] overflow-y-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {checkpointPrevStep.output}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}

                      {/* Approve */}
                      <div className="flex flex-col gap-3">
                        <Button
                          onClick={() => handleApprove(step.id)}
                          disabled={approving}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white w-full"
                        >
                          {approving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                          Aprobar y continuar
                        </Button>

                        {/* Reject with feedback */}
                        <div className="space-y-2">
                          <Textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="Escribe tu feedback para rechazar y re-ejecutar el paso anterior..."
                            className="bg-zinc-950 border-zinc-800 text-zinc-200 text-sm resize-none h-20"
                          />
                          <Button
                            variant="outline"
                            onClick={() => handleReject(step.id)}
                            disabled={rejecting || !feedback.trim()}
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 w-full"
                          >
                            {rejecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                            Rechazar y re-ejecutar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Connecting Line */}
                {showLine && (
                  <div className={`w-0.5 h-8 mx-auto ${lineColor}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Task metadata */}
      {(task.total_tokens > 0 || task.total_duration > 0) && !isActive && (
        <div className="flex items-center gap-4 text-xs text-zinc-500 mt-4">
          {task.total_tokens > 0 && (
            <span className="flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" />
              {formatTokens(task.total_tokens)} tokens totales
            </span>
          )}
          {task.total_duration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatTime(task.total_duration)} duracion total
            </span>
          )}
        </div>
      )}

      {/* Progress Bar (sticky bottom) */}
      {isActive && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800">
          <div className="max-w-4xl mx-auto px-8 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                  <span className="font-medium">Paso {completedSteps}/{totalSteps}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-400 shrink-0">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatTime(task.total_duration || 0)}
                </span>
                <span className="flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5" />
                  {formatTokens(task.total_tokens || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Output Dialog */}
      <Dialog open={!!showOutputDialog} onOpenChange={(open) => { if (!open) setShowOutputDialog(null); }}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[80vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="text-lg text-zinc-50">
                {dialogStep?.name || `Paso ${(dialogStep?.order_index ?? 0) + 1}`}
              </DialogTitle>
              {dialogStep?.output && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyStepOutput(dialogStep.output!)}
                  className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  Copiar
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {dialogStep?.output ? (
              <div className="prose prose-invert prose-sm max-w-none p-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {dialogStep.output}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-8">Sin output disponible</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
