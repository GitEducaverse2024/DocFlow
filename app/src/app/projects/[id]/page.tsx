"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Settings, Trash2, ChevronRight } from 'lucide-react';
import { Project } from '@/lib/types';
import Link from 'next/link';
import { SourceManager } from '@/components/sources/source-manager';

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${params.id}`);
        if (!res.ok) throw new Error('Proyecto no encontrado');
        const data = await res.json();
        setProject(data);
      } catch (error) {
        console.error(error);
        router.push('/projects');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [params.id, router]);

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
        <span className="text-zinc-50 truncate max-w-[200px]">{project.name}</span>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-3xl font-bold text-zinc-50">{project.name}</h1>
            <Badge className={`${getStatusColor(project.status)} text-white border-0`}>
              {getStatusLabel(project.status)}
            </Badge>
          </div>
          <p className="text-zinc-400 max-w-2xl">{project.description || 'Sin descripción'}</p>
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

      <Tabs defaultValue="sources" className="w-full">
        <TabsList className="bg-zinc-900 border-zinc-800 w-full justify-start rounded-none border-b p-0 h-auto">
          <TabsTrigger 
            value="sources" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none px-6 py-3 text-zinc-400 data-[state=active]:text-zinc-50"
          >
            Fuentes
          </TabsTrigger>
          <TabsTrigger 
            value="process" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none px-6 py-3 text-zinc-400 data-[state=active]:text-zinc-50"
          >
            Procesar
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none px-6 py-3 text-zinc-400 data-[state=active]:text-zinc-50"
          >
            Historial
          </TabsTrigger>
          <TabsTrigger 
            value="rag" 
            className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-violet-500 rounded-none px-6 py-3 text-zinc-400 data-[state=active]:text-zinc-50"
          >
            RAG
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="sources" className="m-0">
            <SourceManager projectId={project.id} />
          </TabsContent>
          
          <TabsContent value="process" className="m-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-400">
              <p>El procesamiento IA se implementará en la siguiente fase.</p>
            </div>
          </TabsContent>
          
          <TabsContent value="history" className="m-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-400">
              <p>El historial de versiones se implementará en la siguiente fase.</p>
            </div>
          </TabsContent>
          
          <TabsContent value="rag" className="m-0">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center text-zinc-400">
              <p>La configuración RAG se implementará en la siguiente fase.</p>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
