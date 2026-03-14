"use client";

import { useState } from 'react';
import { StickyNote, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface NoteEditorProps {
  projectId: string;
  onAddComplete: () => void;
}

export function NoteEditor({ projectId, onAddComplete }: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errors, setErrors] = useState({ title: false, content: false });

  const handleAdd = async () => {
    const newErrors = {
      title: !title.trim(),
      content: !content.trim()
    };
    
    setErrors(newErrors);
    
    if (newErrors.title || newErrors.content) return;

    setIsAdding(true);

    try {
      const res = await fetch(`/api/catbrains/${projectId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'note',
          name: title,
          content_text: content
        }),
      });

      if (!res.ok) throw new Error('Error al añadir nota');

      toast.success('Nota añadida correctamente');
      setTitle('');
      setContent('');
      onAddComplete();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Error al añadir la nota');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 border border-zinc-800 rounded-lg bg-zinc-900/50">
      <div>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) setErrors({ ...errors, title: false });
          }}
          placeholder="Título de la nota"
          className={`bg-zinc-950 border-zinc-800 text-zinc-50 ${errors.title ? 'border-red-500' : ''}`}
          disabled={isAdding}
        />
        {errors.title && <span className="text-xs text-red-500 mt-1">El título es obligatorio</span>}
      </div>
      
      <div>
        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (errors.content) setErrors({ ...errors, content: false });
          }}
          placeholder="Escribe tus notas, ideas, requisitos... Puedes usar Markdown."
          className={`bg-zinc-950 border-zinc-800 text-zinc-50 min-h-[300px] resize-y ${errors.content ? 'border-red-500' : ''}`}
          disabled={isAdding}
        />
        {errors.content && <span className="text-xs text-red-500 mt-1">El contenido es obligatorio</span>}
      </div>

      <div className="flex justify-end">
        <Button 
          onClick={handleAdd} 
          disabled={isAdding}
          className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
        >
          {isAdding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <StickyNote className="w-4 h-4 mr-2" />}
          Añadir nota
        </Button>
      </div>
    </div>
  );
}
