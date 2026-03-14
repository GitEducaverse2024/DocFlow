"use client";

import { useState, useEffect } from 'react';
import { Project, ProcessingRun } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Clock, Download, Eye, AlertCircle, CheckCircle2, XCircle, GitCompare, ChevronDown, ChevronUp, Trash2, FolderOpen, HardDrive, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface EnrichedRun extends ProcessingRun {
  file_size: number;
  file_path: string | null;
  source_names: string[];
}

interface VersionHistoryProps {
  project: Project;
  onProjectUpdate?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `hace ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function VersionHistory({ project, onProjectUpdate }: VersionHistoryProps) {
  const [runs, setRuns] = useState<EnrichedRun[]>([]);
  const [totalDiskSize, setTotalDiskSize] = useState(0);
  const [processedPath, setProcessedPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<{ id: string; name: string; emoji: string }[]>([]);
  const [workersMap, setWorkersMap] = useState<Record<string, { name: string; emoji: string }>>({});
  const [skillsMap, setSkillsMap] = useState<Record<string, string>>({});

  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);

  const [showError, setShowError] = useState(false);
  const [errorContent, setErrorContent] = useState('');
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [runPreviews, setRunPreviews] = useState<Record<string, string>>({});

  const [deleteTarget, setDeleteTarget] = useState<EnrichedRun | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCleanup, setShowCleanup] = useState(false);
  const [keepCount, setKeepCount] = useState(3);
  const [cleaning, setCleaning] = useState(false);

  const fetchData = async () => {
    try {
      const [runsRes, agentsRes, workersRes, skillsRes] = await Promise.all([
        fetch(`/api/catbrains/${project.id}/process/history`),
        fetch('/api/agents'),
        fetch('/api/workers'),
        fetch('/api/skills'),
      ]);

      if (runsRes.ok) {
        const data = await runsRes.json();
        setRuns(data.runs || []);
        setTotalDiskSize(data.total_disk_size || 0);
        setProcessedPath(data.processed_path || '');
      }

      if (agentsRes.ok) {
        setAgents(await agentsRes.json());
      }

      if (workersRes.ok) {
        const wList = await workersRes.json();
        const wMap: Record<string, { name: string; emoji: string }> = {};
        if (Array.isArray(wList)) wList.forEach((w: { id: string; name: string; emoji: string }) => { wMap[w.id] = { name: w.name, emoji: w.emoji }; });
        setWorkersMap(wMap);
      }

      if (skillsRes.ok) {
        const sList = await skillsRes.json();
        const sMap: Record<string, string> = {};
        if (Array.isArray(sList)) sList.forEach((s: { id: string; name: string }) => { sMap[s.id] = s.name; });
        setSkillsMap(sMap);
      }
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const toggleExpand = async (runId: string, version: number) => {
    const newExpanded = new Set(expandedRuns);
    if (newExpanded.has(runId)) {
      newExpanded.delete(runId);
      setExpandedRuns(newExpanded);
    } else {
      newExpanded.add(runId);
      setExpandedRuns(newExpanded);

      if (!runPreviews[runId]) {
        try {
          const res = await fetch(`/api/catbrains/${project.id}/process/${version}/output`);
          if (res.ok) {
            const data = await res.json();
            setRunPreviews((prev) => ({ ...prev, [runId]: data.content }));
          }
        } catch (error) {
          console.error('Error fetching preview:', error);
        }
      }
    }
  };

  const fetchPreview = async (version: number) => {
    try {
      const res = await fetch(`/api/catbrains/${project.id}/process/${version}/output`);
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

  const handleDownload = (version: number, content?: string) => {
    const doDownload = (c: string) => {
      const blob = new Blob([c], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(project?.name || 'documento').replace(/\s+/g, '_').toLowerCase()}_v${version}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    if (content) {
      doDownload(content);
    } else {
      fetch(`/api/catbrains/${project.id}/process/${version}/output`)
        .then((res) => res.json())
        .then((data) => doDownload(data.content))
        .catch(() => toast.error('Error al descargar'));
    }
  };

  const handleDeleteVersion = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}/process/${deleteTarget.version}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      const data = await res.json();
      toast.success(`Versión v${deleteTarget.version} eliminada (${formatBytes(data.freed_bytes)} liberados)`);
      setDeleteTarget(null);
      fetchData();
      onProjectUpdate?.();
    } catch {
      toast.error('Error al eliminar la versión');
    } finally {
      setDeleting(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}/process/clean?keep=${keepCount}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al limpiar');
      const data = await res.json();
      toast.success(`${data.deleted_count} versiones eliminadas (${formatBytes(data.freed_bytes)} liberados)`);
      setShowCleanup(false);
      fetchData();
      onProjectUpdate?.();
    } catch {
      toast.error('Error al limpiar versiones');
    } finally {
      setCleaning(false);
    }
  };

  const getProcessorInfo = (run: EnrichedRun): { name: string; isWorker: boolean } => {
    if (run.worker_id && workersMap[run.worker_id]) {
      const w = workersMap[run.worker_id];
      return { name: `${w.emoji} ${w.name}`, isWorker: true };
    }
    if (run.agent_id) {
      const agent = agents.find((a) => a.id === run.agent_id);
      return { name: agent ? `${agent.emoji} ${agent.name}` : run.agent_id, isWorker: false };
    }
    return { name: 'Desconocido', isWorker: false };
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const runsToClean = runs.slice(keepCount);
  const cleanableBytes = runsToClean.reduce((sum, r) => sum + (r.file_size || 0), 0);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg flex flex-col items-center justify-center">
        <Clock className="w-12 h-12 text-zinc-700 mb-4" />
        <p>No hay versiones procesadas todavía. Ve a la pestaña Procesar para generar tu primer documento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-300 font-medium">{runs.length} versiones</span>
          <span className="text-zinc-500 flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" />
            {formatBytes(totalDiskSize)} en disco
          </span>
          {processedPath && (
            <span className="text-zinc-600 flex items-center gap-1.5 text-xs font-mono hidden md:flex">
              <FolderOpen className="w-3.5 h-3.5" />
              {processedPath}
            </span>
          )}
        </div>
        {runs.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCleanup(true)}
            className="bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Limpiar antiguas
          </Button>
        )}
      </div>

      {/* Version list */}
      {runs.map((run) => {
        const isExpanded = expandedRuns.has(run.id);
        return (
          <Card key={run.id} className={`bg-zinc-900 border-zinc-800 overflow-hidden ${run.status === 'failed' ? 'border-red-900/50' : ''}`}>
            <CardContent className="p-0">
              {/* Collapsed row */}
              <div
                className={`px-4 py-3 flex items-center gap-3 ${run.status === 'completed' ? 'cursor-pointer hover:bg-zinc-800/30 transition-colors' : ''}`}
                onClick={() => run.status === 'completed' && toggleExpand(run.id, run.version)}
              >
                {/* Version badge */}
                <Badge variant="outline" className="bg-zinc-950 border-zinc-700 text-zinc-300 font-mono text-xs px-2 flex-shrink-0">
                  v{run.version}
                </Badge>

                {/* Status icon */}
                <div className="flex-shrink-0">
                  {run.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : run.status === 'failed' ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />
                  )}
                </div>

                {/* Processor name */}
                {(() => {
                  const info = getProcessorInfo(run);
                  return (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm text-zinc-300 truncate">{info.name}</span>
                      {info.isWorker && (
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 flex-shrink-0">Worker</Badge>
                      )}
                    </span>
                  );
                })()}

                {/* Skill badges */}
                {(() => {
                  if (!run.skill_ids) return null;
                  try {
                    const ids: string[] = JSON.parse(run.skill_ids);
                    if (ids.length === 0) return null;
                    return (
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Sparkles className="w-3 h-3 text-violet-500" />
                        <span className="text-[10px] text-violet-400">{ids.length}</span>
                      </span>
                    );
                  } catch { return null; }
                })()}

                {/* Time ago */}
                <span className="text-xs text-zinc-500 flex-shrink-0 hidden sm:inline" suppressHydrationWarning>
                  {timeAgo(run.completed_at || run.started_at)}
                </span>

                {/* File size */}
                {run.file_size > 0 && (
                  <span className="text-xs text-zinc-600 flex-shrink-0">{formatBytes(run.file_size)}</span>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {run.status === 'failed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        setErrorContent(run.error_log || 'Error desconocido');
                        setShowError(true);
                      }}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  {run.status === 'completed' && (
                    <div className="text-zinc-600">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(run);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && run.status === 'completed' && (
                <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50 space-y-3">
                  {/* Details grid */}
                  <div className="text-xs text-zinc-500 space-y-1 font-mono bg-zinc-950 rounded-lg p-3">
                    {run.file_path && (
                      <p>
                        <span className="text-zinc-600">Archivo:</span> {run.file_path}
                      </p>
                    )}
                    {run.source_names.length > 0 && (
                      <p>
                        <span className="text-zinc-600">Fuentes ({run.source_names.length}):</span>{' '}
                        {run.source_names.map((n) => (n || '').split('/').pop()).join(', ')}
                      </p>
                    )}
                    {run.skill_ids && (() => {
                      try {
                        const ids: string[] = JSON.parse(run.skill_ids);
                        if (ids.length === 0) return null;
                        return (
                          <p>
                            <span className="text-zinc-600">Skills:</span>{' '}
                            {ids.map(id => skillsMap[id] || id).join(', ')}
                          </p>
                        );
                      } catch { return null; }
                    })()}
                    {run.instructions && (
                      <p>
                        <span className="text-zinc-600">Instrucciones:</span> &quot;{run.instructions.substring(0, 120)}
                        {run.instructions.length > 120 ? '...' : ''}&quot;
                      </p>
                    )}
                    {run.duration_seconds && (
                      <p>
                        <span className="text-zinc-600">Duración:</span> {formatDuration(run.duration_seconds)}
                      </p>
                    )}
                    {run.tokens_used && (
                      <p>
                        <span className="text-zinc-600">Tokens:</span> ~{run.tokens_used.toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* Preview snippet */}
                  <div className="bg-zinc-950 rounded-lg p-4 relative overflow-hidden max-h-40">
                    <div className="prose prose-invert prose-sm max-w-none opacity-80">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {runPreviews[run.id]
                          ? runPreviews[run.id].substring(0, 500) + (runPreviews[run.id].length > 500 ? '...' : '')
                          : 'Cargando...'}
                      </ReactMarkdown>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none"></div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchPreview(run.version);
                      }}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Ver documento
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(run.version, runPreviews[run.id]);
                      }}
                      className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                      Descargar .md
                    </Button>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-600 text-[10px] px-2 py-1 cursor-default">
                      <GitCompare className="w-3 h-3 mr-1" />
                      Comparar — próximamente
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-7xl w-[95vw] h-[90vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-800 pb-4">
            <DialogTitle className="text-xl text-zinc-50">Documento Generado (v{previewVersion})</DialogTitle>
            <Button onClick={() => previewVersion && handleDownload(previewVersion, previewContent)} className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white">
              <Download className="w-4 h-4 mr-2" />
              Descargar .md
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <article className="prose prose-invert prose-violet max-w-none prose-headings:text-zinc-100 prose-headings:border-b prose-headings:border-zinc-800 prose-headings:pb-2 prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-p:text-zinc-300 prose-p:leading-relaxed prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline prose-strong:text-zinc-200 prose-code:text-violet-300 prose-code:bg-zinc-900 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800 prose-li:text-zinc-300 prose-blockquote:border-violet-500 prose-blockquote:text-zinc-400 prose-table:text-zinc-300 prose-th:text-zinc-200 prose-th:border-zinc-700 prose-td:border-zinc-800 prose-hr:border-zinc-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
            </article>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error dialog */}
      <Dialog open={showError} onOpenChange={setShowError}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-red-500 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Detalle del Error
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-red-950/30 border border-red-900/50 rounded-md overflow-x-auto">
            <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap">{errorContent}</pre>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">Eliminar versión v{deleteTarget?.version}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400">
            Se borrará el archivo output.md ({deleteTarget ? formatBytes(deleteTarget.file_size) : '0 B'}).
            Esta acción no se puede deshacer.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteVersion} disabled={deleting} className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup dialog */}
      <Dialog open={showCleanup} onOpenChange={setShowCleanup}>
        <DialogContent className="bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">Limpiar versiones antiguas</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm text-zinc-400">Mantener las últimas</Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  type="number"
                  min={1}
                  max={runs.length}
                  value={keepCount}
                  onChange={(e) => setKeepCount(Math.max(1, Math.min(runs.length, parseInt(e.target.value) || 1)))}
                  className="w-20 bg-zinc-900 border-zinc-700 text-zinc-50"
                />
                <span className="text-sm text-zinc-400">versiones</span>
              </div>
            </div>
            {runsToClean.length > 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-sm">
                <p className="text-zinc-300">
                  Se eliminarán <span className="text-red-400 font-medium">{runsToClean.length} versiones</span>{' '}
                  ({runsToClean.map((r) => `v${r.version}`).join(', ')})
                </p>
                <p className="text-zinc-500 mt-1">
                  Liberando aproximadamente {formatBytes(cleanableBytes)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No hay versiones para eliminar con esta configuración.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCleanup(false)} className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCleanup}
              disabled={cleaning || runsToClean.length === 0}
              className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/20"
            >
              {cleaning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Limpiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
