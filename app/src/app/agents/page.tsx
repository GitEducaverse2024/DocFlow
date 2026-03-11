"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ExternalLink, Pencil, Trash2, FileText, Copy, Bot, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';
import { AgentCreator } from '@/components/agents/agent-creator';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Agent {
  id: string;
  name: string;
  emoji: string;
  model: string;
  description?: string | null;
  source: 'openclaw' | 'custom';
  created_at?: string;
  usage_count?: number;
  has_workspace?: boolean;
}

interface AgentFiles {
  soul: string | null;
  agents: string | null;
  identity: string | null;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit sheet
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSoul, setEditSoul] = useState('');
  const [editAgentsMd, setEditAgentsMd] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // View files dialog
  const [viewAgent, setViewAgent] = useState<Agent | null>(null);
  const [viewFiles, setViewFiles] = useState<AgentFiles | null>(null);
  const [loadingView, setLoadingView] = useState(false);

  // Connector access
  const [allConnectors, setAllConnectors] = useState<Array<{ id: string; name: string; emoji: string; type: string; is_active: number }>>([]);
  const [agentConnectorIds, setAgentConnectorIds] = useState<string[]>([]);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);

  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) setAgents(await res.json());
    } catch (e) {
      console.error('Error fetching agents:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchConnectors = async () => {
    try {
      const res = await fetch('/api/connectors');
      if (res.ok) {
        const data = await res.json();
        setAllConnectors(data.filter((c: { is_active: number }) => c.is_active === 1));
      }
    } catch (err) {
      console.error('Error fetching connectors:', err);
    }
  };

  useEffect(() => { fetchAgents(); fetchConnectors(); }, []);

  const openclawAgents = agents.filter(a => a.source === 'openclaw');
  const customAgents = agents.filter(a => a.source === 'custom');

  const handleEdit = async (agent: Agent) => {
    setEditAgent(agent);
    setEditName(agent.name);
    setEditEmoji(agent.emoji);
    setEditModel(agent.model);
    setEditDesc(agent.description || '');
    setEditSoul('');
    setEditAgentsMd('');

    // Load connector access
    setAgentConnectorIds([]);
    try {
      const accessRes = await fetch(`/api/agents/${agent.id}`);
      if (accessRes.ok) {
        const accessData = await accessRes.json();
        setAgentConnectorIds(accessData.connector_ids || []);
      }
    } catch { /* skip */ }

    // Load workspace files
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/files`);
      if (res.ok) {
        const data = await res.json();
        setEditSoul(data.soul || '');
        setEditAgentsMd(data.agents || '');
      }
    } catch { /* skip */ }
    setLoadingFiles(false);
  };

  const handleSaveEdit = async () => {
    if (!editAgent) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/agents/${editAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          emoji: editEmoji,
          model: editModel,
          description: editDesc,
          soul: editSoul,
          agents: editAgentsMd,
          connector_ids: agentConnectorIds,
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      toast.success('Agente actualizado');
      setEditAgent(null);
      fetchAgents();
    } catch {
      toast.error('Error al actualizar agente');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    if (!confirm(`¿Eliminar el agente "${agent.name}"? Se borrarán los archivos del workspace.`)) return;
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      toast.success('Agente eliminado', {
        description: `Para desregistrar de OpenClaw: ${data.openclawCommand}`,
        duration: 8000,
      });
      fetchAgents();
    } catch {
      toast.error('Error al eliminar agente');
    }
  };

  const handleViewFiles = async (agent: Agent) => {
    setViewAgent(agent);
    setViewFiles(null);
    setLoadingView(true);
    try {
      const res = await fetch(`/api/agents/${agent.id}/files`);
      if (res.ok) setViewFiles(await res.json());
    } catch { /* skip */ }
    setLoadingView(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Agentes</h1>
          <p className="text-sm text-zinc-400 mt-1">Gestiona los agentes de OpenClaw y los personalizados de DocFlow</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-violet-500 hover:bg-violet-400 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Crear agente
        </Button>
      </div>

      {/* Section A: OpenClaw Agents */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Agentes de OpenClaw</h2>
          <a
            href="http://192.168.1.49:3333/agents"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
          >
            Gestionar en Mission Control <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {openclawAgents.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <Bot className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No se encontraron agentes de OpenClaw</p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Agente</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Modelo</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Descripción</th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {openclawAgents.map(agent => (
                  <tr key={agent.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{agent.emoji || '🤖'}</span>
                        <span className="font-medium text-zinc-50 text-sm">{agent.name || agent.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-0 text-xs">
                        {agent.model}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-zinc-400 truncate max-w-[250px]">{agent.description || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs">
                        OpenClaw
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section B: Custom Agents */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Agentes personalizados</h2>

        {customAgents.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
            <Bot className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No has creado agentes personalizados aún</p>
            <Button onClick={() => setShowCreate(true)} variant="outline" size="sm" className="mt-3 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Crear agente
            </Button>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Agente</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Modelo</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Usos</th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Workspace</th>
                  <th className="text-right text-xs font-medium text-zinc-500 uppercase tracking-wider px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {customAgents.map(agent => (
                  <tr key={agent.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{agent.emoji}</span>
                        <div className="min-w-0">
                          <p className="font-medium text-zinc-50 text-sm truncate">{agent.name}</p>
                          <p className="text-xs text-zinc-500 truncate max-w-[200px]">{agent.description || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-0 text-xs">
                        {agent.model}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-sm text-zinc-400">{agent.usage_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {agent.has_workspace ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-xs">Activo</Badge>
                      ) : (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs">Sin workspace</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewFiles(agent)}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title="Ver archivos"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(agent)}
                          className="text-zinc-400 hover:text-zinc-50 h-8 w-8 p-0"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(agent)}
                          className="text-red-400 hover:text-red-300 h-8 w-8 p-0"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create Agent Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">Crear agente personalizado</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <AgentCreator
              projectName=""
              onAgentCreated={() => {
                setShowCreate(false);
                fetchAgents();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Agent Sheet */}
      <Sheet open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <SheetContent side="right" className="sm:max-w-lg w-full bg-zinc-950 border-zinc-800 flex flex-col p-0">
          <SheetHeader className="p-6 pb-4 border-b border-zinc-800">
            <SheetTitle className="text-lg text-zinc-50">Editar agente</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-[60px_1fr] gap-3">
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Emoji</Label>
                <Input
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50 text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">Nombre</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-zinc-900 border-zinc-800 text-zinc-50"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Modelo</Label>
              <Input
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-zinc-50"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">Descripción</Label>
              <Textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="bg-zinc-900 border-zinc-800 text-zinc-50 h-20 resize-none"
              />
            </div>

            {loadingFiles ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando archivos del workspace...
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">SOUL.md — Personalidad</Label>
                  <Textarea
                    value={editSoul}
                    onChange={(e) => setEditSoul(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50 text-xs font-mono h-40 resize-y"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">AGENTS.md — Instrucciones operativas</Label>
                  <Textarea
                    value={editAgentsMd}
                    onChange={(e) => setEditAgentsMd(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50 text-xs font-mono h-40 resize-y"
                  />
                </div>
              </>
            )}

            {/* Conectores disponibles (CACCESS-01) */}
            {allConnectors.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-medium text-zinc-300">Conectores disponibles</Label>
                <div className="space-y-2">
                  {allConnectors.map(connector => (
                    <label key={connector.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-800/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agentConnectorIds.includes(connector.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAgentConnectorIds(prev => [...prev, connector.id]);
                          } else {
                            setAgentConnectorIds(prev => prev.filter(id => id !== connector.id));
                          }
                        }}
                        className="rounded border-zinc-600"
                      />
                      <span className="text-lg">{connector.emoji}</span>
                      <div>
                        <div className="text-sm text-zinc-200">{connector.name}</div>
                        <div className="text-xs text-zinc-500">{connector.type}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 p-4 border-t border-zinc-800 bg-zinc-950">
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit || !editName.trim()}
              className="w-full bg-violet-500 hover:bg-violet-400 text-white"
            >
              {savingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />}
              Guardar cambios
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* View Files Dialog */}
      <Dialog open={!!viewAgent} onOpenChange={(open) => { if (!open) setViewAgent(null); }}>
        <DialogContent className="max-w-3xl w-[90vw] max-h-[80vh] bg-zinc-950 border-zinc-800 flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg text-zinc-50 flex items-center gap-2">
              <span className="text-xl">{viewAgent?.emoji}</span>
              {viewAgent?.name} — Archivos del workspace
            </DialogTitle>
          </DialogHeader>

          {loadingView ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : viewFiles ? (
            <Tabs defaultValue="soul" className="flex-1 flex flex-col min-h-0">
              <TabsList className="bg-zinc-900 border-zinc-800">
                <TabsTrigger value="soul">SOUL.md</TabsTrigger>
                <TabsTrigger value="agents">AGENTS.md</TabsTrigger>
                <TabsTrigger value="identity">IDENTITY.md</TabsTrigger>
              </TabsList>
              {(['soul', 'agents', 'identity'] as const).map(key => (
                <TabsContent key={key} value={key} className="flex-1 overflow-y-auto mt-0">
                  {viewFiles[key] ? (
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-50 z-10"
                        onClick={() => {
                          if (copyToClipboard(viewFiles[key]!)) {
                            toast.success('Contenido copiado');
                          } else {
                            toast.error('No se pudo copiar');
                          }
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <div className="p-4 prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {viewFiles[key]!}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-zinc-500 text-sm">
                      Archivo no encontrado
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="p-8 text-center text-zinc-500 text-sm">
              No se encontró el workspace de este agente
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
