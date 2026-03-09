"use client";

import { useSystemHealth } from '@/hooks/use-system-health';
import { CheckCircle2, XCircle, Circle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { useState } from 'react';
import { DiagnosticSheet } from '@/components/system/diagnostic-sheet';

interface ConnectionStatusBarProps {
  projectStatus: string;
}

export function ConnectionStatusBar({ projectStatus }: ConnectionStatusBarProps) {
  const { health, refresh } = useSystemHealth();
  const [diagnosticService, setDiagnosticService] = useState<'openclaw' | 'n8n' | 'qdrant' | 'litellm' | null>(null);

  if (projectStatus === 'draft') return null;

  const requirements = {
    openclaw: ['sources_added', 'processing', 'processed', 'rag_indexed'].includes(projectStatus),
    n8n: ['sources_added', 'processing', 'processed', 'rag_indexed'].includes(projectStatus),
    qdrant: ['processed', 'rag_indexed'].includes(projectStatus),
    litellm: ['processed', 'rag_indexed'].includes(projectStatus),
  };

  const services = [
    { id: 'openclaw' as const, name: 'OpenClaw', required: requirements.openclaw, data: health.openclaw },
    { id: 'n8n' as const, name: 'n8n', required: requirements.n8n, data: health.n8n },
    { id: 'qdrant' as const, name: 'Qdrant', required: requirements.qdrant, data: health.qdrant },
    { id: 'litellm' as const, name: 'LiteLLM', required: requirements.litellm, data: health.litellm },
  ];

  const hasRequiredError = services.some(s => s.required && (s.data.status === 'disconnected' || s.data.status === 'error'));

  const renderChip = (service: typeof services[0]) => {
    if (!service.required) {
      return (
        <TooltipProvider key={service.id}>
          <Tooltip>
            <TooltipTrigger>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs cursor-help">
                <Circle className="w-3 h-3" />
                {service.name}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>No necesario en esta fase</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    if (service.data.status === 'connected') {
      return (
        <div key={service.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs">
          <CheckCircle2 className="w-3 h-3" />
          {service.name}
        </div>
      );
    }

    return (
      <button 
        key={service.id}
        onClick={() => setDiagnosticService(service.id)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-950 border border-red-800 text-red-300 text-xs hover:bg-red-900 transition-colors"
      >
        <XCircle className="w-3 h-3" />
        {service.name} — No conectado
      </button>
    );
  };

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        {services.map(renderChip)}
      </div>
      {hasRequiredError && (
        <p className="text-xs text-amber-500 mt-2">
          ⚠️ Hay servicios necesarios desconectados. Algunas funcionalidades no estarán disponibles hasta que se resuelvan.
        </p>
      )}

      <DiagnosticSheet 
        isOpen={diagnosticService !== null}
        onClose={() => setDiagnosticService(null)}
        serviceId={diagnosticService}
        error={diagnosticService ? health[diagnosticService].error : null}
        url={diagnosticService ? health[diagnosticService].url : ''}
        onRetry={refresh}
      />
    </div>
  );
}
