"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUploadZone } from './file-upload-zone';
import { UrlInput } from './url-input';
import { YoutubeInput } from './youtube-input';
import { NoteEditor } from './note-editor';
import { SourceList } from './source-list';
import { FileText, Link as LinkIcon, Youtube, StickyNote, AlertCircle, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Source } from '@/lib/types';

interface SourceManagerProps {
  projectId: string;
  onNavigateToProcess?: () => void;
  lastProcessedAt?: string | null;
  onSourcesChanged?: () => void;
  ragEnabled?: boolean;
}

export function SourceManager({ projectId, onNavigateToProcess, lastProcessedAt, onSourcesChanged, ragEnabled }: SourceManagerProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newSourcesCount, setNewSourcesCount] = useState(0);
  const [pendingAppendCount, setPendingAppendCount] = useState(0);
  const [isAppending, setIsAppending] = useState(false);

  const handleAddComplete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Count new sources and pending append sources
  useEffect(() => {
    fetch(`/api/catbrains/${projectId}/sources`)
      .then(res => res.json())
      .then((sources: Source[]) => {
        // Count sources added after last processing
        if (lastProcessedAt) {
          const cutoff = new Date(lastProcessedAt);
          const count = sources.filter(s =>
            new Date(s.created_at) > cutoff ||
            (s.content_updated_at && new Date(s.content_updated_at) > cutoff)
          ).length;
          setNewSourcesCount(count);
        } else {
          setNewSourcesCount(0);
        }
        // Count pending append sources
        const pending = sources.filter(s => s.is_pending_append === 1).length;
        setPendingAppendCount(pending);
      })
      .catch(() => {});
  }, [projectId, refreshTrigger, lastProcessedAt]);

  const handleAppendToRag = async () => {
    setIsAppending(true);
    try {
      // Get pending source IDs
      const res = await fetch(`/api/catbrains/${projectId}/sources`);
      const sources: Source[] = await res.json();
      const pendingIds = sources.filter(s => s.is_pending_append === 1).map(s => s.id);

      if (pendingIds.length === 0) return;

      const appendRes = await fetch(`/api/catbrains/${projectId}/rag/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: pendingIds }),
      });

      if (appendRes.ok) {
        const data = await appendRes.json();
        const { toast } = await import('sonner');
        toast.success(`✓ ${data.sources_processed} fuente${data.sources_processed !== 1 ? 's' : ''} añadida${data.sources_processed !== 1 ? 's' : ''} al RAG (${data.vectors_added} vectores)`);
        setPendingAppendCount(0);
        setRefreshTrigger(prev => prev + 1);
        onSourcesChanged?.();
      } else {
        const err = await appendRes.json();
        const { toast } = await import('sonner');
        toast.error(`Error: ${err.error || 'Error desconocido'}`);
      }
    } catch {
      const { toast } = await import('sonner');
      toast.error('Error al añadir fuentes al RAG');
    } finally {
      setIsAppending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Re-process banner */}
      {newSourcesCount > 0 && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-emerald-300">
                {newSourcesCount} fuente{newSourcesCount > 1 ? 's' : ''} nueva{newSourcesCount > 1 ? 's' : ''} desde el último procesamiento
              </p>
              <p className="text-xs text-zinc-500">
                Procesa de nuevo para incluirlas en el documento generado
              </p>
            </div>
          </div>
          {onNavigateToProcess && (
            <Button
              size="sm"
              onClick={onNavigateToProcess}
              className="bg-emerald-600 hover:bg-emerald-500 text-white flex-shrink-0"
            >
              Ir a Procesar
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          )}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <Tabs defaultValue="files" className="w-full">
          <TabsList className="w-full justify-start bg-zinc-900/50 border-b border-zinc-800 rounded-none p-0 h-auto">
            <TabsTrigger
              value="files"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-4 py-2 text-zinc-400 flex items-center gap-1.5 text-sm"
            >
              <FileText className="w-4 h-4" />
              Archivos
            </TabsTrigger>
            <TabsTrigger
              value="urls"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-4 py-2 text-zinc-400 flex items-center gap-1.5 text-sm"
            >
              <LinkIcon className="w-4 h-4" />
              URLs
            </TabsTrigger>
            <TabsTrigger
              value="youtube"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-4 py-2 text-zinc-400 flex items-center gap-1.5 text-sm"
            >
              <Youtube className="w-4 h-4" />
              YouTube
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-4 py-2 text-zinc-400 flex items-center gap-1.5 text-sm"
            >
              <StickyNote className="w-4 h-4" />
              Notas
            </TabsTrigger>
          </TabsList>

          <div className="p-4">
            <TabsContent value="files" className="m-0">
              <FileUploadZone projectId={projectId} onUploadComplete={handleAddComplete} ragEnabled={ragEnabled} />
            </TabsContent>

            <TabsContent value="urls" className="m-0">
              <UrlInput projectId={projectId} onAddComplete={handleAddComplete} />
            </TabsContent>

            <TabsContent value="youtube" className="m-0">
              <YoutubeInput projectId={projectId} onAddComplete={handleAddComplete} />
            </TabsContent>

            <TabsContent value="notes" className="m-0">
              <NoteEditor projectId={projectId} onAddComplete={handleAddComplete} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div>
        <SourceList projectId={projectId} refreshTrigger={refreshTrigger} lastProcessedAt={lastProcessedAt} ragEnabled={ragEnabled} onSourcesChanged={() => { setRefreshTrigger(prev => prev + 1); onSourcesChanged?.(); }} />
      </div>

      {/* Append to RAG banner */}
      {ragEnabled && pendingAppendCount > 0 && (
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-violet-500/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-violet-300">
                {pendingAppendCount} fuente{pendingAppendCount > 1 ? 's' : ''} nueva{pendingAppendCount > 1 ? 's' : ''} lista{pendingAppendCount > 1 ? 's' : ''} para indexar
              </p>
              <p className="text-xs text-zinc-500">
                Se añadirán al RAG existente sin reindexar todo
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleAppendToRag}
            disabled={isAppending}
            className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white flex-shrink-0"
          >
            {isAppending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            Procesar y añadir al RAG
          </Button>
        </div>
      )}
    </div>
  );
}
