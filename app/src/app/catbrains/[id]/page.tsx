"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings, Trash2, ChevronRight, Files, Cpu, Clock, Database, MessageCircle, Plug, Lock, Search } from 'lucide-react';
import { Project } from '@/lib/types';
import Link from 'next/link';
import Image from 'next/image';
import { SourceManager } from '@/components/sources/source-manager';
import { ProcessPanel } from '@/components/process/process-panel';
import { VersionHistory } from '@/components/process/version-history';
import { RagPanel } from '@/components/rag/rag-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { ConnectorsPanel } from '@/components/catbrains/connectors-panel';
import { ConfigPanel } from '@/components/catbrains/config-panel';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PipelineNav, PipelineStep } from '@/components/projects/pipeline-nav';
import { PipelineFooter } from '@/components/projects/pipeline-footer';
import { DeleteProjectDialog } from '@/components/projects/delete-project-dialog';
import { WebSearchEngineTab } from '@/components/projects/websearch-engine-tab';
import { SourcesPipeline } from '@/components/catbrains/sources-pipeline';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export default function CatBrainDetail() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('catbrains');
  const [catbrain, setCatbrain] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [versionsCount, setVersionsCount] = useState(0);
  const [activeStep, setActiveStep] = useState(searchParams.get('step') || 'sources');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [lastProcessedAt, setLastProcessedAt] = useState<string | null>(null);
  const [hasNewSources, setHasNewSources] = useState(false);
  const [connectorsCount, setConnectorsCount] = useState(0);

  useEffect(() => {
    const fetchCatBrain = async () => {
      try {
        const res = await fetch(`/api/catbrains/${params.id}`);
        if (!res.ok) throw new Error('CatBrain no encontrado');
        const data = await res.json();
        setCatbrain(data);

        // Fetch counts
        try {
          const [sourcesRes, historyRes, connectorsRes] = await Promise.all([
            fetch(`/api/catbrains/${params.id}/sources`),
            fetch(`/api/catbrains/${params.id}/process/history`),
            fetch(`/api/catbrains/${params.id}/connectors`)
          ]);

          if (connectorsRes.ok) {
            const connectorsData = await connectorsRes.json();
            setConnectorsCount(Array.isArray(connectorsData) ? connectorsData.length : 0);
          }

          let lastCompletedAt: string | null = null;

          if (historyRes.ok) {
            const historyData = await historyRes.json();
            const runs = Array.isArray(historyData) ? historyData : (historyData.runs || []);
            setVersionsCount(runs.length);
            const lastCompleted = runs.find((r: { status: string; completed_at: string | null }) => r.status === 'completed');
            if (lastCompleted?.completed_at) {
              lastCompletedAt = lastCompleted.completed_at;
              setLastProcessedAt(lastCompletedAt);
            }
          }

          if (sourcesRes.ok) {
            const sourcesData = await sourcesRes.json();
            setSourcesCount(sourcesData.length);
            // Detect new or re-extracted sources after last processing
            if (lastCompletedAt && sourcesData.length > 0) {
              const cutoff = new Date(lastCompletedAt!);
              const hasNewer = sourcesData.some((s: { created_at: string; content_updated_at?: string | null }) =>
                new Date(s.created_at) > cutoff ||
                (s.content_updated_at && new Date(s.content_updated_at) > cutoff)
              );
              setHasNewSources(hasNewer);
            } else {
              setHasNewSources(false);
            }
          }
        } catch (e) {
          console.error('Error fetching counts', e);
        }
      } catch (error) {
        console.error(error);
        router.push('/catbrains');
      } finally {
        setLoading(false);
      }
    };

    fetchCatBrain();
  }, [params.id, router, refreshTrigger]);

  // Auto-advance: only go to the NEXT sequential step, never skip
  useEffect(() => {
    if (!catbrain || loading) return;

    const isWS = catbrain.is_system === 1 && !!catbrain.search_engine;
    const order = isWS
      ? ['sources', 'process', 'history', 'rag', 'connectors', 'websearch', 'config', 'chat']
      : ['sources', 'process', 'history', 'rag', 'connectors', 'config', 'chat'];
    const currentIndex = order.indexOf(activeStep);
    if (currentIndex === -1 || currentIndex >= order.length - 1) return;

    const isProc = ['processed', 'rag_indexed'].includes(catbrain.status || '');
    const ragOn = (catbrain.rag_enabled ?? 0) === 1 || catbrain.status === 'rag_indexed';

    const stepStatuses: Record<string, string> = {
      sources: sourcesCount > 0 ? 'completed' : 'active',
      process: isProc ? 'completed' : sourcesCount > 0 ? 'pending' : 'locked',
      history: versionsCount > 0 ? 'completed' : (catbrain.current_version ?? 0) > 0 ? 'pending' : 'locked',
      rag: ragOn ? 'completed' : isProc ? 'pending' : 'locked',
      connectors: connectorsCount > 0 ? 'completed' : 'pending',
      websearch: 'pending',
      config: 'pending',
      chat: ragOn ? 'pending' : 'locked',
    };

    const currentStatus = stepStatuses[activeStep];
    if (currentStatus === 'completed') {
      const nextStep = order[currentIndex + 1];
      if (nextStep && stepStatuses[nextStep] !== 'locked') {
        setActiveStep(nextStep);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!catbrain) return null;

  // Simplified sources pipeline flow (triggered from entry modal "Nuevas Fuentes")
  const flow = searchParams.get('flow');
  if (flow === 'sources-pipeline') {
    return (
      <SourcesPipeline
        catbrainId={catbrain.id}
        catbrain={catbrain}
        onComplete={() => router.push(`/catbrains/${catbrain.id}?step=chat`)}
        onBack={() => router.push('/catbrains')}
      />
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-zinc-500';
      case 'sources_added': return 'bg-blue-500';
      case 'processing': return 'bg-amber-500';
      case 'processed': return 'bg-emerald-500';
      case 'rag_indexed': return 'bg-violet-500';
      default: return 'bg-zinc-500';
    }
  };

  const isProcessed = ['processed', 'rag_indexed'].includes(catbrain.status || '');
  const ragEnabled = (catbrain.rag_enabled ?? 0) === 1 || catbrain.status === 'rag_indexed';
  const isSystem = catbrain.is_system === 1;
  const isWebSearch = isSystem && !!catbrain.search_engine;

  // Determine stale: new sources added after last processing
  const isStale = hasNewSources && isProcessed;

  const steps: PipelineStep[] = [
    {
      id: 'sources', number: 1, label: t('pipeline.sources'),
      icon: <Files className="w-4 h-4" />,
      status: sourcesCount > 0 ? 'completed' : 'active',
      description: sourcesCount > 0 ? t('pipeline.sourcesCount', { count: sourcesCount }) : t('pipeline.uploadDocs')
    },
    {
      id: 'process', number: 2, label: t('pipeline.process'),
      icon: <Cpu className="w-4 h-4" />,
      status: isStale ? 'stale'
        : isProcessed ? 'completed'
        : sourcesCount > 0 ? 'pending'
        : 'locked',
      description: isStale ? t('pipeline.newUnprocessed')
        : isProcessed ? t('pipeline.version', { version: catbrain.current_version })
        : sourcesCount > 0 ? t('pipeline.readyToProcess') : t('pipeline.needsSources')
    },
    {
      id: 'history', number: 3, label: t('pipeline.history'),
      icon: <Clock className="w-4 h-4" />,
      status: isStale && versionsCount > 0 ? 'stale'
        : versionsCount > 0 ? 'completed'
        : (catbrain.current_version ?? 0) > 0 ? 'pending' : 'locked',
      description: isStale && versionsCount > 0 ? t('pipeline.outdated')
        : versionsCount > 0 ? t('pipeline.versionsCount', { count: versionsCount }) : t('pipeline.noVersions')
    },
    {
      id: 'rag', number: 4, label: t('pipeline.rag'),
      icon: <Database className="w-4 h-4" />,
      status: isStale && ragEnabled ? 'stale'
        : ragEnabled ? 'completed'
        : isProcessed ? 'pending' : 'locked',
      description: isStale && ragEnabled ? t('pipeline.outdated')
        : ragEnabled ? t('pipeline.indexed') : t('pipeline.pending')
    },
    {
      id: 'connectors', number: 5, label: t('pipeline.connectors'),
      icon: <Plug className="w-4 h-4" />,
      status: connectorsCount > 0 ? 'completed' : 'pending',
      description: connectorsCount > 0 ? t('pipeline.connectorsCount', { count: connectorsCount }) : t('pipeline.configure')
    },
    ...(isWebSearch ? [{
      id: 'websearch', number: 6, label: t('pipeline.searchEngine'),
      icon: <Search className="w-4 h-4" />,
      status: 'pending' as const,
      description: catbrain.search_engine || 'Auto'
    }] : []),
    {
      id: 'config', number: isWebSearch ? 7 : 6, label: t('pipeline.config'),
      icon: <Settings className="w-4 h-4" />,
      status: 'pending' as const,
      description: t('pipeline.personalityModel')
    },
    {
      id: 'chat', number: isWebSearch ? 8 : 7, label: t('pipeline.chat'),
      icon: <MessageCircle className="w-4 h-4" />,
      status: isStale && ragEnabled ? 'stale'
        : ragEnabled ? 'pending' : 'locked',
      description: isStale && ragEnabled ? t('pipeline.outdated')
        : ragEnabled ? t('pipeline.available') : t('pipeline.needsRag')
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center text-sm text-zinc-400 mb-4">
        <Link href="/" className="hover:text-zinc-50 transition-colors">Dashboard</Link>
        <ChevronRight className="w-4 h-4 mx-1.5 flex-shrink-0" />
        <Link href="/catbrains" className="hover:text-zinc-50 transition-colors">CatBrains</Link>
        <ChevronRight className="w-4 h-4 mx-1.5 flex-shrink-0" />
        <span className="text-zinc-50 truncate max-w-[200px]">{catbrain?.name || 'CatBrain'}</span>
      </div>

      {/* Header -- responsive */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={32} height={32} />
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 truncate">{catbrain?.name || 'CatBrain'}</h1>
            <Badge className={`${getStatusColor(catbrain?.status || 'draft')} text-white border-0 flex-shrink-0`}>
              {t(`status.${catbrain?.status || 'draft'}`)}
            </Badge>
          </div>
          {catbrain?.description && (
            <p className="text-zinc-400 text-sm line-clamp-2">{catbrain.description}</p>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setActiveStep('config')} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            <Settings className="w-4 h-4 mr-1.5" />
            {t('detail.configure')}
          </Button>
          {isSystem ? (
            <Button variant="outline" size="sm" disabled className="bg-transparent border-zinc-700 text-zinc-500 cursor-not-allowed">
              <Lock className="w-4 h-4 mr-1.5" />
              {t('detail.system')}
            </Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">
              <Trash2 className="w-4 h-4 mr-1.5" />
              {t('detail.delete')}
            </Button>
          )}
        </div>
      </div>

      {/* Pipeline navigation */}
      <PipelineNav steps={steps} activeStep={activeStep} onStepClick={setActiveStep} />

      {/* Step content */}
      <div className="mt-6">
        {activeStep === 'sources' && (
          <SourceManager
            projectId={catbrain?.id || ''}
            onNavigateToProcess={() => setActiveStep('process')}
            lastProcessedAt={lastProcessedAt}
            ragEnabled={(catbrain?.rag_enabled ?? 0) === 1}
            onSourcesChanged={() => setRefreshTrigger(prev => prev + 1)}
          />
        )}

        {activeStep === 'process' && (
          <ErrorBoundary>
            <ProcessPanel project={catbrain} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} onNavigateToHistory={() => setActiveStep('history')} isStale={isStale} />
          </ErrorBoundary>
        )}

        {activeStep === 'history' && (
          <ErrorBoundary>
            <VersionHistory project={catbrain} />
          </ErrorBoundary>
        )}

        {activeStep === 'rag' && (
          <ErrorBoundary>
            <RagPanel project={catbrain} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </ErrorBoundary>
        )}

        {activeStep === 'connectors' && (
          <ErrorBoundary>
            <ConnectorsPanel catbrainId={catbrain.id} />
          </ErrorBoundary>
        )}

        {activeStep === 'websearch' && isWebSearch && (
          <ErrorBoundary>
            <WebSearchEngineTab
              catbrainId={catbrain.id}
              currentEngine={catbrain.search_engine || 'auto'}
              onEngineChange={() => setRefreshTrigger(prev => prev + 1)}
            />
          </ErrorBoundary>
        )}

        {activeStep === 'config' && (
          <ErrorBoundary>
            <ConfigPanel
              catbrain={catbrain}
              onCatBrainUpdate={() => setRefreshTrigger(prev => prev + 1)}
              onDelete={async () => {
                const res = await fetch(`/api/catbrains/${params.id}`, { method: 'DELETE' });
                if (!res.ok) { toast.error(t('detail.deleteErrorShort')); return; }
                toast.success(t('detail.deleted'));
                router.push('/catbrains');
              }}
            />
          </ErrorBoundary>
        )}

        {activeStep === 'chat' && (
          <ErrorBoundary>
            <ChatPanel project={catbrain} />
          </ErrorBoundary>
        )}

        <PipelineFooter steps={steps} activeStep={activeStep} onStepChange={setActiveStep} />
      </div>

      {/* Delete confirmation dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        projectName={catbrain.name}
        onConfirm={async () => {
          const res = await fetch(`/api/catbrains/${params.id}`, { method: 'DELETE' });
          if (!res.ok) {
            toast.error(t('detail.deleteError'));
            throw new Error('Delete failed');
          }
          toast.success(t('detail.deleted'));
          router.push('/catbrains');
        }}
      />

    </div>
  );
}
