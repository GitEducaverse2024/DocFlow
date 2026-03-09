"use client";

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileUploadZone } from './file-upload-zone';
import { UrlInput } from './url-input';
import { YoutubeInput } from './youtube-input';
import { NoteEditor } from './note-editor';
import { SourceList } from './source-list';
import { FileText, Link as LinkIcon, Youtube, StickyNote } from 'lucide-react';

interface SourceManagerProps {
  projectId: string;
}

export function SourceManager({ projectId }: SourceManagerProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleAddComplete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="space-y-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <Tabs defaultValue="files" className="w-full">
          <TabsList className="w-full justify-start bg-zinc-900/50 border-b border-zinc-800 rounded-none p-0 h-auto">
            <TabsTrigger 
              value="files" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-6 py-3 text-zinc-400 flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Archivos
            </TabsTrigger>
            <TabsTrigger 
              value="urls" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-6 py-3 text-zinc-400 flex items-center gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              URLs
            </TabsTrigger>
            <TabsTrigger 
              value="youtube" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-6 py-3 text-zinc-400 flex items-center gap-2"
            >
              <Youtube className="w-4 h-4" />
              YouTube
            </TabsTrigger>
            <TabsTrigger 
              value="notes" 
              className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50 rounded-none px-6 py-3 text-zinc-400 flex items-center gap-2"
            >
              <StickyNote className="w-4 h-4" />
              Notas
            </TabsTrigger>
          </TabsList>
          
          <div className="p-6">
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
        <h3 className="text-lg font-medium text-zinc-50 mb-4">Fuentes del proyecto</h3>
        <SourceList projectId={projectId} refreshTrigger={refreshTrigger} />
      </div>
    </div>
  );
}
