"use client";

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Check, X, Clock, Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function CatBrainNode({ data, selected }: NodeProps) {
  const t = useTranslations('canvas');
  const nodeData = data as {
    label?: string;
    catbrainId?: string | null;
    catbrainName?: string | null;
    projectId?: string | null;   // backward compat
    projectName?: string | null; // backward compat
    rag_status?: 'ready' | 'processing' | 'none' | 'stale' | null;
    search_engine?: string | null;
  };

  const execStatus = (data as Record<string, unknown>).executionStatus as string | undefined;
  const isRunning = execStatus === 'running';
  const isCompleted = execStatus === 'completed';
  const isFailed = execStatus === 'failed';
  const isWaiting = execStatus === 'waiting';
  const isSkipped = execStatus === 'skipped';

  const borderClass =
    isRunning   ? 'border-violet-400 animate-pulse shadow-violet-500/30 shadow-lg' :
    isCompleted ? 'border-emerald-400 shadow-emerald-500/20 shadow-md' :
    isFailed    ? 'border-red-400 shadow-red-500/20 shadow-md' :
    isWaiting   ? 'border-amber-400 animate-pulse shadow-amber-500/20 shadow-md' :
    isSkipped   ? 'border-zinc-600 opacity-50' :
    selected    ? 'border-violet-400' : 'border-violet-600';

  // RAG status badge
  const ragStatus = nodeData.rag_status;
  const ragDotClass =
    ragStatus === 'ready'      ? 'bg-emerald-400' :
    ragStatus === 'processing' ? 'bg-amber-400 animate-pulse' :
                                 'bg-zinc-500';
  const ragLabel =
    ragStatus === 'ready'      ? t('nodes.ragReady') :
    ragStatus === 'processing' ? t('nodes.ragProcessing') :
                                 t('nodes.ragNone');

  // Display name: prefer catbrain fields, fallback to legacy project fields
  const displayName = nodeData.catbrainName || nodeData.projectName ||
    (nodeData.catbrainId || nodeData.projectId ? (nodeData.catbrainId || nodeData.projectId) : t('nodes.noCatBrain'));

  return (
    <div
      className={`w-[240px] min-h-[80px] rounded-xl bg-violet-950/80 border-2 transition-colors relative ${borderClass} p-3`}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#7c3aed', width: 10, height: 10 }}
      />
      <div className="flex items-center gap-2 mb-1">
        <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={20} height={20} className="shrink-0" />
        <span className="text-sm font-semibold text-violet-100 truncate">
          {nodeData.label || t('nodes.catbrain')}
        </span>
      </div>
      {/* Badges row: RAG status + conectores count */}
      <div className="flex items-center gap-2 mt-1">
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${ragDotClass}`} />
          <span className="text-[10px] text-zinc-400">{ragLabel}</span>
        </span>
        <span className="text-[10px] bg-zinc-700/60 text-zinc-400 px-1.5 py-0.5 rounded-full">{t('nodes.connectorsCount', { count: 0 })}</span>
        {nodeData.search_engine && (
          <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded-full flex items-center gap-1">
            <Search className="w-2.5 h-2.5" />
            {nodeData.search_engine === 'auto' ? 'Auto' :
             nodeData.search_engine === 'searxng' ? 'SearXNG' :
             nodeData.search_engine === 'gemini' ? 'Gemini' :
             nodeData.search_engine === 'ollama' ? 'Ollama' :
             nodeData.search_engine}
          </span>
        )}
      </div>
      <div className="text-xs text-zinc-400 truncate mt-1">
        {displayName}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#7c3aed', width: 10, height: 10 }}
      />
      {execStatus && execStatus !== 'pending' && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs">
          {isRunning && <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />}
          {isCompleted && <Check className="w-4 h-4 text-emerald-400" />}
          {isFailed && <X className="w-4 h-4 text-red-400" />}
          {isWaiting && <Clock className="w-4 h-4 text-amber-400" />}
        </div>
      )}
    </div>
  );
}
