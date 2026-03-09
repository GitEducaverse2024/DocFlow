"use client";

import { useState, useEffect } from 'react';
import { Project, Source, ProcessingRun } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, FileText, Link as LinkIcon, Youtube, StickyNote, Play, XCircle, Download, } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ProcessPanelProps {
  project: Project;
  onProjectUpdate: () => void;
}

export function ProcessPanel({ project, onProjectUpdate }: ProcessPanelProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [activeRun, setActiveRun] = useState<ProcessingRun | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  const [agents, setAgents] = useState<{ id: string, name: string, emoji: string, model: string }[]>([]);
  
  
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sourcesRes, agentsRes, statusRes] = await Promise.all([
          fetch(`/api/projects/${project.id}/sources`),
          fetch('/api/agents'),
          fetch(`/api/projects/${project.id}/process/status`)
        ]);

        if (sourcesRes.ok) {
          const data = await sourcesRes.json();
          setSources(data);
          setSelectedSources(new Set(data.map((s: Source) => s.id)));
        }

        if (agentsRes.ok) {
          setAgents(await agentsRes.json());
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
          const res = await fetch(`/api/projects/${project.id}/process/status`);
          if (res.ok) {
            const data = await res.json();
            setActiveRun(data);
            
            if (data.status === 'completed' || data.status === 'failed') {
              setIsPolling(false);
              onProjectUpdate();
              
              if (data.status === 'completed') {
                toast.success('Procesamiento completado');
                fetchPreview(data.version);
              } else {
                toast.error('Error en el procesamiento');
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

  const fetchPreview = async (version: number) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/process/${version}/output`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error fetching preview:', error);
    }
  };

  const handleProcess = async () => {
    if (!project.agent_id) {
      toast.error('Debes asignar un agente primero');
      return;
    }

    if (selectedSources.size === 0) {
      toast.error('Debes seleccionar al menos una fuente');
      return;
    }

    try {
      const res = await fetch(`/api/projects/${project.id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIds: Array.from(selectedSources),
          instructions
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
        agent_id: project.agent_id,
        status: 'queued',
        input_sources: JSON.stringify(Array.from(selectedSources)),
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
      toast.success('Procesamiento iniciado');
    } catch (error: unknown) {
      toast.error((error as Error).message);
    }
  };

  const handleCancel = async () => {
    if (!activeRun) return;
    
    try {
      // In a real app, we might want to tell n8n to cancel, but for now we just mark it as failed locally
      await fetch(`/api/projects/${project.id}/process/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: activeRun.id,
          status: 'failed',
          error_log: 'Cancelado por el usuario'
        })
      });
      
      setIsPolling(false);
      setActiveRun(prev => prev ? { ...prev, status: 'failed', error_log: 'Cancelado por el usuario' } : null);
      onProjectUpdate();
      toast.info('Procesamiento cancelado');
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
    a.download = `${project.name.replace(/\s+/g, '_').toLowerCase()}_v${activeRun?.version || project.current_version}.md`;
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

  const currentAgent = agents.find((a: { id: string, name: string, emoji: string, model: string }) => a.id === project.agent_id);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (activeRun && (activeRun.status === 'queued' || activeRun.status === 'running')) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-16 h-16 animate-spin text-violet-500 mb-6" />
          <h3 className="text-xl font-semibold text-zinc-50 mb-2">
            Procesando con {currentAgent?.name || 'Agente IA'}...
          </h3>
          <p className="text-zinc-400 mb-8">
            Esto puede tardar unos minutos dependiendo de la cantidad de fuentes.
          </p>
          
          <div className="w-full max-w-md bg-zinc-950 rounded-full h-2 mb-8 overflow-hidden">
            <div className="bg-violet-500 h-full w-full animate-pulse origin-left"></div>
          </div>
          
          <Button variant="destructive" onClick={handleCancel} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0">
            <XCircle className="w-4 h-4 mr-2" />
            Cancelar procesamiento
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {activeRun?.status === 'failed' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <h4 className="text-red-500 font-medium mb-2 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            Error en el último procesamiento
          </h4>
          <p className="text-sm text-red-400/80 whitespace-pre-wrap font-mono bg-red-950/50 p-3 rounded">
            {activeRun.error_log || 'Error desconocido'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg text-zinc-50">Fuentes a procesar</CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedSources(new Set(sources.map(s => s.id)))}
                  className="text-xs text-zinc-400 hover:text-zinc-50"
                >
                  Seleccionar todas
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedSources(new Set())}
                  className="text-xs text-zinc-400 hover:text-zinc-50"
                >
                  Deseleccionar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sources.length === 0 ? (
                <p className="text-zinc-500 text-center py-4">No hay fuentes en este proyecto.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {sources.map(source => (
                    <div key={source.id} className="flex items-center gap-3 p-2 hover:bg-zinc-800/50 rounded-md transition-colors">
                      <Checkbox 
                        id={`source-${source.id}`} 
                        checked={selectedSources.has(source.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedSources);
                          if (checked) newSet.add(source.id);
                          else newSet.delete(source.id);
                          setSelectedSources(newSet);
                        }}
                        className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                      />
                      <label htmlFor={`source-${source.id}`} className="flex items-center gap-3 flex-1 cursor-pointer">
                        {getSourceIcon(source.type)}
                        <span className="text-sm text-zinc-300 truncate flex-1">{source.name}</span>
                        <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-500">
                          {source.type.toUpperCase()}
                        </Badge>
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-50">Instrucciones adicionales (Opcional)</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea 
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Añade contexto o instrucciones específicas para esta ejecución..."
                className="bg-zinc-950 border-zinc-800 text-zinc-50 min-h-[120px] resize-y"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg text-zinc-50">Agente IA</CardTitle>
            </CardHeader>
            <CardContent>
              {currentAgent ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <span className="text-2xl">{currentAgent.emoji}</span>
                    <div>
                      <p className="font-medium text-zinc-50">{currentAgent.name}</p>
                      <p className="text-xs text-zinc-500">{currentAgent.model}</p>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    
                    className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    Cambiar agente
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4">
                  <Bot className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 mb-4">No hay agente asignado</p>
                  <Button 
                    
                    className="w-full bg-violet-500 hover:bg-violet-400 text-white"
                  >
                    Asignar agente
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Button 
            size="lg" 
            className="w-full h-14 text-lg bg-violet-500 hover:bg-violet-400 text-white"
            disabled={!project.agent_id || selectedSources.size === 0 || sources.length === 0}
            onClick={handleProcess}
          >
            <Play className="w-5 h-5 mr-2 fill-current" />
            Procesar con {currentAgent?.name || 'Agente'}
          </Button>
          
          {(!project.agent_id || selectedSources.size === 0) && (
            <p className="text-xs text-center text-zinc-500">
              {!project.agent_id ? 'Asigna un agente para continuar.' : 'Selecciona al menos una fuente.'}
            </p>
          )}
        </div>
      </div>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-800 pb-4">
            <DialogTitle className="text-xl text-zinc-50">Documento Generado (v{activeRun?.version})</DialogTitle>
            <Button onClick={handleDownload} className="bg-violet-500 hover:bg-violet-400 text-white">
              <Download className="w-4 h-4 mr-2" />
              Descargar .md
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 prose prose-invert prose-violet max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {previewContent}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
