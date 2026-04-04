'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getTierStyle } from '@/lib/ui/tier-styles';
import type { MidEntry } from './mid-cards-grid';

interface AliasRow {
  alias: string;
  model_key: string;
  description: string;
  is_active: number;
}

interface Props {
  midModels: MidEntry[];
}

export function AliasRoutingTable({ midModels }: Props) {
  const t = useTranslations('settings.modelIntelligence.routing');
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingAlias, setUpdatingAlias] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/alias-routing');
        if (res.ok) {
          const data = await res.json();
          setAliases(Array.isArray(data?.aliases) ? data.aliases : []);
        }
      } catch (e) {
        console.error('Error loading aliases', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const midByKey = useMemo(() => {
    const map: Record<string, MidEntry> = {};
    for (const m of midModels) map[m.model_key] = m;
    return map;
  }, [midModels]);

  const handleChange = async (alias: string, newKey: string) => {
    setUpdatingAlias(alias);
    try {
      const res = await fetch('/api/alias-routing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, model_key: newKey }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error ?? 'update failed');
      setAliases((prev) =>
        prev.map((a) => (a.alias === alias ? { ...a, model_key: newKey } : a)),
      );
      toast.success(t('updated'));
    } catch {
      toast.error(t('updateError'));
    } finally {
      setUpdatingAlias(null);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-zinc-50">{t('title')}</h3>
          <p className="text-xs text-zinc-500 mt-1">{t('description')}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
          </div>
        ) : aliases.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">—</p>
        ) : (
          <div className="space-y-2">
            {aliases.map((a) => {
              const currentMid = midByKey[a.model_key];
              const tier = currentMid?.tier ?? null;
              const costNotes = currentMid?.cost_notes ?? null;
              return (
                <div
                  key={a.alias}
                  className="flex flex-col md:flex-row md:items-center gap-3 p-3 bg-zinc-950/40 border border-zinc-800 rounded"
                >
                  <div className="md:w-52 shrink-0">
                    <div className="text-sm font-mono text-zinc-200">{a.alias}</div>
                    {a.description && (
                      <div className="text-xs text-zinc-500 line-clamp-1">{a.description}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Select
                      value={a.model_key}
                      onValueChange={(v) => handleChange(a.alias, String(v))}
                      disabled={updatingAlias === a.alias}
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50 max-h-80">
                        {midModels.map((m) => (
                          <SelectItem key={m.model_key} value={m.model_key}>
                            <span className="font-mono text-xs">{m.model_key}</span>
                            <span className="text-zinc-500 text-xs ml-2">({m.tier ?? '—'})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 md:w-64 shrink-0">
                    {currentMid ? (
                      <>
                        <Badge variant="outline" className={`${getTierStyle(tier)} text-xs`}>
                          {tier ?? '—'}
                        </Badge>
                        {costNotes && (
                          <span className="text-[11px] text-zinc-500 truncate">{costNotes}</span>
                        )}
                      </>
                    ) : (
                      <Badge variant="outline" className="bg-amber-600/20 border-amber-500/40 text-amber-300 text-xs">
                        Sin ficha
                      </Badge>
                    )}
                    {updatingAlias === a.alias && (
                      <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
