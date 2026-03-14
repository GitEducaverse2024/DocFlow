"use client";

import { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface UrlInputProps {
  projectId: string;
  onAddComplete: () => void;
}

export function UrlInput({ projectId, onAddComplete }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!url.trim()) return;

    // Check for multiple URLs
    const urls = url.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    
    if (urls.length > 1) {
      if (!confirm(`Hemos detectado ${urls.length} URLs. ¿Añadir todas?`)) {
        return;
      }
    }

    setIsAdding(true);
    let successCount = 0;
    let errorCount = 0;

    for (const u of urls) {
      if (!u.startsWith('http://') && !u.startsWith('https://')) {
        toast.error(`URL inválida: ${u}`);
        errorCount++;
        continue;
      }

      try {
        // Try to fetch title via a simple API route or just use URL as name for now
        // In a real app, we'd have an API route to fetch the title to avoid CORS
        const res = await fetch(`/api/catbrains/${projectId}/sources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'url',
            name: u, // We'll use URL as name initially, the backend could fetch the title
            url: u
          }),
        });

        if (res.ok) successCount++;
        else errorCount++;
      } catch (error) {
        console.error('Error adding URL:', error);
        errorCount++;
      }
    }

    setIsAdding(false);
    setUrl('');

    if (successCount > 0) {
      toast.success(`${successCount} URL(s) añadida(s) correctamente`);
      onAddComplete();
    }
    if (errorCount > 0) {
      toast.error(`Error al añadir ${errorCount} URL(s)`);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 border border-zinc-800 rounded-lg bg-zinc-900/50">
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="https://ejemplo.com (puedes pegar varias URLs, una por línea)"
          className="bg-zinc-950 border-zinc-800 text-zinc-50 flex-1"
          disabled={isAdding}
        />
        <Button 
          onClick={handleAdd} 
          disabled={!url.trim() || isAdding}
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
        >
          {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Añadir URL
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        El contenido de la URL se extraerá durante la fase de procesamiento.
      </p>
    </div>
  );
}
