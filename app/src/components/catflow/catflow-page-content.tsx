"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Plus,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { CatFlowCard } from './catflow-card';
import { ForkDialog } from './fork-dialog';
import { CanvasWizard } from '@/components/canvas/canvas-wizard';
import type { CatFlowCanvas } from './catflow-card';

type FilterKey = 'all' | 'agents' | 'catbrains' | 'mixed';

export function CatFlowPageContent() {
  const router = useRouter();
  const t = useTranslations('catflow');
  const [canvases, setCanvases] = useState<CatFlowCanvas[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [forkTarget, setForkTarget] = useState<{ id: string; name: string } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/canvas');
      if (res.ok) {
        const data = await res.json();
        // Exclude templates
        setCanvases(data.filter((c: CatFlowCanvas) => !c.tags?.includes('template')));
      }
    } catch {
      toast.error(t('toasts.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Filter counts
  const counts = useMemo(() => ({
    all: canvases.length,
    agents: canvases.filter(c => c.mode === 'agents').length,
    catbrains: canvases.filter(c => c.mode === 'catbrains').length,
    mixed: canvases.filter(c => c.mode === 'mixed').length,
  }), [canvases]);

  const filteredCanvases = useMemo(() => canvases.filter(c => {
    if (filter === 'all') return true;
    return c.mode === filter;
  }), [canvases, filter]);

  const filters: { key: FilterKey; labelKey: string }[] = [
    { key: 'all', labelKey: 'filters.all' },
    { key: 'agents', labelKey: 'filters.agents' },
    { key: 'catbrains', labelKey: 'filters.catbrains' },
    { key: 'mixed', labelKey: 'filters.mixed' },
  ];

  // --- Handlers ---

  const handleExecute = async (id: string) => {
    setExecutingId(id);
    try {
      const res = await fetch(`/api/canvas/${id}/execute`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error');
      }
      const data = await res.json();
      toast.success(t('toasts.executed'));
      // Navigate to canvas to see execution
      router.push(`/canvas/${id}?run=${data.runId}`);
    } catch {
      toast.error(t('toasts.executeError'));
    } finally {
      setExecutingId(null);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'archived' ? 'idle' : 'archived';
    try {
      const res = await fetch(`/api/canvas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      setCanvases(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      toast.success(t(newStatus === 'idle' ? 'toasts.activated' : 'toasts.deactivated'));
    } catch {
      toast.error(t('toasts.toggleError'));
    }
  };

  const handleExport = async (id: string) => {
    try {
      const res = await fetch(`/api/canvas/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.name || 'catflow'}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('toasts.exported'));
    } catch {
      toast.error(t('toasts.exportError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    if (!confirm(t('card.deleteConfirm'))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/canvas/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(t('toasts.deleted'));
      setCanvases(prev => prev.filter(c => c.id !== id));
    } catch {
      toast.error(t('toasts.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleWizardCreated = (id: string) => {
    setWizardOpen(false);
    router.push(`/canvas/${id}`);
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={<Zap className="w-6 h-6" />}
        action={
          <Button
            onClick={() => setWizardOpen(true)}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('newCatflow')}
          </Button>
        }
      />

      {/* Filter buttons */}
      <div className="flex items-center gap-1 mb-6 flex-wrap">
        {filters.map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
            className={filter === f.key
              ? 'bg-violet-500/20 text-violet-400 border-violet-500/30'
              : 'bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50'}
          >
            {t(f.labelKey)} ({counts[f.key]})
          </Button>
        ))}
      </div>

      {/* Canvas Card Grid */}
      {filteredCanvases.length === 0 ? (
        <div className="text-center py-20 border border-zinc-800 border-dashed rounded-lg">
          <Zap className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-zinc-300 mb-2">
            {filter === 'all' ? t('list.emptyAll') : t('list.emptyFiltered')}
          </h2>
          {filter === 'all' && (
            <>
              <p className="text-zinc-500 max-w-md mx-auto mb-6">
                {t('list.emptyDescription')}
              </p>
              <Button
                onClick={() => setWizardOpen(true)}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('list.createFirst')}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCanvases.map(canvas => (
            <CatFlowCard
              key={canvas.id}
              canvas={canvas}
              onExecute={handleExecute}
              onToggleActive={handleToggleActive}
              onFork={(id, name) => setForkTarget({ id, name })}
              onExport={handleExport}
              onDelete={handleDelete}
              isDeleting={deletingId === canvas.id}
              isExecuting={executingId === canvas.id}
            />
          ))}
        </div>
      )}

      {/* Canvas Wizard Dialog */}
      <CanvasWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={handleWizardCreated}
      />

      {/* Fork Dialog */}
      <ForkDialog
        open={!!forkTarget}
        onOpenChange={(open) => { if (!open) setForkTarget(null); }}
        canvasId={forkTarget?.id || null}
        canvasName={forkTarget?.name || ''}
        onForked={() => { fetchData(); }}
      />
    </div>
  );
}
