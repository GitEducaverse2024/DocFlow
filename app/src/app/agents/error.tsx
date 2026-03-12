'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SECTION_NAME = 'Agentes';

const CATBOT_KEY = 'docatflow_catbot_messages';
const MAX_STORED = 50;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // RESIL-06: Push error context to CatBot localStorage
    try {
      const existing = JSON.parse(localStorage.getItem(CATBOT_KEY) || '[]');
      existing.push({
        role: 'assistant',
        content: `He detectado un error en la seccion ${SECTION_NAME}: "${error.message}". Puedes pulsar "Reintentar" o abrir CatBot para que te ayude.`,
        timestamp: Date.now(),
      });
      localStorage.setItem(CATBOT_KEY, JSON.stringify(existing.slice(-MAX_STORED)));
    } catch {
      // Ignore localStorage errors (private browsing, full storage, etc.)
    }
    console.error(`[${SECTION_NAME}] Error boundary caught:`, error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 max-w-md">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">
          Algo ha ido mal
        </h2>
        <p className="text-zinc-400 mb-1 text-sm">
          Error en la seccion de {SECTION_NAME}
        </p>
        <p className="text-zinc-500 mb-6 text-xs font-mono break-all">
          {error.message}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>
            Reintentar
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Ir al inicio
          </Button>
        </div>
        <p className="text-zinc-600 text-xs mt-4">
          CatBot ha sido notificado de este error.
        </p>
      </div>
    </div>
  );
}
