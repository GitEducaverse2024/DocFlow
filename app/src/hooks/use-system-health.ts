import { useState, useEffect, useCallback } from 'react';

export interface ServiceStatus {
  status: 'connected' | 'disconnected' | 'error' | 'checking';
  url: string;
  latency_ms: number | null;
  error: string | null;
}

export interface SystemHealth {
  docflow: { status: string; db: string; projects_count: number; sources_count: number };
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
  docflow: { status: 'checking', db: 'checking', projects_count: 0, sources_count: 0 },
  openclaw: { ...initialServiceState, agents: [] },
  n8n: { ...initialServiceState },
  qdrant: { ...initialServiceState, collections: [], collections_count: 0 },
  litellm: { ...initialServiceState, models: [], embedding_models: [] },
  timestamp: new Date().toISOString()
};

export function useSystemHealth(pollingInterval = 30000) {
  const [health, setHealth] = useState<SystemHealth>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Failed to fetch health status');
      const data = await res.json();
      setHealth(data);
      setError(null);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, pollingInterval);
    return () => clearInterval(interval);
  }, [fetchHealth, pollingInterval]);

  return { health, isLoading, error, refresh: fetchHealth };
}
