"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { type Node } from '@xyflow/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Play, Plug, UserCheck, GitMerge, GitBranch, Flag,
  ChevronDown, ChevronUp, GripHorizontal, Timer,
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  model?: string;
  mode?: string;
  avatar_emoji?: string;
}

interface CatBrain {
  id: string;
  name: string;
}

interface Connector {
  id: string;
  name: string;
  emoji?: string;
}

interface Skill {
  id: string;
  name: string;
}

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onNodeDataUpdate: (nodeId: string, newData: Record<string, unknown>) => void;
}

const NODE_TYPE_ICON: Record<string, { icon: React.ReactNode; color: string }> = {
  start:      { icon: <Play className="w-4 h-4" />,          color: 'text-emerald-400' },
  agent:      { icon: <Image src="/Images/icon/catpaw.png" alt="CatPaw" width={16} height={16} />, color: 'text-violet-400' },
  catbrain:   { icon: <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={16} height={16} />, color: 'text-violet-400' },
  project:    { icon: <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={16} height={16} />, color: 'text-violet-400' }, // backward compat
  connector:  { icon: <Plug className="w-4 h-4" />,          color: 'text-orange-400' },
  checkpoint: { icon: <UserCheck className="w-4 h-4" />,     color: 'text-amber-400' },
  merge:      { icon: <GitMerge className="w-4 h-4" />,      color: 'text-cyan-400' },
  condition:  { icon: <GitBranch className="w-4 h-4" />,     color: 'text-yellow-400' },
  output:     { icon: <Flag className="w-4 h-4" />,          color: 'text-emerald-400' },
  scheduler:  { icon: <Timer className="w-4 h-4" />,         color: 'text-amber-400' },
};

const NODE_TYPE_LABEL_KEYS: Record<string, string> = {
  start: 'nodes.start',
  agent: 'nodes.agent',
  catbrain: 'nodes.catbrain',
  project: 'nodes.catbrain',
  connector: 'nodes.connector',
  checkpoint: 'nodes.checkpoint',
  merge: 'nodes.merge',
  condition: 'nodes.condition',
  output: 'nodes.output',
  scheduler: 'nodes.scheduler',
};

const MIN_PANEL_HEIGHT = 80;
const DEFAULT_PANEL_HEIGHT = 220;

export function NodeConfigPanel({ selectedNode, onNodeDataUpdate }: NodeConfigPanelProps) {
  const t = useTranslations('canvas');
  const [collapsed, setCollapsed] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [catbrains, setCatBrains] = useState<CatBrain[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  // Resizable panel height
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startY.current = e.clientY;
    startHeight.current = panelHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [panelHeight]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      // Dragging up increases height, dragging down decreases
      const delta = startY.current - e.clientY;
      const maxHeight = Math.floor(window.innerHeight * 0.8);
      const newHeight = Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, startHeight.current + delta));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Auto-open when a different node is selected
  useEffect(() => {
    if (selectedNode) setCollapsed(false);
  }, [selectedNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch resources based on node type
  useEffect(() => {
    if (!selectedNode) return;
    const type = selectedNode.type;

    if (type === 'agent' || type === 'merge') {
      fetch('/api/cat-paws').then(r => r.json()).then(setAgents).catch(() => {});
    }
    if (type === 'agent') {
      fetch('/api/skills').then(r => r.json()).then(setSkills).catch(() => {});
    }
    if (type === 'catbrain' || type === 'project') {
      fetch('/api/catbrains').then(r => r.json()).then(d => setCatBrains(d.data || [])).catch(() => {});
    }
    if (type === 'connector') {
      fetch('/api/connectors').then(r => r.json()).then(setConnectors).catch(() => {});
    }
  }, [selectedNode?.id, selectedNode?.type]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedNode) return null;

  // Capture non-null values for use in nested render functions
  const activeNode = selectedNode;
  const nodeType = activeNode.type || 'unknown';
  const meta = NODE_TYPE_ICON[nodeType];
  const data = activeNode.data as Record<string, unknown>;

  const update = (changes: Record<string, unknown>) => {
    onNodeDataUpdate(activeNode.id, changes);
  };

  // ---- Per-type forms ----

  function renderStartForm() {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            {t('nodeConfig.start.initialInput')} <span className="text-zinc-600">({t('nodeConfig.start.optional')})</span>
          </label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
            rows={3}
            placeholder={t('nodeConfig.start.placeholder')}
            value={(data.initialInput as string) || ''}
            onChange={e => update({ initialInput: e.target.value })}
          />
        </div>
      </div>
    );
  }

  function renderAgentForm() {
    const selectedSkills = (data.skills as string[]) || [];
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.agent.agent')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.agentId as string) || ''}
            onChange={e => {
              const agent = agents.find(a => a.id === e.target.value);
              update({ agentId: e.target.value || null, agentName: agent?.name || null, model: agent?.model || (data.model as string) || '', mode: agent?.mode || null });
            }}
          >
            <option value="">{t('nodeConfig.agent.noAgent')}</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.avatar_emoji ? `${a.avatar_emoji} ` : ''}{a.name}{a.mode ? ` (${a.mode})` : ''}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            {t('nodeConfig.agent.modelOverride')} <span className="text-zinc-600">({t('nodeConfig.agent.modelOverrideSuffix')})</span>
          </label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder={t('nodeConfig.agent.modelPlaceholder')}
            value={(data.model as string) || ''}
            onChange={e => update({ model: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.agent.instructions')}</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder={t('nodeConfig.agent.instructionsPlaceholder')}
            value={(data.instructions as string) || ''}
            onChange={e => update({ instructions: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`rag-${activeNode.id}`}
            className="rounded border-zinc-600 bg-zinc-800 text-violet-500"
            checked={!!(data.useRag)}
            onChange={e => update({ useRag: e.target.checked })}
          />
          <label htmlFor={`rag-${activeNode.id}`} className="text-sm text-zinc-300 cursor-pointer">
            {t('nodeConfig.agent.useRag')}
          </label>
        </div>
        {skills.length > 0 && (
          <div className="col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.agent.skills')}</label>
            <div className="flex flex-wrap gap-2">
              {skills.map(s => (
                <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-zinc-600 bg-zinc-800 text-violet-500"
                    checked={selectedSkills.includes(s.id)}
                    onChange={e => {
                      const newSkills = e.target.checked
                        ? [...selectedSkills, s.id]
                        : selectedSkills.filter(id => id !== s.id);
                      update({ skills: newSkills });
                    }}
                  />
                  <span className="text-xs text-zinc-300">{s.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCatBrainForm() {
    // Support both catbrainId and legacy projectId
    const currentId = (data.catbrainId as string) || (data.projectId as string) || '';
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.catbrain.catbrain')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={currentId}
            onChange={e => {
              const catbrain = catbrains.find(p => p.id === e.target.value);
              update({ catbrainId: e.target.value || null, catbrainName: catbrain?.name || null });
            }}
          >
            <option value="">{t('nodeConfig.catbrain.noCatBrain')}</option>
            {catbrains.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.catbrain.maxChunks')}</label>
          <input
            type="number"
            min={1}
            max={20}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.maxChunks as number) ?? 5}
            onChange={e => update({ maxChunks: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.catbrain.mode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.connector_mode as string) || 'both'}
            onChange={e => update({ connector_mode: e.target.value })}
          >
            <option value="rag">{t('nodeConfig.catbrain.modeRag')}</option>
            <option value="connector">{t('nodeConfig.catbrain.modeConnector')}</option>
            <option value="both">{t('nodeConfig.catbrain.modeBoth')}</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.catbrain.ragQuery')}</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder={t('nodeConfig.catbrain.ragQueryPlaceholder')}
            value={(data.ragQuery as string) || ''}
            onChange={e => update({ ragQuery: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.catbrain.inputMode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.input_mode as string) || 'independent'}
            onChange={e => update({ input_mode: e.target.value })}
          >
            <option value="independent">{t('nodeConfig.catbrain.inputIndependent')}</option>
            <option value="pipeline">{t('nodeConfig.catbrain.inputPipeline')}</option>
          </select>
          <p className="text-[10px] text-zinc-500 mt-1">
            {t('nodeConfig.catbrain.inputHelp')}
          </p>
        </div>
      </div>
    );
  }

  function renderConnectorForm() {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.connector')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.connectorId as string) || ''}
            onChange={e => {
              const connector = connectors.find(c => c.id === e.target.value);
              update({ connectorId: e.target.value || null, connectorName: connector?.name || null });
            }}
          >
            <option value="">{t('nodeConfig.connector.noConnector')}</option>
            {connectors.map(c => (
              <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.mode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.mode as string) || 'after'}
            onChange={e => update({ mode: e.target.value })}
          >
            <option value="before">{t('nodeConfig.connector.modeBefore')}</option>
            <option value="after">{t('nodeConfig.connector.modeAfter')}</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.payloadTemplate')}</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500 font-mono text-xs"
            rows={2}
            placeholder={t('nodeConfig.connector.payloadPlaceholder')}
            value={(data.payload as string) || ''}
            onChange={e => update({ payload: e.target.value })}
          />
        </div>
      </div>
    );
  }

  function renderCheckpointForm() {
    return (
      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.checkpoint.reviewerInstructions')}</label>
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
          rows={4}
          placeholder={t('nodeConfig.checkpoint.placeholder')}
          value={(data.instructions as string) || ''}
          onChange={e => update({ instructions: e.target.value })}
        />
      </div>
    );
  }

  function renderMergeForm() {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            {t('nodeConfig.merge.synthesizerAgent')} <span className="text-zinc-600">({t('nodeConfig.merge.optional')})</span>
          </label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.agentId as string) || ''}
            onChange={e => update({ agentId: e.target.value || null })}
          >
            <option value="">{t('nodeConfig.merge.noAgent')}</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.avatar_emoji ? `${a.avatar_emoji} ` : ''}{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.merge.handles')}</label>
          <input
            type="number"
            min={2}
            max={5}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.handleCount as number) ?? 3}
            onChange={e => update({ handleCount: Math.max(2, Math.min(5, Number(e.target.value))) })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.merge.synthesisInstructions')}</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder={t('nodeConfig.merge.placeholder')}
            value={(data.instructions as string) || ''}
            onChange={e => update({ instructions: e.target.value })}
          />
        </div>
      </div>
    );
  }

  function renderConditionForm() {
    return (
      <div>
        <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.condition.condition')}</label>
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
          rows={4}
          placeholder={t('nodeConfig.condition.placeholder')}
          value={(data.condition as string) || ''}
          onChange={e => update({ condition: e.target.value })}
        />
      </div>
    );
  }

  function renderOutputForm() {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.output.outputName')}</label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder={t('nodeConfig.output.outputNamePlaceholder')}
            value={(data.outputName as string) || ''}
            onChange={e => update({ outputName: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.output.format')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.format as string) || 'markdown'}
            onChange={e => update({ format: e.target.value })}
          >
            <option value="markdown">{t('nodeConfig.output.formatMarkdown')}</option>
            <option value="json">{t('nodeConfig.output.formatJson')}</option>
            <option value="plain">{t('nodeConfig.output.formatPlain')}</option>
          </select>
        </div>
      </div>
    );
  }

  function renderSchedulerForm() {
    const scheduleType = (data.schedule_type as string) || 'delay';

    return (
      <div className="space-y-3">
        {/* Mode selector */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.scheduler.mode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={scheduleType}
            onChange={e => update({ schedule_type: e.target.value })}
          >
            <option value="delay">{t('nodeConfig.scheduler.modeDelay')}</option>
            <option value="count">{t('nodeConfig.scheduler.modeCount')}</option>
            <option value="listen">{t('nodeConfig.scheduler.modeListen')}</option>
          </select>
        </div>

        {/* Delay mode fields */}
        {scheduleType === 'delay' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.scheduler.delayValue')}</label>
              <input
                type="number"
                min={1}
                max={3600}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                value={(data.delay_value as number) ?? 5}
                onChange={e => update({ delay_value: Math.max(1, Number(e.target.value)) })}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.scheduler.delayUnit')}</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                value={(data.delay_unit as string) || 'minutes'}
                onChange={e => update({ delay_unit: e.target.value })}
              >
                <option value="seconds">{t('nodeConfig.scheduler.unitSeconds')}</option>
                <option value="minutes">{t('nodeConfig.scheduler.unitMinutes')}</option>
                <option value="hours">{t('nodeConfig.scheduler.unitHours')}</option>
              </select>
            </div>
          </div>
        )}

        {/* Count mode fields */}
        {scheduleType === 'count' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.scheduler.countValue')}</label>
            <input
              type="number"
              min={1}
              max={100}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.count_value as number) ?? 3}
              onChange={e => update({ count_value: Math.max(1, Math.min(100, Number(e.target.value))) })}
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              {t('nodeConfig.scheduler.countHelp')}
            </p>
          </div>
        )}

        {/* Listen mode fields */}
        {scheduleType === 'listen' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.scheduler.listenTimeout')}</label>
            <input
              type="number"
              min={0}
              max={86400}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.listen_timeout as number) ?? 300}
              onChange={e => update({ listen_timeout: Math.max(0, Number(e.target.value)) })}
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              {t('nodeConfig.scheduler.listenHelp')}
            </p>
          </div>
        )}
      </div>
    );
  }

  const formRenderers: Record<string, () => React.ReactNode> = {
    start:      renderStartForm,
    agent:      renderAgentForm,
    catbrain:   renderCatBrainForm,
    project:    renderCatBrainForm, // backward compat
    connector:  renderConnectorForm,
    checkpoint: renderCheckpointForm,
    merge:      renderMergeForm,
    condition:  renderConditionForm,
    output:     renderOutputForm,
    scheduler:  renderSchedulerForm,
  };

  const renderForm = formRenderers[nodeType];

  return (
    <div className="bg-zinc-900 border-t border-zinc-800 shadow-lg z-20 shrink-0">
      {/* Resize handle */}
      {!collapsed && (
        <div
          className="flex items-center justify-center h-2 cursor-ns-resize group hover:bg-zinc-700/50 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <GripHorizontal className="w-5 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
        </div>
      )}

      {/* Header bar -- always visible */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-zinc-800/50 select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className={meta?.color || 'text-zinc-400'}>{meta?.icon}</span>
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
          {t(NODE_TYPE_LABEL_KEYS[nodeType] || `nodes.${nodeType}`)}
        </span>
        <span className="text-xs text-zinc-500 ml-1">
          — {(data.label as string) || activeNode.id}
        </span>
        <button
          className="ml-auto text-zinc-500 hover:text-zinc-300"
          aria-label={collapsed ? t('nodeConfig.expandPanel') : t('nodeConfig.collapsePanel')}
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Form body — resizable */}
      {!collapsed && renderForm && (
        <div
          className="px-4 pb-4 pt-2 overflow-y-auto"
          style={{ maxHeight: `${panelHeight}px` }}
        >
          {renderForm()}
        </div>
      )}
    </div>
  );
}
