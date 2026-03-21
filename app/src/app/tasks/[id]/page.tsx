"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Loader2, ArrowLeft, Bot, ShieldCheck, GitMerge,
  ChevronDown, ChevronRight, Copy, Download, Play,
  XCircle, Clock, Coins, CheckCircle2, AlertCircle,
  CalendarClock, RotateCcw, Package, Trash2,
  Workflow, GitFork, Combine
} from 'lucide-react';
import { formatNextExecution } from '@/lib/schedule-utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';

// --------------- Types ---------------

interface TaskStepDetail {
  id: string;
  task_id: string;
  order_index: number;
  type: 'agent' | 'checkpoint' | 'merge' | 'canvas' | 'fork' | 'join';
  name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  agent_model: string | null;
  instructions: string | null;
  context_mode: string;
  canvas_id: string | null;
  fork_group: string | null;
  branch_index: number | null;
  branch_label: string | null;
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
  execution_mode: 'single' | 'variable' | 'scheduled';
  execution_count: number;
  run_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  schedule_config: string | null;
}

interface CanvasProgress {
  canvas_run_id: string;
  canvas_name: string;
  total_nodes: number;
  completed_nodes: number;
  current_node_name: string | null;
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
  canvas_progress?: CanvasProgress;
}

interface StatusResponse {
  status: string;
  current_step_index: number;
  elapsed_time: number;
  total_tokens: number;
  total_duration: number;
  execution_mode: string | null;
  execution_count: number;
  run_count: number;
  steps: StatusStep[];
}

// --------------- Constants ---------------

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  configuring: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ready: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  running: 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const STEP_STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  running: 'bg-violet-500/10 text-violet-400 border-violet-500/20 animate-pulse',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  skipped: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
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
    case 'canvas': return Workflow;
    case 'fork': return GitFork;
    case 'join': return Combine;
    default: return Bot;
  }
}

// --------------- Export Section ---------------

interface ExportBundle {
  id: string;
  name: string;
  bundle_path: string;
  created_at: string;
  manifest?: {
    task: { name: string };
    agents: { id: string }[];
    skills: { id: string }[];
    canvases: { id: string }[];
    services: string[];
  };
}

function ExportSection({ taskId, t }: { taskId: string; t: (key: string, values?: Record<string, string | number | boolean>) => string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [bundles, setBundles] = useState<ExportBundle[]>([]);
  const [generating, setGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchBundles = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/exports`);
      if (!res.ok) return;
      const data = await res.json();
      setBundles(data.bundles || []);
    } catch { /* silently fail */ }
    finally { setLoaded(true); }
  }, [taskId]);

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !loaded) {
      fetchBundles();
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/export`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('export.generated'));
      await fetchBundles();
    } catch {
      toast.error(t('export.error'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (bundleId: string) => {
    if (!confirm(t('export.delete_confirm'))) return;
    setDeleting(bundleId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/exports/${bundleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('export.deleted'));
      setBundles(prev => prev.filter(b => b.id !== bundleId));
    } catch {
      toast.error(t('export.error'));
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = (bundleId: string) => {
    window.open(`/api/tasks/${taskId}/exports/${bundleId}/download`, '_blank');
  };

  // Get resource counts from latest bundle manifest
  const latestManifest = bundles.length > 0 ? bundles[0].manifest : null;
  const agentCount = latestManifest?.agents?.length ?? 0;
  const skillCount = latestManifest?.skills?.length ?? 0;
  const canvasCount = latestManifest?.canvases?.length ?? 0;
  const services = latestManifest?.services ?? [];

  return (
    <div className="mt-8 rounded-lg border border-border/50 bg-card/50 overflow-hidden">
      {/* Header - clickable toggle */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Package className="w-4 h-4 text-violet-400" />
          {t('export.title')}
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-zinc-500" />
          : <ChevronRight className="w-4 h-4 text-zinc-500" />
        }
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800">
          {/* Description */}
          <p className="text-sm text-zinc-400 mt-3">{t('export.description')}</p>

          {/* Resource summary (only if we have manifest data) */}
          {latestManifest && (
            <>
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">{t('export.resources')}</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-zinc-900 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-zinc-100">{agentCount}</div>
                    <div className="text-xs text-zinc-500">{t('export.agents')}</div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-zinc-100">{skillCount}</div>
                    <div className="text-xs text-zinc-500">{t('export.skills')}</div>
                  </div>
                  <div className="bg-zinc-900 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-zinc-100">{canvasCount}</div>
                    <div className="text-xs text-zinc-500">{t('export.canvases')}</div>
                  </div>
                </div>
              </div>

              {/* Required services */}
              {services.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-2">{t('export.services')}</p>
                  <div className="flex flex-wrap gap-2">
                    {services.map((svc: string) => (
                      <Badge key={svc} variant="outline" className="text-xs border-violet-500/30 text-violet-400">
                        {svc}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white w-full"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t('export.generating')}</>
              : <><Package className="w-4 h-4 mr-2" />{t('export.generate')}</>
            }
          </Button>

          {/* Bundle list */}
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-2">{t('export.bundles')}</p>
            {loaded && bundles.length === 0 && (
              <p className="text-sm text-zinc-500 italic">{t('export.no_bundles')}</p>
            )}
            {bundles.length > 0 && (
              <div className="space-y-2">
                {bundles.map(bundle => (
                  <div key={bundle.id} className="flex items-center justify-between bg-zinc-900 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{bundle.name}</p>
                      <p className="text-xs text-zinc-500">
                        {new Date(bundle.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(bundle.id)}
                        className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
                        title={t('export.download')}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(bundle.id)}
                        disabled={deleting === bundle.id}
                        className="text-zinc-400 hover:text-red-400 h-8 px-2"
                        title={t('export.delete')}
                      >
                        {deleting === bundle.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />
                        }
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --------------- Component ---------------

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const t = useTranslations('tasks');

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showOutputDialog, setShowOutputDialog] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reExecuting, setReExecuting] = useState(false);
  const [scheduleActive, setScheduleActive] = useState(false);

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
      toast.error(t('toasts.taskLoadError'));
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

  // --------------- Schedule state sync ---------------

  useEffect(() => {
    if (task?.schedule_config) {
      try {
        const config = JSON.parse(task.schedule_config);
        setScheduleActive(config.is_active ?? false);
      } catch { /* ignore parse errors */ }
    }
  }, [task?.schedule_config]);

  const handleScheduleToggle = async (active: boolean) => {
    const res = await fetch(`/api/tasks/${task!.id}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    });
    if (res.ok) {
      setScheduleActive(active);
      fetchFullTask();
      toast.success(active ? t('detail.scheduleActivated') : t('detail.scheduleDeactivated'));
    } else {
      toast.error(t('detail.scheduleToggleError'));
    }
  };

  // --------------- Actions ---------------

  const handleApprove = async (stepId: string) => {
    setApproving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps/${stepId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toasts.checkpointApproved'));
    } catch {
      toast.error(t('toasts.checkpointApproveError'));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (stepId: string) => {
    if (!feedback.trim()) {
      toast.error(t('toasts.feedbackRequired'));
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
      toast.success(t('toasts.checkpointRejected'));
      setFeedback('');
    } catch {
      toast.error(t('toasts.checkpointRejectError'));
    } finally {
      setRejecting(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toasts.cancelled'));
      await fetchFullTask();
    } catch {
      toast.error(t('toasts.cancelError'));
    } finally {
      setCancelling(false);
    }
  };

  const handleReExecute = async () => {
    setReExecuting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/execute`, { method: 'POST' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toasts.reExecuted'));
      await fetchFullTask();
    } catch {
      toast.error(t('toasts.reExecuteError'));
    } finally {
      setReExecuting(false);
    }
  };

  const handleCopyResult = async () => {
    // Use result_output, or fallback to last completed step's output
    let content = task?.result_output;
    if (!content && task?.steps) {
      const lastCompleted = [...task.steps].reverse().find(s => s.status === 'completed' && s.output);
      content = lastCompleted?.output || null;
    }
    if (!content) {
      toast.error(t('toasts.noCopyContent'));
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
      } else {
        // Fallback for HTTP (no HTTPS)
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success(t('toasts.copied'));
    } catch {
      toast.error(t('toasts.copyError'));
    }
  };

  const handleDownloadResult = () => {
    if (!task?.result_output) return;
    const blob = new Blob([task.result_output], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${task.name || 'result'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyStepOutput = async (output: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(output);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = output;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      toast.success(t('toasts.copied'));
    } catch {
      toast.error(t('toasts.copyError'));
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
        <h2 className="text-xl font-semibold text-zinc-200 mb-2">{t('detail.notFound')}</h2>
        <Link href="/tasks" className="text-violet-400 hover:text-violet-300 text-sm">
          {t('detail.backToTasks')}
        </Link>
      </div>
    );
  }

  const taskStatusClass = STATUS_CLASSES[task.status] || STATUS_CLASSES.draft;

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
          {t('detail.backToTasks')}
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-zinc-50 truncate">{task.name}</h1>
              <Badge variant="outline" className={`shrink-0 text-xs border ${taskStatusClass}`}>
                {t(`status.${task.status}`)}
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
                {t('detail.cancel')}
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
                {t('detail.reExecute')}
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
            <p className="text-sm font-medium">{t('detail.failedBanner')}</p>
          </div>
        </div>
      )}

      {/* Cycle progress (variable mode) */}
      {task.execution_mode === 'variable' && (
        <div className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-2 mb-6">
          <div className="flex items-center gap-2 text-sm font-medium">
            <RotateCcw className="w-4 h-4" />
            {t('detail.cycleProgress')}
          </div>
          <div className="text-sm text-muted-foreground">
            {t('detail.cycleCount', { current: task.run_count, total: task.execution_count })}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${task.execution_count > 0 ? (task.run_count / task.execution_count) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* Schedule info (scheduled mode) */}
      {task.execution_mode === 'scheduled' && (
        <div className="rounded-lg border border-border/50 bg-card/50 p-4 space-y-3 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="w-4 h-4" />
              {t('detail.schedule')}
            </div>
            <Switch checked={scheduleActive} onCheckedChange={handleScheduleToggle} />
          </div>
          {scheduleActive && task.next_run_at && (
            <div className="text-sm text-muted-foreground">
              {t('detail.nextRun')}: {formatNextExecution(new Date(task.next_run_at), 'es-ES')}
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {t('detail.totalRuns')}: {task.run_count}
          </div>
        </div>
      )}

      {/* Completion result */}
      {isCompleted && (task.result_output || task.steps.some(s => s.status === 'completed' && s.output)) && (
        <div className="bg-zinc-900 border border-emerald-500/20 rounded-lg mb-8">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t('detail.finalResult')}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadResult}
                className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
              >
                <Download className="w-4 h-4 mr-1" />
                {t('detail.downloadMd')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyResult}
                className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
              >
                <Copy className="w-4 h-4 mr-1" />
                {t('detail.copy')}
              </Button>
              <Button
                size="sm"
                onClick={handleReExecute}
                disabled={reExecuting}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white h-8 px-3"
              >
                {reExecuting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                {t('detail.reExecute')}
              </Button>
            </div>
          </div>
          <div className="p-4 prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {task.result_output || [...task.steps].reverse().find(s => s.status === 'completed' && s.output)?.output || t('detail.noResult')}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Pipeline View */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">{t('detail.pipeline')}</h2>

        <div className="space-y-0">
          {task.steps.map((step, idx) => {
            const StepIcon = getStepIcon(step.type);
            const stepStatusClass = STEP_STATUS_CLASSES[step.status] || STEP_STATUS_CLASSES.pending;
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
                          {step.name || `${t(`stepTypes.${step.type}`)} ${idx + 1}`}
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
                      <Badge variant="outline" className={`text-xs border ${stepStatusClass}`}>
                        {isRunning && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                        {t(`stepStatus.${step.status}`)}
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
                        {t('detail.viewFull')}
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
                          {t('detail.viewFull')}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyStepOutput(step.output!); }}
                          className="text-xs text-zinc-400 hover:text-zinc-300 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" /> {t('detail.copy')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Checkpoint UI (active checkpoint) */}
                  {isCheckpointActive && (
                    <div className="px-5 pb-5 border-t border-zinc-800 mt-0 pt-4 space-y-4">
                      {/* Previous step output */}
                      {checkpointPrevStep?.output && (
                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
                          <p className="text-xs text-zinc-500 mb-2 font-medium">
                            {t('detail.previousStepResult', { name: checkpointPrevStep.name || `${t('stepTypes.agent')} ${checkpointPrevStep.order_index + 1}` })}
                          </p>
                          <div className="prose prose-invert prose-sm max-w-none max-h-[400px] overflow-y-auto scroll-smooth">
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
                          {t('detail.approveAndContinue')}
                        </Button>

                        {/* Reject with feedback */}
                        <div className="space-y-2">
                          <Textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder={t('detail.rejectFeedbackPlaceholder')}
                            className="bg-zinc-950 border-zinc-800 text-zinc-200 text-sm resize-y min-h-[100px]"
                            rows={4}
                          />
                          <Button
                            variant="outline"
                            onClick={() => handleReject(step.id)}
                            disabled={rejecting || !feedback.trim()}
                            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 w-full"
                          >
                            {rejecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
                            {t('detail.rejectAndReExecute')}
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
              {t('detail.totalTokens', { count: formatTokens(task.total_tokens) })}
            </span>
          )}
          {task.total_duration > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {t('detail.totalDuration', { time: formatTime(task.total_duration) })}
            </span>
          )}
        </div>
      )}

      {/* Export Section */}
      <ExportSection taskId={task.id} t={t} />

      {/* Progress Bar (sticky bottom) */}
      {isActive && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950 border-t border-zinc-800">
          <div className="max-w-4xl mx-auto px-8 py-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                  <span className="font-medium">{t('detail.stepProgress', { completed: completedSteps, total: totalSteps })}</span>
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
                {dialogStep?.name || t('detail.stepDialogTitle', { index: (dialogStep?.order_index ?? 0) + 1 })}
              </DialogTitle>
              {dialogStep?.output && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyStepOutput(dialogStep.output!)}
                  className="text-zinc-400 hover:text-zinc-50 h-8 px-2"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  {t('detail.copy')}
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
              <p className="text-zinc-500 text-sm text-center py-8">{t('detail.noOutput')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
