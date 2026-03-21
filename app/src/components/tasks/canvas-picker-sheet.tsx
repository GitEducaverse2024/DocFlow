"use client";

import { useState, useEffect } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';

interface CanvasInfo {
  id: string;
  name: string;
  emoji: string;
  node_count: number;
  updated_at: string;
  description?: string | null;
}

interface CanvasPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onSelect: (canvas: CanvasInfo) => void;
  onCreateNew: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `hace ${diffDays}d`;
  return new Date(dateStr).toLocaleDateString();
}

export function CanvasPickerSheet({
  open,
  onClose,
  onSelect,
  onCreateNew,
  t,
}: CanvasPickerSheetProps) {
  const [canvases, setCanvases] = useState<CanvasInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    fetch('/api/canvas')
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setCanvases(data);
        }
      })
      .catch(() => {
        setCanvases([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = canvases.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('wizard.pipeline.canvasSheet.title')}</SheetTitle>
        </SheetHeader>

        {/* Search */}
        <div className="px-4 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('wizard.pipeline.canvasSheet.search')}
            className="bg-zinc-900 border-zinc-800 text-zinc-50 pl-9"
          />
        </div>

        {/* Canvas list */}
        <div className="flex-1 overflow-y-auto px-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">
              {t('wizard.pipeline.canvasSheet.empty')}
            </p>
          ) : (
            filtered.map((canvas) => (
              <button
                key={canvas.id}
                type="button"
                onClick={() => {
                  onSelect(canvas);
                  onClose();
                }}
                className="w-full text-left p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-violet-500/40 hover:bg-zinc-800/80 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-200">
                    {canvas.emoji} {canvas.name}
                  </span>
                  <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                    {t('wizard.pipeline.canvasSheet.nodes', { count: canvas.node_count })}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  {relativeTime(canvas.updated_at)}
                </p>
              </button>
            ))
          )}
        </div>

        <SheetFooter>
          <Button
            variant="outline"
            onClick={onCreateNew}
            className="w-full border-dashed border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-violet-400"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('wizard.pipeline.canvasSheet.createNew')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
