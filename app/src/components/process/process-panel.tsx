"use client";

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Project, Source, ProcessingRun, Skill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, FileText, Link as LinkIcon, Youtube, StickyNote, Play, XCircle, Download, RefreshCw, Cpu, BookOpen, EyeOff, Sparkles, AlertTriangle, Info, CheckCircle2, Square } from 'lucide-react';
import Image from 'next/image';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AgentCreator } from '@/components/agents/agent-creator';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { AgentListSelector } from '@/components/agents/agent-list-selector';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSSEStream } from '@/hooks/use-sse-stream';
import { CatPawWithCounts } from '@/lib/types/catpaw';

interface ProcessPanelProps {
  project: Project;
  onProjectUpdate: () => void;
  onNavigateToHistory?: () => void;
  isStale?: boolean;
}

export function ProcessPanel({ project, onProjectUpdate, onNavigateToHistory, isStale }: ProcessPanelProps) {
  const t = useTranslations('process');
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceModes, setSourceModes] = useState<Record<string, 'process' | 'direct' | 'exclude'>>({});
  const [instructions, setInstructions] = useState('');
  const [useLocalProcessing, setUseLocalProcessing] = useState(true);
  const [modelGroups, setModelGroups] = useState<{ provider: string; name: string; models: string[] }[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [activeRun, setActiveRun] = useState<ProcessingRun | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const [agents, setAgents] = useState<{ id: string, name: string, emoji: string, model: string, description?: string }[]>([]);
  const [processorPaws, setProcessorPaws] = useState<CatPawWithCounts[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [processMode, setProcessMode] = useState<'agent' | 'catpaw-processor'>('agent');
  const [selectedProcessorId, setSelectedProcessorId] = useState<string>('');

  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>(project.agent_id || 'none');
  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // SSE streaming state (local processing only)
  const [streamingContent, setStreamingContent] = useState('');
  const [currentStage, setCurrentStage] = useState<{ stage: string; message: string } | null>(null);
  const streamingContentRef = useRef('');
  const streamingPreviewRef = useRef<HTMLDivElement>(null);

  const { start: startStream, stop: stopStream, isStreaming } = useSSEStream({
    onToken: (token) => {
      streamingContentRef.current += token;
      setStreamingContent(streamingContentRef.current);
    },
    onStage: (data) => {
      setCurrentStage(data);
    },
    onDone: (data) => {
      const d = data as Record<string, unknown>;
      const usage = d.usage as Record<string, unknown> | undefined;
      setActiveRun(prev => prev ? {
        ...prev,
        status: 'completed',
        tokens_used: (usage?.total_tokens as number) || null,
        completed_at: new Date().toISOString(),
      } : null);
      setStreamingContent('');
      streamingContentRef.current = '';
      setCurrentStage(null);
      setIsPolling(false);
      onProjectUpdate();
      toast.success(t('toast.completed'));
    },
    onError: (error) => {
      setActiveRun(prev => prev ? {
        ...prev,
        status: 'failed',
        error_log: error.message,
        completed_at: new Date().toISOString(),
      } : null);
      setStreamingContent('');
      streamingContentRef.current = '';
      setCurrentStage(null);
      setIsPolling(false);
      toast.error(`Error: ${error.message}`);
    },
  });

  // Auto-scroll streaming preview
  useEffect(() => {
    if (streamingPreviewRef.current) {
      streamingPreviewRef.current.scrollTop = streamingPreviewRef.current.scrollHeight;
    }
  }, [streamingContent]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sourcesRes, agentsRes, modelsRes, statusRes, processorPawsRes, skillsRes] = await Promise.all([
          fetch(`/api/catbrains/${project.id}/sources`),
          fetch('/api/cat-paws'),
          fetch('/api/settings/models'),
          fetch(`/api/catbrains/${project.id}/process/status`),
          fetch('/api/cat-paws?mode=processor'),
          fetch('/api/skills')
        ]);

        if (sourcesRes.ok) {
          const data = await sourcesRes.json();
          setSources(data);
          const modes: Record<string, 'process' | 'direct' | 'exclude'> = {};
          data.forEach((s: Source) => { modes[s.id] = (s.process_mode as 'process' | 'direct' | 'exclude') || 'process'; });
          setSourceModes(modes);
        }

        if (agentsRes.ok) {
          setAgents(await agentsRes.json());
        }

        if (modelsRes.ok) {
          const groups = await modelsRes.json();
          if (Array.isArray(groups)) setModelGroups(groups);
        }

        if (processorPawsRes.ok) {
          setProcessorPaws(await processorPawsRes.json());
        }

        if (skillsRes.ok) {
          setSkills(await skillsRes.json());
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.status !== 'none') {
            setActiveRun(statusData);
            if (statusData.status === 'queued' || statusData.status === 'running') {
              setIsPolling(true);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [project.id]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isPolling) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/catbrains/${project.id}/process/status`);
          if (res.ok) {
            const data = await res.json();
            setActiveRun(data);

            if (data.status === 'completed' || data.status === 'failed') {
              setIsPolling(false);
              onProjectUpdate();

              if (data.status === 'completed') {
                toast.success(t('toast.completed'));
                fetchPreview(data.version);
              } else {
                toast.error(t('toast.error'));
              }
            }
          }
        } catch (error) {
          console.error('Error polling status:', error);
        }
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPolling, project.id, onProjectUpdate]);

  // Timer for elapsed seconds during processing
  useEffect(() => {
    if (isPolling) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPolling]);

  const isProcessed = ['processed', 'rag_indexed'].includes(project.status || '');
  const processCount = Object.values(sourceModes).filter(m => m === 'process').length;
  const directCount = Object.values(sourceModes).filter(m => m === 'direct').length;
  const excludeCount = Object.values(sourceModes).filter(m => m === 'exclude').length;
  const activeCount = processCount + directCount;

  const updateSourceMode = async (sourceId: string, mode: 'process' | 'direct' | 'exclude') => {
    setSourceModes(prev => ({ ...prev, [sourceId]: mode }));
    try {
      await fetch(`/api/catbrains/${project.id}/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process_mode: mode })
      });
    } catch { /* silent */ }
  };

  const setAllModes = (mode: 'process' | 'direct' | 'exclude') => {
    const newModes: Record<string, 'process' | 'direct' | 'exclude'> = {};
    sources.forEach(s => { newModes[s.id] = mode; });
    setSourceModes(newModes);
    // Batch update - fire and forget
    sources.forEach(s => {
      fetch(`/api/catbrains/${project.id}/sources/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process_mode: mode })
      }).catch(() => {});
    });
  };

  const getProcessingLogs = () => {
    const logs: { text: string; done: boolean }[] = [];
    const srcCount = activeCount || sources.length;
    const modelName = selectedModel || currentAgent?.model || 'LLM';

    logs.push({ text: t('logs.readingSources', { count: srcCount }), done: elapsedSeconds >= 3 });
    if (elapsedSeconds >= 3) {
      logs.push({ text: t('logs.sendingToModel', { model: modelName }), done: elapsedSeconds >= 10 });
    }
    if (elapsedSeconds >= 10) {
      logs.push({ text: t('logs.generatingDocument'), done: false });
    }
    return logs;
  };

  const fetchPreview = async (version: number) => {
    try {
      const res = await fetch(`/api/catbrains/${project.id}/process/${version}/output`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error fetching preview:', error);
    }
  };

  const handleUpdateAgent = async () => {
    try {
      setIsUpdatingAgent(true);
      const newAgentId = selectedAgent === 'none' ? null : selectedAgent;

      const res = await fetch(`/api/catbrains/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: newAgentId })
      });

      if (!res.ok) throw new Error('Error al actualizar agente');

      toast.success(t('toast.agentUpdated'));
      setShowAgentDialog(false);
      onProjectUpdate();
    } catch (error) {
      toast.error(t('toast.agentUpdateError'));
      console.error(error);
    } finally {
      setIsUpdatingAgent(false);
    }
  };

  const selectedProcessor = processorPaws.find(w => w.id === selectedProcessorId);

  const handleProcess = async () => {
    if (processMode === 'catpaw-processor' && !selectedProcessorId) {
      toast.error(t('validation.selectProcessor'));
      return;
    }

    if (activeCount === 0) {
      toast.error(t('validation.selectSource'));
      return;
    }

    const processedSources = Object.entries(sourceModes).filter(([, m]) => m === 'process').map(([id]) => id);
    const directSources = Object.entries(sourceModes).filter(([, m]) => m === 'direct').map(([id]) => id);

    // Agent required only when there are sources to process with LLM (not pass-through)
    const needsAgent = processMode === 'agent' && (processedSources.length > 0 || instructions.trim().length > 0 || selectedSkillIds.length > 0);
    if (needsAgent && !project.agent_id) {
      toast.error(t('validation.assignAgent'));
      return;
    }

    // SSE streaming path for local processing
    if (useLocalProcessing) {
      streamingContentRef.current = '';
      setStreamingContent('');
      setCurrentStage(null);

      setActiveRun({
        id: 'streaming',
        project_id: project.id,
        version: (project.current_version || 0) + 1,
        agent_id: processMode === 'agent' ? project.agent_id : null,
        worker_id: processMode === 'catpaw-processor' ? selectedProcessorId : null,
        skill_ids: selectedSkillIds.length > 0 ? JSON.stringify(selectedSkillIds) : null,
        status: 'running',
        input_sources: JSON.stringify([...processedSources, ...directSources]),
        output_path: null,
        output_format: 'md',
        tokens_used: null,
        duration_seconds: null,
        error_log: null,
        instructions,
        started_at: new Date().toISOString(),
        completed_at: null
      });

      startStream(`/api/catbrains/${project.id}/process`, {
        sourceIds: [...processedSources, ...directSources],
        processedSources,
        directSources,
        instructions,
        useLocalProcessing: true,
        model: selectedModel,
        mode: processMode,
        processor_paw_id: processMode === 'catpaw-processor' ? selectedProcessorId : undefined,
        skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined,
      });

      onProjectUpdate();
      toast.success(t('toast.startedStreaming'));
      return;
    }

    // Non-streaming path (n8n mode) — JSON + polling
    try {
      const res = await fetch(`/api/catbrains/${project.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: [...processedSources, ...directSources],
          processedSources,
          directSources,
          instructions,
          useLocalProcessing,
          model: selectedModel,
          mode: processMode,
          processor_paw_id: processMode === 'catpaw-processor' ? selectedProcessorId : undefined,
          skill_ids: selectedSkillIds.length > 0 ? selectedSkillIds : undefined
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al iniciar el procesamiento');
      }

      const data = await res.json();

      setActiveRun({
        id: data.runId,
        project_id: project.id,
        version: data.version,
        agent_id: processMode === 'agent' ? project.agent_id : null,
        worker_id: processMode === 'catpaw-processor' ? selectedProcessorId : null,
        skill_ids: selectedSkillIds.length > 0 ? JSON.stringify(selectedSkillIds) : null,
        status: 'queued',
        input_sources: JSON.stringify([...processedSources, ...directSources]),
        output_path: null,
        output_format: 'md',
        tokens_used: null,
        duration_seconds: null,
        error_log: null,
        instructions,
        started_at: new Date().toISOString(),
        completed_at: null
      });

      setIsPolling(true);
      onProjectUpdate();
      toast.success(t('toast.started'));
    } catch (error: unknown) {
      toast.error((error as Error).message);
    }
  };

  const handleCancel = async () => {
    if (!activeRun) return;

    try {
      // In a real app, we might want to tell n8n to cancel, but for now we just mark it as failed locally
      await fetch(`/api/catbrains/${project.id}/process/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: activeRun.id,
          status: 'failed',
          error_log: t('cancelledByUser')
        })
      });

      setIsPolling(false);
      setActiveRun(prev => prev ? { ...prev, status: 'failed', error_log: t('cancelledByUser') } : null);
      onProjectUpdate();
      toast.info(t('toast.cancelled'));
    } catch (error) {
      console.error('Error canceling:', error);
    }
  };

  const handleDownload = () => {
    if (!previewContent) return;

    const blob = new Blob([previewContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(project?.name || 'documento').replace(/\s+/g, '_').toLowerCase()}_v${activeRun?.version || project.current_version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'file': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'url': return <LinkIcon className="w-4 h-4 text-green-500" />;
      case 'youtube': return <Youtube className="w-4 h-4 text-red-500" />;
      case 'note': return <StickyNote className="w-4 h-4 text-purple-500" />;
      default: return <FileText className="w-4 h-4 text-zinc-500" />;
    }
  };

  const currentAgent = agents.find((a: { id: string, name: string, emoji: string, model: string, description?: string }) => a.id === project?.agent_id);

  const flatModels = modelGroups.flatMap(g => g.models);

  useEffect(() => {
    if (currentAgent && !selectedModel) {
      setSelectedModel(currentAgent.model);
    } else if (!selectedModel && flatModels.length > 0) {
      setSelectedModel(flatModels[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAgent, flatModels.length, selectedModel]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (activeRun && (activeRun.status === 'queued' || activeRun.status === 'running')) {
    const logs = getProcessingLogs();
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-16 h-16 animate-spin text-violet-500 mb-6" />
          <h3 className="text-xl font-semibold text-zinc-50 mb-2">
            {t('processing.title', { name: activeRun?.worker_id ? (processorPaws.find(w => w.id === activeRun.worker_id)?.name || 'CatPaw Procesador') : (currentAgent?.name || 'Agente IA') })}
          </h3>
          <p className="text-zinc-400 mb-4">
            {isStreaming ? t('processing.streaming') : t('processing.waiting')}
          </p>

          {/* SSE streaming: stage indicators */}
          {isStreaming && currentStage && (
            <div className="mb-4 flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-zinc-300">{currentStage.message}</span>
            </div>
          )}

          {/* SSE streaming: live content preview */}
          {isStreaming && streamingContent && (
            <div ref={streamingPreviewRef} className="w-full max-w-2xl max-h-[300px] overflow-y-auto rounded-lg bg-zinc-950 border border-zinc-800 p-4 mb-6">
              <div className="prose prose-invert prose-sm max-w-none streaming-cursor">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Non-streaming (n8n polling): timer + fake logs */}
          {!isStreaming && (
            <>
              <p className="text-xs text-zinc-500 mb-6">{t('processing.elapsed', { minutes: Math.floor(elapsedSeconds / 60), seconds: (elapsedSeconds % 60).toString().padStart(2, '0') })}</p>

              <div className="w-full max-w-md bg-zinc-950 rounded-full h-2 mb-6 overflow-hidden">
                <div className="bg-violet-500 h-full w-full animate-pulse origin-left"></div>
              </div>

              <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 text-left">
                <p className="text-xs font-mono text-zinc-500 mb-2">{t('processing.logTitle')}</p>
                <div className="space-y-1 text-xs font-mono text-zinc-400 max-h-32 overflow-y-auto">
                  {logs.map((log, i) => (
                    <p key={i} className={log.done ? 'text-emerald-400' : 'text-violet-400 animate-pulse'}>
                      {log.done ? '\u2713' : '\u27F3'} {log.text}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Stop/Cancel button */}
          {isStreaming ? (
            <Button variant="outline" onClick={stopStream} className="border-red-500/50 text-red-400 hover:bg-red-500/10">
              <Square className="w-4 h-4 mr-2 fill-current" />
              {t('buttons.stopGeneration')}
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleCancel} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">
              <XCircle className="w-4 h-4 mr-2" />
              {t('buttons.cancelProcessing')}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {activeRun?.status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-red-500 font-medium mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                {t('error.title')}
              </h4>
              <p className="text-sm text-red-400/80 whitespace-pre-wrap font-mono bg-red-950/50 p-3 rounded mb-3 max-h-40 overflow-y-auto">
                {activeRun.error_log || t('error.unknown')}
              </p>
              <p className="text-sm text-zinc-400">
                {t('error.suggestions')}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={handleProcess}
              className="bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('buttons.retry')}
            </Button>
          </div>
        </div>
      )}

      {activeRun?.status === 'completed' && !showPreview && previewContent && (
        <Card className="bg-zinc-900 border-emerald-500/30 mb-6 overflow-hidden">
          <div className="bg-emerald-500/10 px-6 py-4 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-emerald-500">{t('success.title')}</h3>
                <p className="text-sm text-emerald-500/70">Versión {activeRun.version}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowPreview(true)} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800">
                {t('buttons.viewFull')}
              </Button>
              <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <Download className="w-4 h-4 mr-2" />
                {t('buttons.downloadMd')}
              </Button>
              {onNavigateToHistory && (
                <Button onClick={onNavigateToHistory} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
                  {t('buttons.viewHistory')}
                </Button>
              )}
            </div>
          </div>
          <div className="p-6 max-h-60 overflow-y-hidden relative">
            <div className="prose prose-invert prose-sm max-w-none opacity-70">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {previewContent.substring(0, 500) + '...'}
              </ReactMarkdown>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-900 to-transparent pointer-events-none"></div>
          </div>
        </Card>
      )}

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setProcessMode('agent')}
          className={`p-4 rounded-lg border text-left transition-colors ${processMode === 'agent' ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800/50'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Bot className={`w-5 h-5 ${processMode === 'agent' ? 'text-violet-400' : 'text-zinc-500'}`} />
            <span className={`font-medium text-sm ${processMode === 'agent' ? 'text-violet-300' : 'text-zinc-300'}`}>{t('modes.agent')}</span>
          </div>
          <p className="text-xs text-zinc-500">{t('modes.agentDesc')}</p>
        </button>
        <button
          onClick={() => setProcessMode('catpaw-processor')}
          className={`p-4 rounded-lg border text-left transition-colors ${processMode === 'catpaw-processor' ? 'border-violet-500 bg-violet-500/5' : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800/50'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Image src="/Images/icon/catpaw.png" alt="CatPaw" width={20} height={20} className={`${processMode === 'catpaw-processor' ? 'opacity-100' : 'opacity-50'}`} />
            <span className={`font-medium text-sm ${processMode === 'catpaw-processor' ? 'text-violet-300' : 'text-zinc-300'}`}>{t('modes.catpaw')}</span>
          </div>
          <p className="text-xs text-zinc-500">{t('modes.catpawDesc')}</p>
        </button>
      </div>

      {/* Agent mode: Agent + Config */}
      {processMode === 'agent' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{t('config.agentTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {currentAgent ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <span className="text-xl">{currentAgent.emoji}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-50 text-sm truncate">{currentAgent.name}</p>
                      <p className="text-xs text-zinc-500">{currentAgent.model}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedAgent(project.agent_id || 'none'); setShowAgentDialog(true); }} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 flex-shrink-0">
                    {t('buttons.change')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Bot className="w-8 h-8 text-zinc-600 flex-shrink-0" />
                  <p className="text-sm text-zinc-400 flex-1">{t('config.noAgent')}</p>
                  <Button size="sm" onClick={() => { setSelectedAgent('none'); setShowAgentDialog(true); }} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white flex-shrink-0">
                    {t('buttons.assign')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{t('config.configTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="local-processing" checked={useLocalProcessing} onCheckedChange={(checked) => setUseLocalProcessing(checked as boolean)} className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500" />
                <label htmlFor="local-processing" className="text-sm text-zinc-200 cursor-pointer">{t('config.localProcessing')}</label>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">{t('config.llmModel')}</Label>
                <Select value={selectedModel} onValueChange={(v) => v && setSelectedModel(v)}>
                  <SelectTrigger className="h-9 bg-zinc-950 border-zinc-800 text-zinc-50 text-sm"><SelectValue placeholder={t('config.selectModel')} /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                    {modelGroups.length > 0 ? modelGroups.map(group => (
                      <SelectGroup key={group.provider}>
                        <SelectLabel className="text-zinc-500 text-xs">{group.name}</SelectLabel>
                        {group.models.map(m => (<SelectItem key={`${group.provider}::${m}`} value={m}>{m}</SelectItem>))}
                      </SelectGroup>
                    )) : (<SelectItem value="gemini-main">gemini-main</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* CatPaw Processor mode */}
      {processMode === 'catpaw-processor' && (
        <div className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">{t('catpawSelector.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {processorPaws.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-sm">
                  {t('catpawSelector.empty')} <a href="/agents" className="text-violet-400 hover:underline">Ve a Agentes</a>
                </div>
              ) : (
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {processorPaws.map(paw => (
                    <button
                      key={paw.id}
                      onClick={() => {
                        setSelectedProcessorId(paw.id);
                        if (paw.model && !selectedModel) setSelectedModel(paw.model);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selectedProcessorId === paw.id ? 'bg-violet-500/10 border-l-2 border-violet-500' : 'hover:bg-zinc-800/50 border-l-2 border-transparent'}`}
                    >
                      <span className="text-lg">{paw.avatar_emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${selectedProcessorId === paw.id ? 'text-violet-300' : 'text-zinc-300'}`}>{paw.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{paw.description || t('catpawSelector.noDescription')}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] border flex-shrink-0 ${
                        paw.mode === 'processor' ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>{paw.mode}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox id="local-processing-w" checked={useLocalProcessing} onCheckedChange={(checked) => setUseLocalProcessing(checked as boolean)} className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500" />
                  <label htmlFor="local-processing-w" className="text-sm text-zinc-200 cursor-pointer">{t('config.localProcessing')}</label>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-4">
                <Label className="text-xs text-zinc-400 mb-1 block">{t('config.llmModel')}</Label>
                <Select value={selectedModel} onValueChange={(v) => v && setSelectedModel(v)}>
                  <SelectTrigger className="h-9 bg-zinc-950 border-zinc-800 text-zinc-50 text-sm"><SelectValue placeholder={t('config.selectModel')} /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                    {modelGroups.length > 0 ? modelGroups.map(group => (
                      <SelectGroup key={group.provider}>
                        <SelectLabel className="text-zinc-500 text-xs">{group.name}</SelectLabel>
                        {group.models.map(m => (<SelectItem key={`${group.provider}::${m}`} value={m}>{m}</SelectItem>))}
                      </SelectGroup>
                    )) : (<SelectItem value="gemini-main">gemini-main</SelectItem>)}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Contextual explanation */}
      {isStale ? (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 space-y-1">
            <p className="font-medium text-blue-400">{t('info.staleTitle')}</p>
            <p>{t('info.staleDesc')}</p>
            <p className="text-zinc-500">{t('info.staleNote')}</p>
          </div>
        </div>
      ) : isProcessed && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300">
            <p>{t('info.upToDate', { version: project.current_version })}</p>
          </div>
        </div>
      )}

      {/* Row 2: Sources with 3-state selector (full-width) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
              {t('sources.title', { count: sources.length })}
            </CardTitle>
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setAllModes('process')} className="text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 h-7 px-2">
                <Cpu className="w-3 h-3 mr-1" /> {t('buttons.allAi')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAllModes('direct')} className="text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2">
                <BookOpen className="w-3 h-3 mr-1" /> {t('buttons.allDirect')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAllModes('exclude')} className="text-xs text-zinc-500 hover:text-zinc-400 hover:bg-zinc-800 h-7 px-2">
                <EyeOff className="w-3 h-3 mr-1" /> {t('buttons.excludeAll')}
              </Button>
            </div>
          </div>
          {sources.length > 0 && (
            <>
              <p className="text-xs text-zinc-500 mt-1">
                {processCount > 0 && <span className="text-violet-400">{t('sources.processedByAi', { count: processCount })}</span>}
                {processCount > 0 && directCount > 0 && ' · '}
                {directCount > 0 && <span className="text-emerald-400">{t('sources.directContext', { count: directCount })}</span>}
                {(processCount > 0 || directCount > 0) && excludeCount > 0 && ' · '}
                {excludeCount > 0 && <span className="text-zinc-500">{t('sources.excluded', { count: excludeCount })}</span>}
              </p>
              {(() => {
                const activeSources = sources.filter(s => sourceModes[s.id] !== 'exclude');
                const totalBytes = activeSources.reduce((sum, s) => sum + (s.file_size || (s.content_text?.length || 200)), 0);
                const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
                const estTokens = Math.round(totalBytes / 4);
                const isHigh = estTokens > 200000;
                return (
                  <>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {t('sources.stats', { count: activeCount, size: totalBytes > 1024 * 1024 ? `${totalMB}MB` : `${Math.round(totalBytes / 1024)}KB`, tokens: estTokens > 1000 ? `${Math.round(estTokens / 1000)}K` : String(estTokens) })}
                    </p>
                    {isHigh && (
                      <div className="flex items-start gap-2 mt-2 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-400/80">
                          {t('warnings.highVolume')}
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-zinc-500 text-center py-4 text-sm">{t('sources.empty')}</p>
          ) : (
            <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
              {sources.map(source => {
                const mode = sourceModes[source.id] || 'process';
                return (
                  <div key={source.id} className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                    mode === 'process' ? 'bg-violet-500/5 border-l-2 border-violet-500' :
                    mode === 'direct' ? 'bg-emerald-500/5 border-l-2 border-emerald-500' :
                    'bg-zinc-900 border-l-2 border-zinc-700 opacity-50'
                  }`}>
                    {/* 3-state toggle buttons */}
                    <div className="flex gap-0.5 flex-shrink-0">
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => updateSourceMode(source.id, 'process')}
                          className={`p-1 rounded transition-colors ${mode === 'process' ? 'bg-violet-500/20 text-violet-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                          <Cpu className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px]">
                          <p className="font-medium">{t('tooltips.processAi')}</p>
                          <p className="text-xs text-zinc-400">{t('tooltips.processAiDesc')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => updateSourceMode(source.id, 'direct')}
                          className={`p-1 rounded transition-colors ${mode === 'direct' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px]">
                          <p className="font-medium">{t('tooltips.directContext')}</p>
                          <p className="text-xs text-zinc-400">{t('tooltips.directContextDesc')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          onClick={() => updateSourceMode(source.id, 'exclude')}
                          className={`p-1 rounded transition-colors ${mode === 'exclude' ? 'bg-zinc-700/50 text-zinc-400' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[200px]">
                          <p className="font-medium">{t('tooltips.exclude')}</p>
                          <p className="text-xs text-zinc-400">{t('tooltips.excludeDesc')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Source info */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getSourceIcon(source.type)}
                      <span className={`text-sm truncate ${mode === 'exclude' ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                        {(source.name || '').split('/').pop()}
                      </span>
                      <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-500 flex-shrink-0">
                        {source.type.toUpperCase()}
                      </Badge>
                      {source.file_size && (
                        <span className="text-[10px] text-zinc-600 flex-shrink-0">
                          {source.file_size > 1024 * 1024 ? `${(source.file_size / 1024 / 1024).toFixed(1)}MB` : `${Math.round(source.file_size / 1024)}KB`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skills selector */}
      {skills.length > 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {t('skills.title', { count: selectedSkillIds.length })}
              </CardTitle>
              {selectedSkillIds.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedSkillIds([])} className="text-xs text-zinc-500 hover:text-zinc-300 h-7 px-2">
                  {t('buttons.clear')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {skills.map(s => {
                const isSelected = selectedSkillIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSelectedSkillIds(prev =>
                        isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id]
                      );
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      isSelected
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isSelected && <Sparkles className="w-3 h-3" />}
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <div>
        <Label className="text-sm text-zinc-400 mb-2 block">
          {processMode === 'catpaw-processor' ? t('instructions.catpawLabel') : t('instructions.agentLabel')}
        </Label>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={processMode === 'catpaw-processor' ? t('instructions.catpawPlaceholder') : t('instructions.agentPlaceholder')}
          className="bg-zinc-950 border-zinc-800 text-zinc-50 min-h-[80px] resize-y"
        />
      </div>

      {/* CTA Button */}
      {(() => {
        // Pass-through: all sources are direct context, no instructions, no skills → no agent needed
        const isPassThrough = processMode === 'agent' && processCount === 0 && instructions.trim().length === 0 && selectedSkillIds.length === 0;
        const isAgentReady = processMode === 'agent' && (!!project.agent_id || isPassThrough);
        const isWorkerReady = processMode === 'catpaw-processor' && !!selectedProcessorId;
        const canProcess = (isAgentReady || isWorkerReady) && activeCount > 0 && sources.length > 0;
        const processorName = processMode === 'catpaw-processor' ? (selectedProcessor?.name || 'CatPaw') : isPassThrough ? 'Contexto Directo' : (currentAgent?.name || 'Agente');
        return (
          <>
            <Button
              size="lg"
              className="w-full h-14 text-lg bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white font-semibold"
              disabled={!canProcess}
              onClick={handleProcess}
            >
              <Play className="w-5 h-5 mr-2 fill-current" />
              {t('buttons.processWith', { name: processorName })}
            </Button>
            {!canProcess && (
              <p className="text-xs text-center text-zinc-500 -mt-3">
                {processMode === 'agent' && !project.agent_id && !isPassThrough ? t('cta.assignAgent') :
                 processMode === 'catpaw-processor' && !selectedProcessorId ? t('cta.selectProcessor') :
                 t('cta.selectSource')}
              </p>
            )}
          </>
        );
      })()}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl w-[95vw] h-[85vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-800 pb-4">
            <DialogTitle className="text-xl text-zinc-50">{t('preview.title', { version: activeRun?.version })}</DialogTitle>
            <Button onClick={handleDownload} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              <Download className="w-4 h-4 mr-2" />
              {t('buttons.downloadMd')}
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <article className="prose prose-invert prose-violet max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-a:text-violet-400 prose-strong:text-zinc-200 prose-code:text-violet-300 prose-pre:bg-zinc-900">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {previewContent}
              </ReactMarkdown>
            </article>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">Seleccionar Agente IA</DialogTitle>
          </DialogHeader>

          <div className="py-4 max-h-[60vh] overflow-y-auto pr-2">
            {agents.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No hay agentes disponibles. Verifica la conexión con OpenClaw.
              </div>
            ) : (
              <AgentListSelector
                agents={agents}
                value={selectedAgent}
                onValueChange={setSelectedAgent}
                idPrefix="proc-agent"
              >
                <AgentCreator
                  projectName={project.name}
                  projectDescription={project.description || undefined}
                  projectPurpose={project.purpose || undefined}
                  projectTechStack={project.tech_stack}
                  models={flatModels}
                  onAgentCreated={(agent) => {
                    setAgents(prev => [...prev, { ...agent, description: agent.description || '' }]);
                    setSelectedAgent(agent.id);
                  }}
                />
              </AgentListSelector>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              onClick={() => setShowAgentDialog(false)}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdateAgent}
              disabled={isUpdatingAgent || (selectedAgent === (project.agent_id || 'none'))}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {isUpdatingAgent && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
