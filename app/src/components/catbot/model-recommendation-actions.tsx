'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface Props {
  recommended_model: string;
  alias_target: string;
  justification: string;
}

export function ModelRecommendationActions({
  recommended_model,
  alias_target,
  justification,
}: Props) {
  const t = useTranslations('settings');
  const [status, setStatus] = useState<'pending' | 'applied' | 'ignored'>('pending');
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    setApplying(true);
    try {
      const res = await fetch('/api/alias-routing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: alias_target, model_key: recommended_model }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success(t('modelIntelligence.routing.updated'));
      setStatus('applied');
    } catch (e) {
      toast.error(
        t('modelIntelligence.routing.updateError') + ': ' + (e as Error).message,
      );
    } finally {
      setApplying(false);
    }
  };

  if (status === 'applied') {
    return (
      <div className="text-xs text-emerald-400 mt-2">
        ✓ Aplicado: {alias_target} → {recommended_model}
      </div>
    );
  }
  if (status === 'ignored') {
    return <div className="text-xs text-zinc-500 mt-2">Ignorado</div>;
  }

  return (
    <div className="mt-2 p-3 bg-zinc-900 border border-violet-800/30 rounded">
      <div className="text-xs text-zinc-300 mb-1">
        <strong>Recomendación:</strong> cambiar{' '}
        <code className="text-violet-300">{alias_target}</code> →{' '}
        <code className="text-violet-300">{recommended_model}</code>
      </div>
      <div className="text-xs text-zinc-400 mb-2">{justification}</div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={apply}
          disabled={applying}
          className="bg-violet-600 hover:bg-violet-500"
        >
          {applying ? '...' : 'Aplicar'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setStatus('ignored')}>
          Ignorar
        </Button>
      </div>
    </div>
  );
}
