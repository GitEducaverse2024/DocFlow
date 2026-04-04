'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { MidEntry } from './mid-cards-grid';

interface Props {
  model: MidEntry | null;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: MidEntry) => void;
}

const SCORE_KEYS = ['reasoning', 'coding', 'creativity', 'speed', 'multilingual'] as const;
type ScoreKey = (typeof SCORE_KEYS)[number];

const TIER_OPTIONS = ['Elite', 'Pro', 'Libre', '__none__'] as const;

export function MidEditDialog({ model, open, onClose, onSaved }: Props) {
  const t = useTranslations('settings.modelIntelligence.mid');

  const [displayName, setDisplayName] = useState('');
  const [tier, setTier] = useState<string>('__none__');
  const [bestUse, setBestUse] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capInput, setCapInput] = useState('');
  const [costNotes, setCostNotes] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<'active' | 'retired'>('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!model) return;
    setDisplayName(model.display_name ?? '');
    setTier(model.tier ?? '__none__');
    setBestUse(model.best_use ?? '');
    setCapabilities(Array.isArray(model.capabilities) ? [...model.capabilities] : []);
    setCapInput('');
    setCostNotes(model.cost_notes ?? '');
    const initScores: Record<string, number> = {};
    for (const k of SCORE_KEYS) {
      const v = model.scores?.[k];
      initScores[k] = typeof v === 'number' ? v : 0;
    }
    setScores(initScores);
    setStatus(model.status ?? 'active');
  }, [model]);

  const handleAddCapability = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = capInput.trim();
      if (v && !capabilities.includes(v)) {
        setCapabilities([...capabilities, v]);
      }
      setCapInput('');
    }
  };

  const removeCapability = (c: string) => {
    setCapabilities(capabilities.filter((x) => x !== c));
  };

  const handleSave = async () => {
    if (!model) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        display_name: displayName,
        tier: tier === '__none__' ? null : tier,
        best_use: bestUse,
        capabilities,
        cost_notes: costNotes,
        scores,
        status,
      };
      const res = await fetch(`/api/mid/${model.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error ?? 'save failed');
      }
      toast.success(t('saved'));
      onSaved(data.updated as MidEntry);
    } catch {
      toast.error(t('saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-50 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {model?.display_name ?? ''}
            <span className="ml-2 text-xs text-zinc-500 font-mono">{model?.model_key ?? ''}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-zinc-400">Display name</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-zinc-50 mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-zinc-400">{t('tier')}</Label>
              <Select value={tier} onValueChange={(v) => setTier(String(v))}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                  {TIER_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt === '__none__' ? '—' : opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">{t('costNotes')}</Label>
              <Input
                value={costNotes}
                onChange={(e) => setCostNotes(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 mt-1"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-zinc-400">{t('bestUse')}</Label>
            <Textarea
              value={bestUse}
              onChange={(e) => setBestUse(e.target.value)}
              rows={3}
              className="bg-zinc-950 border-zinc-800 text-zinc-50 mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400">{t('capabilities')}</Label>
            <div className="flex flex-wrap gap-1.5 mt-1 mb-2 min-h-[28px]">
              {capabilities.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="bg-zinc-800/60 border-zinc-700 text-zinc-300 text-xs pl-2 pr-1 py-0.5 flex items-center gap-1"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => removeCapability(c)}
                    className="hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
              onKeyDown={handleAddCapability}
              placeholder={t('addCapability')}
              className="bg-zinc-950 border-zinc-800 text-zinc-50"
            />
          </div>

          <div>
            <Label className="text-xs text-zinc-400 mb-2 block">{t('scores')}</Label>
            <div className="space-y-3">
              {SCORE_KEYS.map((key) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-zinc-400">{t(key as ScoreKey)}</span>
                    <span className="text-zinc-300 font-mono">{scores[key] ?? 0}</span>
                  </div>
                  <Slider
                    value={[scores[key] ?? 0]}
                    onValueChange={(v) => {
                      const n = Array.isArray(v) ? v[0] : (v as number);
                      setScores((prev) => ({ ...prev, [key]: n }));
                    }}
                    min={0}
                    max={10}
                    step={1}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={status === 'active'}
              onCheckedChange={(v) => setStatus(v ? 'active' : 'retired')}
            />
            <span className="text-sm text-zinc-300">
              {status === 'active' ? t('active') : t('retired')}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={saving}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-violet-600 to-purple-700 text-white"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
