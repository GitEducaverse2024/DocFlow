"use client";

import React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Play, Plug, UserCheck, GitMerge, GitBranch, Flag } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PaletteItem {
  type: string;
  icon: React.ComponentType<{ className?: string }> | null;
  customIcon?: React.ReactNode;
  color: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'start',      icon: Play,        color: 'text-emerald-400' },
  { type: 'agent',      icon: null, customIcon: <Image src="/Images/icon/catpaw.png" alt="CatPaw" width={20} height={20} />, color: 'text-violet-400' },
  { type: 'catbrain',   icon: null, customIcon: <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={20} height={20} />, color: 'text-violet-400' },
  { type: 'connector',  icon: Plug,        color: 'text-orange-400' },
  { type: 'checkpoint', icon: UserCheck,   color: 'text-amber-400' },
  { type: 'merge',      icon: GitMerge,    color: 'text-cyan-400' },
  { type: 'condition',  icon: GitBranch,   color: 'text-yellow-400' },
  { type: 'output',     icon: Flag,        color: 'text-emerald-400' },
];

// Node types allowed per canvas mode
const MODE_ALLOWED_TYPES: Record<string, Set<string>> = {
  agents:    new Set(['start', 'agent', 'checkpoint', 'merge', 'condition', 'output']),
  catbrains: new Set(['start', 'catbrain', 'checkpoint', 'merge', 'condition', 'output']),
  // Backward compat: old canvases may still have mode 'projects'
  projects:  new Set(['start', 'catbrain', 'checkpoint', 'merge', 'condition', 'output']),
  mixed:     new Set(['start', 'agent', 'catbrain', 'connector', 'checkpoint', 'merge', 'condition', 'output']),
};

interface NodePaletteProps {
  canvasMode?: string;
}

export function NodePalette({ canvasMode }: NodePaletteProps) {
  const t = useTranslations('canvas');

  function onDragStart(event: React.DragEvent, nodeType: string) {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }

  const allowedTypes = MODE_ALLOWED_TYPES[canvasMode || 'mixed'] || MODE_ALLOWED_TYPES.mixed;
  const visibleItems = PALETTE_ITEMS.filter(item => allowedTypes.has(item.type));

  return (
    <TooltipProvider delay={300}>
      <div className="w-20 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center gap-1 py-3 overflow-y-auto">
        {visibleItems.map(item => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.type}>
              <TooltipTrigger
                draggable
                onDragStart={e => onDragStart(e as unknown as React.DragEvent, item.type)}
                className="w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 cursor-grab hover:bg-zinc-800 transition-colors active:cursor-grabbing"
              >
                {item.customIcon ? item.customIcon : Icon ? <Icon className={`w-5 h-5 ${item.color}`} /> : null}
                <span className={`text-[9px] ${item.color} font-medium`}>{t(`palette.${item.type}`)}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {t(`palette.tooltips.${item.type}`)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
