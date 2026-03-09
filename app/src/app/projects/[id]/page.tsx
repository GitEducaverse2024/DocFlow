"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings, Trash2, ChevronRight, Files, Cpu, Clock, Database } from 'lucide-react';
import { Project } from '@/lib/types';
import Link from 'next/link';
import { SourceManager } from '@/components/sources/source-manager';
import { ConnectionStatusBar } from '@/components/projects/connection-status-bar';
import { ProcessPanel } from '@/components/process/process-panel';
import { VersionHistory } from '@/components/process/version-history';
import { RagPanel } from '@/components/rag/rag-panel';
import { HelpText } from '@/components/ui/help-text';

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sourcesCount, setSourcesCount] = useState(0);
  const [versionsCount, setVersionsCount] = useState(0);

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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center text-sm text-zinc-400 mb-6">
        <Link href="/" className="hover:text-zinc-50">Dashboard</Link>
        <ChevronRight className="w-4 h-4 mx-2" />
        <Link href="/projects" className="hover:text-zinc-50">Proyectos</Link>
        <ChevronRight className="w-4 h-4 mx-2" />
        <span className="text-zinc-50 truncate max-w-[200px]">{project?.name || 'Proyecto'}</span>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-zinc-50">{project?.name || 'Proyecto'}</h1>
            <Badge className={`${getStatusColor(project?.status || 'draft')} text-white border-0`}>
              {getStatusLabel(project?.status || 'draft')}
            </Badge>
          </div>
          <p className="text-zinc-400 max-w-2xl">{project?.description || 'Sin descripción'}</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            <Settings className="w-4 h-4 mr-2" />
            Configurar
          </Button>
          <Button variant="destructive" className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">
            <Trash2 className="w-4 h-4 mr-2" />
            Eliminar
          </Button>
        </div>
      </div>

      <ConnectionStatusBar projectStatus={project?.status || 'draft'} />

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="w-full justify-start bg-zinc-900 border border-zinc-800 rounded-lg p-1 gap-1 h-auto">
          <TabsTrigger
            value="sources"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Files className="w-4 h-4" />
            Fuentes
            <Badge variant="secondary" className="ml-1 text-xs bg-zinc-800 text-zinc-300 border-0">{sourcesCount}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="process"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            Procesar
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            Historial
            <Badge variant="secondary" className="ml-1 text-xs bg-zinc-800 text-zinc-300 border-0">{versionsCount}</Badge>
          </TabsTrigger>
          <TabsTrigger
            value="rag"
            className="data-[state=active]:bg-violet-600 data-[state=active]:text-white rounded-md px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2"
          >
            <Database className="w-4 h-4" />
            RAG
            {(project?.rag_enabled === 1 || project?.status === 'rag_indexed') && <span className="w-2 h-2 bg-emerald-500 rounded-full ml-1" />}
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="sources" className="m-0">
            <div className="mb-6">
              <HelpText text="Gestiona las fuentes de tu proyecto. El orden determina la secuencia en que el agente procesará la documentación." />
            </div>
            <SourceManager projectId={project?.id || ''} />
          </TabsContent>
          
          <TabsContent value="process" className="m-0">
            <div className="mb-6">
              <HelpText text="Selecciona las fuentes a incluir y lanza el procesamiento. El agente generará un documento estructurado a partir de la documentación seleccionada." />
            </div>
            <ProcessPanel project={project} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </TabsContent>
          
          <TabsContent value="history" className="m-0">
            <div className="mb-6">
              <HelpText text="Historial de todas las versiones generadas. Cada procesamiento crea una nueva versión sin borrar las anteriores." />
            </div>
            <VersionHistory project={project} />
          </TabsContent>
          
          <TabsContent value="rag" className="m-0">
            <div className="mb-6">
              <HelpText text="Indexa tus documentos procesados en una base vectorial para consulta inteligente vía MCP." />
            </div>
            <RagPanel project={project} onProjectUpdate={() => setRefreshTrigger(prev => prev + 1)} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
