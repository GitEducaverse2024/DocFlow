/**
 * KnowledgeCountsBar — Phase 154 Plan 02 client-safe counts panel.
 *
 * Renders the 8 shadcn Cards from `KbIndexHeader['counts']`. Server-safe
 * (no state, no handlers) but lives in `components/knowledge/` for
 * consistency with its siblings.
 */
import { Card, CardContent } from '@/components/ui/card';
import type { KbIndexHeader } from '@/lib/services/kb-index-cache';

interface Props {
  counts: KbIndexHeader['counts'];
}

const LABELS: Record<keyof KbIndexHeader['counts'], string> = {
  catpaws_active: 'CatPaws activos',
  connectors_active: 'Conectores activos',
  catbrains_active: 'CatBrains activos',
  templates_active: 'Plantillas activas',
  skills_active: 'Skills activos',
  rules: 'Reglas',
  incidents_resolved: 'Incidentes resueltos',
  features_documented: 'Features documentadas',
};

export function KnowledgeCountsBar({ counts }: Props) {
  const items = Object.entries(LABELS) as Array<[keyof typeof LABELS, string]>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(([key, label]) => (
        <Card key={key} className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="text-2xl font-semibold text-zinc-50">{counts[key] ?? 0}</div>
            <div className="text-xs text-zinc-400 mt-1">{label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
