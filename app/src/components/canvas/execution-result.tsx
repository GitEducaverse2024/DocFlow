"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown, ChevronUp, Copy, Download, RotateCcw, X,
  CheckCircle2, XCircle, AlertCircle, GripHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';

interface ExecutionResultProps {
  status: 'completed' | 'failed' | 'cancelled';
  nodeStates: Record<string, { status: string; output?: string; tokens?: number; duration_ms?: number }>;
  totalTokens: number;
  totalDuration: number; // seconds
  outputContent: string;
  onReExecute: () => void;
  onClose: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
  completed: {
    label: 'Completado',
    icon: <CheckCircle2 className="w-4 h-4" />,
    colorClass: 'text-emerald-400',
  },
  failed: {
    label: 'Fallido',
    icon: <XCircle className="w-4 h-4" />,
    colorClass: 'text-red-400',
  },
  cancelled: {
    label: 'Cancelado',
    icon: <AlertCircle className="w-4 h-4" />,
    colorClass: 'text-amber-400',
  },
};

// Rough token cost estimate: $0.50 per 1M tokens (blended average)
function estimateCost(tokens: number): string {
  const cost = (tokens / 1_000_000) * 0.5;
  if (cost < 0.001) return '<$0.001';
  return `$${cost.toFixed(4)}`;
}

const MIN_PANEL_HEIGHT = 80;
const DEFAULT_PANEL_HEIGHT = 320;

export function ExecutionResult({
  status,
  nodeStates,
  totalTokens,
  totalDuration,
  outputContent,
  onReExecute,
  onClose,
}: ExecutionResultProps) {
  const [expanded, setExpanded] = useState(true);

  // Resizable panel height
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [panelHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startY.current - e.clientY;
      const maxHeight = Math.floor(window.innerHeight * 0.8);
      const newHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight.current + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.completed;
  const completedNodes = Object.values(nodeStates).filter(ns => ns.status === 'completed').length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(outputContent);
      toast.success('Copiado al portapapeles');
    } catch {
      toast.error('Error al copiar');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([outputContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resultado.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 transition-all duration-200">
      {/* Resize handle */}
      {expanded && (
        <div
          className="flex items-center justify-center h-2 cursor-ns-resize group hover:bg-zinc-700/50 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <GripHorizontal className="w-5 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        </div>
      )}

      {/* Header — always visible */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-zinc-800/50 select-none"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className={`flex items-center gap-2 font-medium text-sm ${statusCfg.colorClass}`}>
          {statusCfg.icon}
          <span>Resultado de ejecucion: {statusCfg.label}</span>
        </div>
        <div className="flex items-center gap-1 text-zinc-400">
          <span className="text-xs mr-2">{totalDuration}s · {totalTokens.toLocaleString()} tokens</span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </div>
      </div>

      {/* Expanded body — resizable */}
      {expanded && (
        <div className="flex gap-4 px-4 pb-4" style={{ maxHeight: `${panelHeight}px`, minHeight: 0 }}>
          {/* Output — 70% */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="bg-zinc-950 rounded-lg p-3 h-full overflow-y-auto">
              {outputContent ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {outputContent}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-zinc-500 text-sm italic">Sin resultado de salida</p>
              )}
            </div>
          </div>

          {/* Stats — 30% */}
          <div className="w-52 shrink-0 flex flex-col gap-3">
            <div className="bg-zinc-950 rounded-lg p-3 space-y-2 text-sm">
              <h4 className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Estadisticas</h4>
              <div className="flex justify-between">
                <span className="text-zinc-400">Duracion</span>
                <span className="text-zinc-100 font-mono">{totalDuration}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Tokens</span>
                <span className="text-zinc-100 font-mono">{totalTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Costo est.</span>
                <span className="text-zinc-100 font-mono">{estimateCost(totalTokens)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Nodos</span>
                <span className="text-zinc-100 font-mono">{completedNodes}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="justify-start gap-2 text-zinc-300 hover:text-zinc-100"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="justify-start gap-2 text-zinc-300 hover:text-zinc-100"
              >
                <Download className="w-3.5 h-3.5" />
                Descargar .md
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReExecute}
                className="justify-start gap-2 text-zinc-300 hover:text-zinc-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-ejecutar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="justify-start gap-2 text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-3.5 h-3.5" />
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
