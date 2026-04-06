'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ProviderStatus {
  provider: string;
  status: string;
  model_count: number;
  latency_ms: number | null;
}

interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  is_local: boolean;
  is_embedding: boolean;
}

interface ModelInventory {
  models: DiscoveredModel[];
  providers: ProviderStatus[];
  cached_at: string;
  is_stale: boolean;
}

export function DiscoveryInventoryPanel() {
  const t = useTranslations('settings.modelIntelligence.inventory');
  const [inventory, setInventory] = useState<ModelInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/discovery/models');
      if (res.ok) {
        const data = await res.json();
        setInventory(data);
      }
    } catch (e) {
      console.error('Error loading discovery inventory', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/discovery/refresh', { method: 'POST' });
      if (!res.ok) throw new Error('refresh failed');
      await fetch('/api/mid/sync', { method: 'POST' });
      await load();
      toast.success(t('refresh'));
    } catch {
      toast.error(t('refresh'));
    } finally {
      setRefreshing(false);
    }
  };

  const modelsByProvider: Record<string, DiscoveredModel[]> = {};
  if (inventory) {
    for (const m of inventory.models) {
      if (!modelsByProvider[m.provider]) modelsByProvider[m.provider] = [];
      modelsByProvider[m.provider].push(m);
    }
  }

  const cachedAtLabel = inventory?.cached_at
    ? new Date(inventory.cached_at).toLocaleString()
    : '—';

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-zinc-50 mb-1">{t('title')}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-500">
                {t('lastUpdate')}: {cachedAtLabel}
              </span>
              {inventory?.is_stale && (
                <Badge variant="outline" className="bg-amber-600/20 border-amber-500/40 text-amber-300 text-xs">
                  {t('stale')}
                </Badge>
              )}
            </div>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            size="sm"
            variant="outline"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {refreshing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('refreshing')}
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('refresh')}
              </>
            )}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
          </div>
        ) : !inventory || inventory.models.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">{t('empty')}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{t('providers')}</h4>
              <div className="flex flex-wrap gap-2">
                {inventory.providers.map((p) => (
                  <Badge
                    key={p.provider}
                    variant="outline"
                    className={
                      p.status === 'active'
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }
                  >
                    {p.provider} ({p.model_count})
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{t('models')}</h4>
              <div className="space-y-2">
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <div key={provider}>
                    <div className="text-xs text-zinc-400 mb-1">{provider}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {models.map((m) => (
                        <Badge
                          key={m.id}
                          variant="outline"
                          className="bg-zinc-800/60 border-zinc-700 text-zinc-300 text-xs font-mono"
                        >
                          {m.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
