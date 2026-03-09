"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings, Trash2, ChevronRight, Files, Cpu, Clock, Database, MessageCircle } from 'lucide-react';
import { Project } from '@/lib/types';
import Link from 'next/link';
import { SourceManager } from '@/components/sources/source-manager';
import { ProcessPanel } from '@/components/process/process-panel';
import { VersionHistory } from '@/components/process/version-history';
import { RagPanel } from '@/components/rag/rag-panel';
import { ChatPanel } from '@/components/chat/chat-panel';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PipelineNav, PipelineStep } from '@/components/projects/pipeline-nav';

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [versionsCount, setVersionsCount] = useState(0);
  const [activeStep, setActiveStep] = useState('sources');

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${params.id}`);
        if (!res.ok) throw new Error('Proyecto no encontrado');
        const data = await res.json();
        setProject(data);

        // Fetch counts
        try {
          const [sourcesRes, historyRes] = await Promise.all([
            fetch(`/api/projects/${params.id}/sources`),
            fetch(`/api/projects/${params.id}/process/history`)
          ]);

          if (sourcesRes.ok) {
            const sourcesData = await sourcesRes.json();
            setSourcesCount(sourcesData.length);
          }

          if (historyRes.ok) {
            const historyData = await historyRes.json();
            setVersionsCount(historyData.length);
          }
        } catch (e) {
          console.error('Error fetching counts', e);
        }
      } catch (error) {
        console.error(error);
        router.push('/projects');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [params.id, router, refreshTrigger]);

  // Auto-advance to next step when current step is completed
  useEffect(() => {
    if (!project || loading) return;

    const isProc = ['processed', 'rag_indexed'].includes(project.status || '');
    const ragOn = (project.rag_enabled ?? 0) === 1 || project.status === 'rag_indexed';

    const stepStatuses: Record<string, string> = {
      sources: sourcesCount > 0 ? 'completed' : 'active',
      process: isProc ? 'completed' : sourcesCount > 0 ? 'pending' : 'locked',
      history: versionsCount > 0 ? 'completed' : (project.current_version ?? 0) > 0 ? 'pending' : 'locked',
      rag: ragOn ? 'completed' : isProc ? 'pending' : 'locked',
      chat: ragOn ? 'pending' : 'locked',
    };

    const currentStatus = stepStatuses[activeStep];
    if (currentStatus === 'completed') {
      const order = ['sources', 'process', 'history', 'rag', 'chat'];
      const next = order.find(id => stepStatuses[id] === 'pending' || stepStatuses[id] === 'active');
      if (next && next !== activeStep) {
        setActiveStep(next);
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

  if (!project) return null;

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Borrador';
      case 'sources_added': return 'Fuentes Añadidas';
      case 'processing': return 'Procesando';
      case 'processed': return 'Procesado';
      case 'rag_indexed': return 'RAG Activo';
      default: return status;
    }
  };

  const isProcessed = ['processed', 'rag_indexed'].includes(project.status || '');
  const ragEnabled = (project.rag_enabled ?? 0) === 1 || project.status === 'rag_indexed';

  const steps: PipelineStep[] = [
    {
      id: 'sources', number: 1, label: 'Fuentes',
      icon: <Files className="w-4 h-4" />,
      status: sourcesCount > 0 ? 'completed' : 'active',
      description: sourcesCount > 0 ? `${sourcesCount} fuentes` : 'Sube documentación'
    },
    {
      id: 'process', number: 2, label: 'Procesar',
      icon: <Cpu className="w-4 h-4" />,
      status: isProcessed ? 'completed'
        : sourcesCount > 0 ? 'pending'
        : 'locked',
      description: isProcessed ? `v${project.current_version}` : sourcesCount > 0 ? 'Listo para procesar' : 'Necesita fuentes'
    },
    {
      id: 'history', number: 3, label: 'Historial',
      icon: <Clock className="w-4 h-4" />,
      status: versionsCount > 0 ? 'completed' : (project.current_version ?? 0) > 0 ? 'pending' : 'locked',
      description: versionsCount > 0 ? `${versionsCount} versiones` : 'Sin versiones'
    },
    {
      id: 'rag', number: 4, label: 'RAG',
      icon: <Database className="w-4 h-4" />,
      status: ragEnabled ? 'completed' : isProcessed ? 'pending' : 'locked',
      description: ragEnabled ? 'Indexado' : 'Pendiente'
    },
    {
      id: 'chat', number: 5, label: 'Chat',
      icon: <MessageCircle className="w-4 h-4" />,
      status: ragEnabled ? 'pending' : 'locked',
      description: ragEnabled ? 'Disponible' : 'Necesita RAG'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center text-sm text-zinc-400 mb-4">
        <Link href="/" className="hover:text-zinc-50 transition-colors">Dashboard</Link>
        <ChevronRight className="w-4 h-4 mx-1.5 flex-shrink-0" />
        <Link href="/projects" className="hover:text-zinc-50 transition-colors">Proyectos</Link>
        <ChevronRight className="w-4 h-4 mx-1.5 flex-shrink-0" />
        <span className="text-zinc-50 truncate max-w-[200px]">{project?.name || 'Proyecto'}</span>
      </div>

      {/* Header — responsive */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 truncate">{project?.name || 'Proyecto'}</h1>
            <Badge className={`${getStatusColor(project?.status || 'draft')} text-white border-0 flex-shrink-0`}>
              {getStatusLabel(project?.status || 'draft')}
            </Badge>
          </div>
          {project?.description && (
            <p className="text-zinc-400 text-sm line-clamp-2">{project.description}</p>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            <Settings className="w-4 h-4 mr-1.5" />
            Configurar
          </Button>
          <Button variant="destructive" size="sm" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">
            <Trash2 className="w-4 h-4 mr-1.5" />
            Eliminar
          </Button>
        </div>
      </div>

      {/* Pipeline navigation */}
      <PipelineNav steps={steps} activeStep={activeStep} onStepClick={setActiveStep} />

      {/* Step content */}
      <div className="mt-6">
        {activeStep === 'sources' && (
          <SourceManager projectId={project?.id || ''} />
        )}

        {activeStep === 'process' && (
          <ErrorBoundary>
            <ProcessPanel project={project} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </ErrorBoundary>
        )}

        {activeStep === 'history' && (
          <ErrorBoundary>
            <VersionHistory project={project} />
          </ErrorBoundary>
        )}

        {activeStep === 'rag' && (
          <ErrorBoundary>
            <RagPanel project={project} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </ErrorBoundary>
        )}

        {activeStep === 'chat' && (
          <ErrorBoundary>
            <ChatPanel project={project} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
