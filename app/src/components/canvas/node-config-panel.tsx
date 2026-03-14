"use client";

import { useEffect, useState } from 'react';
import { type Node } from '@xyflow/react';
import Image from 'next/image';
import {
  Play, Bot, Plug, UserCheck, GitMerge, GitBranch, Flag,
  ChevronDown, ChevronUp,
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  model?: string;
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

const NODE_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  start:      { label: 'Inicio',      icon: <Play className="w-4 h-4" />,          color: 'text-emerald-400' },
  agent:      { label: 'Agente',      icon: <Bot className="w-4 h-4" />,           color: 'text-violet-400' },
  catbrain:   { label: 'CatBrain',    icon: <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={16} height={16} />, color: 'text-violet-400' },
  project:    { label: 'CatBrain',    icon: <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={16} height={16} />, color: 'text-violet-400' }, // backward compat
  connector:  { label: 'Conector',    icon: <Plug className="w-4 h-4" />,          color: 'text-orange-400' },
  checkpoint: { label: 'Checkpoint',  icon: <UserCheck className="w-4 h-4" />,     color: 'text-amber-400' },
  merge:      { label: 'Merge',       icon: <GitMerge className="w-4 h-4" />,      color: 'text-cyan-400' },
  condition:  { label: 'Condicion',   icon: <GitBranch className="w-4 h-4" />,     color: 'text-yellow-400' },
  output:     { label: 'Output',      icon: <Flag className="w-4 h-4" />,          color: 'text-emerald-400' },
};

export function NodeConfigPanel({ selectedNode, onNodeDataUpdate }: NodeConfigPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [catbrains, setCatBrains] = useState<CatBrain[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  // Auto-open when a different node is selected
  useEffect(() => {
    if (selectedNode) setCollapsed(false);
  }, [selectedNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch resources based on node type
  useEffect(() => {
    if (!selectedNode) return;
    const type = selectedNode.type;

    if (type === 'agent' || type === 'merge') {
      fetch('/api/agents').then(r => r.json()).then(setAgents).catch(() => {});
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
  const meta = NODE_TYPE_META[nodeType];
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
            Input inicial <span className="text-zinc-600">(opcional)</span>
          </label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500"
            rows={3}
            placeholder="Texto de entrada inicial para el flujo..."
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
          <label className="block text-xs text-zinc-400 mb-1">Agente</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.agentId as string) || ''}
            onChange={e => {
              const agent = agents.find(a => a.id === e.target.value);
              update({ agentId: e.target.value || null, agentName: agent?.name || null });
            }}
          >
            <option value="">Sin agente</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Modelo <span className="text-zinc-600">(sobrescribir)</span>
          </label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Modelo del agente"
            value={(data.model as string) || ''}
            onChange={e => update({ model: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Instrucciones</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder="Instrucciones para este nodo..."
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
            Usar RAG
          </label>
        </div>
        {skills.length > 0 && (
          <div className="col-span-2">
            <label className="block text-xs text-zinc-400 mb-1">Skills</label>
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
          <label className="block text-xs text-zinc-400 mb-1">CatBrain</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={currentId}
            onChange={e => {
              const catbrain = catbrains.find(p => p.id === e.target.value);
              update({ catbrainId: e.target.value || null, catbrainName: catbrain?.name || null });
            }}
          >
            <option value="">Sin CatBrain</option>
            {catbrains.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Max chunks</label>
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
          <label className="block text-xs text-zinc-400 mb-1">Modo</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.connector_mode as string) || 'both'}
            onChange={e => update({ connector_mode: e.target.value })}
          >
            <option value="rag">Solo RAG</option>
            <option value="connector">Solo Conectores</option>
            <option value="both">RAG + Conectores</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Consulta RAG</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder="Consulta RAG..."
            value={(data.ragQuery as string) || ''}
            onChange={e => update({ ragQuery: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Modo de entrada (desde nodo anterior)</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.input_mode as string) || 'independent'}
            onChange={e => update({ input_mode: e.target.value })}
          >
            <option value="independent">Modo A: Consulta RAG independiente</option>
            <option value="pipeline">Modo B: Pipeline secuencial (recibe contexto del anterior)</option>
          </select>
          <p className="text-[10px] text-zinc-500 mt-1">
            Modo A: ignora la salida del nodo anterior. Modo B: usa la salida como contexto adicional.
          </p>
        </div>
      </div>
    );
  }

  function renderConnectorForm() {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Conector</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.connectorId as string) || ''}
            onChange={e => {
              const connector = connectors.find(c => c.id === e.target.value);
              update({ connectorId: e.target.value || null, connectorName: connector?.name || null });
            }}
          >
            <option value="">Sin conector</option>
            {connectors.map(c => (
              <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Modo</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.mode as string) || 'after'}
            onChange={e => update({ mode: e.target.value })}
          >
            <option value="before">Antes (before)</option>
            <option value="after">Despues (after)</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-zinc-400 mb-1">Plantilla de payload JSON</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500 font-mono text-xs"
            rows={2}
            placeholder='{"key": "value"}'
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
        <label className="block text-xs text-zinc-400 mb-1">Instrucciones para el revisor</label>
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500"
          rows={4}
          placeholder="Instrucciones para el revisor humano..."
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
            Agente sintetizador <span className="text-zinc-600">(opcional)</span>
          </label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.agentId as string) || ''}
            onChange={e => update({ agentId: e.target.value || null })}
          >
            <option value="">Sin agente</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Entradas (handles)</label>
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
          <label className="block text-xs text-zinc-400 mb-1">Instrucciones de sintesis</label>
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500"
            rows={2}
            placeholder="Instrucciones de sintesis..."
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
        <label className="block text-xs text-zinc-400 mb-1">Condicion</label>
        <textarea
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500"
          rows={4}
          placeholder="Condicion en lenguaje natural, ej: 'El documento tiene mas de 500 palabras'"
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
          <label className="block text-xs text-zinc-400 mb-1">Nombre del output</label>
          <input
            type="text"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
            placeholder="Resultado"
            value={(data.outputName as string) || ''}
            onChange={e => update({ outputName: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Formato</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            value={(data.format as string) || 'markdown'}
            onChange={e => update({ format: e.target.value })}
          >
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
            <option value="plain">Texto plano</option>
          </select>
        </div>
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
  };

  const renderForm = formRenderers[nodeType];

  return (
    <div className="bg-zinc-900 border-t border-zinc-800 shadow-lg z-20 shrink-0">
      {/* Header bar -- always visible */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-zinc-800/50 select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className={meta?.color || 'text-zinc-400'}>{meta?.icon}</span>
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
          {meta?.label || nodeType}
        </span>
        <span className="text-xs text-zinc-500 ml-1">
          — {(data.label as string) || activeNode.id}
        </span>
        <button
          className="ml-auto text-zinc-500 hover:text-zinc-300"
          aria-label={collapsed ? 'Expandir panel' : 'Contraer panel'}
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Form body */}
      {!collapsed && renderForm && (
        <div className="px-4 pb-4 pt-2 max-h-[220px] overflow-y-auto">
          {renderForm()}
        </div>
      )}
    </div>
  );
}
