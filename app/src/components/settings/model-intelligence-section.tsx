'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Cpu } from 'lucide-react';
import { DiscoveryInventoryPanel } from './discovery-inventory-panel';
import { MidCardsGrid, type MidEntry } from './mid-cards-grid';
import { AliasRoutingTable } from './alias-routing-table';
import { MidEditDialog } from './mid-edit-dialog';

export function ModelIntelligenceSection() {
  const t = useTranslations('settings.modelIntelligence');
  const [midModels, setMidModels] = useState<MidEntry[]>([]);
  const [editingModel, setEditingModel] = useState<MidEntry | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/mid?status=active');
        if (res.ok) {
          const data = await res.json();
          setMidModels(Array.isArray(data?.models) ? data.models : []);
        }
      } catch (e) {
        console.error('Error loading MID models', e);
      }
    })();
  }, []);

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">{t('description')}</p>
      <div className="space-y-6">
        <DiscoveryInventoryPanel />
        <MidCardsGrid models={midModels} onEdit={setEditingModel} />
        <AliasRoutingTable midModels={midModels} />
      </div>
      <MidEditDialog
        model={editingModel}
        open={!!editingModel}
        onClose={() => setEditingModel(null)}
        onSaved={(u) => {
          setMidModels((prev) => prev.map((m) => (m.id === u.id ? u : m)));
          setEditingModel(null);
        }}
      />
    </section>
  );
}
