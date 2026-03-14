"use client";

import { useState } from 'react';
import { PlayCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface YoutubeInputProps {
  projectId: string;
  onAddComplete: () => void;
}

export function YoutubeInput({ projectId, onAddComplete }: YoutubeInputProps) {
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState('');

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleAdd = async () => {
    if (!url.trim()) return;
    setError('');

    const videoId = extractYoutubeId(url);
    if (!videoId) {
      setError('URL de YouTube no válida. Formatos aceptados: youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/...');
      return;
    }

    setIsAdding(true);

    try {
      // Try to get title from noembed
      let title = `Video de YouTube (${videoId})`;
      try {
        const noembedRes = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        const noembedData = await noembedRes.json();
        if (noembedData.title) {
          title = noembedData.title;
        } else {
          toast.warning('Vídeo no accesible o privado');
        }
      } catch (e) {
        console.error('Error fetching youtube title:', e);
      }

      const res = await fetch(`/api/catbrains/${projectId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'youtube',
          name: title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          youtube_id: videoId
        }),
      });

      if (!res.ok) throw new Error('Error al añadir vídeo');

      toast.success('Vídeo añadido correctamente');
      setUrl('');
      onAddComplete();
    } catch (error) {
      console.error('Error adding youtube video:', error);
      toast.error('Error al añadir el vídeo');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 border border-zinc-800 rounded-lg bg-zinc-900/50">
      <div className="flex gap-2">
        <div className="flex-1 flex flex-col gap-1">
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="https://youtube.com/watch?v=..."
            className={`bg-zinc-950 border-zinc-800 text-zinc-50 ${error ? 'border-red-500' : ''}`}
            disabled={isAdding}
          />
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
        <Button 
          onClick={handleAdd} 
          disabled={!url.trim() || isAdding}
          className="bg-red-600 hover:bg-red-500 text-white h-10"
        >
          {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Añadir vídeo
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        DoCatFlow no transcribe el vídeo. El agente IA recibirá la URL como referencia.
      </p>
    </div>
  );
}
