"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { diagnosticContent } from './diagnostic-content';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';

interface DiagnosticSheetProps {
  isOpen: boolean;
  onClose: () => void;
  serviceId: 'openclaw' | 'n8n' | 'qdrant' | 'litellm' | null;
  error: string | null;
  url: string;
  onRetry: () => void;
}

export function DiagnosticSheet({ isOpen, onClose, serviceId, error, url, onRetry }: DiagnosticSheetProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!serviceId) return null;

  const content = diagnosticContent[serviceId];

  const handleCopy = (text: string, index: number) => {
    if (copyToClipboard(text)) {
      setCopiedIndex(index);
      toast.success('Copiado al portapapeles');
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      toast.error('No se pudo copiar');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md bg-zinc-950 border-zinc-800 overflow-y-auto">
        <SheetHeader className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-6 h-6 text-red-500" />
            <SheetTitle className="text-xl text-zinc-50">Diagnóstico: {content.name}</SheetTitle>
          </div>
          <Badge className="w-fit bg-red-500/10 text-red-500 border-red-500/20">Desconectado</Badge>
        </SheetHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-300">Problema detectado</h3>
            <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-md">
              <p className="text-sm text-zinc-300 mb-2">No se puede conectar con {content.name} en <code className="text-xs bg-zinc-900 px-1 py-0.5 rounded">{url}</code></p>
              <p className="text-xs text-red-400 font-mono">{error || 'Error desconocido'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-zinc-300">¿Para qué necesitas este servicio?</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">{content.purpose}</p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">Pasos para solucionarlo</h3>
            <div className="space-y-4">
              {content.steps.map((step, idx) => (
                <div key={idx} className="space-y-2">
                  <p className="text-sm text-zinc-400">
                    <span className="text-zinc-500 mr-2">{idx + 1}.</span>
                    {step.text}
                  </p>
                  {step.code && (
                    <div className="relative group">
                      <pre className="p-3 bg-zinc-900 border border-zinc-800 rounded-md text-xs text-zinc-300 font-mono overflow-x-auto">
                        {step.code}
                      </pre>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                        onClick={() => handleCopy(step.code, idx)}
                      >
                        {copiedIndex === idx ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <Button 
              className="w-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              onClick={onRetry}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Reintentar conexión
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
