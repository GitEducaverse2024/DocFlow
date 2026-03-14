"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUploadZone } from './file-upload-zone';
import { UrlInput } from './url-input';
import { YoutubeInput } from './youtube-input';
import { NoteEditor } from './note-editor';
import { SourceList } from './source-list';
import { FileText, Link as LinkIcon, Youtube, StickyNote, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Source } from '@/lib/types';

interface SourceManagerProps {
  projectId: string;
  onNavigateToProcess?: () => void;
  lastProcessedAt?: string | null;
  onSourcesChanged?: () => void;
}

export function SourceManager({ projectId, onNavigateToProcess, lastProcessedAt, onSourcesChanged }: SourceManagerProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newSourcesCount, setNewSourcesCount] = useState(0);

  const handleAddComplete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Count new sources (added after last processing)
  useEffect(() => {
    if (!lastProcessedAt) {
      setNewSourcesCount(0);
      return;
    }

    fetch(`/api/catbrains/${projectId}/sources`)
      .then(res => res.json())
      .then((sources: Source[]) => {
        const cutoff = new Date(lastProcessedAt);
        const count = sources.filter(s =>
          new Date(s.created_at) > cutoff ||
          (s.content_updated_at && new Date(s.content_updated_at) > cutoff)
        ).length;
        setNewSourcesCount(count);
      })
      .catch(() => {});
  }, [projectId, refreshTrigger, lastProcessedAt]);

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
              <FileUploadZone projectId={projectId} onUploadComplete={handleAddComplete} />
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
        <SourceList projectId={projectId} refreshTrigger={refreshTrigger} lastProcessedAt={lastProcessedAt} onSourcesChanged={() => { setRefreshTrigger(prev => prev + 1); onSourcesChanged?.(); }} />
      </div>
    </div>
  );
}
