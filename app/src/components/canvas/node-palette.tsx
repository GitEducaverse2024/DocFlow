"use client";

import React from 'react';
import { Play, Bot, FolderKanban, Plug, UserCheck, GitMerge, GitBranch, Flag } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PaletteItem {
  type: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'start',      label: 'Inicio',    icon: Play,        color: 'text-emerald-400' },
  { type: 'agent',      label: 'Agente',    icon: Bot,         color: 'text-violet-400' },
  { type: 'project',    label: 'Proyecto',  icon: FolderKanban, color: 'text-blue-400' },
  { type: 'connector',  label: 'Conector',  icon: Plug,        color: 'text-orange-400' },
  { type: 'checkpoint', label: 'Check',     icon: UserCheck,   color: 'text-amber-400' },
  { type: 'merge',      label: 'Fusionar',  icon: GitMerge,    color: 'text-cyan-400' },
  { type: 'condition',  label: 'Condicion', icon: GitBranch,   color: 'text-yellow-400' },
  { type: 'output',     label: 'Salida',    icon: Flag,        color: 'text-emerald-400' },
];

const TOOLTIP_LABELS: Record<string, string> = {
  start:      'Inicio — punto de entrada del workflow',
  agent:      'Agente — ejecuta un agente de IA',
  project:    'Proyecto — consulta RAG de un proyecto',
  connector:  'Conector — llama a un servicio externo',
  checkpoint: 'Checkpoint — pausa para revision humana',
  merge:      'Fusionar — combina multiples ramas',
  condition:  'Condicion — bifurca segun una condicion',
  output:     'Salida — resultado final del workflow',
};

interface NodePaletteProps {
  canvasMode?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NodePalette({ canvasMode }: NodePaletteProps) {
  function onDragStart(event: React.DragEvent, nodeType: string) {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <TooltipProvider delay={300}>
      <div className="w-20 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center gap-1 py-3 overflow-y-auto">
        {PALETTE_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <Tooltip key={item.type}>
              <TooltipTrigger
                draggable
                onDragStart={e => onDragStart(e as unknown as React.DragEvent, item.type)}
                className="w-14 h-14 rounded-lg flex flex-col items-center justify-center gap-0.5 cursor-grab hover:bg-zinc-800 transition-colors active:cursor-grabbing"
              >
                <Icon className={`w-5 h-5 ${item.color}`} />
                <span className={`text-[9px] ${item.color} font-medium`}>{item.label}</span>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {TOOLTIP_LABELS[item.type]}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
