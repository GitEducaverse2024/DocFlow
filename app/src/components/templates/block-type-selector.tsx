'use client';

import { useState } from 'react';
import { Image, Video, Type, Bot, Stamp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { TemplateBlock } from '@/lib/types';

export const blockTypes: Array<{
  type: TemplateBlock['type'];
  icon: typeof Image;
  labelKey: string;
  descKey: string;
}> = [
  { type: 'logo', icon: Stamp, labelKey: 'logo', descKey: 'logoDesc' },
  { type: 'image', icon: Image, labelKey: 'image', descKey: 'imageDesc' },
  { type: 'video', icon: Video, labelKey: 'video', descKey: 'videoDesc' },
  { type: 'text', icon: Type, labelKey: 'text', descKey: 'textDesc' },
  { type: 'instruction', icon: Bot, labelKey: 'instruction', descKey: 'instructionDesc' },
];

interface BlockTypeSelectorProps {
  onSelect: (type: TemplateBlock['type']) => void;
  children: React.ReactNode;
}

export default function BlockTypeSelector({ onSelect, children }: BlockTypeSelectorProps) {
  const t = useTranslations('catpower');
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div role="button" tabIndex={0} onClick={() => setOpen(true)}>
          {children}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 bg-zinc-900 border-zinc-700 p-2" align="start">
        <div className="space-y-1">
          {blockTypes.map((bt) => {
            const Icon = bt.icon;
            return (
              <button
                key={bt.type}
                className="w-full flex items-center gap-3 py-2.5 px-3 text-left rounded-md hover:bg-violet-500/10 transition-colors"
                onClick={() => {
                  onSelect(bt.type);
                  setOpen(false);
                }}
              >
                <Icon className="w-4 h-4 text-violet-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-200">
                    {t(`templates.blocks.${bt.labelKey}` as Parameters<typeof t>[0])}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {t(`templates.blocks.${bt.descKey}` as Parameters<typeof t>[0])}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
