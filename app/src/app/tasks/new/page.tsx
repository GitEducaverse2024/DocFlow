"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Project, Skill, TaskTemplate } from '@/lib/types';
import { useTranslations } from 'next-intl';

import { CascadeSection } from '@/components/tasks/cascade-section';
import { ObjetivoSection } from '@/components/tasks/objetivo-section';
import { CatBrainsSection } from '@/components/tasks/catbrains-section';
import { PipelineSection, type PipelineStep, type CanvasMetadata } from '@/components/tasks/pipeline-section';
import type { ForkBranch } from '@/components/tasks/fork-step-config';
import { CicloSection } from '@/components/tasks/ciclo-section';
import { RevisarSection } from '@/components/tasks/revisar-section';
import type { ScheduleConfig } from '@/lib/schedule-utils';

// --- Types ---

interface Agent {
  id: string;
  name: string;
  avatar_emoji: string;
  model: string;
  mode?: string;
  description?: string | null;
}

interface ConnectorInfo {
  id: string;
  name: string;
  emoji: string;
  type: string;
}

interface RagInfo {
  enabled: boolean;
  vectorCount?: number;
}

// --- Constants ---

const TOTAL_SECTIONS = 5;
const WIZARD_DRAFT_KEY = 'wizard_draft';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// --- Main Wizard Content (uses useSearchParams) ---

function WizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');
  const fromCanvas = searchParams.get('from_canvas');
  const editId = searchParams.get('edit');
  const isEditMode = !!editId;
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
  const [canvasMetadata, setCanvasMetadata] = useState<Record<string, CanvasMetadata>>({});
  const [forkBranches, setForkBranches] = useState<Record<string, ForkBranch[]>>({});

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
  const [loadingEdit, setLoadingEdit] = useState(false);

  // --- Section names from i18n ---
  const sectionNames = t.raw('wizard.steps') as string[];

  // --- Section summaries ---
  function getSectionSummary(index: number): string {
    const totalStepCount = pipelineSteps.length + Object.values(forkBranches).reduce(
      (sum, branches) => sum + branches.reduce((bSum, b) => bSum + b.steps.length, 0),
      0
    );
    switch (index) {
      case 0:
        return taskName
          ? t('wizard.section.summary.objetivo', { name: taskName.substring(0, 50) })
          : '';
      case 1:
        return selectedProjects.length > 0
          ? t('wizard.section.summary.catbrains', { count: selectedProjects.length })
          : t('wizard.section.summary.catbrainsNone');
      case 2: {
        if (totalStepCount === 0) return t('wizard.pipeline.summaryEmpty');
        // Collect unique step type labels
        const typeLabels: Record<string, string> = {
          agent: 'Agente', canvas: 'Canvas', checkpoint: 'Checkpoint',
          merge: 'Sintesis', fork: 'Fork', join: 'Join',
        };
        const allTypes = new Set<string>();
        for (const ps of pipelineSteps) {
          if (ps.type !== 'join') allTypes.add(typeLabels[ps.type] || ps.type);
        }
        for (const branches of Object.values(forkBranches)) {
          for (const branch of branches) {
            for (const bs of branch.steps) {
              allTypes.add(typeLabels[bs.type] || bs.type);
            }
          }
        }
        const types = Array.from(allTypes).join(', ');
        return t('wizard.pipeline.summaryTypes', { count: totalStepCount, types });
      }
      case 3:
        if (executionMode === 'variable') return t('wizard.section4.summary.variable', { count: executionCount });
        if (executionMode === 'scheduled' && scheduleConfig) return t('wizard.section4.summary.scheduled', { time: scheduleConfig.time, days: scheduleConfig.days });
        return t('wizard.section4.summary.single');
      case 4:
        return '';
      default:
        return '';
    }
  }

  // --- Section navigation ---
  function handleContinue(sectionIndex: number) {
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
    if (index > activeSection) return;
    setExpandedSection(expandedSection === index ? null : index);
  }

  // --- Wizard draft save/restore for canvas navigation ---
  const saveWizardDraft = useCallback(() => {
    const draft = {
      taskName,
      taskDescription,
      expectedOutput,
      selectedProjects,
      pipelineSteps,
      canvasMetadata,
      forkBranches,
      executionMode,
      executionCount,
      scheduleConfig,
      activeSection,
      completedSections: Array.from(completedSections),
      expandedSection,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // localStorage quota exceeded or unavailable
    }
  }, [
    taskName, taskDescription, expectedOutput, selectedProjects,
    pipelineSteps, canvasMetadata, forkBranches,
    executionMode, executionCount, scheduleConfig,
    activeSection, completedSections, expandedSection,
  ]);

  // Restore wizard draft on mount if coming back from canvas creation
  useEffect(() => {
    if (!fromCanvas) return;
    try {
      const raw = localStorage.getItem(WIZARD_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);

      setTaskName(draft.taskName || '');
      setTaskDescription(draft.taskDescription || '');
      setExpectedOutput(draft.expectedOutput || '');
      setSelectedProjects(draft.selectedProjects || []);
      setPipelineSteps(draft.pipelineSteps || []);
      setCanvasMetadata(draft.canvasMetadata || {});
      setForkBranches(draft.forkBranches || {});
      setExecutionMode(draft.executionMode || 'single');
      setExecutionCount(draft.executionCount || 1);
      setScheduleConfig(draft.scheduleConfig || null);
      setActiveSection(draft.activeSection || 0);
      setCompletedSections(new Set(draft.completedSections || []));
      setExpandedSection(draft.expandedSection ?? null);

      localStorage.removeItem(WIZARD_DRAFT_KEY);
      toast.success(t('wizard.pipeline.stateRestored'));
    } catch {
      // Corrupted draft, ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromCanvas]);

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

  // --- Load existing task for edit mode ---
  const loadTaskForEditing = useCallback(async (taskId: string) => {
    setLoadingEdit(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (!res.ok) {
        toast.error(t('wizard.toasts.loadError'));
        return;
      }
      const data = await res.json();

      // Populate task fields
      setTaskName(data.name || '');
      setTaskDescription(data.description || '');
      setExpectedOutput(data.expected_output || '');

      // Linked projects
      if (data.linked_projects) {
        try {
          const parsed = JSON.parse(data.linked_projects);
          setSelectedProjects(Array.isArray(parsed) ? parsed : []);
        } catch {
          setSelectedProjects([]);
        }
      }

      // Execution config
      setExecutionMode(data.execution_mode || 'single');
      setExecutionCount(data.execution_count || 1);
      if (data.schedule_config) {
        try {
          const parsed = typeof data.schedule_config === 'string'
            ? JSON.parse(data.schedule_config)
            : data.schedule_config;
          setScheduleConfig(parsed);
        } catch {
          setScheduleConfig(null);
        }
      }

      // Reconstruct pipeline steps from task_steps
      interface TaskStep {
        id: string;
        type: string;
        name: string;
        agent_id: string | null;
        agent_name: string | null;
        agent_model: string | null;
        instructions: string | null;
        context_mode: string;
        context_manual: string | null;
        use_project_rag: number;
        skill_ids: string | null;
        connector_config: string | null;
        canvas_id: string | null;
        fork_group: string | null;
        branch_index: number | null;
        branch_label: string | null;
        order_index: number;
      }

      const steps: TaskStep[] = data.steps || [];

      // Separate fork-grouped steps from regular steps
      const forkGrouped = new Map<string, TaskStep[]>();
      const regularSteps: TaskStep[] = [];

      for (const step of steps) {
        if (step.fork_group) {
          if (!forkGrouped.has(step.fork_group)) {
            forkGrouped.set(step.fork_group, []);
          }
          forkGrouped.get(step.fork_group)!.push(step);
        } else {
          regularSteps.push(step);
        }
      }

      // Map a TaskStep to PipelineStep
      const mapToPipelineStep = (s: TaskStep): PipelineStep => {
        return {
          id: generateId(),
          type: s.type as PipelineStep['type'],
          name: s.name || '',
          agent_id: s.agent_id || '',
          agent_name: s.agent_name || '',
          agent_model: s.agent_model || '',
          instructions: s.instructions || '',
          context_mode: (s.context_mode as PipelineStep['context_mode']) || 'previous',
          context_manual: s.context_manual || '',
          use_project_rag: !!s.use_project_rag,
          skill_ids: s.skill_ids ? JSON.parse(s.skill_ids) : [],
          connector_config: s.connector_config ? JSON.parse(s.connector_config) : [],
          canvas_id: s.canvas_id || undefined,
          fork_group: s.fork_group || undefined,
          branch_index: s.branch_index !== null ? s.branch_index : undefined,
          branch_label: s.branch_label || undefined,
        };
      };

      // Build pipeline steps with fork reconstruction
      const resultSteps: PipelineStep[] = [];
      const resultForkBranches: Record<string, ForkBranch[]> = {};
      const processedForkGroups = new Set<string>();

      // Process all steps in order_index order
      const allStepsSorted = [...steps].sort((a, b) => a.order_index - b.order_index);

      for (const step of allStepsSorted) {
        if (step.fork_group) {
          // Already processed this fork group
          if (processedForkGroups.has(step.fork_group)) continue;
          processedForkGroups.add(step.fork_group);

          const groupSteps = forkGrouped.get(step.fork_group) || [];
          const forkStep = groupSteps.find(s => s.type === 'fork');
          const joinStep = groupSteps.find(s => s.type === 'join');
          const branchSteps = groupSteps.filter(s => s.type !== 'fork' && s.type !== 'join')
            .sort((a, b) => (a.branch_index ?? 0) - (b.branch_index ?? 0) || a.order_index - b.order_index);

          // Group by branch_index
          const branchesByIndex = new Map<number, TaskStep[]>();
          for (const bs of branchSteps) {
            const bi = bs.branch_index ?? 0;
            if (!branchesByIndex.has(bi)) {
              branchesByIndex.set(bi, []);
            }
            branchesByIndex.get(bi)!.push(bs);
          }

          // Build ForkBranch array
          const branches: ForkBranch[] = [];
          const sortedBranchIndices = Array.from(branchesByIndex.keys()).sort((a, b) => a - b);
          for (const bi of sortedBranchIndices) {
            const bSteps = branchesByIndex.get(bi) || [];
            branches.push({
              label: bSteps[0]?.branch_label || `Branch ${bi + 1}`,
              steps: bSteps.map(mapToPipelineStep),
            });
          }

          // Add fork step to pipeline
          if (forkStep) {
            const forkPipelineStep = mapToPipelineStep(forkStep);
            // Store branch count in branch_index (convention from 59-02)
            forkPipelineStep.branch_index = branches.length;
            resultSteps.push(forkPipelineStep);
            resultForkBranches[forkPipelineStep.fork_group!] = branches;
          }

          // Add join step to pipeline
          if (joinStep) {
            resultSteps.push(mapToPipelineStep(joinStep));
          }
        } else {
          // Regular step
          resultSteps.push(mapToPipelineStep(step));
        }
      }

      setPipelineSteps(resultSteps);
      setForkBranches(resultForkBranches);

      // Fetch canvas metadata for canvas steps
      const canvasSteps = steps.filter(s => s.canvas_id && s.type === 'canvas');
      if (canvasSteps.length > 0) {
        const metaMap: Record<string, CanvasMetadata> = {};
        await Promise.all(
          canvasSteps.map(async (cs) => {
            try {
              const cRes = await fetch(`/api/canvas/${cs.canvas_id}`);
              if (cRes.ok) {
                const cData = await cRes.json();
                metaMap[cs.canvas_id!] = {
                  name: cData.name || 'Canvas',
                  emoji: cData.emoji || '',
                  node_count: cData.nodes?.length || 0,
                  updated_at: cData.updated_at || '',
                };
              }
            } catch {
              // Ignore canvas metadata fetch errors
            }
          })
        );
        setCanvasMetadata(metaMap);
      }

      // Mark all sections as completed, expand Revisar (section 4)
      setActiveSection(4);
      setCompletedSections(new Set([0, 1, 2, 3]));
      setExpandedSection(4);
    } catch {
      toast.error(t('wizard.toasts.loadError'));
    } finally {
      setLoadingEdit(false);
    }
  }, [t]);

  // Load task for editing on mount
  useEffect(() => {
    if (editId && !loading) {
      loadTaskForEditing(editId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, loading]);

  // --- Fetch connectors for an agent ---
  const fetchAgentConnectors = useCallback(async (agentId: string) => {
    if (!agentId || agentConnectors[agentId]) return;
    try {
      const res = await fetch(`/api/cat-paws/${agentId}/relations`);
      if (res.ok) {
        const data = await res.json();
        const connectorsList: ConnectorInfo[] = (data.connectors || []).map((c: { connector_id: string; connector_name: string; connector_type: string }) => ({
          id: c.connector_id,
          name: c.connector_name || 'Connector',
          emoji: '',
          type: c.connector_type || '',
        }));
        setAgentConnectors(prev => ({ ...prev, [agentId]: connectorsList }));
      }
    } catch (err) {
      console.error('Error fetching agent connectors:', err);
    }
  }, [agentConnectors]);

  // --- Canvas navigation handler ---
  const handleNavigateToCanvasNew = useCallback((stepIndex: number) => {
    saveWizardDraft();
    router.push(`/canvas/new?from_task=draft&step_index=${stepIndex}`);
  }, [saveWizardDraft, router]);

  // --- Collect all connectors for current agent steps ---
  const currentConnectors = Object.values(agentConnectors).flat();

  // --- Resolve project names for review section ---
  const projectNames = useMemo(() => {
    return selectedProjects.map(id => {
      const project = projects.find(p => p.id === id);
      return project?.name || id;
    });
  }, [selectedProjects, projects]);

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
      // For scheduled mode, ensure is_active is true so the API creates a task_schedules row
      const finalScheduleConfig = executionMode === 'scheduled' && scheduleConfig
        ? { ...scheduleConfig, is_active: true }
        : null;
      const taskRes = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName.trim(),
          description: taskDescription.trim() || null,
          expected_output: expectedOutput.trim() || null,
          execution_mode: executionMode,
          execution_count: executionMode === 'variable' ? executionCount : 1,
          schedule_config: finalScheduleConfig,
        }),
      });
      if (!taskRes.ok) throw new Error(t('wizard.toasts.createError'));
      const task = await taskRes.json();

      // 2. Create pipeline steps (including fork/join and branch steps)
      let orderIndex = 0;
      for (const ps of pipelineSteps) {
        if (ps.type === 'fork' && ps.fork_group) {
          // POST the fork step
          await postStep(task.id, { ...ps, order_index: orderIndex++ });

          // POST each branch step
          const branches = forkBranches[ps.fork_group] || [];
          const branchCount = (ps.branch_index === 3 ? 3 : 2);
          for (let bi = 0; bi < branchCount; bi++) {
            const branch = branches[bi];
            if (!branch) continue;
            for (const branchStep of branch.steps) {
              await postStep(task.id, {
                ...branchStep,
                fork_group: ps.fork_group,
                branch_index: bi,
                branch_label: branch.label,
                order_index: orderIndex++,
              });
            }
          }
          continue;
        }
        if (ps.type === 'join' && ps.fork_group) {
          // POST the join step
          await postStep(task.id, { ...ps, order_index: orderIndex++ });
          continue;
        }

        // Regular step
        await postStep(task.id, { ...ps, order_index: orderIndex++ });
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

  // --- Edit mode save flow: PATCH task, DELETE all steps, POST new steps ---
  async function saveTaskEditMode(launch: boolean) {
    if (!editId) return;
    if (!taskName.trim()) {
      toast.error(t('wizard.toasts.nameRequired'));
      return;
    }

    const setter = launch ? setLaunching : setSaving;
    setter(true);

    try {
      // 1. PATCH task fields
      const finalScheduleConfig = executionMode === 'scheduled' && scheduleConfig
        ? { ...scheduleConfig, is_active: true }
        : null;

      await fetch(`/api/tasks/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName.trim(),
          description: taskDescription.trim() || null,
          expected_output: expectedOutput.trim() || null,
          linked_projects: JSON.stringify(selectedProjects),
          execution_mode: executionMode,
          execution_count: executionMode === 'variable' ? executionCount : 1,
          schedule_config: finalScheduleConfig,
          status: 'ready',
        }),
      });

      // 2. DELETE all existing steps
      const existingStepsRes = await fetch(`/api/tasks/${editId}/steps`);
      if (existingStepsRes.ok) {
        const existingSteps = await existingStepsRes.json();
        await Promise.all(
          (existingSteps as { id: string }[]).map((step) =>
            fetch(`/api/tasks/${editId}/steps/${step.id}`, { method: 'DELETE' })
          )
        );
      }

      // 3. POST new steps in order (using shared postStep + flatten logic)
      let orderIndex = 0;
      for (const ps of pipelineSteps) {
        if (ps.type === 'fork' && ps.fork_group) {
          await postStep(editId, { ...ps, order_index: orderIndex++ });
          const branches = forkBranches[ps.fork_group] || [];
          const branchCount = (ps.branch_index === 3 ? 3 : 2);
          for (let bi = 0; bi < branchCount; bi++) {
            const branch = branches[bi];
            if (!branch) continue;
            for (const branchStep of branch.steps) {
              await postStep(editId, {
                ...branchStep,
                fork_group: ps.fork_group,
                branch_index: bi,
                branch_label: branch.label,
                order_index: orderIndex++,
              });
            }
          }
          continue;
        }
        if (ps.type === 'join' && ps.fork_group) {
          await postStep(editId, { ...ps, order_index: orderIndex++ });
          continue;
        }
        await postStep(editId, { ...ps, order_index: orderIndex++ });
      }

      // 4. Launch if requested
      if (launch) {
        const execRes = await fetch(`/api/tasks/${editId}/execute`, { method: 'POST' });
        if (!execRes.ok) {
          toast.error(t('wizard.toasts.savedNotLaunched'));
        }
      }

      toast.success(launch ? t('wizard.toasts.launched') : t('wizard.toasts.draftSaved'));
      router.push(`/tasks/${editId}`);
    } catch (err) {
      toast.error((err as Error).message || t('wizard.toasts.saveError'));
    } finally {
      setter(false);
    }
  }

  // Helper to POST a single step
  async function postStep(taskId: string, ps: PipelineStep & { order_index?: number }) {
    const stepRes = await fetch(`/api/tasks/${taskId}/steps`, {
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
        skill_ids: ps.skill_ids && ps.skill_ids.length > 0 ? JSON.stringify(ps.skill_ids) : null,
        connector_config: ps.connector_config && ps.connector_config.length > 0 ? JSON.stringify(ps.connector_config) : null,
        canvas_id: ps.canvas_id || null,
        fork_group: ps.fork_group || null,
        branch_index: ps.branch_index !== undefined ? ps.branch_index : null,
        branch_label: ps.branch_label || null,
        order_index: ps.order_index,
      }),
    });
    if (!stepRes.ok) {
      console.error('Error creating step:', await stepRes.text());
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

      <h1 className="text-2xl font-bold text-zinc-50 mb-8">
        {isEditMode ? t('wizard.editTitle') : t('wizard.title')}
      </h1>

      {loadingTemplate && (
        <div className="flex items-center gap-2 text-sm text-violet-400 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('wizard.loadingTemplate')}
        </div>
      )}

      {loadingEdit && (
        <div className="flex items-center gap-2 text-sm text-violet-400 mb-4">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('wizard.loadingTask')}
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

        {/* Section 2: Pipeline */}
        <CascadeSection
          index={2}
          title={sectionNames[2] || 'Pipeline'}
          isCompleted={completedSections.has(2)}
          isActive={expandedSection === 2}
          isLocked={2 > activeSection}
          summary={getSectionSummary(2)}
          onToggle={() => handleToggleSection(2)}
        >
          <PipelineSection
            steps={pipelineSteps}
            setSteps={setPipelineSteps}
            agents={agents}
            skills={skills}
            connectors={currentConnectors}
            onFetchConnectors={fetchAgentConnectors}
            availableModels={availableModels}
            t={(key: string, values?: Record<string, string | number | boolean>) => t(key, values)}
            onNavigateToCanvasNew={handleNavigateToCanvasNew}
            canvasMetadata={canvasMetadata}
            setCanvasMetadata={setCanvasMetadata}
            forkBranches={forkBranches}
            setForkBranches={setForkBranches}
          />
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => handleContinue(2)}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('wizard.continue')}
            </Button>
          </div>
        </CascadeSection>

        {/* Section 3: Ciclo de Ejecucion */}
        <CascadeSection
          index={3}
          title={sectionNames[3] || 'Ciclo'}
          isCompleted={completedSections.has(3)}
          isActive={expandedSection === 3}
          isLocked={3 > activeSection}
          summary={getSectionSummary(3)}
          onToggle={() => handleToggleSection(3)}
        >
          <CicloSection
            executionMode={executionMode}
            setExecutionMode={setExecutionMode}
            executionCount={executionCount}
            setExecutionCount={setExecutionCount}
            scheduleConfig={scheduleConfig}
            setScheduleConfig={setScheduleConfig}
            t={(key: string, values?: Record<string, string | number | boolean>) => t(key, values)}
          />
          <div className="flex justify-end mt-6">
            <Button
              onClick={() => handleContinue(3)}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('wizard.continue')}
            </Button>
          </div>
        </CascadeSection>

        {/* Section 4: Revisar y Lanzar */}
        <CascadeSection
          index={4}
          title={sectionNames[4] || 'Revisar'}
          isCompleted={completedSections.has(4)}
          isActive={expandedSection === 4}
          isLocked={4 > activeSection}
          summary={getSectionSummary(4)}
          onToggle={() => handleToggleSection(4)}
        >
          <RevisarSection
            taskName={taskName}
            taskDescription={taskDescription}
            expectedOutput={expectedOutput}
            projectNames={projectNames}
            pipelineSteps={pipelineSteps}
            forkBranches={forkBranches}
            executionMode={executionMode}
            executionCount={executionCount}
            scheduleConfig={scheduleConfig}
            saving={saving}
            launching={launching}
            onSave={() => isEditMode ? saveTaskEditMode(false) : saveTask(false)}
            onLaunch={() => isEditMode ? saveTaskEditMode(true) : saveTask(true)}
            t={(key: string, values?: Record<string, string | number | boolean>) => t(key, values)}
          />
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
