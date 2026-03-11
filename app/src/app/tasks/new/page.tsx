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
  FolderKanban,
  Database,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Project, Skill, TaskTemplate } from '@/lib/types';

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
  emoji: string;
  model: string;
  description?: string | null;
  source: 'openclaw' | 'custom';
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
}

interface RagInfo {
  enabled: boolean;
  vectorCount?: number;
}

// --- Constants ---

const WIZARD_STEPS = [
  { label: 'Objetivo', icon: '1' },
  { label: 'Proyectos', icon: '2' },
  { label: 'Pipeline', icon: '3' },
  { label: 'Revisar', icon: '4' },
];

const STEP_TYPE_CONFIG = {
  agent: { label: 'Agente', icon: Bot, badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  checkpoint: { label: 'Checkpoint', icon: Shield, badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  merge: { label: 'Sintesis', icon: GitMerge, badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
};

const MAX_STEPS = 10;

// --- Helper: create empty pipeline step ---

function createPipelineStep(type: PipelineStep['type'], index: number): PipelineStep {
  const defaults: Record<PipelineStep['type'], Partial<PipelineStep>> = {
    agent: { name: `Paso ${index}`, context_mode: 'previous' },
    checkpoint: { name: 'Revision humana' },
    merge: { name: 'Sintesis final' },
  };
  return {
    id: crypto.randomUUID(),
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
}: {
  step: PipelineStep;
  agents: Agent[];
  skills: Skill[];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<PipelineStep>) => void;
  onDelete: () => void;
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
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <TypeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
        <span className="text-sm text-zinc-200 truncate flex-1">{step.name || 'Sin nombre'}</span>
        <Badge variant="outline" className={`text-xs border shrink-0 ${typeCfg.badgeClass}`}>
          {typeCfg.label}
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
                <label className="text-xs text-zinc-500 block mb-1">Agente</label>
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
                    });
                  }}
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-50">
                    <SelectValue placeholder="Selecciona un agente" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-zinc-50">
                        {a.emoji} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model override */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Modelo (override)</label>
                <Input
                  value={step.agent_model}
                  onChange={(e) => onUpdate({ agent_model: e.target.value })}
                  placeholder="Usa el del agente"
                  className="bg-zinc-900 border-zinc-800 text-zinc-50"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Instrucciones *</label>
                <Textarea
                  value={step.instructions}
                  onChange={(e) => onUpdate({ instructions: e.target.value })}
                  placeholder="Instrucciones especificas para este paso..."
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 font-mono text-sm min-h-[120px]"
                  rows={5}
                />
              </div>

              {/* Context mode */}
              <div>
                <label className="text-xs text-zinc-500 block mb-2">Contexto</label>
                <div className="flex gap-4">
                  {([
                    { value: 'previous', label: 'Paso anterior' },
                    { value: 'all', label: 'Todo el pipeline' },
                    { value: 'manual', label: 'Manual' },
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
                    placeholder="Contexto manual para este paso..."
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
                Usar RAG de proyectos vinculados
              </label>

              {/* Skills */}
              {skills.length > 0 && (
                <div>
                  <label className="text-xs text-zinc-500 block mb-2">Skills</label>
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
            </>
          ) : (
            /* Checkpoint / Merge: just name */
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Nombre</label>
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
}: {
  onAdd: (type: PipelineStep['type']) => void;
  disabled: boolean;
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
            <Bot className="w-4 h-4 text-violet-400" /> Paso de agente
          </button>
          <button
            onClick={() => { onAdd('checkpoint'); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Shield className="w-4 h-4 text-amber-400" /> Checkpoint
          </button>
          <button
            onClick={() => { onAdd('merge'); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <GitMerge className="w-4 h-4 text-blue-400" /> Sintesis
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
      const [agentsRes, skillsRes, projectsRes, templatesRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/skills'),
        fetch('/api/projects?limit=100'),
        fetch('/api/tasks/templates'),
      ]);

      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (skillsRes.ok) setSkills(await skillsRes.json());
      if (projectsRes.ok) {
        const pData = await projectsRes.json();
        setProjects(Array.isArray(pData) ? pData : pData.data || []);
      }
      if (templatesRes.ok) setTemplates(await templatesRes.json());
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- Template pre-fill ---
  useEffect(() => {
    if (!templateId || templates.length === 0) return;
    const tmpl = templates.find((t) => t.id === templateId);
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
          id: crypto.randomUUID(),
          type: (s.type as PipelineStep['type']) || 'agent',
          name: s.name || `Paso ${i + 1}`,
          agent_id: '',
          agent_name: '',
          agent_model: '',
          instructions: s.instructions || '',
          context_mode: (s.context_mode as PipelineStep['context_mode']) || 'previous',
          context_manual: '',
          use_project_rag: !!s.use_project_rag,
          skill_ids: [],
        }));
        setPipelineSteps(mapped);
      }
      toast.success(`Plantilla cargada: ${tmpl.name}`);
    } catch {
      toast.error('Error al cargar plantilla');
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
          const res = await fetch(`/api/projects/${p.id}/rag/info`);
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

  // --- Pipeline helpers ---

  function handleAddStep(type: PipelineStep['type'], afterIndex?: number) {
    if (pipelineSteps.length >= MAX_STEPS) return;
    const newStep = createPipelineStep(type, pipelineSteps.length + 1);
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
      toast.error('El nombre de la tarea es obligatorio');
      return;
    }
    if (pipelineSteps.length === 0) {
      toast.error('Agrega al menos un paso al pipeline');
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
      if (!taskRes.ok) throw new Error('Error al crear tarea');
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
          toast.error('Tarea guardada pero no se pudo lanzar');
        }
      }

      toast.success(launch ? 'Tarea lanzada' : 'Borrador guardado');
      router.push(`/tasks/${task.id}`);
    } catch (err) {
      toast.error((err as Error).message || 'Error al guardar');
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
        <ArrowLeft className="w-4 h-4" /> Volver a tareas
      </button>

      <h1 className="text-2xl font-bold text-zinc-50 mb-8">Nueva tarea</h1>

      {loadingTemplate && (
        <div className="flex items-center gap-2 text-sm text-violet-400 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando plantilla...
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-between mb-10">
        {WIZARD_STEPS.map((ws, i) => {
          const isCompleted = i < currentStep;
          const isActive = i === currentStep;
          return (
            <div key={ws.label} className="flex items-center flex-1 last:flex-none">
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
                  {ws.label}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 && (
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
                Nombre de la tarea <span className="text-red-400">*</span>
              </label>
              <Input
                value={taskName}
                onChange={(e) => {
                  setTaskName(e.target.value);
                  if (e.target.value.trim()) setNameError(false);
                }}
                onBlur={() => { if (!taskName.trim()) setNameError(true); }}
                placeholder="Ej: Documentacion tecnica del API"
                className={`bg-zinc-900 border-zinc-800 text-zinc-50 ${nameError ? 'border-red-500' : ''}`}
              />
              {nameError && (
                <p className="text-xs text-red-400 mt-1">El nombre es obligatorio</p>
              )}
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Descripcion (opcional)</label>
              <Textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="Describe brevemente el objetivo de esta tarea..."
                className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px]"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Resultado esperado (opcional)</label>
              <Textarea
                value={expectedOutput}
                onChange={(e) => setExpectedOutput(e.target.value)}
                placeholder="Que esperas obtener al finalizar la tarea..."
                className="bg-zinc-900 border-zinc-800 text-zinc-50 min-h-[80px]"
                rows={3}
              />
            </div>
          </div>
        )}

        {/* Step 2: Proyectos */}
        {currentStep === 1 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Vincula proyectos para contexto RAG</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Los agentes podran buscar en los documentos indexados de estos proyectos.
            </p>

            {projects.length === 0 ? (
              <div className="text-center py-12 border border-zinc-800 border-dashed rounded-lg">
                <FolderKanban className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No hay proyectos disponibles.</p>
                <p className="text-zinc-500 text-sm mt-1">Crea un proyecto primero.</p>
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
                    ragLabel = 'RAG: Deshabilitado';
                    ragColor = 'text-zinc-500';
                  } else if (ri && ri.enabled && ri.vectorCount && ri.vectorCount > 0) {
                    ragLabel = `RAG: ${ri.vectorCount.toLocaleString()} vectores`;
                    ragColor = 'text-emerald-400';
                  } else {
                    ragLabel = 'RAG: No indexado';
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
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">Construye el pipeline de procesamiento</h2>
            <p className="text-sm text-zinc-500 mb-6">
              Arrastra los pasos para reordenar. Maximo {MAX_STEPS} pasos.
            </p>

            {pipelineSteps.length === 0 ? (
              <div className="text-center py-12 border border-zinc-800 border-dashed rounded-lg mb-4">
                <Bot className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                <p className="text-zinc-400">No hay pasos en el pipeline.</p>
                <p className="text-zinc-500 text-sm mt-1">Agrega el primer paso para comenzar.</p>
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
            />
          </div>
        )}

        {/* Step 4: Revisar */}
        {currentStep === 3 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-6">Resumen de la tarea</h2>

            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 space-y-4">
              {/* Task info */}
              <div>
                <span className="text-xs text-zinc-500">Nombre</span>
                <p className="text-zinc-100 font-medium">{taskName}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Descripcion</span>
                <p className="text-zinc-300 text-sm">{taskDescription || '—'}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Resultado esperado</span>
                <p className="text-zinc-300 text-sm">{expectedOutput || '—'}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-500">Proyectos vinculados</span>
                <p className="text-zinc-300 text-sm">
                  {selectedProjects.length > 0
                    ? projects
                        .filter((p) => selectedProjects.includes(p.id))
                        .map((p) => p.name)
                        .join(', ')
                    : 'Ninguno'}
                </p>
              </div>

              {/* Pipeline */}
              <div className="pt-3 border-t border-zinc-800">
                <span className="text-xs text-zinc-500">
                  Pipeline ({pipelineSteps.length} {pipelineSteps.length === 1 ? 'paso' : 'pasos'})
                </span>
                <div className="mt-3 space-y-2">
                  {pipelineSteps.map((step, idx) => {
                    const TypeIcon = STEP_TYPE_CONFIG[step.type].icon;
                    const cfg = STEP_TYPE_CONFIG[step.type];
                    return (
                      <div key={step.id} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-600 w-5 text-right">{idx + 1}.</span>
                        <TypeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                        <span className="text-sm text-zinc-200">{step.name || 'Sin nombre'}</span>
                        {step.type === 'agent' && step.agent_name && (
                          <span className="text-xs text-zinc-500">— agente: {step.agent_name}</span>
                        )}
                        {step.type === 'agent' && step.agent_model && (
                          <span className="text-xs text-zinc-600">, modelo: {step.agent_model}</span>
                        )}
                        <Badge variant="outline" className={`text-xs border ml-auto shrink-0 ${cfg.badgeClass}`}>
                          {cfg.label}
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
                Guardar borrador
              </Button>
              <Button
                onClick={() => saveTask(true)}
                disabled={saving || launching}
                className="bg-violet-500 hover:bg-violet-400 text-white"
              >
                {launching && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Rocket className="w-4 h-4 mr-2" />
                Lanzar tarea
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
            Anterior
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="bg-violet-500 hover:bg-violet-400 text-white disabled:opacity-50"
          >
            Siguiente
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
