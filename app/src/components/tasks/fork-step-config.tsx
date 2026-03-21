"use client";

import { useState } from 'react';
import { GitFork, GitMerge, Plus, Trash2, Bot, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ConnectorConfig {
  connector_id: string;
  mode: string;
}

interface PipelineStep {
  id: string;
  type: 'agent' | 'checkpoint' | 'merge' | 'canvas' | 'fork' | 'join';
  name: string;
  agent_id: string;
  agent_name: string;
  agent_model: string;
  instructions: string;
  context_mode: 'previous' | 'all' | 'manual';
  context_manual: string;
  use_project_rag: boolean;
  skill_ids: string[];
  connector_config: ConnectorConfig[];
  canvas_id?: string;
  fork_group?: string;
  branch_index?: number;
  branch_label?: string;
}

interface ForkBranch {
  label: string;
  steps: PipelineStep[];
}

interface ForkStepConfigProps {
  forkGroup: string;
  branchCount: 2 | 3;
  branches: ForkBranch[];
  onBranchCountChange: (count: 2 | 3) => void;
  onBranchLabelChange: (index: number, label: string) => void;
  onAddStepToBranch: (branchIndex: number, type: PipelineStep['type']) => void;
  onDeleteStepFromBranch: (branchIndex: number, stepIndex: number) => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}

const BRANCH_STEP_TYPES = [
  { type: 'agent' as const, icon: Bot, label: 'Agente', color: 'text-violet-400' },
  { type: 'checkpoint' as const, icon: Shield, label: 'Checkpoint', color: 'text-amber-400' },
  { type: 'merge' as const, icon: GitMerge, label: 'Sintesis', color: 'text-blue-400' },
];

const STEP_TYPE_BADGES: Record<string, string> = {
  agent: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  checkpoint: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  merge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};

function BranchAddMenu({
  branchIndex,
  onAdd,
}: {
  branchIndex: number;
  onAdd: (branchIndex: number, type: PipelineStep['type']) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex justify-center pt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-7 h-7 rounded-full border border-dashed border-zinc-700 text-zinc-600 hover:border-violet-500 hover:text-violet-400 flex items-center justify-center transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute top-10 z-20 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 min-w-[150px]">
          {BRANCH_STEP_TYPES.map((st) => (
            <button
              key={st.type}
              type="button"
              onClick={() => {
                onAdd(branchIndex, st.type);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <st.icon className={`w-3.5 h-3.5 ${st.color}`} />
              {st.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ForkStepConfig({
  forkGroup,
  branchCount,
  branches,
  onBranchCountChange,
  onBranchLabelChange,
  onAddStepToBranch,
  onDeleteStepFromBranch,
  t,
}: ForkStepConfigProps) {
  const visibleBranches = branches.slice(0, branchCount);

  return (
    <div className="space-y-3" data-fork-group={forkGroup}>
      {/* Configurator row */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs text-zinc-400 font-medium">
          {t('wizard.pipeline.fork.branches')}:
        </span>
        <div className="flex gap-1">
          {([2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onBranchCountChange(n)}
              className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                branchCount === n
                  ? 'bg-violet-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {visibleBranches.map((branch, idx) => (
            <Input
              key={idx}
              value={branch.label}
              onChange={(e) => onBranchLabelChange(idx, e.target.value)}
              className="w-28 h-8 text-xs bg-zinc-900 border-zinc-800 text-zinc-50"
              placeholder={t('wizard.pipeline.fork.branchLabel', { label: String.fromCharCode(65 + idx) })}
            />
          ))}
        </div>
      </div>

      {/* Fork bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
        <GitFork className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-medium text-violet-400">Fork</span>
      </div>

      {/* Parallel columns */}
      <div className={`grid gap-3 ${branchCount === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {visibleBranches.map((branch, branchIdx) => (
          <div
            key={branchIdx}
            className="border border-zinc-800 rounded-lg p-2 bg-zinc-900/50 min-h-[80px]"
          >
            {/* Branch header */}
            <Badge
              variant="outline"
              className="text-xs border-zinc-700 text-zinc-400 mb-2"
            >
              {branch.label}
            </Badge>

            {/* Steps in branch */}
            <div className="space-y-1.5">
              {branch.steps.map((step, stepIdx) => (
                <div
                  key={step.id}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-800/50 group"
                >
                  <span className="text-xs text-zinc-300 truncate flex-1">
                    {step.name || 'Sin nombre'}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] border shrink-0 ${STEP_TYPE_BADGES[step.type] || ''}`}
                  >
                    {step.type}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => onDeleteStepFromBranch(branchIdx, stepIdx)}
                    className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add step button */}
            <BranchAddMenu branchIndex={branchIdx} onAdd={onAddStepToBranch} />
          </div>
        ))}
      </div>

      {/* Join bar */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <GitMerge className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium text-blue-400">Join</span>
      </div>
    </div>
  );
}

export type { ForkBranch, PipelineStep as ForkPipelineStep };
