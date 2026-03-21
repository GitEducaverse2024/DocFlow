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
  ArrowRight,
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
}

interface RagInfo {
  enabled: boolean;
  vectorCount?: number;
}

// --- Constants ---

const STEP_TYPE_CONFIG = {
  agent: { icon: Bot, badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  checkpoint: { icon: Shield, badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  merge: { icon: GitMerge, badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

const MAX_STEPS = 10;

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
                      connector_config: [], // Reset connectors when agent changes
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

  // Wizard navigation
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Objetivo
  const [taskName, setTaskName] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [expectedOutput, setExpectedOutput] = useState('');
  const [nameError, setNameError] = useState(false);

  // Step 2: Proyectos
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [ragInfo, setRagInfo] = useState<Record<string, RagInfo>>({});
  const [ragLoading, setRagLoading] = useState(false);
  const [ragFetched, setRagFetched] = useState(false);

  // Step 3: Pipeline
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

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

  // --- Fetch RAG info lazily when step 2 renders ---
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
    if (currentStep === 1) {
      fetchRagInfo();
    }
  }, [currentStep, fetchRagInfo]);

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

  // --- Validation ---

  function canProceed(): boolean {
    if (currentStep === 0) return taskName.trim().length > 0;
    if (currentStep === 2) return pipelineSteps.length > 0;
    return true;
  }

  function handleNext() {
    if (currentStep === 0 && !taskName.trim()) {
      setNameError(true);
      return;
    }
    if (currentStep < 3) setCurrentStep(currentStep + 1);
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
      // 1. Create task
      const taskRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName.trim(),
          description: taskDescription.trim() || null,
          expected_output: expectedOutput.trim() || null,
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

      {/* Stepper */}
      <div className="flex items-center justify-between mb-10">
        {(t.raw('wizard.steps') as string[]).map((label: string, i: number) => {
          const isCompleted = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    isCompleted
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : isActive
                        ? 'bg-violet-500 text-white'
                        : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={`text-xs mt-1.5 ${
                    isActive ? 'text-zinc-50' : isCompleted ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < 3 && (
                <div
                  className={`flex-1 h-px mx-3 ${
                    isCompleted ? 'bg-emerald-500/40' : 'bg-zinc-800'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {/* Step 1: Objetivo */}
        {currentStep === 0 && (
          <div className="space-y-5">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">
                {t('wizard.step1.taskName')} <span className="text-red-400">*</span>
              </label>
              <Input
                value={taskName}
                onChange={(e) => {
                  setTaskName(e.target.value);
                  if (e.target.value.trim()) setNameError(false);
                }}
                onBlur={() => { if (!taskName.trim()) setNameError(true); }}
                placeholder={t('wizard.step1.taskNamePlaceholder')}
                className={`bg-zinc-900 border-zinc-800 text-zinc-50 ${nameError ? 'border-red-500' : ''}`}
              />
              {nameError && (
                <p className="text-xs text-red-400 mt-1">{t('wizard.step1.taskNameRequired')}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step1.description')}</label>
              <Textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder={t('wizard.step1.descriptionPlaceholder')}
                className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px]"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">{t('wizard.step1.expectedOutput')}</label>
              <Textarea
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                placeholder={t('wizard.step1.expectedOutputPlaceholder')}
                className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px]"
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 2: Proyectos */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">{t('wizard.step2.title')}</h2>
            <p className="text-sm text-zinc-500 mb-6">
              {t('wizard.step2.description')}
            </p>

            {projects.length === 0 ? (
              <div className="text-center py-12 border border-zinc-800 border-dashed rounded-lg">
                <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={48} height={48} className="mx-auto mb-3 opacity-40" />
                <p className="text-zinc-400">{t('wizard.step2.noCatBrains')}</p>
                <p className="text-zinc-500 text-sm mt-1">{t('wizard.step2.createFirst')}</p>
              </div>
            ) : ragLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => {
                  const ri = ragInfo[p.id];
                  const isSelected = selectedProjects.includes(p.id);

                  let ragLabel: string;
                  let ragColor: string;
                  if (!p.rag_enabled) {
                    ragLabel = t('wizard.step2.ragDisabled');
                    ragColor = 'text-zinc-500';
                  } else if (ri && ri.enabled && ri.vectorCount && ri.vectorCount > 0) {
                    ragLabel = t('wizard.step2.ragVectors', { count: ri.vectorCount.toLocaleString() });
                    ragColor = 'text-emerald-400';
                  } else {
                    ragLabel = t('wizard.step2.ragNotIndexed');
                    ragColor = 'text-amber-400';
                  }

                  return (
                    <label
                      key={p.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-violet-500/40 bg-violet-500/5' : 'border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedProjects((prev) =>
                            checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)
                          );
                        }}
                        className="mt-0.5 border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{p.name}</p>
                        <div className={`flex items-center gap-1.5 text-xs mt-1 ${ragColor}`}>
                          <Database className="w-3 h-3" />
                          {ragLabel}
                          {ragColor === 'text-amber-400' && <AlertTriangle className="w-3 h-3" />}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Pipeline */}
        {currentStep === 2 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">{t('wizard.step3.title')}</h2>
            <p className="text-sm text-zinc-500 mb-6">
              {t('wizard.step3.description', { max: MAX_STEPS })}
            </p>

            {pipelineSteps.length === 0 ? (
              <div className="text-center py-12 border border-zinc-800 border-dashed rounded-lg mb-4">
                <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">{t('wizard.step3.emptyPipeline')}</p>
                <p className="text-zinc-500 text-sm mt-1">{t('wizard.step3.addFirst')}</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={pipelineSteps.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-0">
                    {pipelineSteps.map((step, idx) => (
                      <div key={step.id}>
                        {idx > 0 && (
                          <AddStepButton
                            onAdd={(type) => handleAddStep(type, idx - 1)}
                            disabled={pipelineSteps.length >= MAX_STEPS}
                            t={t}
                          />
                        )}
                        <SortableStepCard
                          step={step}
                          agents={agents}
                          skills={skills}
                          expanded={expandedStep === step.id}
                          onToggleExpand={() =>
                            setExpandedStep(expandedStep === step.id ? null : step.id)
                          }
                          onUpdate={(updates) => handleUpdateStep(step.id, updates)}
                          onDelete={() => handleDeleteStep(step.id)}
                          connectors={step.agent_id ? (agentConnectors[step.agent_id] || []) : []}
                          onFetchConnectors={fetchAgentConnectors}
                          availableModels={availableModels}
                          t={t}
                        />
                      </div>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            {/* Add at end */}
            <AddStepButton
              onAdd={(type) => handleAddStep(type)}
              disabled={pipelineSteps.length >= MAX_STEPS}
              t={t}
            />
          </div>
        )}

        {/* Step 4: Revisar */}
        {currentStep === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-6">{t('wizard.step4.title')}</h2>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              {/* Task info */}
              <div>
                <span className="text-xs text-zinc-500">{t('wizard.step4.name')}</span>
                <p className="text-zinc-100 font-medium">{taskName}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">{t('wizard.step4.description')}</span>
                <p className="text-zinc-300 text-sm">{taskDescription || '—'}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">{t('wizard.step4.expectedOutput')}</span>
                <p className="text-zinc-300 text-sm">{expectedOutput || '—'}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">{t('wizard.step4.linkedCatBrains')}</span>
                <p className="text-zinc-300 text-sm">
                  {selectedProjects.length > 0
                    ? projects
                        .filter((p) => selectedProjects.includes(p.id))
                        .map((p) => p.name)
                        .join(', ')
                    : t('wizard.step4.none')}
                </p>
              </div>

              {/* Pipeline */}
              <div className="pt-3 border-t border-zinc-800">
                <span className="text-xs text-zinc-500">
                  {t('wizard.step4.pipeline', { count: pipelineSteps.length })}
                </span>
                <div className="mt-3 space-y-2">
                  {pipelineSteps.map((step, idx) => {
                    const TypeIcon = STEP_TYPE_CONFIG[step.type].icon;
                    const cfg = STEP_TYPE_CONFIG[step.type];
                    return (
                      <div key={step.id} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-600 w-5 text-right">{idx + 1}.</span>
                        <TypeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="text-sm text-zinc-200">{step.name || t('wizard.step3.noName')}</span>
                        {step.type === 'agent' && step.agent_name && (
                          <span className="text-xs text-zinc-500">— {t('wizard.step4.agentLabel', { name: step.agent_name })}</span>
                        )}
                        {step.type === 'agent' && step.agent_model && (
                          <span className="text-xs text-zinc-600">, {t('wizard.step4.modelLabel', { name: step.agent_model })}</span>
                        )}
                        <Badge variant="outline" className={`text-xs border ml-auto shrink-0 ${cfg.badgeClass}`}>
                          {t(`stepTypes.${step.type}`)}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 mt-8">
              <Button
                variant="outline"
                onClick={() => saveTask(false)}
                disabled={saving || launching}
                className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Save className="w-4 h-4 mr-2" />
                {t('wizard.step4.saveDraft')}
              </Button>
              <Button
                onClick={() => saveTask(true)}
                disabled={saving || launching}
                className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
              >
                {launching && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Rocket className="w-4 h-4 mr-2" />
                {t('wizard.step4.launch')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      {currentStep < 3 && (
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-zinc-800">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('wizard.previous')}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white disabled:opacity-50"
          >
            {t('wizard.next')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
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
