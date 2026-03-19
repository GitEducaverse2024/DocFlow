"use client";

import { Badge } from '@/components/ui/badge';
import { Bot } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  description?: string | null;
  source?: string;
}

interface AgentListSelectorProps {
  agents: Agent[];
  value: string;
  onValueChange: (value: string) => void;
  idPrefix?: string;
  children?: React.ReactNode; // slot for AgentCreator
}

export function AgentListSelector({ agents, value, onValueChange, idPrefix = 'agent', children }: AgentListSelectorProps) {
  return (
    <RadioGroup value={value} onValueChange={onValueChange} className="space-y-1">
      {agents.map((agent) => (
        <div key={agent.id}>
          <RadioGroupItem value={agent.id} id={`${idPrefix}-${agent.id}`} className="peer sr-only" />
          <Label
            htmlFor={`${idPrefix}-${agent.id}`}
            className="flex items-center gap-3 px-3 py-2.5 border-l-[3px] border-transparent rounded-r-lg cursor-pointer hover:bg-zinc-900 peer-data-[state=checked]:bg-violet-500/5 peer-data-[state=checked]:border-l-violet-500 transition-all"
          >
            <span className="text-lg flex-shrink-0">{agent.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-50 text-sm">{agent.name}</span>
                {agent.source === 'custom' && (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px] px-1.5 py-0">
                    Personalizado
                  </Badge>
                )}
              </div>
              {agent.description && (
                <p className="text-xs text-zinc-500 truncate">{agent.description}</p>
              )}
            </div>
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 border-0 text-xs flex-shrink-0">
              {agent.model}
            </Badge>
          </Label>
        </div>
      ))}

      {/* Slot for AgentCreator */}
      {children}

      {/* Sin agente option */}
      <div>
        <RadioGroupItem value="none" id={`${idPrefix}-none`} className="peer sr-only" />
        <Label
          htmlFor={`${idPrefix}-none`}
          className="flex items-center gap-3 px-3 py-2.5 border-l-[3px] border-transparent rounded-r-lg cursor-pointer hover:bg-zinc-900 peer-data-[state=checked]:bg-zinc-800/50 peer-data-[state=checked]:border-l-zinc-500 transition-all"
        >
          <Bot className="w-5 h-5 text-zinc-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-zinc-50 text-sm">Sin agente</span>
            <p className="text-xs text-zinc-500">Desasignar el agente actual</p>
          </div>
        </Label>
      </div>
    </RadioGroup>
  );
}
