'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Project, Source } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Check, FileText, Globe, Youtube, StickyNote, Trash2, Upload,
  Cpu, BookOpen, EyeOff, ChevronRight, ChevronLeft, Loader2,
  AlertTriangle, MessageCircle, Database, Play, RotateCcw,
  Code, Image as ImageIcon, FileSpreadsheet, File, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { useSSEStream } from '@/hooks/use-sse-stream';
import { FileUploadZone } from '@/components/sources/file-upload-zone';
import { UrlInput } from '@/components/sources/url-input';
import { YoutubeInput } from '@/components/sources/youtube-input';
import { NoteEditor } from '@/components/sources/note-editor';

interface SourcesPipelineProps {
  catbrainId: string;
  catbrain: Project;
  onComplete: () => void;
  onBack: () => void;
}

interface RagInfo {
  enabled: boolean;
  collectionName?: string;
  vectorCount?: number;
  embeddingModel?: string;
}

interface IndexResult {
  vectorsAdded: number;
  sourcesProcessed: number;
  failures?: { name: string; reason: string }[];
}

interface CatPawAgent {
  id: string;
  name: string;
  model?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function getSourceIcon(source: Source) {
  if (source.type === 'url') return Globe;
  if (source.type === 'youtube') return Youtube;
  if (source.type === 'note') return StickyNote;
  // File types
  const ft = source.file_type || '';
  if (ft.includes('pdf')) return FileText;
  if (ft.includes('image')) return ImageIcon;
  if (ft.includes('spreadsheet') || ft.includes('csv')) return FileSpreadsheet;
  if (ft.includes('javascript') || ft.includes('typescript') || ft.includes('python') || ft.includes('json')) return Code;
  return File;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourcesPipeline({ catbrainId, catbrain, onComplete, onBack }: SourcesPipelineProps) {
  const t = useTranslations('catbrains');

  // Phase state
  const [currentPhase, setCurrentPhase] = useState(1);

  // Phase 1 state
  const [sources, setSources] = useState<Source[]>([]);
  const [newSourceIds, setNewSourceIds] = useState<Set<string>>(new Set());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<'files' | 'urls' | 'youtube' | 'notes'>('files');
  const [loadingSources, setLoadingSources] = useState(true);

  // Phase 2 state
  const [sourceModes, setSourceModes] = useState<Record<string, 'process' | 'direct' | 'exclude'>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processComplete, setProcessComplete] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);
  const [processElapsed, setProcessElapsed] = useState(0);
  const [agents, setAgents] = useState<CatPawAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(catbrain.agent_id || '');
  const [showAgentList, setShowAgentList] = useState(false);
  const processTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<{ text: string; type: 'info' | 'token' | 'error' | 'success' }[]>([]);
  const [streamTimedOut, setStreamTimedOut] = useState(false);
  const lastTokenTimeRef = useRef<number>(0);
  const timeoutCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consoleEndRef = useRef<HTMLDivElement | null>(null);

  // Phase 3 state
  const [ragInfo, setRagInfo] = useState<RagInfo | null>(null);
  const [loadingRagInfo, setLoadingRagInfo] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ processed: 0, total: 0, percent: 0 });
  const [indexComplete, setIndexComplete] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexResult, setIndexResult] = useState<IndexResult | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [collectionName, setCollectionName] = useState(catbrain.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
  const [selectedModel, setSelectedModel] = useState('nomic-embed-text');
  const [chunkSize, setChunkSize] = useState(512);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [showFailures, setShowFailures] = useState(false);
  // RAG SSE console state
  const [ragConsoleLogs, setRagConsoleLogs] = useState<{ text: string; type: 'info' | 'token' | 'error' | 'success' }[]>([]);
  const [ragStreamTimedOut, setRagStreamTimedOut] = useState(false);
  const ragLastProgressRef = useRef<number>(0);
  const ragTimeoutCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ragConsoleEndRef = useRef<HTMLDivElement | null>(null);
  const ragReconnectCountRef = useRef(0);
  const ragReconnectParamsRef = useRef<Record<string, unknown> | null>(null);

  // SSE Stream for processing
  const sseStream = useSSEStream({
    onToken: (token) => {
      lastTokenTimeRef.current = Date.now();
      setStreamTimedOut(false);
      setConsoleLogs(prev => {
        const last = prev[prev.length - 1];
        if (last && last.type === 'token') {
          return [...prev.slice(0, -1), { text: last.text + token, type: 'token' as const }];
        }
        return [...prev, { text: token, type: 'token' as const }];
      });
    },
    onStage: (data) => {
      lastTokenTimeRef.current = Date.now();
      const msg = data.message || data.stage;
      setConsoleLogs(prev => [...prev, { text: msg, type: 'info' as const }]);
    },
    onDone: () => {
      setIsProcessing(false);
      setProcessComplete(true);
      if (processTimerRef.current) { clearInterval(processTimerRef.current); processTimerRef.current = null; }
      if (timeoutCheckRef.current) { clearInterval(timeoutCheckRef.current); timeoutCheckRef.current = null; }
      setConsoleLogs(prev => [...prev, { text: t('sourcesFlow.process.processComplete'), type: 'success' as const }]);
      toast.success(t('sourcesFlow.process.processComplete'));
    },
    onError: (error) => {
      setIsProcessing(false);
      setProcessError(error.message);
      if (processTimerRef.current) { clearInterval(processTimerRef.current); processTimerRef.current = null; }
      if (timeoutCheckRef.current) { clearInterval(timeoutCheckRef.current); timeoutCheckRef.current = null; }
      setConsoleLogs(prev => [...prev, { text: error.message, type: 'error' as const }]);
      toast.error(t('sourcesFlow.process.processError'));
    },
  });

  // SSE Stream for RAG indexing (Phase 3)
  const ragStream = useSSEStream({
    onToken: () => {
      // RAG doesn't use tokens, but keep for interface compat
    },
    onStage: (data) => {
      ragLastProgressRef.current = Date.now();
      setRagStreamTimedOut(false);
      const processed = (data as Record<string, unknown>).chunksProcessed as number || 0;
      const total = (data as Record<string, unknown>).chunksTotal as number || 0;
      const percent = (data as Record<string, unknown>).percent as number || (total > 0 ? Math.round((processed / total) * 100) : 0);
      const currentSource = (data as Record<string, unknown>).currentSource as string || '';
      const elapsed = (data as Record<string, unknown>).elapsed as number || 0;
      setIndexProgress({ processed, total, percent });
      const msg = currentSource
        ? `Chunk ${processed}/${total} · ${currentSource} · ${percent}%${elapsed > 0 ? ` · ${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : ''}`
        : (data.message || data.stage);
      setRagConsoleLogs(prev => {
        // Replace last progress line instead of appending
        if (prev.length > 0 && prev[prev.length - 1].type === 'token') {
          return [...prev.slice(0, -1), { text: msg, type: 'token' as const }];
        }
        return [...prev, { text: msg, type: 'token' as const }];
      });
    },
    onDone: (data) => {
      setIsIndexing(false);
      setIndexComplete(true);
      const chunksCount = (data as Record<string, unknown>).chunksCount as number || 0;
      setIndexResult({ vectorsAdded: chunksCount, sourcesProcessed: sources.length });
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      if (ragTimeoutCheckRef.current) { clearInterval(ragTimeoutCheckRef.current); ragTimeoutCheckRef.current = null; }
      setRagConsoleLogs(prev => [...prev, { text: t('sourcesFlow.index.complete'), type: 'success' as const }]);
      toast.success(t('sourcesFlow.index.complete'));
      ragReconnectCountRef.current = 0;
      // Auto-navigate to chat after successful index
      if (autoIndexTriggeredRef.current) {
        setTimeout(() => onComplete(), 1500);
      }
    },
    onError: (error) => {
      // Auto-reconnect up to 3 times
      if (ragReconnectCountRef.current < 3 && ragReconnectParamsRef.current) {
        ragReconnectCountRef.current++;
        const attempt = ragReconnectCountRef.current;
        setRagConsoleLogs(prev => [...prev, {
          text: t('sourcesFlow.index.reconnecting', { attempt }),
          type: 'info' as const,
        }]);
        setTimeout(() => {
          if (ragReconnectParamsRef.current) {
            ragStream.start(`/api/catbrains/${catbrainId}/rag/create`, ragReconnectParamsRef.current);
          }
        }, 2000);
        return;
      }
      setIsIndexing(false);
      setIndexError(error.message);
      if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      if (ragTimeoutCheckRef.current) { clearInterval(ragTimeoutCheckRef.current); ragTimeoutCheckRef.current = null; }
      const errorData = error as unknown as Record<string, unknown>;
      const logs: { text: string; type: 'info' | 'token' | 'error' | 'success' }[] = [
        { text: error.message, type: 'error' as const },
      ];
      if (errorData.currentSource) {
        logs.push({ text: t('sourcesFlow.index.errorSource', { source: String(errorData.currentSource) }), type: 'info' as const });
      }
      if (errorData.chunksCompleted) {
        logs.push({ text: t('sourcesFlow.index.errorChunks', { completed: String(errorData.chunksCompleted), total: String(errorData.chunksTotal || '?') }), type: 'info' as const });
      }
      if (errorData.errorType && errorData.errorType !== 'unknown') {
        logs.push({ text: t('sourcesFlow.index.errorType', { type: String(errorData.errorType) }), type: 'info' as const });
      }
      if (ragReconnectCountRef.current >= 3) {
        logs.push({ text: t('sourcesFlow.index.reconnectFailed'), type: 'error' as const });
      }
      setRagConsoleLogs(prev => [...prev, ...logs]);
      toast.error(t('sourcesFlow.index.error'));
      ragReconnectCountRef.current = 0;
    },
  });

  // Fetch sources
  const fetchSources = useCallback(async () => {
    try {
      setLoadingSources(true);
      const res = await fetch(`/api/catbrains/${catbrainId}/sources`);
      if (res.ok) {
        const data = await res.json();
        setSources(data);
        // Initialize source modes — already-processed sources default to 'direct'
        // (they already have content_text, no need to re-process with LLM)
        setSourceModes(prev => {
          const next = { ...prev };
          for (const s of data) {
            if (!(s.id in next)) {
              const alreadyProcessed = s.content_text && s.content_text.trim().length > 10;
              next[s.id] = s.process_mode || (alreadyProcessed ? 'direct' : 'process');
            }
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Error fetching sources:', err);
    } finally {
      setLoadingSources(false);
    }
  }, [catbrainId]);

  useEffect(() => { fetchSources(); }, [fetchSources, refreshTrigger]);

  // Fetch agents for Phase 2
  useEffect(() => {
    if (currentPhase === 2) {
      fetch('/api/cat-paws')
        .then(r => r.ok ? r.json() : [])
        .then(data => setAgents(Array.isArray(data) ? data : []))
        .catch(() => setAgents([]));
    }
  }, [currentPhase]);

  // Fetch RAG info on Phase 3 enter (or preload for auto-index)
  const ragInfoFetchedRef = useRef(false);
  const autoIndexTriggeredRef = useRef(false);

  const fetchRagInfo = useCallback(async () => {
    setLoadingRagInfo(true);
    try {
      const r = await fetch(`/api/catbrains/${catbrainId}/rag/info`);
      const data = r.ok ? await r.json() : { enabled: false };
      const info: RagInfo = {
        enabled: !!data.enabled,
        collectionName: data.collectionName,
        vectorCount: data.vectorCount,
        embeddingModel: data.embeddingModel,
      };
      setRagInfo(info);
      ragInfoFetchedRef.current = true;
      return info;
    } catch {
      setRagInfo({ enabled: false });
      ragInfoFetchedRef.current = true;
      return { enabled: false } as RagInfo;
    } finally {
      setLoadingRagInfo(false);
    }
  }, [catbrainId]);

  useEffect(() => {
    if (currentPhase === 3 && !ragInfoFetchedRef.current) {
      fetchRagInfo();
    }
  }, [currentPhase, fetchRagInfo]);

  // Auto-advance to Phase 3 and auto-start indexing when processing completes
  // and RAG already exists (append path = seamless, no user intervention needed)
  useEffect(() => {
    if (!processComplete || autoIndexTriggeredRef.current) return;

    const autoIndex = async () => {
      const info = ragInfoFetchedRef.current ? ragInfo : await fetchRagInfo();
      if (info?.enabled && info?.collectionName) {
        // RAG exists → auto-advance to Phase 3 and auto-start append
        autoIndexTriggeredRef.current = true;
        setCurrentPhase(3);
        // Small delay to let Phase 3 render before starting
        setTimeout(() => {
          handleStartIndex(info);
        }, 500);
      }
    };

    autoIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processComplete]);

  // Delete source
  const handleDelete = async (sourceId: string) => {
    try {
      const res = await fetch(`/api/catbrains/${catbrainId}/sources/${sourceId}`, { method: 'DELETE' });
      if (res.ok) {
        setNewSourceIds(prev => { const n = new Set(prev); n.delete(sourceId); return n; });
        setRefreshTrigger(r => r + 1);
      }
    } catch { /* ignore */ }
  };

  // Update source process_mode
  const handleModeChange = async (sourceId: string, mode: 'process' | 'direct' | 'exclude') => {
    setSourceModes(prev => ({ ...prev, [sourceId]: mode }));
    try {
      await fetch(`/api/catbrains/${catbrainId}/sources/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process_mode: mode }),
      });
    } catch { /* ignore, state already updated */ }
  };

  // Batch mode change
  const handleBatchMode = (mode: 'process' | 'direct') => {
    for (const s of sources) {
      handleModeChange(s.id, mode);
    }
  };

  // Start processing (Phase 2)
  const handleProcess = () => {
    const processIds = sources.filter(s => sourceModes[s.id] === 'process').map(s => s.id);
    const directIds = sources.filter(s => sourceModes[s.id] === 'direct').map(s => s.id);
    const totalSources = processIds.length + directIds.length;

    setIsProcessing(true);
    setProcessError(null);
    setProcessElapsed(0);
    setStreamTimedOut(false);
    setConsoleLogs([{
      text: t('sourcesFlow.process.startLog', { count: totalSources }),
      type: 'info',
    }]);

    lastTokenTimeRef.current = Date.now();
    processTimerRef.current = setInterval(() => setProcessElapsed(e => e + 1), 1000);
    timeoutCheckRef.current = setInterval(() => {
      if (lastTokenTimeRef.current && Date.now() - lastTokenTimeRef.current > 120_000) {
        setStreamTimedOut(true);
      }
    }, 10_000);

    sseStream.start(`/api/catbrains/${catbrainId}/process`, {
      processedSources: processIds,
      directSources: directIds,
      instructions: '',
      skill_ids: [],
      useLocalProcessing: true,
      stream: true,
    });
  };

  // Cancel processing
  const handleCancelProcess = () => {
    sseStream.stop();
    setIsProcessing(false);
    setStreamTimedOut(false);
    if (processTimerRef.current) { clearInterval(processTimerRef.current); processTimerRef.current = null; }
    if (timeoutCheckRef.current) { clearInterval(timeoutCheckRef.current); timeoutCheckRef.current = null; }
    setConsoleLogs(prev => [...prev, { text: t('sourcesFlow.process.cancelled'), type: 'info' as const }]);
  };

  // Cancel RAG indexing
  const handleCancelIndex = () => {
    ragStream.stop();
    setIsIndexing(false);
    setRagStreamTimedOut(false);
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
    if (ragTimeoutCheckRef.current) { clearInterval(ragTimeoutCheckRef.current); ragTimeoutCheckRef.current = null; }
    setRagConsoleLogs(prev => [...prev, { text: t('sourcesFlow.index.cancelled'), type: 'info' as const }]);
    ragReconnectCountRef.current = 0;
  };

  // Start indexing (Phase 3)
  // Accepts optional ragInfoOverride for auto-index (state may not be updated yet)
  const handleStartIndex = async (ragInfoOverride?: RagInfo) => {
    setIsIndexing(true);
    setIndexError(null);
    setIndexResult(null);
    setIndexComplete(false);
    setElapsedSeconds(0);
    setRagStreamTimedOut(false);
    ragReconnectCountRef.current = 0;
    elapsedTimerRef.current = setInterval(() => setElapsedSeconds(e => e + 1), 1000);

    const effectiveRagInfo = ragInfoOverride || ragInfo;
    const useAppend = effectiveRagInfo?.enabled && effectiveRagInfo?.collectionName;

    if (useAppend) {
      // Append path — synchronous, no SSE needed
      setRagConsoleLogs([{ text: t('sourcesFlow.index.startLog', { count: sources.length }), type: 'info' }]);
      try {
        const nonExcluded = sources.filter(s => sourceModes[s.id] !== 'exclude').map(s => s.id);
        const res = await fetch(`/api/catbrains/${catbrainId}/rag/append`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceIds: nonExcluded }),
        });

        if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }

        if (res.ok) {
          const data = await res.json();
          setIndexResult({ vectorsAdded: data.vectors_added, sourcesProcessed: data.sources_processed });
          setIndexComplete(true);
          setRagConsoleLogs(prev => [...prev, { text: t('sourcesFlow.index.complete'), type: 'success' as const }]);
          toast.success(t('sourcesFlow.index.complete'));
          // Auto-navigate to chat after successful append (seamless flow)
          if (autoIndexTriggeredRef.current) {
            setTimeout(() => onComplete(), 1500);
          }
        } else {
          const err = await res.json();
          setIndexError(err.error || 'Error en indexación');
          setRagConsoleLogs(prev => [...prev, { text: err.error || 'Error en indexación', type: 'error' as const }]);
          if (err.failures) {
            setIndexResult({ vectorsAdded: 0, sourcesProcessed: 0, failures: err.failures });
          }
        }
      } catch (err) {
        setIndexError((err as Error).message);
        setRagConsoleLogs(prev => [...prev, { text: (err as Error).message, type: 'error' as const }]);
        if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null; }
      }
      setIsIndexing(false);
    } else {
      // Create path — SSE stream
      const streamParams = {
        collectionName,
        model: selectedModel,
        chunkSize,
        chunkOverlap,
        stream: true,
      };
      ragReconnectParamsRef.current = streamParams;

      setRagConsoleLogs([
        { text: t('sourcesFlow.index.startLog', { count: sources.length }), type: 'info' },
        { text: t('sourcesFlow.index.validating'), type: 'info' },
      ]);

      ragLastProgressRef.current = Date.now();
      ragTimeoutCheckRef.current = setInterval(() => {
        if (ragLastProgressRef.current && Date.now() - ragLastProgressRef.current > 120_000) {
          setRagStreamTimedOut(true);
        }
      }, 10_000);

      ragStream.start(`/api/catbrains/${catbrainId}/rag/create`, streamParams);
    }
  };

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (processTimerRef.current) clearInterval(processTimerRef.current);
      if (timeoutCheckRef.current) clearInterval(timeoutCheckRef.current);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      if (ragTimeoutCheckRef.current) clearInterval(ragTimeoutCheckRef.current);
    };
  }, []);

  // Auto-scroll consoles
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  useEffect(() => {
    ragConsoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ragConsoleLogs]);

  // Phase 2 computed
  const hasProcessSources = sources.some(s => sourceModes[s.id] === 'process');
  const allDirect = sources.length > 0 && sources.every(s => sourceModes[s.id] === 'direct' || sourceModes[s.id] === 'exclude');
  const canProcess = !isProcessing && (allDirect || selectedAgentId);

  // Step indicator
  const phases = [
    { num: 1, label: t('sourcesFlow.phase1') },
    { num: 2, label: t('sourcesFlow.phase2') },
    { num: 3, label: t('sourcesFlow.phase3') },
  ];

  // Source add callback
  const onSourceAdded = useCallback(() => {
    setRefreshTrigger(r => r + 1);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Title */}
        <h1 className="text-xl font-semibold text-zinc-50">{t('sourcesFlow.title')}</h1>

        {/* Step Indicator */}
        <div className="flex items-center justify-between relative max-w-md mx-auto">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-zinc-800 -z-10" />
          {phases.map((s) => (
            <div key={s.num} className="flex flex-col items-center gap-2 bg-zinc-950 px-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                currentPhase === s.num
                  ? 'bg-violet-500 text-white'
                  : currentPhase > s.num
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-900 text-zinc-500 border-2 border-zinc-800'
              }`}>
                {currentPhase > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span className={`text-xs font-medium ${currentPhase >= s.num ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Phase Content */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6">
          {/* ============= PHASE 1: FUENTES ============= */}
          {currentPhase === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{t('sourcesFlow.sources.title')}</h2>
                <p className="text-sm text-zinc-400 mt-1">{t('sourcesFlow.sources.subtitle')}</p>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                {([
                  { key: 'files' as const, label: t('sourcesFlow.sources.tabFiles'), icon: Upload },
                  { key: 'urls' as const, label: t('sourcesFlow.sources.tabUrls'), icon: Globe },
                  { key: 'youtube' as const, label: t('sourcesFlow.sources.tabYoutube'), icon: Youtube },
                  { key: 'notes' as const, label: t('sourcesFlow.sources.tabNotes'), icon: StickyNote },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
                        : 'text-zinc-400 hover:text-zinc-300'
                    }`}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="min-h-[120px]">
                {activeTab === 'files' && (
                  <FileUploadZone projectId={catbrainId} onUploadComplete={onSourceAdded} />
                )}
                {activeTab === 'urls' && (
                  <UrlInput projectId={catbrainId} onAddComplete={onSourceAdded} />
                )}
                {activeTab === 'youtube' && (
                  <YoutubeInput projectId={catbrainId} onAddComplete={onSourceAdded} />
                )}
                {activeTab === 'notes' && (
                  <NoteEditor projectId={catbrainId} onAddComplete={onSourceAdded} />
                )}
              </div>

              {/* Source list */}
              <div>
                <h3 className="text-sm font-medium text-zinc-300 mb-3">
                  {t('sourcesFlow.sources.existing')} ({sources.length})
                </h3>
                {loadingSources ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
                  </div>
                ) : sources.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                    <FileText className="h-8 w-8 mb-2" />
                    <p className="text-sm">{t('sourcesFlow.sources.noSources')}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {sources.map(source => {
                      const Icon = getSourceIcon(source);
                      return (
                        <div key={source.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
                          <Icon className="h-4 w-4 text-zinc-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-zinc-200 truncate">{source.name}</span>
                              {newSourceIds.has(source.id) && (
                                <Badge className="animate-pulse bg-violet-500/20 text-violet-400 text-[10px] border-0">
                                  {t('sourcesFlow.sources.newBadge')}
                                </Badge>
                              )}
                            </div>
                            {source.file_size && (
                              <span className="text-xs text-zinc-500">{formatSize(source.file_size)}</span>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
                            onClick={() => handleDelete(source.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============= PHASE 2: PROCESAR ============= */}
          {currentPhase === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{t('sourcesFlow.process.title')}</h2>
                <p className="text-sm text-zinc-400 mt-1">{t('sourcesFlow.process.subtitle')}</p>
              </div>

              {/* Batch buttons */}
              {!isProcessing && !processComplete && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleBatchMode('process')} className="text-xs border-zinc-700">
                    <Cpu className="h-3 w-3 mr-1" /> Todos IA
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleBatchMode('direct')} className="text-xs border-zinc-700">
                    <BookOpen className="h-3 w-3 mr-1" /> Todos Directo
                  </Button>
                </div>
              )}

              {/* Source mode list */}
              {!isProcessing && !processComplete && (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {sources.map(source => {
                    const Icon = getSourceIcon(source);
                    const mode = sourceModes[source.id] || 'process';
                    return (
                      <div key={source.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 flex items-center gap-3">
                        <Icon className="h-4 w-4 text-zinc-400 shrink-0" />
                        <span className="text-sm text-zinc-200 truncate flex-1 min-w-0">{source.name}</span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleModeChange(source.id, 'process')}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                              mode === 'process'
                                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                            }`}
                          >
                            <Cpu className="h-3 w-3" />
                            <span className="hidden sm:inline">{t('sourcesFlow.process.modeProcess')}</span>
                          </button>
                          <button
                            onClick={() => handleModeChange(source.id, 'direct')}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                              mode === 'direct'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                            }`}
                          >
                            <BookOpen className="h-3 w-3" />
                            <span className="hidden sm:inline">{t('sourcesFlow.process.modeDirect')}</span>
                          </button>
                          <button
                            onClick={() => handleModeChange(source.id, 'exclude')}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                              mode === 'exclude'
                                ? 'bg-zinc-700/50 text-zinc-400 border border-zinc-600'
                                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                            }`}
                          >
                            <EyeOff className="h-3 w-3" />
                            <span className="hidden sm:inline">{t('sourcesFlow.process.modeExclude')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Agent selector */}
              {!isProcessing && !processComplete && (
                <div>
                  {allDirect ? (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
                      <Info className="h-4 w-4 shrink-0" />
                      {t('sourcesFlow.process.noAgentNeeded')}
                    </div>
                  ) : hasProcessSources && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">{t('sourcesFlow.process.selectAgent')}</label>
                      {showAgentList ? (
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-h-[200px] overflow-y-auto">
                          {agents.map(agent => (
                            <button
                              key={agent.id}
                              onClick={() => { setSelectedAgentId(agent.id); setShowAgentList(false); }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 transition-colors ${
                                selectedAgentId === agent.id ? 'bg-violet-500/10 text-violet-400' : 'text-zinc-300'
                              }`}
                            >
                              {agent.name}
                            </button>
                          ))}
                          {agents.length === 0 && (
                            <p className="px-3 py-2 text-sm text-zinc-500">No agents available</p>
                          )}
                        </div>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setShowAgentList(true)} className="border-zinc-700">
                          {selectedAgentId
                            ? agents.find(a => a.id === selectedAgentId)?.name || t('sourcesFlow.process.changeAgent')
                            : t('sourcesFlow.process.selectAgent')
                          }
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Streaming console */}
              {(isProcessing || processComplete || (processError && !isProcessing)) && consoleLogs.length > 0 && (
                <div className="space-y-3">
                  {/* Console header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-violet-400" />}
                      {processComplete && <Check className="h-4 w-4 text-emerald-400" />}
                      {processError && !isProcessing && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      <span className="text-sm text-zinc-300">
                        {isProcessing ? t('sourcesFlow.process.processing') : processComplete ? t('sourcesFlow.process.processComplete') : t('sourcesFlow.process.processError')}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600">{formatElapsed(processElapsed)}</span>
                  </div>

                  {/* Console output */}
                  <div className="h-48 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs">
                    {consoleLogs.map((log, i) => (
                      <div key={i} className={
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'info' ? 'text-zinc-500' :
                        'text-green-400'
                      }>
                        {log.type === 'info' && <span className="text-zinc-600 mr-1">{'>'}</span>}
                        {log.type === 'error' && <span className="text-red-600 mr-1">{'✗'}</span>}
                        {log.type === 'success' && <span className="text-emerald-600 mr-1">{'✓'}</span>}
                        <span className="whitespace-pre-wrap">{log.text}</span>
                      </div>
                    ))}
                    <div ref={consoleEndRef} />
                  </div>

                  {/* Timeout warning */}
                  {streamTimedOut && isProcessing && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-sm text-amber-400">{t('sourcesFlow.process.timeoutWarning')}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={handleCancelProcess} className="border-zinc-700">
                        {t('sourcesFlow.process.cancelAndReturn')}
                      </Button>
                    </div>
                  )}

                  {/* Error actions */}
                  {processError && !isProcessing && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={handleProcess} className="border-zinc-700">
                        <RotateCcw className="h-3 w-3 mr-1" /> {t('sourcesFlow.process.retry')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCurrentPhase(3)} className="border-zinc-700">
                        {t('sourcesFlow.process.continueAnyway')} <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Process action button */}
              {!isProcessing && !processComplete && !processError && (
                <Button
                  onClick={handleProcess}
                  disabled={!canProcess}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Play className="h-4 w-4 mr-2" /> {t('sourcesFlow.process.title')}
                </Button>
              )}
            </div>
          )}

          {/* ============= PHASE 3: INDEXAR RAG ============= */}
          {currentPhase === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-zinc-100">{t('sourcesFlow.index.title')}</h2>
                <p className="text-sm text-zinc-400 mt-1">{t('sourcesFlow.index.subtitle')}</p>
              </div>

              {/* Loading RAG info */}
              {loadingRagInfo && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('sourcesFlow.index.checkingRag')}
                </div>
              )}

              {/* RAG status banner */}
              {ragInfo && !loadingRagInfo && !isIndexing && !indexComplete && !indexError && (
                <>
                  {ragInfo.enabled ? (
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-emerald-400" />
                        <span className="text-sm text-emerald-400">{t('sourcesFlow.index.ragActive')}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-zinc-400">
                        <span>{t('sourcesFlow.index.collection')}: {ragInfo.collectionName}</span>
                        <span>{ragInfo.vectorCount} vectores</span>
                        <span>{t('sourcesFlow.index.model')}: {ragInfo.embeddingModel}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-blue-400" />
                          <span className="text-sm text-blue-400">{t('sourcesFlow.index.ragNew')}</span>
                        </div>
                      </div>
                      {/* Config inputs for new collection */}
                      <div className="grid gap-4">
                        <div>
                          <label className="text-xs font-medium text-zinc-400 mb-1 block">{t('sourcesFlow.index.collection')}</label>
                          <Input
                            value={collectionName}
                            onChange={e => setCollectionName(e.target.value)}
                            className="bg-zinc-900 border-zinc-700 text-zinc-200"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-zinc-400 mb-1 block">{t('sourcesFlow.index.model')}</label>
                          <select
                            value={selectedModel}
                            onChange={e => setSelectedModel(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200"
                          >
                            <option value="nomic-embed-text">nomic-embed-text (768d)</option>
                            <option value="mxbai-embed-large">mxbai-embed-large (1024d)</option>
                            <option value="all-minilm">all-minilm (384d)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-zinc-400 mb-1 block">{t('sourcesFlow.index.chunkSize')}: {chunkSize}</label>
                          <Slider value={[chunkSize]} onValueChange={(v) => setChunkSize(Array.isArray(v) ? v[0] : v)} min={256} max={2048} step={64} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-zinc-400 mb-1 block">{t('sourcesFlow.index.chunkOverlap')}: {chunkOverlap}</label>
                          <Slider value={[chunkOverlap]} onValueChange={(v) => setChunkOverlap(Array.isArray(v) ? v[0] : v)} min={0} max={256} step={10} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Start button */}
                  <Button
                    onClick={() => handleStartIndex()}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    <Database className="h-4 w-4 mr-2" /> {t('sourcesFlow.index.startIndex')}
                  </Button>
                </>
              )}

              {/* Indexing progress — SSE console */}
              {(isIndexing || indexComplete || (indexError && !isIndexing)) && ragConsoleLogs.length > 0 && (
                <div className="space-y-3">
                  {/* Console header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isIndexing && <Loader2 className="h-4 w-4 animate-spin text-violet-400" />}
                      {indexComplete && <Check className="h-4 w-4 text-emerald-400" />}
                      {indexError && !isIndexing && <AlertTriangle className="h-4 w-4 text-red-400" />}
                      <span className="text-sm text-zinc-300">
                        {isIndexing ? t('sourcesFlow.index.indexing') : indexComplete ? t('sourcesFlow.index.complete') : t('sourcesFlow.index.error')}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-600">{formatElapsed(elapsedSeconds)}</span>
                  </div>

                  {/* Progress bar (create path only) */}
                  {isIndexing && !ragInfo?.enabled && indexProgress.total > 0 && (
                    <>
                      <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-violet-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${indexProgress.percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-zinc-500">
                        <span>{indexProgress.processed} / {indexProgress.total} chunks ({indexProgress.percent}%)</span>
                        <span>{formatElapsed(elapsedSeconds)}</span>
                      </div>
                    </>
                  )}

                  {/* Append path: indeterminate */}
                  {isIndexing && ragInfo?.enabled && (
                    <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                      <div className="bg-violet-500 h-full rounded-full animate-pulse w-full" />
                    </div>
                  )}

                  {/* Console output */}
                  <div className="h-48 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs">
                    {ragConsoleLogs.map((log, i) => (
                      <div key={i} className={
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'success' ? 'text-emerald-400' :
                        log.type === 'info' ? 'text-zinc-500' :
                        'text-green-400'
                      }>
                        {log.type === 'info' && <span className="text-zinc-600 mr-1">{'>'}</span>}
                        {log.type === 'error' && <span className="text-red-600 mr-1">{'✗'}</span>}
                        {log.type === 'success' && <span className="text-emerald-600 mr-1">{'✓'}</span>}
                        <span className="whitespace-pre-wrap">{log.text}</span>
                      </div>
                    ))}
                    <div ref={ragConsoleEndRef} />
                  </div>

                  {/* Timeout warning */}
                  {ragStreamTimedOut && isIndexing && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-sm text-amber-400">{t('sourcesFlow.index.timeoutWarning')}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={handleCancelIndex} className="border-zinc-700">
                        {t('sourcesFlow.index.cancelAndReturn')}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Index complete */}
              {indexComplete && indexResult && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">{t('sourcesFlow.index.complete')}</span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      {indexResult.vectorsAdded} vectores · {indexResult.sourcesProcessed} fuentes · {formatElapsed(elapsedSeconds)}
                    </p>
                    {indexResult.failures && indexResult.failures.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => setShowFailures(!showFailures)}
                          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {indexResult.failures.length} fuentes con advertencias
                          <ChevronRight className={`h-3 w-3 transition-transform ${showFailures ? 'rotate-90' : ''}`} />
                        </button>
                        {showFailures && (
                          <div className="mt-2 space-y-1">
                            {indexResult.failures.map((f, i) => (
                              <p key={i} className="text-[11px] text-zinc-500">• {f.name}: {f.reason}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => onComplete()}
                      className="bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" /> {t('sourcesFlow.goToChat')}
                    </Button>
                    <Button variant="outline" onClick={onBack} className="border-zinc-700">
                      {t('sourcesFlow.backToList')}
                    </Button>
                  </div>
                </div>
              )}

              {/* Index error — action buttons (error details shown in console above) */}
              {indexError && !isIndexing && !indexComplete && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleStartIndex()} className="border-zinc-700">
                    <RotateCcw className="h-3 w-3 mr-1" /> {t('sourcesFlow.process.retry')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={onBack} className="border-zinc-700">
                    {t('sourcesFlow.backToList')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
          <Button
            variant="outline"
            onClick={() => {
              if (currentPhase === 1) onBack();
              else if (!isIndexing) setCurrentPhase(currentPhase - 1 as 1 | 2);
            }}
            disabled={isIndexing}
            className="border-zinc-700"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {currentPhase === 1 ? t('sourcesFlow.backToList') : t('sourcesFlow.back')}
          </Button>

          {currentPhase === 1 && (
            <Button
              onClick={() => setCurrentPhase(2)}
              disabled={sources.length === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
            >
              {t('sourcesFlow.continue')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {currentPhase === 2 && (processComplete || processError) && (
            <Button
              onClick={() => setCurrentPhase(3)}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {t('sourcesFlow.continue')} <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}

          {currentPhase === 3 && indexComplete && (
            <Button
              onClick={() => onComplete()}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <MessageCircle className="h-4 w-4 mr-2" /> {t('sourcesFlow.goToChat')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
