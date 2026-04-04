'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { getTierStyle } from '@/lib/ui/tier-styles';

export interface MidEntry {
  id: number;
  model_key: string;
  display_name: string;
  provider: string;
  tier: 'Elite' | 'Pro' | 'Libre' | null;
  best_use: string | null;
  capabilities: string[];
  cost_tier: string | null;
  cost_notes: string | null;
  scores: Record<string, number>;
  status: 'active' | 'retired';
  created_at: string;
  updated_at: string;
}

interface Props {
  models: MidEntry[];
  onEdit: (m: MidEntry) => void;
}

const TIER_ORDER: Array<'Elite' | 'Pro' | 'Libre'> = ['Elite', 'Pro', 'Libre'];

export function MidCardsGrid({ models, onEdit }: Props) {
  const t = useTranslations('settings.modelIntelligence.mid');

  const grouped: Record<string, MidEntry[]> = {
    Elite: [],
    Pro: [],
    Libre: [],
    'Sin clasificar': [],
  };
  for (const m of models) {
    const key = m.tier ?? 'Sin clasificar';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  const sections: Array<{ label: string; items: MidEntry[] }> = [];
  for (const tier of TIER_ORDER) {
    if (grouped[tier].length > 0) sections.push({ label: tier, items: grouped[tier] });
  }
  if (grouped['Sin clasificar'].length > 0) {
    sections.push({ label: 'Sin clasificar', items: grouped['Sin clasificar'] });
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-50 mb-4">{t('title')}</h3>
      <div className="space-y-6">
        {sections.map(({ label, items }) => (
          <div key={label}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className={getTierStyle(label === 'Sin clasificar' ? null : label)}>
                {label}
              </Badge>
              <span className="text-xs text-zinc-500">{items.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map((m) => (
                <Card key={m.id} className="bg-zinc-900 border-zinc-800 hover:border-violet-800/30 transition-colors">
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-zinc-50 truncate">{m.display_name}</h4>
                        <p className="text-xs text-zinc-500 font-mono truncate">{m.model_key}</p>
                      </div>
                      <Badge variant="outline" className={`${getTierStyle(m.tier)} text-xs shrink-0`}>
                        {m.tier ?? '—'}
                      </Badge>
                    </div>

                    {m.best_use && (
                      <p className="text-xs text-zinc-400 line-clamp-2">{m.best_use}</p>
                    )}

                    {m.capabilities && m.capabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {m.capabilities.slice(0, 6).map((c, i) => (
                          <Badge
                            key={`${m.id}-cap-${i}`}
                            variant="outline"
                            className="bg-zinc-800/60 border-zinc-700 text-zinc-300 text-[10px] px-1.5 py-0"
                          >
                            {c}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {m.cost_notes && (
                      <p className="text-[11px] text-zinc-500">{m.cost_notes}</p>
                    )}

                    <Button
                      onClick={() => onEdit(m)}
                      size="sm"
                      variant="outline"
                      className="mt-1 h-7 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      <Pencil className="w-3 h-3 mr-1.5" />
                      {t('edit')}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
