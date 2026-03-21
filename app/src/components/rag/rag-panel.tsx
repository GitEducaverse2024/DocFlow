"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { Project } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Database, Search, Trash2, RefreshCw, Copy, CheckCircle2, AlertCircle, Bot, AlertTriangle, Cpu, Layers, BookOpen, Globe, Plug, Terminal, Download, Zap, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { HelpText } from '@/components/ui/help-text';
import { copyToClipboard } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface RagPanelProps {
  project: Project;
  onProjectUpdate: () => void;
}

interface EmbeddingModel {
  name: string;
  full_name?: string;
  size_mb: number;
  family?: string;
  parameter_size?: string;
  description?: string;
  installed?: boolean;
  supports_mrl?: boolean;
  mrl_dims?: number[];
  native_dims?: number;
}

export function RagPanel({ project, onProjectUpdate }: RagPanelProps) {
  const t = useTranslations('rag');
  const [loading, setLoading] = useState(true);
  const [ragInfo, setRagInfo] = useState<{
    enabled: boolean;
    collectionName?: string;
    vectorCount?: number;
    pointsCount?: number;
    vectorDimensions?: number;
    embeddingModel?: string;
    model?: string;
    status?: string;
    error?: string;
    indexedVersion?: number | null;
    indexedAt?: string | null;
    currentVersion?: number;
    isOutdated?: boolean;
  } | null>(null);

  // Config state
  const [collectionName, setCollectionName] = useState(project?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '');
  const [model, setModel] = useState('nomic-embed-text');
  const [chunkSize, setChunkSize] = useState([512]);
  const [chunkOverlap, setChunkOverlap] = useState([50]);
  const [truncateDim, setTruncateDim] = useState<number | null>(null);

  // Models state
  const [installedModels, setInstalledModels] = useState<EmbeddingModel[]>([]);
  const [suggestedModels, setSuggestedModels] = useState<EmbeddingModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Indexing state
  const [isIndexing, setIsIndexing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [ragElapsed, setRagElapsed] = useState(0);
  const [chunksProcessed, setChunksProcessed] = useState(0);
  const [chunksTotal, setChunksTotal] = useState(0);
  const ragTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Query state
  const [query, setQuery] = useState('');
  const [isQuerying, setIsQuerying] = useState(false);
  const [results, setResults] = useState<{ score: number, payload: { chunk_index?: number, text: string, source_name?: string, content_type?: string, section_path?: string } }[]>([]);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  const [copied, setCopied] = useState(false);

  // Get selected model info
  const selectedModelInfo = useMemo(() => {
    return installedModels.find(m => m.name === model) ||
           suggestedModels.find(m => m.name.split(':')[0] === model);
  }, [model, installedModels, suggestedModels]);

  useEffect(() => {
    fetchRagInfo();
    fetchEmbeddingModels();
  }, [project.id]);

  // Reset MRL when model changes
  useEffect(() => {
    if (selectedModelInfo?.supports_mrl && selectedModelInfo.mrl_dims) {
      setTruncateDim(null);
    } else {
      setTruncateDim(null);
    }
  }, [model, selectedModelInfo]);

  const fetchRagInfo = async () => {
    try {
      const res = await fetch(`/api/catbrains/${project.id}/rag/info`);
      if (res.ok) {
        const data = await res.json();
        setRagInfo(data);
      }
    } catch {
      console.error('Error fetching RAG info');
    } finally {
      setLoading(false);
    }
  };

  const fetchEmbeddingModels = async () => {
    setLoadingModels(true);
    try {
      const res = await fetch('/api/models?type=embedding');
      if (res.ok) {
        const data = await res.json();
        setInstalledModels(data.installed || []);
        setSuggestedModels(data.suggestions || []);
        if (data.installed?.length > 0 && model === 'nomic-embed-text') {
          const qwen = data.installed.find((m: EmbeddingModel) => m.name.includes('qwen3-embedding'));
          if (qwen) setModel(qwen.name);
        }
      }
    } catch {
      // Fallback: no dynamic models available
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (isIndexing) {
      setRagElapsed(0);
      ragTimerRef.current = setInterval(() => {
        setRagElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (ragTimerRef.current) {
        clearInterval(ragTimerRef.current);
        ragTimerRef.current = null;
      }
    }
    return () => { if (ragTimerRef.current) clearInterval(ragTimerRef.current); };
  }, [isIndexing]);

  const [ragLogHistory, setRagLogHistory] = useState<string[]>([]);

  const lastProgressRef = useRef('');
  useEffect(() => {
    if (progressMsg && progressMsg !== lastProgressRef.current) {
      lastProgressRef.current = progressMsg;
      setRagLogHistory(prev => [...prev, progressMsg]);
    }
    if (!isIndexing) {
      lastProgressRef.current = '';
      setRagLogHistory([]);
    }
  }, [progressMsg, isIndexing]);

  const getRagLogs = () => {
    return ragLogHistory.map((text, i) => ({
      text,
      done: i < ragLogHistory.length - 1,
    }));
  };

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/catbrains/${project.id}/rag/status`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'running') {
          setProgressMsg(data.progress || t('indexing'));
          if (data.chunksProcessed !== undefined) setChunksProcessed(data.chunksProcessed);
          if (data.chunksTotal !== undefined) setChunksTotal(data.chunksTotal);
        } else if (data.status === 'completed') {
          stopPolling();
          setIsIndexing(false);
          setProgressMsg('');
          setChunksProcessed(0);
          setChunksTotal(0);
          toast.success(t('indexComplete', { count: data.chunksCount }));
          try {
            await fetch(`/api/catbrains/${project.id}/bot/create`, { method: 'POST' });
          } catch (e) {
            console.error('Error creating bot:', e);
          }
          onProjectUpdate();
          fetchRagInfo();
        } else if (data.status === 'error') {
          stopPolling();
          setIsIndexing(false);
          setProgressMsg('');
          setChunksProcessed(0);
          setChunksTotal(0);
          toast.error(data.error || t('indexError'));
        } else if (data.status === 'idle') {
          stopPolling();
          setIsIndexing(false);
          setProgressMsg('');
          setChunksProcessed(0);
          setChunksTotal(0);
        }
      } catch {
        // Network error during poll - keep trying
      }
    }, 2000);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleIndex = async (isReindex = false) => {
    if (isReindex && !confirm(t('confirmReindex'))) {
      return;
    }

    setIsIndexing(true);
    setProgressMsg(t('startingIndexing'));

    try {
      const res = await fetch(`/api/catbrains/${project.id}/rag/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collectionName,
          model,
          chunkSize: chunkSize[0],
          chunkOverlap: chunkOverlap[0],
          truncateDim: truncateDim || undefined,
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('indexError'));
      }

      startPolling();
    } catch (error: unknown) {
      toast.error((error as Error).message);
      setIsIndexing(false);
      setProgressMsg('');
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('confirmDelete'))) {
      return;
    }

    try {
      const res = await fetch(`/api/catbrains/${project.id}/rag`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(t('deleteError'));

      toast.success(t('collectionDeleted'));
      onProjectUpdate();
      setRagInfo({ enabled: false });
    } catch {
      toast.error(t('deleteCollectionError'));
    }
  };

  const handleQuery = async () => {
    if (!query.trim()) return;

    setIsQuerying(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}/rag/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 10, minScore: 0.2 })
      });

      if (!res.ok) throw new Error(t('queryError'));

      const data = await res.json();
      setResults(data.results || []);
    } catch {
      toast.error(t('queryErrorShort'));
    } finally {
      setIsQuerying(false);
    }
  };

  // Score color helper
  const scoreColor = (score: number) => {
    if (score >= 0.7) return 'text-emerald-400';
    if (score >= 0.5) return 'text-yellow-400';
    if (score >= 0.35) return 'text-orange-400';
    return 'text-red-400';
  };

  const scoreBg = (score: number) => {
    if (score >= 0.7) return 'bg-emerald-500/10 border-emerald-500/30';
    if (score >= 0.5) return 'bg-yellow-500/10 border-yellow-500/30';
    if (score >= 0.35) return 'bg-orange-500/10 border-orange-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  // Content type badge helper
  const contentTypeBadge = (type?: string) => {
    if (!type) return null;
    const validTypes = ['dense', 'narrative', 'list'] as const;
    if (!validTypes.includes(type as typeof validTypes[number])) return null;
    const colorMap: Record<string, string> = {
      dense: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      narrative: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      list: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    };
    return <Badge variant="outline" className={`text-xs ${colorMap[type]}`}>{t(`contentTypes.${type}`)}</Badge>;
  };

  // Time ago helper for indexation info
  const timeAgoStr = (dateStr: string): string => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return t('time.now');
    if (diffMins < 60) return t('time.minutesAgo', { mins: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('time.hoursAgo', { hours: diffHours });
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (project.status !== 'processed' && project.status !== 'rag_indexed') {
    return (
      <div className="text-center py-16 border border-zinc-800 border-dashed rounded-lg bg-zinc-900/50 flex flex-col items-center justify-center">
        <Database className="w-16 h-16 text-zinc-700 mb-4" />
        <h3 className="text-xl font-medium text-zinc-50 mb-2">{t('needsProcessing')}</h3>
        <p className="text-zinc-400 max-w-md mx-auto mb-6">
          {t('needsProcessingDescription')}
        </p>
        <Button
          onClick={() => {
            const processTab = document.querySelector('[value="process"]') as HTMLElement;
            if (processTab) processTab.click();
          }}
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
        >
          {t('goToProcess')}
        </Button>
      </div>
    );
  }

  if (!ragInfo?.enabled) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-50 mb-2">{t('configTitle')}</h2>
          <p className="text-zinc-400">
            {t('configDescription')}
          </p>
        </div>

        {/* Explanation banner */}
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 space-y-1">
            <p>{t('explanationBanner', { version: project.current_version })}</p>
            <p className="text-zinc-500">{t('explanationChunking')}</p>
          </div>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-50">{t('createCollection')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-zinc-300">{t('collectionName')}</Label>
              <Input
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50"
              />
            </div>

            {/* Dynamic model selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Label className="text-zinc-300">{t('embeddingModel')}</Label>
                <HelpText text={t('embeddingHelp')} />
                {loadingModels && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
              </div>
              <Select value={model} onValueChange={(v) => setModel(v || "nomic-embed-text")}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50 max-h-80">
                  {/* Installed models */}
                  {installedModels.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3" /> {t('installed')}
                      </div>
                      {installedModels.map(m => (
                        <SelectItem key={m.name} value={m.name}>
                          <span className="flex items-center gap-2">
                            <span>{m.name}</span>
                            <span className="text-xs text-zinc-500">{m.size_mb}MB</span>
                            {m.supports_mrl && <span className="text-xs text-violet-400">MRL</span>}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {/* Suggested models (can be pulled) */}
                  {suggestedModels.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-violet-400 uppercase tracking-wider flex items-center gap-1.5 mt-1">
                        <Download className="w-3 h-3" /> {t('availableModels')}
                      </div>
                      {suggestedModels.map(m => (
                        <SelectItem key={m.name} value={m.name.split(':')[0]}>
                          <span className="flex items-center gap-2">
                            <span>{m.name}</span>
                            <span className="text-xs text-zinc-500">{m.description}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {/* Fallback if no models detected */}
                  {installedModels.length === 0 && suggestedModels.length === 0 && (
                    <>
                      <SelectItem value="nomic-embed-text">nomic-embed-text (768d) - {t('fallbackFast')}</SelectItem>
                      <SelectItem value="mxbai-embed-large">mxbai-embed-large (1024d) - {t('fallbackPrecise')}</SelectItem>
                      <SelectItem value="qwen3-embedding">qwen3-embedding (1024d) - {t('fallbackMultilingual')}</SelectItem>
                      <SelectItem value="bge-m3">bge-m3 (1024d) - Hybrid search</SelectItem>
                      <SelectItem value="all-minilm">all-minilm (384d) - {t('fallbackLight')}</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>

              {/* MRL dimension selector - only for compatible models */}
              {selectedModelInfo?.supports_mrl && selectedModelInfo.mrl_dims && (
                <div className="mt-3 p-3 bg-violet-500/5 border border-violet-500/20 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-violet-400" />
                    <Label className="text-sm text-violet-300">{t('mrlTitle')}</Label>
                    <HelpText text={t('mrlHelp')} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTruncateDim(null)}
                      className={`px-3 py-1.5 rounded text-sm transition-colors ${!truncateDim ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                    >
                      {t('mrlNative', { dims: selectedModelInfo.native_dims || '?' })}
                    </button>
                    {selectedModelInfo.mrl_dims
                      .filter(d => d !== selectedModelInfo.native_dims)
                      .sort((a, b) => b - a)
                      .map(dim => (
                        <button
                          key={dim}
                          onClick={() => setTruncateDim(dim)}
                          className={`px-3 py-1.5 rounded text-sm transition-colors ${truncateDim === dim ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                          {dim}d
                          <span className="text-xs ml-1 opacity-60">
                            ({t('mrlLess', { percent: Math.round((1 - dim / (selectedModelInfo.native_dims || dim)) * 100) })})
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-300">{t('chunkSize')}</Label>
                  <HelpText text={t('chunkSizeHelp')} />
                </div>
                <span className="text-sm text-zinc-400">{chunkSize[0]}</span>
              </div>
              <input
                type="range"
                value={chunkSize[0]}
                onChange={(e) => setChunkSize([Number(e.target.value)])}
                max={2048}
                min={256}
                step={64}
                className="w-full accent-violet-500 py-2 cursor-pointer"
              />
              {/* Adaptive size preview */}
              <div className="flex gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  {t('chunkPreview.code')}: ~{Math.round(chunkSize[0] * 0.6)} chars
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {t('chunkPreview.narrative')}: ~{Math.round(chunkSize[0] * 1.4)} chars
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {t('chunkPreview.lists')}: ~{chunkSize[0]} chars
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-300">{t('overlap')}</Label>
                  <HelpText text={t('overlapHelp')} />
                </div>
                <span className="text-sm text-zinc-400">{chunkOverlap[0]}</span>
              </div>
              <input
                type="range"
                value={chunkOverlap[0]}
                onChange={(e) => setChunkOverlap([Number(e.target.value)])}
                max={256}
                min={0}
                step={10}
                className="w-full accent-violet-500 py-2 cursor-pointer"
              />
            </div>

            {/* Estimation banner */}
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 flex items-center gap-3 text-sm text-zinc-400">
              <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
              <span>
                {t('estimationBanner')}
              </span>
            </div>

            <Button
              className="w-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              onClick={() => handleIndex(false)}
              disabled={isIndexing || !collectionName.trim()}
            >
              {isIndexing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {progressMsg || t('indexing')}
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  {t('indexDocuments')}
                  {truncateDim && <span className="ml-1 text-xs opacity-70">({truncateDim}d MRL)</span>}
                </>
              )}
            </Button>

            {isIndexing && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3">
                {/* Progress bar */}
                {chunksTotal > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300 font-medium">
                        {chunksProcessed}/{chunksTotal} chunks
                      </span>
                      <span className="text-violet-400 font-mono">
                        {Math.round((chunksProcessed / chunksTotal) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((chunksProcessed / chunksTotal) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Current step + timer */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-violet-400 animate-pulse">{progressMsg}</p>
                  <p className="text-xs text-zinc-500 font-mono">
                    {Math.floor(ragElapsed / 60)}:{(ragElapsed % 60).toString().padStart(2, '0')}
                  </p>
                </div>

                {/* Log */}
                <div className="space-y-1 text-xs font-mono text-zinc-400 max-h-32 overflow-y-auto">
                  {getRagLogs().map((log, i) => (
                    <p key={i} className={log.done ? 'text-emerald-400' : 'text-violet-400 animate-pulse'}>
                      {log.done ? '\u2713' : '\u27F3'} {log.text}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ragInfo.error && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-amber-500 font-medium">{t('collectionProblem')}</h4>
            <p className="text-sm text-amber-400/80">{ragInfo.error}</p>
          </div>
        </div>
      )}

      {/* Status banner */}
      {ragInfo.isOutdated ? (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <h4 className="text-amber-500 font-medium">{t('outdatedBanner', { indexedVersion: ragInfo.indexedVersion })}</h4>
              <p className="text-amber-400/80">
                {t.rich('outdatedDescription', {
                  currentVersion: ragInfo.currentVersion,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>
          </div>
          <Button
            onClick={() => handleIndex(true)}
            disabled={isIndexing}
            className="bg-amber-600 hover:bg-amber-500 text-white flex-shrink-0"
          >
            {isIndexing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {t('reindexWith', { version: ragInfo.currentVersion })}
          </Button>
        </div>
      ) : !ragInfo.error && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300">
            <p>{t('upToDate', { version: ragInfo.indexedVersion ?? ragInfo.currentVersion })}</p>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <Database className="w-5 h-5 text-violet-500" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">{t('stats.vectors')}</p>
                <p className="text-xl font-bold text-zinc-50">{ragInfo.vectorCount?.toLocaleString() || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Cpu className="w-5 h-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">{t('stats.embeddingModel')}</p>
                <p className="text-sm font-semibold text-zinc-50 truncate">{ragInfo.embeddingModel || ragInfo.model || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Layers className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-zinc-500">{t('stats.dimensions')}</p>
                <p className="text-xl font-bold text-zinc-50">{ragInfo.vectorDimensions || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Search className="w-5 h-5 text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">{t('stats.collection')}</p>
                <p className="text-sm font-semibold text-zinc-50 truncate" title={ragInfo.collectionName}>{ragInfo.collectionName}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Indexation info + actions row */}
      <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-3">
        <div className="flex items-center gap-4 text-sm text-zinc-400">
          {ragInfo.indexedAt && (
            <span>
              {t('lastIndexation')} <span className="text-zinc-300">{timeAgoStr(ragInfo.indexedAt)}</span>
            </span>
          )}
          {ragInfo.indexedVersion != null && (
            <span>
              {t('document')} <span className="text-zinc-300 font-mono">v{ragInfo.indexedVersion}</span>
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleIndex(true)}
            disabled={isIndexing}
            className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
          >
            {isIndexing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            {t('reindex')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isIndexing}
            className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
          >
            <Trash2 className="w-4 h-4 mr-1.5" />
            {t('delete')}
          </Button>
        </div>
      </div>

      {(project.bot_created ?? 0) === 1 && project.bot_agent_id && (
        <Card className="bg-zinc-900 border-violet-500/30 overflow-hidden">
          <div className="bg-violet-500/10 px-6 py-4 border-b border-violet-500/20 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-violet-400">{t('botExpert.title')}</h3>
              <p className="text-sm text-violet-400/70">{t('botExpert.subtitle')}</p>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-zinc-400 mb-1">{t('botExpert.name')}</p>
                <p className="font-medium text-zinc-50 mb-4">{t('botExpert.expertName', { name: project.name })}</p>

                <p className="text-sm text-zinc-400 mb-1">{t('botExpert.agentId')}</p>
                <code className="bg-zinc-950 px-2 py-1 rounded text-violet-400 text-sm">{project.bot_agent_id}</code>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-zinc-400 mb-2">{t('botExpert.activateStep')}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-zinc-950 px-3 py-2 rounded text-zinc-300 text-sm">openclaw agents add {project.bot_agent_id}</code>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (copyToClipboard(`openclaw agents add ${project.bot_agent_id}`)) {
                        toast.success(t('botExpert.commandCopied'));
                      } else {
                        toast.error(t('botExpert.copyError'));
                      }
                    }} className="h-9 w-9 text-zinc-400 hover:text-zinc-50">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-zinc-400 mb-2">{t('botExpert.chatStep')}</p>
                  <a
                    href={`http://127.0.0.1:18789/chat?session=agent:${project.bot_agent_id}:${project.bot_agent_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-gradient-to-r from-violet-600 to-purple-700 text-white hover:from-violet-500 hover:to-purple-600 h-9 px-4 py-2 w-full"
                  >
                    {t('botExpert.openInOpenClaw')}
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-lg text-zinc-50">{t('query.title')}</CardTitle>
            <CardDescription className="text-zinc-400">
              {t('query.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder={t('query.placeholder')}
                className="bg-zinc-950 border-zinc-800 text-zinc-50"
              />
              <Button
                onClick={handleQuery}
                disabled={isQuerying || !query.trim()}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {isQuerying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            <div className="space-y-3 mt-4 max-h-[400px] overflow-y-auto pr-2">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  className={`p-3 border rounded-lg cursor-pointer hover:border-zinc-600 transition-colors ${scoreBg(result.score)}`}
                  onClick={() => setExpandedResult(expandedResult === idx ? null : idx)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="bg-violet-500/10 text-violet-500 border-0 text-xs">
                        #{idx + 1}
                      </Badge>
                      {result.payload?.source_name && result.payload.source_name !== 'documento' && (
                        <Badge variant="outline" className="bg-zinc-900/50 border-zinc-700 text-zinc-300 text-xs truncate max-w-[200px]">
                          {result.payload.source_name}
                        </Badge>
                      )}
                      {contentTypeBadge(result.payload?.content_type)}
                      {result.payload?.section_path && (
                        <span className="text-xs text-zinc-600 truncate max-w-[250px]" title={result.payload.section_path}>
                          {result.payload.section_path}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-bold ${scoreColor(result.score)}`}>
                      {(result.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className={`text-sm text-zinc-300 ${expandedResult === idx ? '' : 'line-clamp-3'}`}>
                    {result.payload?.text}
                  </p>
                </div>
              ))}
              {results.length === 0 && !isQuerying && query && (
                <p className="text-center text-zinc-500 py-4">{t('query.noResults')}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-zinc-50 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-violet-400" />
                  {t('mcp.title')}
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  {t('mcp.description')}
                </CardDescription>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-0">{t('mcp.active')}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* MCP Endpoint URL */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500 uppercase tracking-wider">{t('mcp.endpoint')}</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-violet-400 font-mono truncate">
                  /api/mcp/{project.id}
                </code>
                <Button size="icon" variant="ghost" onClick={() => {
                  const url = `${window.location.origin}/api/mcp/${project.id}`;
                  if (copyToClipboard(url)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                    toast.success(t('mcp.urlCopied'));
                  }
                }} className="h-9 w-9 text-zinc-400 hover:text-zinc-50 flex-shrink-0">
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* MCP Tools */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500 uppercase tracking-wider">{t('mcp.tools')}</Label>
              <div className="space-y-1">
                <div className="flex items-center gap-2 bg-zinc-950 rounded px-3 py-1.5 border border-zinc-800">
                  <Search className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-sm text-zinc-300">search_knowledge</span>
                  <span className="text-xs text-zinc-600 ml-auto">{t('mcp.semanticSearch')}</span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-950 rounded px-3 py-1.5 border border-zinc-800">
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-sm text-zinc-300">get_project_info</span>
                  <span className="text-xs text-zinc-600 ml-auto">{t('mcp.metadata')}</span>
                </div>
                <div className="flex items-center gap-2 bg-zinc-950 rounded px-3 py-1.5 border border-zinc-800">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-sm text-zinc-300">get_document</span>
                  <span className="text-xs text-zinc-600 ml-auto">{t('mcp.fullOutput')}</span>
                </div>
              </div>
            </div>

            {/* Connection Snippets */}
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500 uppercase tracking-wider">{t('mcp.connectFrom')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const code = `# openclaw.json → shttp_servers\n{\n  "url": "${window.location.origin}/api/mcp/${project.id}",\n  "name": "DoCatFlow — ${project.name}"\n}`;
                    if (copyToClipboard(code)) toast.success(t('mcp.configCopied.openclaw'));
                  }}
                  className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Bot className="w-4 h-4 text-violet-400" />
                  OpenClaw
                </button>
                <button
                  onClick={() => {
                    const code = `# .openhands/config.toml → [mcp]\nservers = ["${window.location.origin}/api/mcp/${project.id}"]`;
                    if (copyToClipboard(code)) toast.success(t('mcp.configCopied.openhands'));
                  }}
                  className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Terminal className="w-4 h-4 text-blue-400" />
                  OpenHands
                </button>
                <button
                  onClick={() => {
                    const code = `# n8n MCP Client node\nURL: ${window.location.origin}/api/mcp/${project.id}\nProtocol: Streamable HTTP`;
                    if (copyToClipboard(code)) toast.success(t('mcp.configCopied.n8n'));
                  }}
                  className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Plug className="w-4 h-4 text-amber-400" />
                  n8n
                </button>
                <button
                  onClick={() => {
                    const code = `# curl test\ncurl -X POST ${window.location.origin}/api/mcp/${project.id} \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;
                    if (copyToClipboard(code)) toast.success(t('mcp.configCopied.curl'));
                  }}
                  className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  <Globe className="w-4 h-4 text-emerald-400" />
                  curl / HTTP
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
