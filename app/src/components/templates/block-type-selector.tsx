'use client';

import { Image, Video, Type, Bot, Stamp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { TemplateBlock } from '@/lib/types';

const blockTypes: Array<{
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

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 bg-zinc-900 border-zinc-700 p-2" align="start">
        <div className="space-y-1">
          {blockTypes.map((bt) => {
            const Icon = bt.icon;
            return (
              <Button
                key={bt.type}
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-2.5 px-3 text-left hover:bg-violet-500/10"
                onClick={() => onSelect(bt.type)}
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
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
