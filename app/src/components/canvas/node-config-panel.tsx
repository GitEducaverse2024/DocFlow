"use client";

import { useEffect, useState } from 'react';
import { type Node } from '@xyflow/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Play, Plug, UserCheck, GitMerge, GitBranch, Flag,
  X, Copy, Trash2, Timer, HardDrive, Network, Radio, Bell, Zap,
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
  onClose: () => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  isExecuting: boolean;
  canvasId?: string;
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
  storage:    { icon: <HardDrive className="w-4 h-4" />,     color: 'text-teal-400' },
  multiagent: { icon: <Network className="w-4 h-4" />,      color: 'text-purple-400' },
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
  storage: 'nodes.storage',
  multiagent: 'nodes.multiagent',
};

export function NodeConfigPanel({ selectedNode, onNodeDataUpdate, onClose, onDuplicate, onDelete, isExecuting, canvasId }: NodeConfigPanelProps) {
  const t = useTranslations('canvas');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [catbrains, setCatBrains] = useState<CatBrain[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [listeningCatflows, setListeningCatflows] = useState<{ id: string; name: string; description?: string; status?: string }[]>([]);
  const [parentListenMode, setParentListenMode] = useState<number>(0);
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);

  // Editable name state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  // Sync nameValue when selected node changes
  useEffect(() => {
    if (selectedNode) {
      setNameValue((selectedNode.data as Record<string, unknown>).label as string || '');
      setEditingName(false);
    }
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
    if (type === 'connector' || type === 'storage') {
      fetch('/api/connectors').then(r => r.json()).then(setConnectors).catch(() => {});
    }
    if (type === 'multiagent' || type === 'output') {
      fetch('/api/catflows/listening').then(r => r.json()).then(setListeningCatflows).catch(() => {});
    }
    if (type === 'start' && canvasId) {
      fetch(`/api/canvas/${canvasId}`)
        .then(r => r.json())
        .then(canvas => {
          if (canvas.task_id) {
            setParentTaskId(canvas.task_id);
            fetch(`/api/tasks/${canvas.task_id}`)
              .then(r => r.json())
              .then(task => setParentListenMode(task.listen_mode || 0))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [selectedNode?.id, selectedNode?.type, canvasId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selectedNode || isExecuting) return null;

  // Capture non-null values for use in nested render functions
  const activeNode = selectedNode;
  const nodeType = activeNode.type || 'unknown';
  const meta = NODE_TYPE_ICON[nodeType];
  const data = activeNode.data as Record<string, unknown>;

  const update = (changes: Record<string, unknown>) => {
    onNodeDataUpdate(activeNode.id, changes);
  };

  const toggleListenMode = async (newValue: number) => {
    if (!parentTaskId) return;
    setParentListenMode(newValue);
    // Update node data so the badge renders immediately
    update({ listen_mode: newValue });
    // PATCH parent task
    try {
      await fetch(`/api/tasks/${parentTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listen_mode: newValue }),
      });
    } catch {
      // Revert on failure
      setParentListenMode(newValue === 1 ? 0 : 1);
      update({ listen_mode: newValue === 1 ? 0 : 1 });
    }
  };

  // ---- Per-type forms ----

  function renderStartForm() {
    return (
      <div className="space-y-3">
        {/* Listen mode toggle */}
        {parentTaskId && (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/30">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs text-zinc-300 font-medium">{t('nodeConfig.start.listenMode')}</span>
                <p className="text-[10px] text-zinc-500">{t('nodeConfig.start.listenModeHelp')}</p>
              </div>
            </div>
            <button
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                parentListenMode === 1 ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
              onClick={() => toggleListenMode(parentListenMode === 1 ? 0 : 1)}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  parentListenMode === 1 ? 'translate-x-[18px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </div>
        )}
        {/* Initial input */}
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
    const triggerTargets = (data.trigger_targets as Array<{ id: string; name: string }>) || [];

    return (
      <div className="space-y-3">
        {/* Existing: Output name + format */}
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

        {/* OUT-01: Notification toggle */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <div>
              <span className="text-xs text-zinc-300 font-medium">{t('nodeConfig.output.notifyToggle')}</span>
              <p className="text-[10px] text-zinc-500">{t('nodeConfig.output.notifyHelp')}</p>
            </div>
          </div>
          <button
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              data.notify_on_complete ? 'bg-amber-500' : 'bg-zinc-700'
            }`}
            onClick={() => update({ notify_on_complete: !data.notify_on_complete })}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                data.notify_on_complete ? 'translate-x-[18px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>

        {/* OUT-02: Trigger chain targets */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" />
            <label className="text-xs text-zinc-300 font-medium">{t('nodeConfig.output.triggerTargets')}</label>
          </div>
          <p className="text-[10px] text-zinc-500">{t('nodeConfig.output.triggerHelp')}</p>

          {listeningCatflows.length === 0 ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
              <span className="text-zinc-500 text-xs">{t('nodeConfig.output.noListening')}</span>
            </div>
          ) : (
            <div className="space-y-1">
              {listeningCatflows.map(cf => {
                const isSelected = triggerTargets.some(tt => tt.id === cf.id);
                return (
                  <label
                    key={cf.id}
                    className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'bg-violet-950/40 border border-violet-700/50' : 'bg-zinc-800/30 border border-zinc-700/30 hover:bg-zinc-800/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-zinc-600 bg-zinc-800 text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
                      checked={isSelected}
                      onChange={() => {
                        const newTargets = isSelected
                          ? triggerTargets.filter(tt => tt.id !== cf.id)
                          : [...triggerTargets, { id: cf.id, name: cf.name }];
                        update({ trigger_targets: newTargets });
                      }}
                    />
                    <span className="text-xs text-zinc-300">{cf.name}</span>
                  </label>
                );
              })}
            </div>
          )}
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

  function renderStorageForm() {
    const storageMode = (data.storage_mode as string) || 'local';

    return (
      <div className="space-y-3">
        {/* Mode selector */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.mode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={storageMode}
            onChange={e => update({ storage_mode: e.target.value })}
          >
            <option value="local">{t('nodeConfig.storage.modeLocal')}</option>
            <option value="connector">{t('nodeConfig.storage.modeConnector')}</option>
            <option value="both">{t('nodeConfig.storage.modeBoth')}</option>
          </select>
        </div>

        {/* Filename template */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.filenameTemplate')}</label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none focus:border-zinc-500"
            placeholder="{title}_{date}_{time}.md"
            value={(data.filename_template as string) || ''}
            onChange={e => update({ filename_template: e.target.value })}
          />
          <p className="text-[10px] text-zinc-500 mt-1">
            {t('nodeConfig.storage.filenameHelp')}
          </p>
        </div>

        {/* Subdir (local/both modes) */}
        {storageMode === 'local' || storageMode === 'both' ? (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.subdir')}</label>
            <input
              type="text"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              placeholder="reports"
              value={(data.subdir as string) || ''}
              onChange={e => update({ subdir: e.target.value })}
            />
          </div>
        ) : null}

        {/* Connector selector (connector/both modes) */}
        {storageMode === 'connector' || storageMode === 'both' ? (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.connector')}</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.connectorId as string) || ''}
              onChange={e => {
                const connector = connectors.find(c => c.id === e.target.value);
                update({ connectorId: e.target.value || null, connectorName: connector?.name || null });
              }}
            >
              <option value="">{t('nodeConfig.storage.noConnector')}</option>
              {connectors.map(c => (
                <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {/* LLM formatting toggle */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="storage-llm-format"
            className="rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500"
            checked={!!(data.use_llm_format)}
            onChange={e => update({ use_llm_format: e.target.checked })}
          />
          <label htmlFor="storage-llm-format" className="text-sm text-zinc-300">{t('nodeConfig.storage.useLlmFormat')}</label>
        </div>

        {/* Format instructions (shown when LLM enabled) */}
        {!!(data.use_llm_format) && (
          <>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.formatInstructions')}</label>
              <textarea
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
                rows={3}
                placeholder={t('nodeConfig.storage.formatPlaceholder')}
                value={(data.format_instructions as string) || ''}
                onChange={e => update({ format_instructions: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.storage.formatModel')}</label>
              <input
                type="text"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                placeholder="gemini-main"
                value={(data.format_model as string) || ''}
                onChange={e => update({ format_model: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  function renderMultiAgentForm() {
    const executionMode = (data.execution_mode as string) || 'sync';

    return (
      <div className="space-y-3">
        {/* Target CatFlow selector */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.multiagent.targetCatflow')}</label>
          {listeningCatflows.length === 0 ? (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-950/50 border border-amber-800/50">
              <span className="text-amber-400 text-xs">{t('nodeConfig.multiagent.noListening')}</span>
            </div>
          ) : (
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.target_task_id as string) || ''}
              onChange={e => {
                const catflow = listeningCatflows.find(c => c.id === e.target.value);
                update({ target_task_id: e.target.value || null, target_task_name: catflow?.name || null });
              }}
            >
              <option value="">{t('nodeConfig.multiagent.selectCatflow')}</option>
              {listeningCatflows.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Execution mode */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.multiagent.executionMode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={executionMode}
            onChange={e => update({ execution_mode: e.target.value })}
          >
            <option value="sync">{t('nodeConfig.multiagent.modeSync')}</option>
            <option value="async">{t('nodeConfig.multiagent.modeAsync')}</option>
          </select>
        </div>

        {/* Payload template */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.multiagent.payloadTemplate')}</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500 font-mono text-xs"
            rows={3}
            placeholder="{input}"
            value={(data.payload_template as string) || '{input}'}
            onChange={e => update({ payload_template: e.target.value })}
          />
          <p className="text-[10px] text-zinc-500 mt-1">
            {t('nodeConfig.multiagent.payloadHelp')}
          </p>
        </div>

        {/* Timeout (sync only) */}
        {executionMode === 'sync' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.multiagent.timeout')}</label>
            <input
              type="number"
              min={10}
              max={3600}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.timeout as number) || 300}
              onChange={e => update({ timeout: Math.max(10, Math.min(3600, Number(e.target.value))) })}
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              {t('nodeConfig.multiagent.timeoutHelp')}
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
    storage:    renderStorageForm,
    multiagent: renderMultiAgentForm,
  };

  const renderForm = formRenderers[nodeType];

  return (
    <div className="w-80 border-l border-zinc-800 bg-zinc-900 h-full flex flex-col shrink-0">
      {/* Header — fixed */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 shrink-0">
        <span className={meta?.color || 'text-zinc-400'}>{meta?.icon}</span>
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          {t(NODE_TYPE_LABEL_KEYS[nodeType] || `nodes.${nodeType}`)}
        </span>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => { onNodeDataUpdate(activeNode.id, { label: nameValue }); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { onNodeDataUpdate(activeNode.id, { label: nameValue }); setEditingName(false); } }}
              autoFocus
            />
          ) : (
            <span
              className="text-sm text-zinc-300 truncate block cursor-pointer hover:text-zinc-100"
              onClick={() => { setNameValue((data.label as string) || ''); setEditingName(true); }}
              title={t('nodeConfig.clickToEditName')}
            >
              {(data.label as string) || activeNode.id}
            </span>
          )}
        </div>
        <button
          className="text-zinc-500 hover:text-zinc-300 p-1"
          onClick={() => onClose()}
          aria-label={t('nodeConfig.closePanel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {renderForm ? renderForm() : null}
      </div>

      {/* Footer — fixed */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800 shrink-0">
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
          onClick={() => onDuplicate(activeNode.id)}
        >
          <Copy className="w-3.5 h-3.5" />
          {t('nodeConfig.duplicate')}
        </button>
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-zinc-800 hover:bg-red-900/30 rounded transition-colors ml-auto"
          onClick={() => onDelete(activeNode.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('nodeConfig.delete')}
        </button>
      </div>
    </div>
  );
}
