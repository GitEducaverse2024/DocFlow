"use client";

import { useState, useEffect } from 'react';
import { Project, ProcessingRun } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, Download, Eye, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface VersionHistoryProps {
  project: Project;
}

export function VersionHistory({ project }: VersionHistoryProps) {
  const [runs, setRuns] = useState<ProcessingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<{ id: string, name: string, emoji: string }[]>([]);
  
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  
  const [showError, setShowError] = useState(false);
  const [errorContent, setErrorContent] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [runsRes, agentsRes] = await Promise.all([
          fetch(`/api/projects/${project.id}/process/history`),
          fetch('/api/agents')
        ]);

        if (runsRes.ok) {
          setRuns(await runsRes.json());
        }

        if (agentsRes.ok) {
          setAgents(await agentsRes.json());
        }
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [project.id]);

  const fetchPreview = async (version: number) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/process/${version}/output`);
      if (res.ok) {
        const data = await res.json();
        setPreviewContent(data.content);
        setPreviewVersion(version);
        setShowPreview(true);
      }
    } catch (error) {
      console.error('Error fetching preview:', error);
    }
  };

  const handleDownload = (version: number) => {
    if (!previewContent && previewVersion !== version) {
      // Need to fetch first
      fetch(`/api/projects/${project.id}/process/${version}/output`)
        .then(res => res.json())
        .then(data => {
          downloadBlob(data.content, version);
        });
    } else {
      downloadBlob(previewContent, version);
    }
  };

  const downloadBlob = (content: string, version: number) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, '_').toLowerCase()}_v${version}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Desconocido';
    const agent = agents.find((a: { id: string, name: string, emoji: string }) => a.id === agentId);
    return agent ? `${agent.emoji} ${agent.name}` : agentId;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg">
        No hay historial de procesamiento para este proyecto.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => (
        <Card key={run.id} className={`bg-zinc-900 border-zinc-800 ${run.status === 'failed' ? 'border-red-900/50' : ''}`}>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                  run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                  run.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                  'bg-amber-500/10 text-amber-500'
                }`}>
                  {run.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> :
                   run.status === 'failed' ? <XCircle className="w-6 h-6" /> :
                   <Loader2 className="w-6 h-6 animate-spin" />}
                </div>
                
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-zinc-50">Versión {run.version}</h3>
                    <Badge variant="outline" className="bg-zinc-950 border-zinc-800 text-zinc-400">
                      {getAgentName(run.agent_id)}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(run.started_at)}
                    </span>
                    
                    {run.input_sources && (
                      <span>
                        {JSON.parse(run.input_sources).length} fuentes
                      </span>
                    )}
                    
                    {run.duration_seconds && (
                      <span>
                        Duración: {formatDuration(run.duration_seconds)}
                      </span>
                    )}
                    
                    {run.tokens_used && (
                      <span>
                        {run.tokens_used.toLocaleString()} tokens
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {run.status === 'completed' && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => fetchPreview(run.version)}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Ver documento
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleDownload(run.version)}
                      className="bg-violet-500 hover:bg-violet-400 text-white"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar
                    </Button>
                  </>
                )}
                
                {run.status === 'failed' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setErrorContent(run.error_log || 'Error desconocido');
                      setShowError(true);
                    }}
                    className="bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Ver error
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-800 pb-4">
            <DialogTitle className="text-xl text-zinc-50">Documento Generado (v{previewVersion})</DialogTitle>
            <Button onClick={() => previewVersion && handleDownload(previewVersion)} className="bg-violet-500 hover:bg-violet-400 text-white">
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

      <Dialog open={showError} onOpenChange={setShowError}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Detalle del Error
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-md overflow-x-auto">
            <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap">
              {errorContent}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
