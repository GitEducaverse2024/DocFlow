"use client";

import { useEffect, useState } from 'react';
import { type Node } from '@xyflow/react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Play, Plug, UserCheck, GitMerge, GitBranch, Flag,
  X, Copy, Trash2, Timer, HardDrive, Network, Radio, Bell, Zap,
  Clock, Plus, Minus, Repeat, CornerDownLeft,
} from 'lucide-react';
import { calculateCanvasNextExecution, isValidCron, type CanvasScheduleConfig } from '@/lib/schedule-utils';

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
  type?: string;
}

interface Skill {
  id: string;
  name: string;
  category?: string;
}

interface PawConnector {
  connector_id: string;
  connector_name: string;
  connector_type: string;
}

const SKILL_CATEGORY_ORDER = ['sales', 'writing', 'analysis', 'strategy', 'technical', 'format', 'system'];
const SKILL_CATEGORY_LABELS: Record<string, string> = {
  sales: 'Ventas',
  writing: 'Escritura',
  analysis: 'Análisis',
  strategy: 'Estrategia',
  technical: 'Técnico',
  format: 'Formato',
  system: 'Sistema',
};
const SKILL_CATEGORY_COLORS: Record<string, string> = {
  sales: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  writing: 'border-blue-500/30 text-blue-400 bg-blue-500/10',
  analysis: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
  strategy: 'border-violet-500/30 text-violet-400 bg-violet-500/10',
  technical: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10',
  format: 'border-pink-500/30 text-pink-400 bg-pink-500/10',
  system: 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10',
};
const CONNECTOR_TYPE_COLORS: Record<string, string> = {
  gmail: 'border-red-500/30 text-red-400 bg-red-500/10',
  google_drive: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10',
  mcp_server: 'border-violet-500/30 text-violet-400 bg-violet-500/10',
  http_api: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  n8n_webhook: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
};

interface NodeConfigPanelProps {
  selectedNode: Node | null;
  onNodeDataUpdate: (nodeId: string, newData: Record<string, unknown>) => void;
  onClose: () => void;
  onDuplicate: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onGenerateIteratorEnd?: (iteratorNodeId: string) => void;
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
  iterator:     { icon: <Repeat className="w-4 h-4" />,       color: 'text-rose-400' },
  iterator_end: { icon: <CornerDownLeft className="w-4 h-4" />, color: 'text-rose-400' },
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
  iterator: 'nodes.iterator',
  iterator_end: 'nodes.iteratorEnd',
};

export function NodeConfigPanel({ selectedNode, onNodeDataUpdate, onClose, onDuplicate, onDelete, onGenerateIteratorEnd, isExecuting, canvasId }: NodeConfigPanelProps) {
  const t = useTranslations('canvas');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [catbrains, setCatBrains] = useState<CatBrain[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [pawConnectors, setPawConnectors] = useState<PawConnector[]>([]); // base connectors from CatPaw
  const [pawSkillIds, setPawSkillIds] = useState<string[]>([]); // base skill IDs from CatPaw
  const [pawCatBrainIds, setPawCatBrainIds] = useState<Array<{ id: string; name: string; query_mode: string }>>([]);
  const [allConnectors, setAllConnectors] = useState<Connector[]>([]);
  const [allCatBrains, setAllCatBrains] = useState<CatBrain[]>([]);
  const [showConnectorPicker, setShowConnectorPicker] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showCatBrainPicker, setShowCatBrainPicker] = useState(false);
  const [listeningCatflows, setListeningCatflows] = useState<{ id: string; name: string; description?: string; status?: string }[]>([]);
  const [parentListenMode, setParentListenMode] = useState<number>(0);
  const [startTab, setStartTab] = useState<'config' | 'schedule'>('config');

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
      fetch('/api/connectors').then(r => r.json()).then(setAllConnectors).catch(() => {});
      fetch('/api/catbrains?limit=100').then(r => r.json()).then(d => setAllCatBrains(d.data || [])).catch(() => {});
    }
    if (type === 'catbrain' || type === 'project') {
      fetch('/api/catbrains?limit=100').then(r => r.json()).then(d => setCatBrains(d.data || [])).catch(() => {});
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
          setParentListenMode(canvas.listen_mode || 0);
        })
        .catch(() => {});
    }
  }, [selectedNode?.id, selectedNode?.type, canvasId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch connectors + skills linked to the selected CatPaw (base config)
  useEffect(() => {
    if (!selectedNode || selectedNode.type !== 'agent') return;
    const agentId = (selectedNode.data as Record<string, unknown>).agentId as string;
    if (agentId) {
      // Fetch base connectors
      fetch(`/api/cat-paws/${agentId}/connectors`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setPawConnectors(Array.isArray(data) ? data.map((c: Record<string, unknown>) => ({
          connector_id: c.connector_id as string,
          connector_name: c.connector_name as string || c.name as string || '',
          connector_type: c.connector_type as string || c.type as string || '',
        })) : []))
        .catch(() => setPawConnectors([]));
      // Fetch base skills + catbrains from CatPaw detail
      fetch(`/api/cat-paws/${agentId}`)
        .then(r => r.ok ? r.json() : {})
        .then((paw: Record<string, unknown>) => {
          const linkedSkills = (paw.skills as Array<{ skill_id: string }>) || [];
          setPawSkillIds(linkedSkills.map(s => s.skill_id));
          const linkedCbs = (paw.catbrains as Array<{ catbrain_id: string; catbrain_name: string; query_mode: string }>) || [];
          setPawCatBrainIds(linkedCbs.map(cb => ({ id: cb.catbrain_id, name: cb.catbrain_name || cb.catbrain_id, query_mode: cb.query_mode || 'rag' })));
        })
        .catch(() => { setPawSkillIds([]); setPawCatBrainIds([]); });
    } else {
      setPawConnectors([]);
      setPawSkillIds([]);
      setPawCatBrainIds([]);
    }
    setShowConnectorPicker(false);
    setShowSkillPicker(false);
    setShowCatBrainPicker(false);
  }, [selectedNode?.id, (selectedNode?.data as Record<string, unknown>)?.agentId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!canvasId) return;
    setParentListenMode(newValue);
    // Update node data so the badge renders immediately
    update({ listen_mode: newValue });
    // PATCH canvas directly
    try {
      await fetch(`/api/canvas/${canvasId}`, {
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
    const schedConfig = (data.schedule_config as CanvasScheduleConfig) || { is_active: false, type: 'interval', interval_value: 60, interval_unit: 'minutes' };
    const schedActive = schedConfig.is_active;

    const updateSchedule = (changes: Partial<CanvasScheduleConfig>) => {
      const newConfig = { ...schedConfig, ...changes };
      update({ schedule_config: newConfig });
      // Persist status to canvas
      if (canvasId) {
        const newStatus = newConfig.is_active ? 'scheduled' : 'idle';
        fetch(`/api/canvas/${canvasId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }).catch(() => {});
      }
    };

    const nextExec = schedActive ? calculateCanvasNextExecution(schedConfig) : null;

    return (
      <div className="space-y-3">
        {/* Tabs */}
        <div className="flex border-b border-zinc-800">
          <button
            className={`flex-1 text-xs py-1.5 border-b-2 transition-colors ${startTab === 'config' ? 'border-violet-500 text-violet-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setStartTab('config')}
          >
            {t('nodeConfig.start.tabConfig')}
          </button>
          <button
            className={`flex-1 text-xs py-1.5 border-b-2 transition-colors ${startTab === 'schedule' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setStartTab('schedule')}
          >
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {t('nodeConfig.start.tabSchedule')}
              {schedActive && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
            </span>
          </button>
        </div>

        {startTab === 'config' && (
          <>
            {/* Listen mode toggle */}
            {canvasId && (
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
          </>
        )}

        {startTab === 'schedule' && (
          <div className="space-y-3">
            {/* Auto-execute toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/30">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <div>
                  <span className="text-xs text-zinc-300 font-medium">{t('nodeConfig.start.scheduleToggle')}</span>
                  <p className="text-[10px] text-zinc-500">{t('nodeConfig.start.scheduleToggleHelp')}</p>
                </div>
              </div>
              <button
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  schedActive ? 'bg-amber-500' : 'bg-zinc-700'
                }`}
                onClick={() => updateSchedule({ is_active: !schedActive })}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    schedActive ? 'translate-x-[18px]' : 'translate-x-[2px]'
                  }`}
                />
              </button>
            </div>

            {schedActive && (
              <>
                {/* Frequency type */}
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.start.scheduleType')}</label>
                  <select
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                    value={schedConfig.type}
                    onChange={e => updateSchedule({ type: e.target.value as CanvasScheduleConfig['type'] })}
                  >
                    <option value="interval">{t('nodeConfig.start.typeInterval')}</option>
                    <option value="weekly">{t('nodeConfig.start.typeWeekly')}</option>
                    <option value="cron">{t('nodeConfig.start.typeCron')}</option>
                    <option value="dates">{t('nodeConfig.start.typeDates')}</option>
                  </select>
                </div>

                {/* Interval */}
                {schedConfig.type === 'interval' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.start.intervalEvery')}</label>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                        value={schedConfig.interval_value ?? 60}
                        onChange={e => updateSchedule({ interval_value: Math.max(1, Number(e.target.value)) })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">&nbsp;</label>
                      <select
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                        value={schedConfig.interval_unit || 'minutes'}
                        onChange={e => updateSchedule({ interval_unit: e.target.value as 'minutes' | 'hours' | 'days' })}
                      >
                        <option value="minutes">{t('nodeConfig.start.unitMinutes')}</option>
                        <option value="hours">{t('nodeConfig.start.unitHours')}</option>
                        <option value="days">{t('nodeConfig.start.unitDays')}</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Weekly */}
                {schedConfig.type === 'weekly' && (
                  <>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.start.weeklyDays')}</label>
                      <div className="flex gap-1">
                        {['S','M','T','W','T','F','S'].map((label, idx) => {
                          const selected = (schedConfig.days || []).includes(idx);
                          return (
                            <button
                              key={idx}
                              className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                                selected ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                              }`}
                              onClick={() => {
                                const current = schedConfig.days || [];
                                const next = selected ? current.filter(d => d !== idx) : [...current, idx].sort();
                                updateSchedule({ days: next });
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.start.weeklyTime')}</label>
                      <input
                        type="time"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                        value={schedConfig.time || '09:00'}
                        onChange={e => updateSchedule({ time: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {/* Cron */}
                {schedConfig.type === 'cron' && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.start.cronExpression')}</label>
                    <input
                      type="text"
                      className={`w-full bg-zinc-800 border rounded-lg px-3 py-2 text-sm text-zinc-100 font-mono focus:outline-none ${
                        schedConfig.cron_expression && !isValidCron(schedConfig.cron_expression) ? 'border-red-500' : 'border-zinc-700 focus:border-zinc-500'
                      }`}
                      placeholder="0 9 * * 1-5"
                      value={schedConfig.cron_expression || ''}
                      onChange={e => updateSchedule({ cron_expression: e.target.value })}
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">{t('nodeConfig.start.cronHelp')}</p>
                  </div>
                )}

                {/* Specific dates */}
                {schedConfig.type === 'dates' && (
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.start.specificDates')}</label>
                    <div className="space-y-1.5">
                      {(schedConfig.specific_dates || []).map((d, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <input
                            type="datetime-local"
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-zinc-500"
                            value={d.slice(0, 16)}
                            onChange={e => {
                              const dates = [...(schedConfig.specific_dates || [])];
                              dates[idx] = new Date(e.target.value).toISOString();
                              updateSchedule({ specific_dates: dates });
                            }}
                          />
                          <button
                            className="p-1 text-zinc-500 hover:text-red-400"
                            onClick={() => {
                              const dates = (schedConfig.specific_dates || []).filter((_, i) => i !== idx);
                              updateSchedule({ specific_dates: dates });
                            }}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                        onClick={() => {
                          const dates = [...(schedConfig.specific_dates || []), new Date().toISOString()];
                          updateSchedule({ specific_dates: dates });
                        }}
                      >
                        <Plus className="w-3 h-3" />
                        {t('nodeConfig.start.addDate')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Next execution preview */}
                <div className="p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <p className="text-[10px] text-zinc-500">{t('nodeConfig.start.nextExecution')}</p>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    {nextExec
                      ? nextExec.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                      : t('nodeConfig.start.noScheduledExecution')}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderAgentForm() {
    const extraSkillIds = (data.skills as string[]) || []; // canvas-only extras
    const extraConnectorIds = (data.extraConnectors as string[]) || []; // canvas-only extras
    const extraCatBrainIds = (data.extraCatBrains as string[]) || []; // canvas-only extras
    const agentId = (data.agentId as string) || '';

    // Combined sets for deduplication in pickers
    const allConnectorIds = new Set(pawConnectors.map(c => c.connector_id).concat(extraConnectorIds));
    const allSkillIds = new Set(pawSkillIds.concat(extraSkillIds));
    const allCatBrainIds = new Set(pawCatBrainIds.map(cb => cb.id).concat(extraCatBrainIds));

    // Group skills by category
    const skillsByCategory: Record<string, Skill[]> = {};
    for (const s of skills) {
      const cat = s.category || 'other';
      if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
      skillsByCategory[cat].push(s);
    }
    const sortedCategories = SKILL_CATEGORY_ORDER.filter(c => skillsByCategory[c]?.length > 0);
    for (const c of Object.keys(skillsByCategory)) {
      if (!sortedCategories.includes(c)) sortedCategories.push(c);
    }

    return (
      <div className="space-y-4">
        {/* Agent + Model row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.agent.agent')}</label>
            <select
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={agentId}
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
        </div>

        {/* Instructions */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.agent.instructions')}</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-vertical focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder={t('nodeConfig.agent.instructionsPlaceholder')}
            value={(data.instructions as string) || ''}
            onChange={e => update({ instructions: e.target.value })}
          />
        </div>

        {/* Connectors section — base (CatPaw, read-only) + extras (Canvas, editable) */}
        {agentId && (
          <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Plug className="w-3 h-3" /> Conectores ({pawConnectors.length + extraConnectorIds.length})
              </span>
              <button
                onClick={() => { setShowConnectorPicker(!showConnectorPicker); setShowSkillPicker(false); }}
                className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                <Plus className="w-3 h-3 inline -mt-0.5 mr-0.5" />Vincular
              </button>
            </div>
            {(pawConnectors.length > 0 || extraConnectorIds.length > 0) ? (
              <div className="flex flex-wrap gap-1.5">
                {/* Base connectors from CatPaw — no X button */}
                {pawConnectors.map(c => (
                  <span key={c.connector_id} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${CONNECTOR_TYPE_COLORS[c.connector_type] || 'border-zinc-700 text-zinc-400 bg-zinc-800/50'}`}>
                    {c.connector_name}
                  </span>
                ))}
                {/* Extra connectors added in Canvas — with X button */}
                {extraConnectorIds.map(cid => {
                  const conn = allConnectors.find(c => c.id === cid);
                  if (!conn) return null;
                  return (
                    <span key={cid} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-dashed ${CONNECTOR_TYPE_COLORS[conn.type || ''] || 'border-zinc-700 text-zinc-400 bg-zinc-800/50'}`}>
                      {conn.name}
                      <button onClick={() => update({ extraConnectors: extraConnectorIds.filter(id => id !== cid) })} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600">Sin conectores vinculados</p>
            )}
            {showConnectorPicker && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-h-[150px] overflow-y-auto">
                {allConnectors.filter(c => !allConnectorIds.has(c.id)).map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      update({ extraConnectors: [...extraConnectorIds, c.id] });
                      setShowConnectorPicker(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors flex items-center justify-between"
                  >
                    <span className="text-zinc-300">{c.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${CONNECTOR_TYPE_COLORS[c.type || ''] || 'border-zinc-700 text-zinc-500'}`}>{c.type}</span>
                  </button>
                ))}
                {allConnectors.filter(c => !allConnectorIds.has(c.id)).length === 0 && (
                  <p className="px-3 py-2 text-xs text-zinc-600">Todos los conectores ya vinculados</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Skills section — base (CatPaw, read-only) + extras (Canvas, editable) */}
        {(skills.length > 0 || pawSkillIds.length > 0) && (
          <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Skills ({pawSkillIds.length + extraSkillIds.length})
              </span>
              <button
                onClick={() => { setShowSkillPicker(!showSkillPicker); setShowConnectorPicker(false); }}
                className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                <Plus className="w-3 h-3 inline -mt-0.5 mr-0.5" />Vincular
              </button>
            </div>
            {(pawSkillIds.length > 0 || extraSkillIds.length > 0) ? (
              <div className="flex flex-wrap gap-1.5">
                {/* Base skills from CatPaw — no X button */}
                {pawSkillIds.map(sid => {
                  const skill = skills.find(s => s.id === sid);
                  if (!skill) return null;
                  const cat = skill.category || 'other';
                  return (
                    <span key={sid} className={`inline-flex items-center text-[11px] px-2 py-1 rounded-full border ${SKILL_CATEGORY_COLORS[cat] || 'border-zinc-700 text-zinc-400 bg-zinc-800/50'}`}>
                      {skill.name}
                    </span>
                  );
                })}
                {/* Extra skills added in Canvas — with X button, dashed border */}
                {extraSkillIds.map(sid => {
                  const skill = skills.find(s => s.id === sid);
                  if (!skill) return null;
                  const cat = skill.category || 'other';
                  return (
                    <span key={sid} className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-dashed ${SKILL_CATEGORY_COLORS[cat] || 'border-zinc-700 text-zinc-400 bg-zinc-800/50'}`}>
                      {skill.name}
                      <button onClick={() => update({ skills: extraSkillIds.filter(id => id !== sid) })} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600">Sin skills vinculadas</p>
            )}
            {showSkillPicker && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-h-[200px] overflow-y-auto">
                {sortedCategories.map(cat => {
                  const catSkills = (skillsByCategory[cat] || []).filter(s => !allSkillIds.has(s.id));
                  if (catSkills.length === 0) return null;
                  return (
                    <div key={cat}>
                      <div className={`px-3 py-1 text-[10px] font-medium uppercase tracking-wider sticky top-0 bg-zinc-900 border-b border-zinc-800 ${SKILL_CATEGORY_COLORS[cat]?.split(' ')[1] || 'text-zinc-500'}`}>
                        {SKILL_CATEGORY_LABELS[cat] || cat}
                      </div>
                      {catSkills.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            update({ skills: [...extraSkillIds, s.id] });
                            setShowSkillPicker(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors flex items-center justify-between"
                        >
                          <span className="text-zinc-300">{s.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SKILL_CATEGORY_COLORS[cat] || 'border-zinc-700 text-zinc-500'}`}>
                            {SKILL_CATEGORY_LABELS[cat] || cat}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
                {skills.filter(s => !allSkillIds.has(s.id)).length === 0 && (
                  <p className="px-3 py-2 text-xs text-zinc-600">Todas las skills ya vinculadas</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* CatBrains section — base (CatPaw, read-only) + extras (Canvas, editable) */}
        {(pawCatBrainIds.length > 0 || allCatBrains.length > 0) && agentId && (
          <div className="border border-zinc-800 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                <Image src="/Images/icon/ico_catbrain.png" alt="" width={12} height={12} /> CatBrains ({pawCatBrainIds.length + extraCatBrainIds.length})
              </span>
              <button
                onClick={() => { setShowCatBrainPicker(!showCatBrainPicker); setShowConnectorPicker(false); setShowSkillPicker(false); }}
                className="text-[10px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                <Plus className="w-3 h-3 inline -mt-0.5 mr-0.5" />Vincular
              </button>
            </div>
            {(pawCatBrainIds.length > 0 || extraCatBrainIds.length > 0) ? (
              <div className="flex flex-wrap gap-1.5">
                {/* Base CatBrains from CatPaw — no X */}
                {pawCatBrainIds.map(cb => (
                  <span key={cb.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-violet-500/30 text-violet-400 bg-violet-500/10">
                    {cb.name}
                    <span className="text-[9px] text-violet-400/60 ml-0.5">{cb.query_mode}</span>
                  </span>
                ))}
                {/* Extra CatBrains from Canvas — with X */}
                {extraCatBrainIds.map(cbId => {
                  const cb = allCatBrains.find(c => c.id === cbId);
                  if (!cb) return null;
                  return (
                    <span key={cbId} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border border-dashed border-violet-500/30 text-violet-400 bg-violet-500/10">
                      {cb.name}
                      <button onClick={() => update({ extraCatBrains: extraCatBrainIds.filter(id => id !== cbId) })} className="hover:text-red-400 ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-600">Sin CatBrains vinculados</p>
            )}
            {showCatBrainPicker && (
              <div className="bg-zinc-900 border border-zinc-700 rounded-lg max-h-[150px] overflow-y-auto">
                {allCatBrains.filter(cb => !allCatBrainIds.has(cb.id)).map(cb => (
                  <button
                    key={cb.id}
                    onClick={() => {
                      update({ extraCatBrains: [...extraCatBrainIds, cb.id] });
                      setShowCatBrainPicker(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-800 transition-colors flex items-center justify-between"
                  >
                    <span className="text-zinc-300">{cb.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-500/30 text-violet-400">RAG</span>
                  </button>
                ))}
                {allCatBrains.filter(cb => !allCatBrainIds.has(cb.id)).length === 0 && (
                  <p className="px-3 py-2 text-xs text-zinc-600">Todos los CatBrains ya vinculados</p>
                )}
              </div>
            )}
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
    const selectedConnector = connectors.find(c => c.id === (data.connectorId as string));
    const isDrive = selectedConnector?.type === 'google_drive';

    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.connector')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.connectorId as string) || ''}
            onChange={e => {
              const connector = connectors.find(c => c.id === e.target.value);
              update({
                connectorId: e.target.value || null,
                connectorName: connector?.name || null,
                ...(connector?.type !== 'google_drive' ? {
                  drive_operation: null, drive_folder_id: null, drive_file_id: null, drive_file_name: null,
                } : {}),
              });
            }}
          >
            <option value="">{t('nodeConfig.connector.noConnector')}</option>
            {connectors.map(c => (
              <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
            ))}
          </select>
        </div>

        {!isDrive && (
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
        )}

        {isDrive && (
          <>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.operation')}</label>
              <select
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
                value={(data.drive_operation as string) || 'upload'}
                onChange={e => update({ drive_operation: e.target.value })}
              >
                <option value="upload">{t('nodeConfig.connector.operationUpload')}</option>
                <option value="download">{t('nodeConfig.connector.operationDownload')}</option>
                <option value="list">{t('nodeConfig.connector.operationList')}</option>
                <option value="create_folder">{t('nodeConfig.connector.operationCreateFolder')}</option>
              </select>
            </div>

            {((data.drive_operation as string) || 'upload') !== 'download' && (
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">
                  {t('nodeConfig.connector.folderId')} <span className="text-zinc-600">({t('nodeConfig.merge.optional')})</span>
                </label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                  placeholder="root"
                  value={(data.drive_folder_id as string) || ''}
                  onChange={e => update({ drive_folder_id: e.target.value })}
                />
              </div>
            )}

            {(data.drive_operation as string) === 'download' && (
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.fileId')}</label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                  placeholder="Google Drive file ID"
                  value={(data.drive_file_id as string) || ''}
                  onChange={e => update({ drive_file_id: e.target.value })}
                />
              </div>
            )}

            {((data.drive_operation as string) === 'upload' || (data.drive_operation as string) === 'create_folder' || !(data.drive_operation as string)) && (
              <div className="col-span-2">
                <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.connector.fileName')}</label>
                <input
                  type="text"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-xs"
                  placeholder={((data.drive_operation as string) === 'create_folder') ? 'Mi Carpeta' : 'output.md'}
                  value={(data.drive_file_name as string) || ''}
                  onChange={e => update({ drive_file_name: e.target.value })}
                />
              </div>
            )}
          </>
        )}

        {!isDrive && (
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
        )}
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

  function renderIteratorForm() {
    const limitMode = (data.limit_mode as string) || 'none';
    const hasPair = !!(data.iteratorEndId as string);

    return (
      <div className="space-y-3">
        {/* Separator (how to parse array) */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.iterator.separator')}</label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
            placeholder="JSON auto | \\n | , | ;"
            value={(data.separator as string) || ''}
            onChange={e => update({ separator: e.target.value })}
          />
          <p className="text-[10px] text-zinc-500 mt-1">
            {t('nodeConfig.iterator.separatorHelp')}
          </p>
        </div>

        {/* Limit mode */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.iterator.limitMode')}</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={limitMode}
            onChange={e => update({ limit_mode: e.target.value })}
          >
            <option value="none">{t('nodeConfig.iterator.limitNone')}</option>
            <option value="rounds">{t('nodeConfig.iterator.limitRounds')}</option>
            <option value="time">{t('nodeConfig.iterator.limitTime')}</option>
          </select>
        </div>

        {/* Max rounds */}
        {limitMode === 'rounds' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.iterator.maxRounds')}</label>
            <input
              type="number"
              min={1}
              max={1000}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.max_rounds as number) || 10}
              onChange={e => update({ max_rounds: Math.max(1, Math.min(1000, Number(e.target.value))) })}
            />
          </div>
        )}

        {/* Max time */}
        {limitMode === 'time' && (
          <div>
            <label className="block text-xs text-zinc-400 mb-1">{t('nodeConfig.iterator.maxTime')}</label>
            <input
              type="number"
              min={10}
              max={7200}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
              value={(data.max_time as number) || 300}
              onChange={e => update({ max_time: Math.max(10, Math.min(7200, Number(e.target.value))) })}
            />
            <p className="text-[10px] text-zinc-500 mt-1">{t('nodeConfig.iterator.maxTimeHelp')}</p>
          </div>
        )}

        {/* Pair status + Generate button */}
        <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/30">
          <div className="flex items-center gap-2 mb-2">
            <CornerDownLeft className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-xs font-medium text-rose-300">{t('nodeConfig.iterator.pairTitle')}</span>
          </div>
          {hasPair ? (
            <div className="text-xs text-rose-200/80">{t('nodeConfig.iterator.pairLinked')}</div>
          ) : (
            <>
              <p className="text-[10px] text-zinc-400 mb-2">{t('nodeConfig.iterator.pairHelp')}</p>
              <button
                className="w-full px-3 py-1.5 text-xs font-medium text-rose-200 bg-rose-800/40 hover:bg-rose-800/60 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                onClick={() => onGenerateIteratorEnd?.(activeNode.id)}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('nodeConfig.iterator.generateEnd')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderIteratorEndForm() {
    const pairedIteratorId = (data.iteratorId as string) || '';

    return (
      <div className="space-y-3">
        <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/30">
          <div className="flex items-center gap-2 mb-2">
            <Repeat className="w-3.5 h-3.5 text-rose-400" />
            <span className="text-xs font-medium text-rose-300">{t('nodeConfig.iteratorEnd.pairTitle')}</span>
          </div>
          {pairedIteratorId ? (
            <div className="text-xs text-rose-200/80">{t('nodeConfig.iteratorEnd.pairLinked')}</div>
          ) : (
            <div className="text-xs text-zinc-500 italic">{t('nodeConfig.iteratorEnd.noPair')}</div>
          )}
        </div>
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          {t('nodeConfig.iteratorEnd.description')}
        </p>
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
    iterator:      renderIteratorForm,
    iterator_end:  renderIteratorEndForm,
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
