"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Loader2, Database, Files, FileStack, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Project } from '@/lib/types';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects?limit=6');
        const data = await res.json();
        setProjects(data.data || []);
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full text-center">
        <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-6">
          <FileStack className="w-12 h-12 text-violet-500" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-50 mb-2">Crea tu primer proyecto de documentación</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          Sube documentos, conecta agentes IA y genera documentación estructurada
        </p>
        <Link href="/projects/new">
          <Button size="lg" className="bg-violet-500 hover:bg-violet-400 text-white gap-2">
            <Plus className="w-5 h-5" />
            Nuevo Proyecto
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-zinc-50">Dashboard</h1>
        <Link href="/projects/new">
          <Button className="bg-violet-500 hover:bg-violet-400 text-white gap-2">
            <Plus className="w-4 h-4" />
            Nuevo Proyecto
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Total Proyectos</CardTitle>
            <FolderOpen className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">{projects.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Procesando</CardTitle>
            <Loader2 className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">
              {projects.filter(p => p.status === 'processing').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Colecciones RAG</CardTitle>
            <Database className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">
              {projects.filter(p => p.rag_enabled).length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Fuentes Totales</CardTitle>
            <Files className="w-4 h-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-50">-</div>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-xl font-semibold text-zinc-50 mb-4">Proyectos Recientes</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(project => (
          <Card key={project.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-50 truncate">{project.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 line-clamp-2 mb-4">
                {project.description || 'Sin descripción'}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500" suppressHydrationWarning>
                  {new Date(project.updated_at).toLocaleDateString()}
                </span>
                <Link href={`/projects/${project.id}`}>
                  <Button variant="secondary" size="sm">Ver Proyecto</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
