"use client";

import { Checkbox } from '@/components/ui/checkbox';
import { Database, AlertTriangle, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Project } from '@/lib/types';

interface RagInfo {
  enabled: boolean;
  vectorCount?: number;
}

interface CatBrainsSectionProps {
  projects: Project[];
  selectedProjects: string[];
  setSelectedProjects: (v: string[]) => void;
  ragInfo: Record<string, RagInfo>;
  ragLoading: boolean;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

export function CatBrainsSection({
  projects,
  selectedProjects,
  setSelectedProjects,
  ragInfo,
  ragLoading,
  t,
}: CatBrainsSectionProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-12 border border-zinc-800 border-dashed rounded-lg">
        <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={48} height={48} className="mx-auto mb-3 opacity-40" />
        <p className="text-zinc-400">{t('wizard.step2.noCatBrains')}</p>
        <p className="text-zinc-500 text-sm mt-1">{t('wizard.step2.createFirst')}</p>
      </div>
    );
  }

  if (ragLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">{t('wizard.step2.title')}</h2>
      <p className="text-sm text-zinc-500 mb-6">
        {t('wizard.step2.description')}
      </p>

      <div className="space-y-2">
        {projects.map((p) => {
          const ri = ragInfo[p.id];
          const isSelected = selectedProjects.includes(p.id);

          let ragLabel: string;
          let ragColor: string;
          if (!p.rag_enabled) {
            ragLabel = t('wizard.step2.ragDisabled');
            ragColor = 'text-zinc-500';
          } else if (ri && ri.enabled && ri.vectorCount && ri.vectorCount > 0) {
            ragLabel = t('wizard.step2.ragVectors', { count: ri.vectorCount.toLocaleString() });
            ragColor = 'text-emerald-400';
          } else {
            ragLabel = t('wizard.step2.ragNotIndexed');
            ragColor = 'text-amber-400';
          }

          return (
            <label
              key={p.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isSelected ? 'border-violet-500/40 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                  setSelectedProjects(
                    checked ? [...selectedProjects, p.id] : selectedProjects.filter((id) => id !== p.id)
                  );
                }}
                className="mt-0.5 border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200">{p.name}</p>
                <div className={`flex items-center gap-1.5 text-xs mt-1 ${ragColor}`}>
                  <Database className="w-3 h-3" />
                  {ragLabel}
                  {ragColor === 'text-amber-400' && <AlertTriangle className="w-3 h-3" />}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
