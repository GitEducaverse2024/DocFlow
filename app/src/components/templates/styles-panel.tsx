'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import ColorPicker from './color-picker';
import type { TemplateStructure } from '@/lib/types';

const FONT_OPTIONS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
];

interface StylesPanelProps {
  styles: TemplateStructure['styles'];
  onChange: (styles: TemplateStructure['styles']) => void;
}

export default function StylesPanel({ styles, onChange }: StylesPanelProps) {
  const t = useTranslations('catpower');

  const update = (partial: Partial<TemplateStructure['styles']>) => {
    onChange({ ...styles, ...partial });
  };

  return (
    <div className="space-y-4">
      {/* Background color */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">
          {t('templates.styles.backgroundColor')}
        </Label>
        <ColorPicker
          value={styles.backgroundColor}
          onChange={(v) => update({ backgroundColor: v })}
          label={t('templates.styles.backgroundColor')}
        />
      </div>

      {/* Primary color */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">
          {t('templates.styles.primaryColor')}
        </Label>
        <ColorPicker
          value={styles.primaryColor}
          onChange={(v) => update({ primaryColor: v })}
          label={t('templates.styles.primaryColor')}
        />
      </div>

      {/* Text color */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">
          {t('templates.styles.textColor')}
        </Label>
        <ColorPicker
          value={styles.textColor}
          onChange={(v) => update({ textColor: v })}
          label={t('templates.styles.textColor')}
        />
      </div>

      {/* Font family */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">
          {t('templates.styles.fontFamily')}
        </Label>
        <select
          value={styles.fontFamily}
          onChange={(e) => update({ fontFamily: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {/* Max width */}
      <div>
        <Label className="text-zinc-400 text-xs mb-2 block">
          {t('templates.styles.maxWidth')}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={styles.maxWidth}
            min={320}
            max={1200}
            step={10}
            onChange={(e) => update({ maxWidth: parseInt(e.target.value) || 600 })}
            className="bg-zinc-800 border-zinc-700 text-zinc-200 w-28"
          />
          <span className="text-xs text-zinc-500">px</span>
        </div>
      </div>
    </div>
  );
}
