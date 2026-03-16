'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Globe, Cpu, Zap, Check, Loader2 } from 'lucide-react';
import { WebSearchTestPanel } from './websearch-test-panel';

interface Props {
  catbrainId: string;
  currentEngine: string;
  onEngineChange: (engine: string) => void;
}

const ENGINES = [
  { id: 'auto', name: 'Auto (Fallback)', icon: Zap, color: 'text-amber-400', ring: 'ring-amber-500/50', bgColor: 'bg-amber-500/10', desc: 'Intenta SearXNG, luego Gemini, luego Ollama' },
  { id: 'searxng', name: 'SearXNG', icon: Search, color: 'text-violet-400', ring: 'ring-violet-500/50', bgColor: 'bg-violet-500/10', desc: 'Metabuscador local self-hosted', badge: 'Local' },
  { id: 'gemini', name: 'Gemini', icon: Globe, color: 'text-blue-400', ring: 'ring-blue-500/50', bgColor: 'bg-blue-500/10', desc: 'Google Gemini con grounding', badge: 'Cloud' },
  { id: 'ollama', name: 'Ollama Web Search', icon: Cpu, color: 'text-emerald-400', ring: 'ring-emerald-500/50', bgColor: 'bg-emerald-500/10', desc: 'Ollama.com API de busqueda web', badge: 'Cloud' },
];

export function WebSearchEngineTab({ catbrainId, currentEngine, onEngineChange }: Props) {
  const [selected, setSelected] = useState(currentEngine || 'auto');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<Record<string, boolean>>({});

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return;
      const data = await res.json();
      const services = data.services || {};
      setServiceStatus({
        searxng: services.searxng?.status === 'online',
        litellm: services.litellm?.status === 'online',
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSelect = async (engineId: string) => {
    setSelected(engineId);
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch(`/api/catbrains/${catbrainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_engine: engineId }),
      });

      if (res.ok) {
        onEngineChange(engineId);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // revert on error
      setSelected(currentEngine);
    } finally {
      setSaving(false);
    }
  };

  const getEngineStatus = (engineId: string): 'online' | 'offline' | 'unknown' => {
    if (engineId === 'auto') return 'online'; // always available
    if (engineId === 'searxng') return serviceStatus.searxng ? 'online' : 'offline';
    if (engineId === 'gemini') return serviceStatus.litellm ? 'online' : 'offline';
    if (engineId === 'ollama') return 'online'; // external API
    return 'unknown';
  };

  const statusDotClass = (status: 'online' | 'offline' | 'unknown') => {
    if (status === 'online') return 'bg-emerald-400';
    if (status === 'offline') return 'bg-red-400';
    return 'bg-zinc-500';
  };

  const statusLabel = (status: 'online' | 'offline' | 'unknown') => {
    if (status === 'online') return 'En linea';
    if (status === 'offline') return 'Desconectado';
    return 'Desconocido';
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-50 mb-1">Motor de Busqueda</h3>
        <p className="text-sm text-zinc-400 mb-4">
          Selecciona el motor de busqueda web para este CatBrain.
          {saving && <Loader2 className="inline w-4 h-4 ml-2 animate-spin text-violet-400" />}
          {saved && <Check className="inline w-4 h-4 ml-2 text-emerald-400" />}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {ENGINES.map((engine) => {
          const Icon = engine.icon;
          const isSelected = selected === engine.id;
          const status = getEngineStatus(engine.id);

          return (
            <Card
              key={engine.id}
              onClick={() => handleSelect(engine.id)}
              className={`cursor-pointer bg-zinc-900 border transition-all ${
                isSelected
                  ? `border-transparent ring-2 ${engine.ring}`
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${engine.bgColor}`}>
                    <Icon className={`w-5 h-5 ${engine.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-zinc-100">{engine.name}</span>
                      {engine.badge && (
                        <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400">{engine.badge}</Badge>
                      )}
                      {isSelected && (
                        <Check className="w-4 h-4 text-emerald-400 ml-auto flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">{engine.desc}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${statusDotClass(status)}`} />
                      <span className="text-[10px] text-zinc-500">{statusLabel(status)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <WebSearchTestPanel catbrainId={catbrainId} engine={selected} />
    </div>
  );
}
