/* eslint-disable @typescript-eslint/no-unused-vars */
// NOTE: SortableStepCard, AddStepButton, DnD imports, and saveTask are retained
// for plan 02 (Pipeline section) and plan 03 (Review section). They are intentionally
// unused in the current render while sections 3-5 are placeholders.
"use client";

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Loader2,
  Check,
  Bot,
  Shield,
  GitMerge,
  GripVertical,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Save,
  Rocket,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { Project, Skill, TaskTemplate } from '@/lib/types';
import { useTranslations } from 'next-intl';

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

import { CascadeSection } from '@/components/tasks/cascade-section';
import { ObjetivoSection } from '@/components/tasks/objetivo-section';
import { CatBrainsSection } from '@/components/tasks/catbrains-section';

// --- Types ---

interface Agent {
  id: string;
  name: string;
  avatar_emoji: string;
  model: string;
  mode?: string;
  description?: string | null;
}

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

interface PipelineStep {
  id: string;
  type: 'agent' | 'checkpoint' | 'merge';
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
  // v15.0
  canvas_id?: string;
  fork_group?: string;
  branch_index?: number;
  branch_label?: string;
}

interface RagInfo {
  enabled: boolean;
  vectorCount?: number;
}

interface ScheduleConfig {
  time?: string;
  days?: string[];
  custom_days?: number[];
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

// --- Constants ---

const STEP_TYPE_CONFIG = {
  agent: { icon: Bot, badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  checkpoint: { icon: Shield, badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  merge: { icon: GitMerge, badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

const MAX_STEPS = 10;
const TOTAL_SECTIONS = 5;

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// --- Helper: create empty pipeline step ---

function createPipelineStep(type: PipelineStep['type'], index: number, names?: { agent: string; checkpoint: string; merge: string }): PipelineStep {
  const defaults: Record<PipelineStep['type'], Partial<PipelineStep>> = {
    agent: { name: names?.agent || `Step ${index}`, context_mode: 'previous' },
    checkpoint: { name: names?.checkpoint || 'Human review' },
    merge: { name: names?.merge || 'Final synthesis' },
  };
  return {
    id: generateId(),
    type,
    name: defaults[type].name || '',
    agent_id: '',
    agent_name: '',
    agent_model: '',
    instructions: '',
    context_mode: (defaults[type].context_mode as PipelineStep['context_mode']) || 'previous',
    context_manual: '',
    use_project_rag: false,
    skill_ids: [],
    connector_config: [],
    ...defaults[type],
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
  t,
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
  t: ReturnType<typeof useTranslations>;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const TypeIcon = STEP_TYPE_CONFIG[step.type].icon;
  const typeCfg = STEP_TYPE_CONFIG[step.type];

  return (
    <div ref={setNodeRef} style={style} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none"
          aria-label={t('wizard.step3.dragToReorder')}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <TypeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="text-sm text-zinc-200 truncate flex-1">{step.name || t('wizard.step3.noName')}</span>
        <Badge variant="outline" className={`text-xs border shrink-0 ${typeCfg.badgeClass}`}>
          {t(`stepTypes.${step.type}`)}
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
          {step.type === 'agent' ? (
            <>
              {/* Agent selector */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step3.agentLabel')}</label>
                <Select
                  value={step.agent_id}
                  onValueChange={(val: string | null) => {
                    if (!val) return;
                    const agentId: string = val;
                    const a = agents.find((ag) => ag.id === agentId);
                    onUpdate({
                      agent_id: agentId,
                      agent_name: a ? a.name : '',
                      agent_model: a ? a.model : '',
                      name: a ? a.name : step.name,
                      connector_config: [],
                    });
                    onFetchConnectors(agentId);
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

              {/* Conectores (opcional) -- CPIPE-06 */}
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

// --- Add Step Button (between steps) ---

function AddStepButton({
  onAdd,
  disabled,
  t,
}: {
  onAdd: (type: PipelineStep['type']) => void;
  disabled: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);

  if (disabled) return null;

  return (
    <div className="flex justify-center py-1 relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full border border-dashed border-zinc-700 text-zinc-600 hover:border-violet-500 hover:text-violet-400 flex items-center justify-center transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute top-10 z-20 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 min-w-[180px]">
          <button
            onClick={() => { onAdd('agent'); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Bot className="w-4 h-4 text-violet-400" /> {t('wizard.step3.addAgent')}
          </button>
          <button
            onClick={() => { onAdd('checkpoint'); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Shield className="w-4 h-4 text-amber-400" /> {t('wizard.step3.addCheckpoint')}
          </button>
          <button
            onClick={() => { onAdd('merge'); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <GitMerge className="w-4 h-4 text-blue-400" /> {t('wizard.step3.addMerge')}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Main Wizard Content (uses useSearchParams) ---

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const t = useTranslations('tasks');

  // Cascade navigation
  const [activeSection, setActiveSection] = useState(0);
  const [completedSections, setCompletedSections] = useState<Set<number>>(new Set());
  const [expandedSection, setExpandedSection] = useState<number | null>(0);

  // Section 1: Objetivo
  const [taskName, setTaskName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [nameError, setNameError] = useState(false);

  // Section 2: CatBrains
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [ragInfo, setRagInfo] = useState<Record<string, RagInfo>>({});
  const [ragLoading, setRagLoading] = useState(false);
  const [ragFetched, setRagFetched] = useState(false);

  // Section 3: Pipeline
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // v15.0 execution config
  const [executionMode, setExecutionMode] = useState<'single' | 'variable' | 'scheduled'>('single');
  const [executionCount, setExecutionCount] = useState(1);
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig | null>(null);

  // Data sources
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Connectors per agent
  const [agentConnectors, setAgentConnectors] = useState<Record<string, ConnectorInfo[]>>({});

  // UI state
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // --- Section names from i18n ---
  const sectionNames = t.raw('wizard.steps') as string[];

  // --- Section summaries ---
  function getSectionSummary(index: number): string {
    switch (index) {
      case 0:
        return taskName ? t('wizard.section.summary.objetivo', { name: taskName }) : '';
      case 1:
        return selectedProjects.length > 0
          ? t('wizard.section.summary.catbrains', { count: selectedProjects.length })
          : t('wizard.section.summary.catbrainsNone');
      case 2:
        return pipelineSteps.length > 0 ? `${pipelineSteps.length} steps` : '';
      case 3:
        return executionMode !== 'single' ? executionMode : '';
      case 4:
        return '';
      default:
        return '';
    }
  }

  // --- Section navigation ---
  function handleContinue(sectionIndex: number) {
    // Validate section before continuing
    if (sectionIndex === 0 && !taskName.trim()) {
      setNameError(true);
      return;
    }

    const newCompleted = new Set(completedSections);
    newCompleted.add(sectionIndex);
    setCompletedSections(newCompleted);

    const nextSection = sectionIndex + 1;
    if (nextSection < TOTAL_SECTIONS) {
      setActiveSection(nextSection);
      setExpandedSection(nextSection);
    }
  }

  function handleToggleSection(index: number) {
    if (index > activeSection) return; // locked
    setExpandedSection(expandedSection === index ? null : index);
  }

  // --- Fetch data on mount ---
  const fetchInitialData = useCallback(async () => {
    try {
      const [agentsRes, skillsRes, projectsRes, templatesRes, modelsRes] = await Promise.all([
        fetch('/api/cat-paws'),
        fetch('/api/skills'),
        fetch('/api/catbrains?limit=100'),
        fetch('/api/tasks/templates'),
        fetch('/api/models'),
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (skillsRes.ok) setSkills(await skillsRes.json());
      if (projectsRes.ok) {
        const pData = await projectsRes.json();
        setProjects(Array.isArray(pData) ? pData : pData.data || []);
      }
      if (templatesRes.ok) setTemplates(await templatesRes.json());
      if (modelsRes.ok) {
        const mData = await modelsRes.json();
        const ids: string[] = Array.isArray(mData)
          ? mData.map((m: { id?: string; name?: string }) => m.id || m.name || '').filter(Boolean)
          : [];
        setAvailableModels(ids);
      }
    } catch {
      toast.error(t('wizard.toasts.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Template pre-fill ---
  useEffect(() => {
    if (!templateId || templates.length === 0) return;
    const tmpl = templates.find((tk) => tk.id === templateId);
    if (!tmpl) return;

    setLoadingTemplate(true);
    try {
      if (tmpl.name && !taskName) {
        setTaskName(tmpl.name);
      }
      if (tmpl.steps_config) {
        const steps = JSON.parse(tmpl.steps_config) as Array<{
          type?: string;
          name?: string;
          instructions?: string;
          context_mode?: string;
          use_project_rag?: number | boolean;
        }>;
        const mapped: PipelineStep[] = steps.map((s, i) => ({
          id: generateId(),
          type: (s.type as PipelineStep['type']) || 'agent',
          name: s.name || t('wizard.step3.defaultStepName', { index: i + 1 }),
          agent_id: '',
          agent_name: '',
          agent_model: '',
          instructions: s.instructions || '',
          context_mode: (s.context_mode as PipelineStep['context_mode']) || 'previous',
          context_manual: '',
          use_project_rag: !!s.use_project_rag,
          skill_ids: [],
          connector_config: [],
        }));
        setPipelineSteps(mapped);
      }
      toast.success(t('wizard.toasts.templateLoaded', { name: tmpl.name }));
    } catch {
      toast.error(t('wizard.toasts.templateError'));
    } finally {
      setLoadingTemplate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  // --- Fetch RAG info lazily when section 2 is active ---
  const fetchRagInfo = useCallback(async () => {
    if (ragFetched || projects.length === 0) return;
    setRagLoading(true);
    setRagFetched(true);
    const info: Record<string, RagInfo> = {};
    await Promise.all(
      projects.map(async (p) => {
        if (!p.rag_enabled) {
          info[p.id] = { enabled: false };
          return;
        }
        try {
          const res = await fetch(`/api/catbrains/${p.id}/rag/info`);
          if (res.ok) {
            const data = await res.json();
            info[p.id] = { enabled: !!data.enabled, vectorCount: data.vectorCount || 0 };
          } else {
            info[p.id] = { enabled: false };
          }
        } catch {
          info[p.id] = { enabled: false };
        }
      })
    );
    setRagInfo(info);
    setRagLoading(false);
  }, [ragFetched, projects]);

  useEffect(() => {
    if (expandedSection === 1) {
      fetchRagInfo();
    }
  }, [expandedSection, fetchRagInfo]);

  // --- Fetch connectors for an agent ---
  const fetchAgentConnectors = useCallback(async (agentId: string) => {
    if (!agentId || agentConnectors[agentId]) return;
    try {
      const res = await fetch(`/api/cat-paws/${agentId}/relations`);
      if (res.ok) {
        const data = await res.json();
        const connectors: ConnectorInfo[] = (data.connectors || []).map((c: { connector_id: string; connector_name: string; connector_type: string }) => ({
          id: c.connector_id,
          name: c.connector_name || 'Connector',
          emoji: '',
          type: c.connector_type || '',
        }));
        setAgentConnectors(prev => ({ ...prev, [agentId]: connectors }));
      }
    } catch (err) {
      console.error('Error fetching agent connectors:', err);
    }
  }, [agentConnectors]);

  // --- Pipeline helpers ---

  function handleAddStep(type: PipelineStep['type'], afterIndex?: number) {
    if (pipelineSteps.length >= MAX_STEPS) return;
    const newStep = createPipelineStep(type, pipelineSteps.length + 1, {
      agent: t('wizard.step3.defaultStepName', { index: pipelineSteps.length + 1 }),
      checkpoint: t('wizard.step3.defaultCheckpointName'),
      merge: t('wizard.step3.defaultMergeName'),
    });
    if (afterIndex !== undefined) {
      const next = [...pipelineSteps];
      next.splice(afterIndex + 1, 0, newStep);
      setPipelineSteps(next);
    } else {
      setPipelineSteps([...pipelineSteps, newStep]);
    }
    setExpandedStep(newStep.id);
  }

  function handleUpdateStep(id: string, updates: Partial<PipelineStep>) {
    setPipelineSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  function handleDeleteStep(id: string) {
    setPipelineSteps((prev) => prev.filter((s) => s.id !== id));
    if (expandedStep === id) setExpandedStep(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPipelineSteps((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  // --- Save/Launch ---

  async function saveTask(launch: boolean) {
    if (!taskName.trim()) {
      toast.error(t('wizard.toasts.nameRequired'));
      return;
    }
    if (pipelineSteps.length === 0) {
      toast.error(t('wizard.toasts.needsSteps'));
      return;
    }

    const setter = launch ? setLaunching : setSaving;
    setter(true);

    try {
      // 1. Create task with v15 fields
      const taskRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName.trim(),
          description: taskDescription.trim() || null,
          expected_output: expectedOutput.trim() || null,
          execution_mode: executionMode,
          execution_count: executionCount,
          schedule_config: scheduleConfig,
        }),
      });
      if (!taskRes.ok) throw new Error(t('wizard.toasts.createError'));
      const task = await taskRes.json();

      // 2. Create pipeline steps
      for (const ps of pipelineSteps) {
        const stepRes = await fetch(`/api/tasks/${task.id}/steps`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: ps.type,
            name: ps.name,
            agent_id: ps.agent_id || null,
            agent_name: ps.agent_name || null,
            agent_model: ps.agent_model || null,
            instructions: ps.instructions || null,
            context_mode: ps.context_mode,
            context_manual: ps.context_manual || null,
            use_project_rag: ps.use_project_rag,
            skill_ids: ps.skill_ids.length > 0 ? JSON.stringify(ps.skill_ids) : null,
            connector_config: ps.connector_config && ps.connector_config.length > 0 ? JSON.stringify(ps.connector_config) : null,
          }),
        });
        if (!stepRes.ok) {
          console.error('Error creating step:', await stepRes.text());
        }
      }

      // 3. Link projects
      if (selectedProjects.length > 0) {
        await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linked_projects: JSON.stringify(selectedProjects),
            status: launch ? undefined : 'ready',
          }),
        });
      } else if (!launch) {
        await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'ready' }),
        });
      }

      // 4. Launch if requested
      if (launch) {
        const execRes = await fetch(`/api/tasks/${task.id}/execute`, { method: 'POST' });
        if (!execRes.ok) {
          toast.error(t('wizard.toasts.savedNotLaunched'));
        }
      }

      toast.success(launch ? t('wizard.toasts.launched') : t('wizard.toasts.draftSaved'));
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      toast.error((err as Error).message || t('wizard.toasts.saveError'));
    } finally {
      setter(false);
    }
  }

  // --- Render ---

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Back link */}
      <button
        onClick={() => router.push('/tasks')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {t('wizard.backToTasks')}
      </button>

      <h1 className="text-2xl font-bold text-zinc-50 mb-8">{t('wizard.title')}</h1>

      {loadingTemplate && (
        <div className="flex items-center gap-2 text-sm text-violet-400 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('wizard.loadingTemplate')}
        </div>
      )}

      {/* Cascade Sections */}
      <div className="space-y-3">
        {/* Section 0: Objetivo */}
        <CascadeSection
          index={0}
          title={sectionNames[0] || 'Objetivo'}
          isCompleted={completedSections.has(0)}
          isActive={expandedSection === 0}
          isLocked={0 > activeSection}
          summary={getSectionSummary(0)}
          onToggle={() => handleToggleSection(0)}
        >
          <ObjetivoSection
            taskName={taskName}
            setTaskName={setTaskName}
            taskDescription={taskDescription}
            setTaskDescription={setTaskDescription}
            expectedOutput={expectedOutput}
            setExpectedOutput={setExpectedOutput}
            nameError={nameError}
            setNameError={setNameError}
            t={(key: string, values?: Record<string, string | number | boolean>) => t(key, values)}
          />
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => handleContinue(0)}
              disabled={!taskName.trim()}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('wizard.continue')}
            </Button>
          </div>
        </CascadeSection>

        {/* Section 1: CatBrains */}
        <CascadeSection
          index={1}
          title={sectionNames[1] || 'CatBrains'}
          isCompleted={completedSections.has(1)}
          isActive={expandedSection === 1}
          isLocked={1 > activeSection}
          summary={getSectionSummary(1)}
          onToggle={() => handleToggleSection(1)}
        >
          <CatBrainsSection
            projects={projects}
            selectedProjects={selectedProjects}
            setSelectedProjects={setSelectedProjects}
            ragInfo={ragInfo}
            ragLoading={ragLoading}
            t={(key: string, values?: Record<string, string | number | boolean>) => t(key, values)}
          />
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => handleContinue(1)}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('wizard.continue')}
            </Button>
          </div>
        </CascadeSection>

        {/* Section 2: Pipeline (placeholder) */}
        <CascadeSection
          index={2}
          title={sectionNames[2] || 'Pipeline'}
          isCompleted={completedSections.has(2)}
          isActive={expandedSection === 2}
          isLocked={2 > activeSection}
          summary={getSectionSummary(2)}
          onToggle={() => handleToggleSection(2)}
        >
          <p className="text-zinc-500 text-sm">Pipeline section (coming in plan 02)</p>
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => handleContinue(2)}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('wizard.continue')}
            </Button>
          </div>
        </CascadeSection>

        {/* Section 3: Ciclo de Ejecucion (placeholder) */}
        <CascadeSection
          index={3}
          title={sectionNames[3] || 'Ciclo'}
          isCompleted={completedSections.has(3)}
          isActive={expandedSection === 3}
          isLocked={3 > activeSection}
          summary={getSectionSummary(3)}
          onToggle={() => handleToggleSection(3)}
        >
          <p className="text-zinc-500 text-sm">Ciclo section (coming in plan 03)</p>
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => handleContinue(3)}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('wizard.continue')}
            </Button>
          </div>
        </CascadeSection>

        {/* Section 4: Revisar y Lanzar (placeholder) */}
        <CascadeSection
          index={4}
          title={sectionNames[4] || 'Revisar'}
          isCompleted={completedSections.has(4)}
          isActive={expandedSection === 4}
          isLocked={4 > activeSection}
          summary={getSectionSummary(4)}
          onToggle={() => handleToggleSection(4)}
        >
          <p className="text-zinc-500 text-sm">Review section (coming in plan 03)</p>
        </CascadeSection>
      </div>
    </div>
  );
}

// --- Page export with Suspense boundary for useSearchParams ---

export default function NewTaskPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      }
    >
      <WizardContent />
    </Suspense>
  );
}
