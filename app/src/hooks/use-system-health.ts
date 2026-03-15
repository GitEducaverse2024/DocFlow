import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface ServiceStatus {
  status: 'connected' | 'disconnected' | 'error' | 'checking';
  url: string;
  latency_ms: number | null;
  error: string | null;
}

export interface SystemHealth {
  docflow: { status: string; db: string; projects_count: number; sources_count: number; catpaws_count: number };
  openclaw: ServiceStatus & { agents: string[] };
  n8n: ServiceStatus;
  qdrant: ServiceStatus & { collections: string[]; collections_count: number };
  litellm: ServiceStatus & { models: string[]; embedding_models: string[] };
  timestamp: string;
}

const initialServiceState: ServiceStatus = {
  status: 'checking',
  url: '',
  latency_ms: null,
  error: null
};

const initialState: SystemHealth = {
  docflow: { status: 'checking', db: 'checking', projects_count: 0, sources_count: 0, catpaws_count: 0 },
  openclaw: { ...initialServiceState, agents: [] },
  n8n: { ...initialServiceState },
  qdrant: { ...initialServiceState, collections: [], collections_count: 0 },
  litellm: { ...initialServiceState, models: [], embedding_models: [] },
  timestamp: new Date().toISOString()
};

const SERVICE_NAMES: Record<string, string> = {
  openclaw: 'OpenClaw',
  n8n: 'n8n',
  qdrant: 'Qdrant',
  litellm: 'LiteLLM',
};

export function useSystemHealth(pollingInterval = 30000, enableToasts = true) {
  const [health, setHealth] = useState<SystemHealth>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevStatusRef = useRef<Record<string, string>>({});
  const initialLoadDone = useRef(false);

  const fetchHealth = useCallback(async (fresh = false) => {
    setIsLoading(true);
    try {
      const url = fresh ? '/api/health?fresh=1' : '/api/health';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch health status');
      const data = await res.json();
      setHealth(data);
      setError(null);

      // Toast on status changes (only after initial load)
      if (enableToasts && initialLoadDone.current) {
        const services = ['openclaw', 'n8n', 'qdrant', 'litellm'] as const;
        for (const svc of services) {
          const prev = prevStatusRef.current[svc];
          const curr = data[svc]?.status;
          if (prev && curr && prev !== curr) {
            const name = SERVICE_NAMES[svc];
            if (curr === 'connected') {
              toast.success(`${name} conectado`, { description: `Latencia: ${data[svc].latency_ms}ms` });
            } else {
              toast.error(`${name} desconectado`, { description: data[svc].error || 'Sin respuesta' });
            }
          }
        }
      }

      // Update previous status for next comparison
      prevStatusRef.current = {
        openclaw: data.openclaw?.status,
        n8n: data.n8n?.status,
        qdrant: data.qdrant?.status,
        litellm: data.litellm?.status,
      };
      initialLoadDone.current = true;
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [enableToasts]);

  useEffect(() => {
    fetchHealth(true); // First load is always fresh
    const interval = setInterval(() => fetchHealth(false), pollingInterval);
    return () => clearInterval(interval);
  }, [fetchHealth, pollingInterval]);

  const refresh = useCallback(() => fetchHealth(true), [fetchHealth]);

  return { health, isLoading, error, refresh };
}
