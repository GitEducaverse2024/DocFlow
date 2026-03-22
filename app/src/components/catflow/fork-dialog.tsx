"use client";

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, GitFork } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface ForkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canvasId: string | null;
  canvasName: string;
  onForked: () => void;
}

export function ForkDialog({ open, onOpenChange, canvasId, canvasName, onForked }: ForkDialogProps) {
  const t = useTranslations('catflow');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill name when dialog opens
  useEffect(() => {
    if (open) {
      setName(`${canvasName} (copia)`);
    }
  }, [open, canvasName]);

  const handleFork = async () => {
    if (!canvasId || !name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/canvas/${canvasId}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success(t('fork.success'));
      onForked();
      onOpenChange(false);
    } catch {
      toast.error(t('fork.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-200">
            <GitFork className="w-5 h-5 text-violet-400" />
            {t('fork.title')}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {t('fork.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <Label className="text-zinc-300 text-sm">{t('fork.nameLabel')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('fork.namePlaceholder')}
              className="mt-1 bg-zinc-800 border-zinc-700 text-zinc-200"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleFork()}
            />
          </div>
          <p className="text-xs text-zinc-500">
            {t('fork.hint')}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-transparent border-zinc-700 text-zinc-300"
          >
            {t('fork.cancel')}
          </Button>
          <Button
            onClick={handleFork}
            disabled={!name.trim() || loading}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <GitFork className="w-4 h-4 mr-2" />}
            {t('fork.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
