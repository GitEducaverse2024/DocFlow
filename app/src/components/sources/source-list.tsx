"use client";

import { useState, useEffect } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Source } from '@/lib/types';
import { SourceItem } from './source-item';
import { toast } from 'sonner';
import { Loader2, Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SourceListProps {
  projectId: string;
  refreshTrigger: number;
}

export function SourceList({ projectId, refreshTrigger }: SourceListProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/sources`);
        if (res.ok) {
          const data = await res.json();
          setSources(data);
        }
      } catch (error) {
        console.error('Error fetching sources:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSources();
  }, [projectId, refreshTrigger]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sources.findIndex((s) => s.id === active.id);
      const newIndex = sources.findIndex((s) => s.id === over.id);
      
      const newSources = arrayMove(sources, oldIndex, newIndex);
      setSources(newSources);

      try {
        await fetch(`/api/projects/${projectId}/sources/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: newSources.map(s => s.id)
          }),
        });
      } catch (error) {
        console.error('Error reordering:', error);
        toast.error('Error al guardar el orden');
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sources/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSources(sources.filter(s => s.id !== id));
        toast.success('Fuente eliminada');
      } else {
        throw new Error('Error deleting');
      }
    } catch (error) {
      console.error('Error deleting source:', error);
      toast.error('Error al eliminar la fuente');
    }
  };

  const handleUpdate = async (id: string, data: Partial<Source>) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const updated = await res.json();
        setSources(sources.map(s => s.id === id ? updated : s));
        toast.success('Fuente actualizada');
      } else {
        throw new Error('Error updating');
      }
    } catch (error) {
      console.error('Error updating source:', error);
      toast.error('Error al actualizar la fuente');
    }
  };

  const filteredSources = sources.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: sources.length,
    file: sources.filter(s => s.type === 'file').length,
    url: sources.filter(s => s.type === 'url').length,
    youtube: sources.filter(s => s.type === 'youtube').length,
    note: sources.filter(s => s.type === 'note').length,
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500 border border-zinc-800 border-dashed rounded-lg">
        No hay fuentes añadidas aún.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="text-sm text-zinc-400">
          {stats.total} fuentes añadidas ({stats.file} archivos, {stats.url} URLs, {stats.youtube} YouTube, {stats.note} notas)
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input 
              placeholder="Buscar..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-zinc-900 border-zinc-800 text-zinc-50"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || "all")}>
            <SelectTrigger className="w-[130px] h-9 bg-zinc-900 border-zinc-800 text-zinc-50">
              <Filter className="w-4 h-4 mr-2 text-zinc-500" />
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="file">Archivos</SelectItem>
              <SelectItem value="url">URLs</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="note">Notas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={filteredSources.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {filteredSources.map((source) => (
              <SourceItem 
                key={source.id} 
                source={source} 
                onDelete={handleDelete}
                onUpdate={handleUpdate}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
