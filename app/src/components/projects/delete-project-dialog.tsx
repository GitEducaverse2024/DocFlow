"use client";

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onConfirm: () => Promise<void>;
}

export function DeleteProjectDialog({ open, onOpenChange, projectName, onConfirm }: DeleteProjectDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleClose = (val: boolean) => {
    if (!val) {
      setStep(1);
      setConfirmText('');
    }
    onOpenChange(val);
  };

  const handleContinue = () => {
    setStep(2);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  const nameMatches = confirmText.trim() === projectName.trim();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl text-zinc-50 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Eliminar CatBrain
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              ¿Estas seguro de que quieres eliminar este CatBrain? Se borraran todas las fuentes, documentos procesados, colecciones RAG y datos del bot.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleContinue}
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              >
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              Escribe <span className="font-semibold text-zinc-200">{projectName}</span> para confirmar la eliminación permanente.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={projectName}
              className="bg-zinc-900 border-zinc-700 text-zinc-50"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDelete}
                disabled={!nameMatches || deleting}
                className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Eliminar permanentemente
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
