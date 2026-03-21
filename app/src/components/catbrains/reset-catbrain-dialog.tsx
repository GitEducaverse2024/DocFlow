"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Project } from '@/lib/types';

interface ResetCatBrainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catbrain: Project;
  stats: { sources_count: number; vectors_count: number | null };
  onResetComplete: () => void;
}

export function ResetCatBrainDialog({ open, onOpenChange, catbrain, stats, onResetComplete }: ResetCatBrainDialogProps) {
  const t = useTranslations('catbrains');
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleClose = (val: boolean) => {
    if (resetting) return;
    if (!val) {
      setStep(1);
      setConfirmText('');
    }
    onOpenChange(val);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch(`/api/catbrains/${catbrain.id}/reset`, { method: 'POST' });
      if (res.ok) {
        onResetComplete();
      } else {
        toast.error(t('reset.error'));
      }
    } catch {
      toast.error(t('reset.error'));
    } finally {
      setResetting(false);
    }
  };

  const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').normalize('NFC');
  const nameMatches = normalize(confirmText) === normalize(catbrain.name);
  const hasVectors = stats.vectors_count != null && stats.vectors_count > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md bg-zinc-950 border-zinc-800"
        showCloseButton={!resetting}
      >
        <DialogHeader>
          <DialogTitle className="text-xl text-zinc-50 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            {t('reset.title')}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              {hasVectors
                ? t('reset.step1Description', { sourceCount: stats.sources_count, vectorCount: stats.vectors_count! })
                : t('reset.step1NoVectors', { sourceCount: stats.sources_count })
              }
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                {t('reset.cancel')}
              </Button>
              <Button
                onClick={() => setStep(2)}
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              >
                {t('reset.continue')}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              {t('reset.step2Prompt', { name: catbrain.name })}
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={catbrain.name}
              className="bg-zinc-900 border-zinc-700 text-zinc-50"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                {t('reset.cancel')}
              </Button>
              <Button
                onClick={handleReset}
                disabled={!nameMatches || resetting}
                className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {resetting ? t('reset.resetting') : t('reset.confirm')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
