"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
import { Loader2, Search, Filter, RotateCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SourceListProps {
  projectId: string;
  refreshTrigger: number;
  lastProcessedAt?: string | null;
  ragEnabled?: boolean;
  onSourcesChanged?: () => void;
}

function getDateLabel(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sourceDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - sourceDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t('dateLabels.today');
  if (diffDays === 1) return t('dateLabels.yesterday');

  const months = t.raw('months') as string[];
  return t('dateLabels.date', { day: date.getDate(), month: months[date.getMonth()] });
}

function getDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface DateGroup {
  dateKey: string;
  label: string;
  sources: Source[];
}

function groupSourcesByDate(sources: Source[], t: ReturnType<typeof useTranslations>): DateGroup[] {
  const groups: Record<string, { label: string; sources: Source[] }> = {};

  for (const source of sources) {
    const key = getDateKey(source.created_at);
    if (!groups[key]) {
      groups[key] = { label: getDateLabel(source.created_at, t), sources: [] };
    }
    groups[key].sources.push(source);
  }

  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, group]) => ({ dateKey, ...group }));
}

export function SourceList({ projectId, refreshTrigger, lastProcessedAt, ragEnabled, onSourcesChanged }: SourceListProps) {
  const t = useTranslations('sources');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeletingMultiple, setIsDeletingMultiple] = useState(false);
  const [isReextractingAll, setIsReextractingAll] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await fetch(`/api/catbrains/${projectId}/sources`);
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

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/models');
        if (res.ok) {
          const data = await res.json();
          setAvailableModels((data.models || []).map((m: { id?: string; model_name?: string }) => m.id || m.model_name || '').filter(Boolean));
        }
      } catch { /* ignore */ }
    };
    fetchModels();
  }, []);

  const isSourceNew = (source: Source): boolean => {
    if (!lastProcessedAt) return false;
    return new Date(source.created_at) > new Date(lastProcessedAt);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sources.findIndex((s) => s.id === active.id);
      const newIndex = sources.findIndex((s) => s.id === over.id);

      const newSources = arrayMove(sources, oldIndex, newIndex);
      setSources(newSources);

      try {
        await fetch(`/api/catbrains/${projectId}/sources/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order: newSources.map(s => s.id)
          }),
        });
      } catch (error) {
        console.error('Error reordering:', error);
        toast.error(t('toast.orderError'));
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredSources.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSources.map(s => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t('deleteConfirm', { count: selectedIds.size }))) return;

    setIsDeletingMultiple(true);
    let successCount = 0;
    let errorCount = 0;

    for (const id of Array.from(selectedIds)) {
      try {
        const res = await fetch(`/api/catbrains/${projectId}/sources/${id}`, {
          method: 'DELETE',
        });
        if (res.ok) successCount++;
        else errorCount++;
      } catch {
        errorCount++;
      }
    }

    if (successCount > 0) {
      setSources(sources.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
      toast.success(t('toast.deletedMultiple', { count: successCount }));
    }
    if (errorCount > 0) {
      toast.error(t('toast.deleteMultipleError', { count: errorCount }));
    }
    setIsDeletingMultiple(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/catbrains/${projectId}/sources/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSources(sources.filter(s => s.id !== id));
        toast.success(t('toast.deleted'));
      } else {
        throw new Error('Error deleting');
      }
    } catch (error) {
      console.error('Error deleting source:', error);
      toast.error(t('toast.deleteError'));
    }
  };

  const handleUpdate = async (id: string, data: Partial<Source>) => {
    try {
      const res = await fetch(`/api/catbrains/${projectId}/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const updated = await res.json();
        setSources(sources.map(s => s.id === id ? updated : s));
        toast.success(t('toast.updated'));
      } else {
        throw new Error('Error updating');
      }
    } catch (error) {
      console.error('Error updating source:', error);
      toast.error(t('toast.updateError'));
    }
  };

  const handleReextract = async (id: string) => {
    try {
      const res = await fetch(`/api/catbrains/${projectId}/sources/${id}`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated = await res.json();
        setSources(sources.map(s => s.id === id ? updated : s));
        if (updated.extraction_log) {
          toast.warning(t('toast.reextractWarning'));
        } else {
          toast.success(t('toast.reextracted'));
        }
        onSourcesChanged?.();
      } else {
        throw new Error('Error re-extracting');
      }
    } catch (error) {
      console.error('Error re-extracting source:', error);
      toast.error(t('toast.reextractError'));
    }
  };

  const sourcesNeedingExtraction = sources.filter(s =>
    s.type === 'file' && (!s.content_text || s.content_text.length < 100)
  );

  const handleReextractAll = async () => {
    if (sourcesNeedingExtraction.length === 0) return;
    setIsReextractingAll(true);
    let successCount = 0;
    let errorCount = 0;

    for (const source of sourcesNeedingExtraction) {
      try {
        const res = await fetch(`/api/catbrains/${projectId}/sources/${source.id}`, {
          method: 'POST',
        });
        if (res.ok) {
          const updated = await res.json();
          setSources(prev => prev.map(s => s.id === source.id ? updated : s));
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(t('toast.reextractedMultiple', { count: successCount }));
      onSourcesChanged?.();
    }
    if (errorCount > 0) toast.error(t('toast.reextractMultipleError', { count: errorCount }));
    setIsReextractingAll(false);
  };

  const handleAiExtract = async (id: string, model: string): Promise<{ extracted_length: number; total_tokens: number } | null> => {
    try {
      const res = await fetch(`/api/catbrains/${projectId}/sources/${id}/ai-extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      });
      if (res.ok) {
        const data = await res.json();
        setSources(sources.map(s => s.id === id ? data.source : s));
        toast.success(t('toast.aiExtracted', { chars: data.ai_extraction.extracted_length.toLocaleString(), tokens: data.ai_extraction.total_tokens.toLocaleString() }));
        onSourcesChanged?.();
        return data.ai_extraction;
      } else {
        const err = await res.json();
        toast.error(t('toast.aiExtractError', { error: err.error || 'Error desconocido' }));
        return null;
      }
    } catch (error) {
      console.error('Error AI extracting:', error);
      toast.error(t('toast.aiExtractGenericError'));
      return null;
    }
  };

  const filteredSources = sources.filter(s => {
    const matchesSearch = (s?.name || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || s.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const dateGroups = groupSourcesByDate(filteredSources, t);

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
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-2">
          <div className="text-sm text-zinc-400">
            {t('stats', { total: stats.total, file: stats.file, url: stats.url, youtube: stats.youtube, note: stats.note })}
          </div>
          {filteredSources.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={selectedIds.size === filteredSources.length && filteredSources.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                <label htmlFor="select-all" className="text-sm text-zinc-300 cursor-pointer">
                  {t('selectAll')}
                </label>
              </div>
              {selectedIds.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={isDeletingMultiple}
                  className="h-7 text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
                >
                  {isDeletingMultiple ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                  {t('deleteSelected', { count: selectedIds.size })}
                </Button>
              )}
              {sourcesNeedingExtraction.length > 0 && (
                <Button
                  size="sm"
                  onClick={handleReextractAll}
                  disabled={isReextractingAll}
                  className="h-7 text-xs bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-0"
                >
                  {isReextractingAll ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCw className="w-3 h-3 mr-1" />}
                  {t('reextract', { count: sourcesNeedingExtraction.length })}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder={t('search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-zinc-900 border-zinc-800 text-zinc-50"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || "all")}>
            <SelectTrigger className="w-[130px] h-9 bg-zinc-900 border-zinc-800 text-zinc-50">
              <Filter className="w-4 h-4 mr-2 text-zinc-500" />
              <SelectValue placeholder={t('filterType')} />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              <SelectItem value="file">{t('filterFile')}</SelectItem>
              <SelectItem value="url">{t('filterUrl')}</SelectItem>
              <SelectItem value="youtube">{t('filterYoutube')}</SelectItem>
              <SelectItem value="note">{t('filterNote')}</SelectItem>
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
          <div className="space-y-1">
            {dateGroups.map((group) => (
              <div key={group.dateKey}>
                {/* Date separator */}
                <div className="flex items-center gap-3 py-2 mt-3 first:mt-0">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">
                    {group.label} · {group.sources.length}
                  </span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>

                {/* Sources in this group */}
                <div className="space-y-2">
                  {group.sources.map((source) => {
                    const isNew = isSourceNew(source);
                    return (
                      <div key={source.id} className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedIds.has(source.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedIds);
                            if (checked) newSet.add(source.id);
                            else newSet.delete(source.id);
                            setSelectedIds(newSet);
                          }}
                          className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                        />
                        <div className="flex-1 min-w-0">
                          <SourceItem
                            source={source}
                            onDelete={handleDelete}
                            onUpdate={handleUpdate}
                            onReextract={handleReextract}
                            onAiExtract={handleAiExtract}
                            availableModels={availableModels}
                          />
                        </div>
                        {source.is_pending_append === 1 && ragEnabled ? (
                          <Badge className="bg-violet-500/10 text-violet-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5 animate-pulse">
                            {t('badge.pendingAppend')}
                          </Badge>
                        ) : isNew ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px] flex-shrink-0 px-1.5 py-0.5">
                            {t('badge.new')}
                          </Badge>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
