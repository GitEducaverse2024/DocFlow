"use client";

import { useState, useEffect, useRef } from 'react';
import { Project, Source, ProcessingRun } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, FileText, Link as LinkIcon, Youtube, StickyNote, Play, XCircle, Download, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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
  const [useLocalProcessing, setUseLocalProcessing] = useState(true);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  
  const [activeRun, setActiveRun] = useState<ProcessingRun | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  
  const [agents, setAgents] = useState<{ id: string, name: string, emoji: string, model: string, description?: string }[]>([]);
  
  
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>(project.agent_id || 'none');
  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDesc, setNewAgentDesc] = useState('');
  const [newAgentModel, setNewAgentModel] = useState('');
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sourcesRes, agentsRes, healthRes, statusRes] = await Promise.all([
          fetch(`/api/projects/${project.id}/sources`),
          fetch('/api/agents'),
          fetch('/api/health'),
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

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          if (healthData.litellm?.models) {
            setModels(healthData.litellm.models);
          }
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

  const getProcessingLogs = () => {
    const logs: { text: string; done: boolean }[] = [];
    const srcCount = selectedSources.size || sources.length;
    const modelName = selectedModel || currentAgent?.model || 'LLM';

    logs.push({ text: `Leyendo ${srcCount} fuentes...`, done: elapsedSeconds >= 3 });
    if (elapsedSeconds >= 3) {
      logs.push({ text: `Enviando a ${modelName}...`, done: elapsedSeconds >= 10 });
    }
    if (elapsedSeconds >= 10) {
      logs.push({ text: 'Generando documento estructurado...', done: false });
    }
    return logs;
  };

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

  const handleCreateAgent = async () => {
    if (!newAgentName.trim() || !newAgentModel) return;
    setIsCreatingAgent(true);
    try {
      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newAgentName,
          model: newAgentModel,
          description: newAgentDesc,
        })
      });
      if (!res.ok) throw new Error('Error al crear agente');
      const created = await res.json();
      setAgents(prev => [...prev, created]);
      setSelectedAgent(created.id);
      setShowNewAgent(false);
      setNewAgentName('');
      setNewAgentDesc('');
      setNewAgentModel('');
      toast.success(`Agente "${created.name}" creado`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setIsCreatingAgent(false);
    }
  };

  const handleUpdateAgent = async () => {
    try {
      setIsUpdatingAgent(true);
      const newAgentId = selectedAgent === 'none' ? null : selectedAgent;
      
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: newAgentId })
      });
      
      if (!res.ok) throw new Error('Error al actualizar agente');
      
      toast.success('Agente actualizado');
      setShowAgentDialog(false);
      onProjectUpdate();
    } catch (error) {
      toast.error('Error al actualizar el agente');
      console.error(error);
    } finally {
      setIsUpdatingAgent(false);
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
          instructions,
          useLocalProcessing,
          model: selectedModel
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

  useEffect(() => {
    if (currentAgent && !selectedModel) {
      setSelectedModel(currentAgent.model);
    } else if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0]);
    }
  }, [currentAgent, models, selectedModel]);

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
            Procesando con {currentAgent?.name || 'Agente IA'}...
          </h3>
          <p className="text-zinc-400 mb-4">
            Esto puede tardar unos minutos dependiendo de la cantidad de fuentes.
          </p>
          <p className="text-xs text-zinc-500 mb-6">{Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')} transcurridos</p>

          <div className="w-full max-w-md bg-zinc-950 rounded-full h-2 mb-6 overflow-hidden">
            <div className="bg-violet-500 h-full w-full animate-pulse origin-left"></div>
          </div>

          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs font-mono text-zinc-500 mb-2">Log de procesamiento:</p>
            <div className="space-y-1 text-xs font-mono text-zinc-400 max-h-32 overflow-y-auto">
              {logs.map((log, i) => (
                <p key={i} className={log.done ? 'text-emerald-400' : 'text-violet-400 animate-pulse'}>
                  {log.done ? '\u2713' : '\u27F3'} {log.text}
                </p>
              ))}
            </div>
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-red-500 font-medium mb-2 flex items-center gap-2">
                <XCircle className="w-5 h-5" />
                Error en el último procesamiento
              </h4>
              <p className="text-sm text-red-400/80 whitespace-pre-wrap font-mono bg-red-950/50 p-3 rounded mb-3 max-h-40 overflow-y-auto">
                {activeRun.error_log || 'Error desconocido'}
              </p>
              <p className="text-sm text-zinc-400">
                Sugerencias: Intenta reducir el número de fuentes o verifica que el agente está configurado correctamente.
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleProcess}
              className="bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30 hover:text-red-300 flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reintentar
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
                <h3 className="text-lg font-medium text-emerald-500">Documento generado con éxito</h3>
                <p className="text-sm text-emerald-500/70">Versión {activeRun.version}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowPreview(true)} variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-300 hover:bg-zinc-800">
                Ver completo
              </Button>
              <Button onClick={handleDownload} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <Download className="w-4 h-4 mr-2" />
                Descargar .md
              </Button>
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

      {/* Row 1: Agent + Config (2 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Agent card */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Agente IA</CardTitle>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSelectedAgent(project.agent_id || 'none'); setShowAgentDialog(true); }}
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 flex-shrink-0"
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Bot className="w-8 h-8 text-zinc-600 flex-shrink-0" />
                <p className="text-sm text-zinc-400 flex-1">Sin agente asignado</p>
                <Button
                  size="sm"
                  onClick={() => { setSelectedAgent('none'); setShowAgentDialog(true); }}
                  className="bg-violet-500 hover:bg-violet-400 text-white flex-shrink-0"
                >
                  Asignar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config card */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Configuración</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="local-processing"
                checked={useLocalProcessing}
                onCheckedChange={(checked) => setUseLocalProcessing(checked as boolean)}
                className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
              />
              <label htmlFor="local-processing" className="text-sm text-zinc-200 cursor-pointer">
                Procesamiento local directo
              </label>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Modelo LLM</Label>
              <Select value={selectedModel} onValueChange={(v) => setSelectedModel(v || '')}>
                <SelectTrigger className="h-9 bg-zinc-950 border-zinc-800 text-zinc-50 text-sm">
                  <SelectValue placeholder="Selecciona un modelo" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                  {models.length > 0 ? (
                    models.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))
                  ) : (
                    <SelectItem value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Sources checklist (full-width) */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
            Fuentes a procesar ({selectedSources.size}/{sources.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedSources(new Set(sources.map(s => s.id)))}
              className="text-xs text-zinc-400 hover:text-zinc-50 h-7"
            >
              Todas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedSources(new Set())}
              className="text-xs text-zinc-400 hover:text-zinc-50 h-7"
            >
              Ninguna
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-zinc-500 text-center py-4 text-sm">No hay fuentes en este proyecto.</p>
          ) : (
            <div className="space-y-1 max-h-[250px] overflow-y-auto pr-1">
              {sources.map(source => (
                <div key={source.id} className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-zinc-800/50 rounded transition-colors">
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
                  <label htmlFor={`source-${source.id}`} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    {getSourceIcon(source.type)}
                    <span className="text-sm text-zinc-300 truncate">{(source.name || '').split('/').pop()}</span>
                    <Badge variant="outline" className="text-[10px] bg-zinc-950 border-zinc-800 text-zinc-500 flex-shrink-0">
                      {source.type.toUpperCase()}
                    </Badge>
                  </label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Instructions (full-width) */}
      <div>
        <Label className="text-sm text-zinc-400 mb-2 block">Instrucciones adicionales (Opcional)</Label>
        <Textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Añade contexto o instrucciones específicas para esta ejecución..."
          className="bg-zinc-950 border-zinc-800 text-zinc-50 min-h-[80px] resize-y"
        />
      </div>

      {/* Row 4: CTA Button (full-width, prominent) */}
      <Button
        size="lg"
        className="w-full h-14 text-lg bg-violet-500 hover:bg-violet-400 text-white font-semibold"
        disabled={!project.agent_id || selectedSources.size === 0 || sources.length === 0}
        onClick={handleProcess}
      >
        <Play className="w-5 h-5 mr-2 fill-current" />
        Procesar con {currentAgent?.name || 'Agente'}
      </Button>

      {(!project.agent_id || selectedSources.size === 0) && (
        <p className="text-xs text-center text-zinc-500 -mt-3">
          {!project.agent_id ? 'Asigna un agente para continuar.' : 'Selecciona al menos una fuente.'}
        </p>
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[85vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-800 pb-4">
            <DialogTitle className="text-xl text-zinc-50">Documento Generado (v{activeRun?.version})</DialogTitle>
            <Button onClick={handleDownload} className="bg-violet-500 hover:bg-violet-400 text-white">
              <Download className="w-4 h-4 mr-2" />
              Descargar .md
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
              <RadioGroup value={selectedAgent} onValueChange={setSelectedAgent} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  {agents.map((agent) => (
                    <div key={agent.id}>
                      <RadioGroupItem value={agent.id} id={`agent-${agent.id}`} className="peer sr-only" />
                      <Label
                        htmlFor={`agent-${agent.id}`}
                        className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900 peer-data-[state=checked]:border-violet-500 peer-data-[state=checked]:bg-violet-500/5 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{agent.emoji}</span>
                            <span className="font-semibold text-zinc-50">{agent.name}</span>
                          </div>
                          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-0">
                            {agent.model}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-400">{agent.description}</p>
                      </Label>
                    </div>
                  ))}

                  {/* Create new agent */}
                  <div className="border border-dashed border-zinc-700 rounded-lg p-4">
                    <button
                      type="button"
                      onClick={() => setShowNewAgent(!showNewAgent)}
                      className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 w-full"
                    >
                      <Plus className="w-4 h-4" />
                      Crear agente personalizado para este proyecto
                    </button>
                    {showNewAgent && (
                      <div className="mt-4 space-y-3">
                        <Input
                          placeholder="Nombre del agente (ej: Experto en Three.js)"
                          value={newAgentName}
                          onChange={(e) => setNewAgentName(e.target.value)}
                          className="bg-zinc-950 border-zinc-800 text-zinc-50"
                        />
                        <Textarea
                          placeholder="Descripcion: que debe hacer este agente"
                          value={newAgentDesc}
                          onChange={(e) => setNewAgentDesc(e.target.value)}
                          className="bg-zinc-950 border-zinc-800 text-zinc-50 h-20 resize-none"
                        />
                        <Select value={newAgentModel} onValueChange={(v) => setNewAgentModel(v || '')}>
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50">
                            <SelectValue placeholder="Selecciona un modelo" />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                            {models.length > 0 ? (
                              models.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))
                            ) : (
                              <SelectItem value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={handleCreateAgent}
                          disabled={isCreatingAgent || !newAgentName.trim() || !newAgentModel}
                          className="w-full bg-violet-600 hover:bg-violet-500 text-white"
                        >
                          {isCreatingAgent && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                          Crear y seleccionar
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <RadioGroupItem value="none" id="agent-none" className="peer sr-only" />
                    <Label
                      htmlFor="agent-none"
                      className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-lg cursor-pointer bg-zinc-950 hover:bg-zinc-900 peer-data-[state=checked]:border-zinc-500 peer-data-[state=checked]:bg-zinc-800/50 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <Bot className="w-6 h-6 text-zinc-500" />
                        <span className="font-semibold text-zinc-50">Sin agente</span>
                      </div>
                      <p className="text-sm text-zinc-400">Desasignar el agente actual.</p>
                    </Label>
                  </div>
                </div>
              </RadioGroup>
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
              className="bg-violet-500 hover:bg-violet-400 text-white"
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
