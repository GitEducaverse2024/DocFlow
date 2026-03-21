"use client";

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Shield,
  GitMerge,
  GitFork,
  LayoutGrid,
  GripVertical,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Skill } from '@/lib/types';
import { CanvasPickerSheet } from './canvas-picker-sheet';
import { CanvasStepConfig } from './canvas-step-config';
import { ForkStepConfig, type ForkBranch } from './fork-step-config';

// --- Types ---

interface ConnectorConfig {
  connector_id: string;
  mode: string;
}

interface ConnectorInfo {
  id: string;
  name: string;
  emoji: string;
  type: string;
}

interface Agent {
  id: string;
  name: string;
  avatar_emoji: string;
  model: string;
  mode?: string;
  description?: string | null;
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

interface CanvasMetadata {
  name: string;
  emoji: string;
  node_count: number;
  updated_at: string;
}

interface PipelineSectionProps {
  steps: PipelineStep[];
  setSteps: (steps: PipelineStep[]) => void;
  agents: Agent[];
  skills: Skill[];
  connectors: ConnectorInfo[];
  onFetchConnectors: (agentId: string) => void;
  availableModels: string[];
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
  onNavigateToCanvasNew: (stepIndex: number) => void;
  canvasMetadata: Record<string, CanvasMetadata>;
  setCanvasMetadata: (meta: Record<string, CanvasMetadata>) => void;
  forkBranches: Record<string, ForkBranch[]>;
  setForkBranches: (branches: Record<string, ForkBranch[]>) => void;
}

// --- Constants ---

const MAX_STEPS = 10;

const STEP_TYPE_CONFIG: Record<string, { icon: typeof Bot; badgeClass: string }> = {
  agent: { icon: Bot, badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  checkpoint: { icon: Shield, badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  merge: { icon: GitMerge, badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  canvas: { icon: LayoutGrid, badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  fork: { icon: GitFork, badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  join: { icon: GitMerge, badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

const ADD_STEP_OPTIONS = [
  { type: 'agent' as const, icon: Bot, color: 'text-violet-400', labelKey: 'wizard.pipeline.addAgent' },
  { type: 'canvas' as const, icon: LayoutGrid, color: 'text-emerald-400', labelKey: 'wizard.pipeline.addCanvas' },
  { type: 'checkpoint' as const, icon: Shield, color: 'text-amber-400', labelKey: 'wizard.pipeline.addCheckpoint' },
  { type: 'merge' as const, icon: GitMerge, color: 'text-blue-400', labelKey: 'wizard.pipeline.addMerge' },
  { type: 'fork' as const, icon: GitFork, color: 'text-violet-400', labelKey: 'wizard.pipeline.addFork' },
];

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function createEmptyStep(type: PipelineStep['type'], name: string): PipelineStep {
  return {
    id: generateId(),
    type,
    name,
    agent_id: '',
    agent_name: '',
    agent_model: '',
    instructions: '',
    context_mode: 'previous',
    context_manual: '',
    use_project_rag: false,
    skill_ids: [],
    connector_config: [],
  };
}

// --- Sortable Step Card ---

function SortableStepCard({
  step,
  agents,
  skills,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  connectors,
  onFetchConnectors,
  availableModels,
  canvasMeta,
  onCanvasChange,
  onCanvasEdit,
  t,
  isDraggable,
}: {
  step: PipelineStep;
  agents: Agent[];
  skills: Skill[];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<PipelineStep>) => void;
  onDelete: () => void;
  connectors: ConnectorInfo[];
  onFetchConnectors: (agentId: string) => void;
  availableModels: string[];
  canvasMeta?: CanvasMetadata;
  onCanvasChange?: () => void;
  onCanvasEdit?: () => void;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
  isDraggable: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const typeCfg = STEP_TYPE_CONFIG[step.type] || STEP_TYPE_CONFIG.agent;
  const TypeIcon = typeCfg.icon;

  return (
    <div ref={setNodeRef} style={style} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {isDraggable && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none"
            aria-label="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <TypeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="text-sm text-zinc-200 truncate flex-1">{step.name || 'Sin nombre'}</span>
        <Badge variant="outline" className={`text-xs border shrink-0 ${typeCfg.badgeClass}`}>
          {step.type}
        </Badge>
        <button onClick={onToggleExpand} className="text-zinc-500 hover:text-zinc-300 p-0.5">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <button onClick={onDelete} className="text-zinc-500 hover:text-red-400 p-0.5">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-800 space-y-4">
          {step.type === 'canvas' && canvasMeta ? (
            <CanvasStepConfig
              canvasName={canvasMeta.name}
              canvasEmoji={canvasMeta.emoji}
              nodeCount={canvasMeta.node_count}
              updatedAt={canvasMeta.updated_at}
              onEdit={onCanvasEdit || (() => {})}
              onChange={onCanvasChange || (() => {})}
              t={t}
            />
          ) : step.type === 'agent' ? (
            <>
              {/* Agent selector */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step3.agentLabel')}</label>
                <Select
                  value={step.agent_id}
                  onValueChange={(val: string | null) => {
                    if (!val) return;
                    const a = agents.find((ag) => ag.id === val);
                    onUpdate({
                      agent_id: val,
                      agent_name: a ? a.name : '',
                      agent_model: a ? a.model : '',
                      name: a ? a.name : step.name,
                      connector_config: [],
                    });
                    onFetchConnectors(val);
                  }}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-50">
                    <SelectValue placeholder={t('wizard.step3.agentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-zinc-50">
                        {a.avatar_emoji} {a.name}{a.mode ? ` (${a.mode})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model override */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step3.modelOverride')}</label>
                {availableModels.length > 0 ? (
                  <Select
                    value={step.agent_model || '__default__'}
                    onValueChange={(val: string | null) => onUpdate({ agent_model: val === '__default__' ? '' : (val || '') })}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-50">
                      <SelectValue placeholder={t('wizard.step3.modelDefault')} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 max-h-60">
                      <SelectItem value="__default__" className="text-zinc-400">
                        {t('wizard.step3.modelDefault')}
                      </SelectItem>
                      {availableModels.map((m) => (
                        <SelectItem key={m} value={m} className="text-zinc-50">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={step.agent_model}
                    onChange={(e) => onUpdate({ agent_model: e.target.value })}
                    placeholder={t('wizard.step3.modelDefault')}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50"
                  />
                )}
              </div>

              {/* Instructions */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step3.instructions')}</label>
                <Textarea
                  value={step.instructions}
                  onChange={(e) => onUpdate({ instructions: e.target.value })}
                  placeholder={t('wizard.step3.instructionsPlaceholder')}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-sm min-h-[120px]"
                  rows={5}
                />
              </div>

              {/* Context mode */}
              <div>
                <label className="text-xs text-zinc-500 block mb-2">{t('wizard.step3.context')}</label>
                <div className="flex gap-4">
                  {([
                    { value: 'previous', label: t('wizard.step3.contextPrevious') },
                    { value: 'all', label: t('wizard.step3.contextAll') },
                    { value: 'manual', label: t('wizard.step3.contextManual') },
                  ] as const).map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                      <input
                        type="radio"
                        name={`context-${step.id}`}
                        value={opt.value}
                        checked={step.context_mode === opt.value}
                        onChange={() => onUpdate({ context_mode: opt.value })}
                        className="accent-violet-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                {step.context_mode === 'manual' && (
                  <Textarea
                    value={step.context_manual}
                    onChange={(e) => onUpdate({ context_manual: e.target.value })}
                    placeholder={t('wizard.step3.contextManualPlaceholder')}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50 text-sm mt-2 min-h-[80px]"
                    rows={3}
                  />
                )}
              </div>

              {/* RAG toggle */}
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <Checkbox
                  checked={step.use_project_rag}
                  onCheckedChange={(checked) => onUpdate({ use_project_rag: !!checked })}
                  className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                />
                {t('wizard.step3.useRag')}
              </label>

              {/* Skills */}
              {skills.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-500 block mb-2">{t('wizard.step3.skills')}</label>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                    {skills.map((sk) => (
                      <label key={sk.id} className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                        <Checkbox
                          checked={step.skill_ids.includes(sk.id)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...step.skill_ids, sk.id]
                              : step.skill_ids.filter((sid) => sid !== sk.id);
                            onUpdate({ skill_ids: next });
                          }}
                          className="border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                        />
                        {sk.name}
                        <span className="text-xs text-zinc-600">{sk.category}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Connectors */}
              {step.agent_id && connectors.length > 0 && (
                <div className="space-y-2 mt-3">
                  <label className="text-xs text-zinc-400 font-medium">{t('wizard.step3.connectors')}</label>
                  <div className="space-y-2">
                    {connectors.map(connector => {
                      const currentConfig: ConnectorConfig[] = step.connector_config || [];
                      const existing = currentConfig.find(c => c.connector_id === connector.id);

                      return (
                        <div key={connector.id} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50">
                          <input
                            type="checkbox"
                            checked={!!existing}
                            onChange={(e) => {
                              let newConfig = [...currentConfig];
                              if (e.target.checked) {
                                newConfig.push({ connector_id: connector.id, mode: 'after' });
                              } else {
                                newConfig = newConfig.filter(c => c.connector_id !== connector.id);
                              }
                              onUpdate({ connector_config: newConfig });
                            }}
                            className="rounded border-zinc-600"
                          />
                          <span>{connector.emoji}</span>
                          <span className="text-sm text-zinc-300 flex-1">{connector.name}</span>
                          {existing && (
                            <select
                              value={existing.mode}
                              onChange={(e) => {
                                const newConfig = currentConfig.map(c =>
                                  c.connector_id === connector.id ? { ...c, mode: e.target.value } : c
                                );
                                onUpdate({ connector_config: newConfig });
                              }}
                              className="text-xs bg-zinc-700 text-zinc-300 rounded px-2 py-1 border border-zinc-600"
                            >
                              <option value="before">{t('wizard.step3.connectorBefore')}</option>
                              <option value="after">{t('wizard.step3.connectorAfter')}</option>
                              <option value="both">{t('wizard.step3.connectorBoth')}</option>
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Checkpoint / Merge: just name */
            <div>
              <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step3.stepName')}</label>
              <Input
                value={step.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
                className="bg-zinc-900 border-zinc-800 text-zinc-50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Add Step Dropdown ---

function AddStepDropdown({
  onSelect,
  disabled,
  t,
}: {
  onSelect: (type: string) => void;
  disabled: boolean;
  t: (key: string, values?: Record<string, string | number | boolean>) => string;
}) {
  const [open, setOpen] = useState(false);

  if (disabled) return null;

  return (
    <div className="flex justify-center py-2 relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-violet-500 hover:text-violet-400 transition-colors text-sm"
      >
        <Plus className="w-4 h-4" />
        {t('wizard.pipeline.addStep')}
      </button>
      {open && (
        <div className="absolute top-12 z-20 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 min-w-[220px]">
          {ADD_STEP_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => {
                onSelect(opt.type);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <opt.icon className={`w-4 h-4 ${opt.color}`} />
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main PipelineSection ---

export function PipelineSection({
  steps,
  setSteps,
  agents,
  skills,
  connectors,
  onFetchConnectors,
  availableModels,
  t,
  onNavigateToCanvasNew,
  canvasMetadata,
  setCanvasMetadata,
  forkBranches,
  setForkBranches,
}: PipelineSectionProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [canvasPickerOpen, setCanvasPickerOpen] = useState(false);
  const [pendingCanvasStepIndex, setPendingCanvasStepIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Count total steps (including branch steps) for summary
  const totalStepCount = steps.length + Object.values(forkBranches).reduce(
    (sum, branches) => sum + branches.reduce((bSum, b) => bSum + b.steps.length, 0),
    0
  );

  // --- Step handlers ---

  const handleAddStepType = useCallback((typeKey: string) => {
    if (typeKey === 'canvas') {
      setPendingCanvasStepIndex(steps.length);
      setCanvasPickerOpen(true);
      return;
    }

    if (typeKey === 'fork') {
      const forkGroup = generateId();
      const forkStep = createEmptyStep('fork', 'Fork');
      forkStep.fork_group = forkGroup;
      const joinStep = createEmptyStep('join', 'Join');
      joinStep.fork_group = forkGroup;

      setSteps([...steps, forkStep, joinStep]);
      setForkBranches({
        ...forkBranches,
        [forkGroup]: [
          { label: 'Rama A', steps: [] },
          { label: 'Rama B', steps: [] },
          { label: 'Rama C', steps: [] },
        ],
      });
      return;
    }

    if (steps.length >= MAX_STEPS) return;

    const nameMap: Record<string, string> = {
      agent: t('wizard.step3.defaultStepName', { index: steps.length + 1 }),
      checkpoint: t('wizard.step3.defaultCheckpointName'),
      merge: t('wizard.step3.defaultMergeName'),
    };

    const newStep = createEmptyStep(typeKey as PipelineStep['type'], nameMap[typeKey] || typeKey);
    setSteps([...steps, newStep]);
    setExpandedStep(newStep.id);
  }, [steps, setSteps, forkBranches, setForkBranches, t]);

  const handleCanvasSelected = useCallback((canvas: { id: string; name: string; emoji: string; node_count: number; updated_at: string }) => {
    const newStep = createEmptyStep('canvas', canvas.name);
    newStep.canvas_id = canvas.id;

    setSteps([...steps, newStep]);
    setCanvasMetadata({
      ...canvasMetadata,
      [canvas.id]: {
        name: canvas.name,
        emoji: canvas.emoji,
        node_count: canvas.node_count,
        updated_at: canvas.updated_at,
      },
    });
    setExpandedStep(newStep.id);
    setCanvasPickerOpen(false);
    setPendingCanvasStepIndex(null);
  }, [steps, setSteps, canvasMetadata, setCanvasMetadata]);

  const handleCreateNewCanvas = useCallback(() => {
    setCanvasPickerOpen(false);
    onNavigateToCanvasNew(pendingCanvasStepIndex ?? steps.length);
  }, [pendingCanvasStepIndex, steps.length, onNavigateToCanvasNew]);

  const handleUpdateStep = useCallback((id: string, updates: Partial<PipelineStep>) => {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, [steps, setSteps]);

  const handleDeleteStep = useCallback((id: string) => {
    const step = steps.find((s) => s.id === id);
    if (step?.type === 'fork' || step?.type === 'join') {
      // Delete the entire fork group
      const fg = step.fork_group;
      setSteps(steps.filter((s) => s.fork_group !== fg));
      if (fg) {
        const newBranches = { ...forkBranches };
        delete newBranches[fg];
        setForkBranches(newBranches);
      }
    } else {
      setSteps(steps.filter((s) => s.id !== id));
    }
    if (expandedStep === id) setExpandedStep(null);
  }, [steps, setSteps, forkBranches, setForkBranches, expandedStep]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Don't allow reordering fork/join steps
    const activeStep = steps.find((s) => s.id === active.id);
    const overStep = steps.find((s) => s.id === over.id);
    if (activeStep?.type === 'fork' || activeStep?.type === 'join') return;
    if (overStep?.type === 'fork' || overStep?.type === 'join') return;

    setSteps((() => {
      const oldIndex = steps.findIndex((s) => s.id === active.id);
      const newIndex = steps.findIndex((s) => s.id === over.id);
      return arrayMove(steps, oldIndex, newIndex);
    })());
  }, [steps, setSteps]);

  // --- Fork branch handlers ---

  const handleBranchCountChange = useCallback((forkGroup: string, count: 2 | 3) => {
    const current = forkBranches[forkGroup] || [];
    // Ensure we always have 3 branches in storage, but display only `count`
    const updated = [...current];
    while (updated.length < 3) {
      updated.push({ label: `Rama ${String.fromCharCode(65 + updated.length)}`, steps: [] });
    }
    // If reducing from 3 to 2, keep the data but it won't be displayed
    setForkBranches({ ...forkBranches, [forkGroup]: updated });
    // Update the fork step's branch count marker
    setSteps(steps.map((s) =>
      s.type === 'fork' && s.fork_group === forkGroup
        ? { ...s, branch_index: count }  // use branch_index to store branch count
        : s
    ));
  }, [forkBranches, setForkBranches, steps, setSteps]);

  const handleBranchLabelChange = useCallback((forkGroup: string, index: number, label: string) => {
    const current = forkBranches[forkGroup] || [];
    const updated = current.map((b, i) => i === index ? { ...b, label } : b);
    setForkBranches({ ...forkBranches, [forkGroup]: updated });
  }, [forkBranches, setForkBranches]);

  const handleAddStepToBranch = useCallback((forkGroup: string, branchIndex: number, type: PipelineStep['type']) => {
    const current = forkBranches[forkGroup] || [];
    const branch = current[branchIndex];
    if (!branch || branch.steps.length >= 5) return;

    const nameMap: Record<string, string> = {
      agent: t('wizard.step3.defaultStepName', { index: branch.steps.length + 1 }),
      checkpoint: t('wizard.step3.defaultCheckpointName'),
      merge: t('wizard.step3.defaultMergeName'),
    };

    const newStep = createEmptyStep(type, nameMap[type] || type);
    newStep.fork_group = forkGroup;
    newStep.branch_index = branchIndex;
    newStep.branch_label = branch.label;

    const updated = current.map((b, i) =>
      i === branchIndex ? { ...b, steps: [...b.steps, newStep] } : b
    );
    setForkBranches({ ...forkBranches, [forkGroup]: updated });
  }, [forkBranches, setForkBranches, t]);

  const handleDeleteStepFromBranch = useCallback((forkGroup: string, branchIndex: number, stepIndex: number) => {
    const current = forkBranches[forkGroup] || [];
    const updated = current.map((b, i) =>
      i === branchIndex ? { ...b, steps: b.steps.filter((_, si) => si !== stepIndex) } : b
    );
    setForkBranches({ ...forkBranches, [forkGroup]: updated });
  }, [forkBranches, setForkBranches]);

  // --- Get the current connectors for a step ---
  const getStepConnectors = useCallback((step: PipelineStep): ConnectorInfo[] => {
    if (step.agent_id) return connectors;
    return [];
  }, [connectors]);

  // --- Render ---

  // Build the render list, inserting ForkStepConfig between fork/join pairs
  const renderItems: Array<{ type: 'step'; step: PipelineStep } | { type: 'fork-config'; forkGroup: string; forkStep: PipelineStep }> = [];
  const processedForkGroups = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.type === 'fork' && step.fork_group && !processedForkGroups.has(step.fork_group)) {
      processedForkGroups.add(step.fork_group);
      renderItems.push({ type: 'fork-config', forkGroup: step.fork_group, forkStep: step });
      // Skip the join step (it will be rendered inside ForkStepConfig)
      continue;
    }
    if (step.type === 'join' && step.fork_group && processedForkGroups.has(step.fork_group)) {
      // Already rendered as part of fork config
      continue;
    }
    renderItems.push({ type: 'step', step });
  }

  // Collect sortable IDs (only non-fork/join steps)
  const sortableIds = steps
    .filter((s) => s.type !== 'fork' && s.type !== 'join')
    .map((s) => s.id);

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <p className="text-xs text-zinc-500">
        {totalStepCount > 0
          ? t('wizard.pipeline.summary', { count: totalStepCount })
          : t('wizard.pipeline.summaryEmpty')}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {renderItems.map((item) => {
              if (item.type === 'fork-config') {
                const fg = item.forkGroup;
                const branches = forkBranches[fg] || [];
                // Use branch_index on the fork step to store branch count (2 or 3)
                const branchCount = (item.forkStep.branch_index === 3 ? 3 : 2) as 2 | 3;

                return (
                  <div key={fg} className="relative">
                    {/* Delete fork group button */}
                    <button
                      type="button"
                      onClick={() => handleDeleteStep(item.forkStep.id)}
                      className="absolute top-2 right-2 z-10 text-zinc-600 hover:text-red-400 p-1"
                      title="Delete fork"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ForkStepConfig
                      forkGroup={fg}
                      branchCount={branchCount}
                      branches={branches}
                      onBranchCountChange={(count) => handleBranchCountChange(fg, count)}
                      onBranchLabelChange={(idx, label) => handleBranchLabelChange(fg, idx, label)}
                      onAddStepToBranch={(branchIdx, type) => handleAddStepToBranch(fg, branchIdx, type)}
                      onDeleteStepFromBranch={(branchIdx, stepIdx) => handleDeleteStepFromBranch(fg, branchIdx, stepIdx)}
                      t={t}
                    />
                  </div>
                );
              }

              const step = item.step;
              return (
                <SortableStepCard
                  key={step.id}
                  step={step}
                  agents={agents}
                  skills={skills}
                  expanded={expandedStep === step.id}
                  onToggleExpand={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                  onUpdate={(updates) => handleUpdateStep(step.id, updates)}
                  onDelete={() => handleDeleteStep(step.id)}
                  connectors={getStepConnectors(step)}
                  onFetchConnectors={onFetchConnectors}
                  availableModels={availableModels}
                  canvasMeta={step.canvas_id ? canvasMetadata[step.canvas_id] : undefined}
                  onCanvasChange={step.type === 'canvas' ? () => {
                    setPendingCanvasStepIndex(steps.indexOf(step));
                    setCanvasPickerOpen(true);
                  } : undefined}
                  onCanvasEdit={step.type === 'canvas' && step.canvas_id ? () => {
                    window.open(`/canvas/${step.canvas_id}`, '_blank');
                  } : undefined}
                  t={t}
                  isDraggable={step.type !== 'fork' && step.type !== 'join'}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add step button */}
      <AddStepDropdown
        onSelect={handleAddStepType}
        disabled={steps.length >= MAX_STEPS}
        t={t}
      />

      {/* Canvas picker sheet */}
      <CanvasPickerSheet
        open={canvasPickerOpen}
        onClose={() => {
          setCanvasPickerOpen(false);
          setPendingCanvasStepIndex(null);
        }}
        onSelect={handleCanvasSelected}
        onCreateNew={handleCreateNewCanvas}
        t={t}
      />
    </div>
  );
}

export type { PipelineStep, CanvasMetadata, ConnectorConfig, ConnectorInfo, Agent };
