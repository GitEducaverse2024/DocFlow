"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Project } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Bot, Save, AlertTriangle, Trash2, Database, History, RotateCcw, Plus, X } from 'lucide-react';
import { AgentListSelector } from '@/components/agents/agent-list-selector';
import { toast } from 'sonner';
import { DeleteProjectDialog } from './delete-project-dialog';
import { AgentCreator } from '@/components/agents/agent-creator';

interface ProjectSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onProjectUpdate: () => void;
  onDelete: () => void;
}

interface ProjectStats {
  sources_count: number;
  sources_by_type: { type: string; count: number }[];
  versions_count: number;
  rag_enabled: number;
  rag_collection: string | null;
  vectors_count: number | null;
  embedding_model: string | null;
  disk_size: string;
  last_processing_agent: string | null;
  last_processing_at: string | null;
  bot_info: { name: string; id: string; has_workspace: boolean } | null;
  created_at: string;
  updated_at: string;
}

export function ProjectSettingsSheet({ open, onOpenChange, project, onProjectUpdate, onDelete }: ProjectSettingsSheetProps) {
  const t = useTranslations('projectSettings');

  // Form state
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [purpose, setPurpose] = useState(project.purpose || '');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [defaultModel, setDefaultModel] = useState(project.default_model || '');
  const [agentId, setAgentId] = useState(project.agent_id || '');

  // Data state
  const [agents, setAgents] = useState<{ id: string; name: string; emoji: string; model: string; description?: string }[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [stats, setStats] = useState<ProjectStats | null>(null);

  // UI state
  const [saving, setSaving] = useState(false);
  const [showAgentDialog, setShowAgentDialog] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(project.agent_id || 'none');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [resettingStatus, setResettingStatus] = useState(false);
  const [cleaningHistory, setCleaningHistory] = useState(false);
  const [deletingRag, setDeletingRag] = useState(false);

  // Parse tech_stack on mount
  useEffect(() => {
    if (project.tech_stack) {
      try {
        const parsed = JSON.parse(project.tech_stack);
        setTechStack(Array.isArray(parsed) ? parsed : []);
      } catch {
        setTechStack([]);
      }
    }
  }, [project.tech_stack]);

  // Reset form when project changes
  useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
    setPurpose(project.purpose || '');
    setDefaultModel(project.default_model || '');
    setAgentId(project.agent_id || '');
  }, [project]);

  // Fetch data when sheet opens
  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
      try {
        const [agentsRes, healthRes, statsRes] = await Promise.all([
          fetch('/api/cat-paws'),
          fetch('/api/health'),
          fetch(`/api/catbrains/${project.id}/stats`),
        ]);
        if (agentsRes.ok) setAgents(await agentsRes.json());
        if (healthRes.ok) {
          const data = await healthRes.json();
          if (data.litellm?.models) setModels(data.litellm.models);
        }
        if (statsRes.ok) setStats(await statsRes.json());
      } catch (e) {
        console.error('Error fetching settings data:', e);
      }
    };
    fetchData();
  }, [open, project.id]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !techStack.includes(tag)) {
      setTechStack(prev => [...prev, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTechStack(prev => prev.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t('toast.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          purpose: purpose.trim() || null,
          tech_stack: techStack.length > 0 ? techStack : null,
          agent_id: agentId || null,
          default_model: defaultModel || null,
        }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      toast.success(t('toast.saved'));
      onProjectUpdate();
    } catch {
      toast.error(t('toast.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleAgentSelect = () => {
    const newId = selectedAgent === 'none' ? '' : selectedAgent;
    setAgentId(newId);
    setShowAgentDialog(false);
  };

  const handleResetStatus = async () => {
    setResettingStatus(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toast.statusReset'));
      onProjectUpdate();
    } catch {
      toast.error(t('toast.statusResetError'));
    } finally {
      setResettingStatus(false);
    }
  };

  const handleCleanHistory = async () => {
    if (!confirm(t('danger.cleanHistoryConfirm'))) return;
    setCleaningHistory(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}/process/clean`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toast.historyCleaned'));
      onProjectUpdate();
      // Update stats
      setStats(prev => prev ? { ...prev, versions_count: 0 } : prev);
    } catch {
      toast.error(t('toast.historyCleanError'));
    } finally {
      setCleaningHistory(false);
    }
  };

  const handleDeleteRag = async () => {
    if (!confirm(t('danger.deleteRagConfirm'))) return;
    setDeletingRag(true);
    try {
      const res = await fetch(`/api/catbrains/${project.id}/rag`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toast.ragDeleted'));
      onProjectUpdate();
      setStats(prev => prev ? { ...prev, rag_enabled: 0, rag_collection: null } : prev);
    } catch {
      toast.error(t('toast.ragDeleteError'));
    } finally {
      setDeletingRag(false);
    }
  };

  const handleDeleteProject = async () => {
    try {
      const res = await fetch(`/api/catbrains/${project.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error');
      toast.success(t('toast.catbrainDeleted'));
      onDelete();
    } catch {
      toast.error(t('toast.catbrainDeleteError'));
    }
  };

  const currentAgent = agents.find(a => a.id === agentId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-zinc-500';
      case 'sources_added': return 'bg-blue-500';
      case 'processing': return 'bg-amber-500';
      case 'processed': return 'bg-emerald-500';
      case 'rag_indexed': return 'bg-violet-500';
      default: return 'bg-zinc-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return t('statusLabels.draft');
      case 'sources_added': return t('statusLabels.sources_added');
      case 'processing': return t('statusLabels.processing');
      case 'processed': return t('statusLabels.processed');
      case 'rag_indexed': return t('statusLabels.rag_indexed');
      default: return status;
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-lg w-full bg-zinc-950 border-zinc-800 flex flex-col p-0">
          <SheetHeader className="p-6 pb-4 border-b border-zinc-800">
            <SheetTitle className="text-lg text-zinc-50">{t('title')}</SheetTitle>
            <SheetDescription className="text-zinc-400 text-sm">
              {t('subtitle')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Section: Información básica */}
            <section className="space-y-4 pb-6 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">{t('sections.basicInfo')}</h3>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">{t('fields.name')}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50"
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">{t('fields.description')}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50 resize-none h-20"
                    placeholder={t('fields.descriptionPlaceholder')}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">{t('fields.purpose')}</Label>
                  <Textarea
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="bg-zinc-900 border-zinc-800 text-zinc-50 resize-none h-20"
                    placeholder={t('fields.purposePlaceholder')}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">{t('fields.techStack')}</Label>
                  <div className="flex gap-2 mb-2 flex-wrap">
                    {techStack.map(tag => (
                      <Badge key={tag} variant="secondary" className="bg-zinc-800 text-zinc-300 border-0 gap-1">
                        {tag}
                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-400 ml-0.5">
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder={t('fields.techStackPlaceholder')}
                      className="bg-zinc-900 border-zinc-800 text-zinc-50 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddTag}
                      disabled={!tagInput.trim()}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Agente IA */}
            <section className="space-y-3 pb-6 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">{t('sections.agent')}</h3>
              {currentAgent ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 p-2.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <span className="text-xl">{currentAgent.emoji}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-50 text-sm truncate">{currentAgent.name}</p>
                      <p className="text-xs text-zinc-500">{currentAgent.model}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSelectedAgent(agentId || 'none'); setShowAgentDialog(true); }}
                    className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 flex-shrink-0"
                  >
                    {t('agent.change')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Bot className="w-6 h-6 text-zinc-600 flex-shrink-0" />
                  <p className="text-sm text-zinc-400 flex-1">{t('agent.noAgent')}</p>
                  <Button
                    size="sm"
                    onClick={() => { setSelectedAgent('none'); setShowAgentDialog(true); }}
                    className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white flex-shrink-0"
                  >
                    {t('agent.assign')}
                  </Button>
                </div>
              )}
            </section>

            {/* Section: Modelo por defecto */}
            <section className="space-y-3 pb-6 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">{t('sections.defaultModel')}</h3>
              <p className="text-xs text-zinc-500">{t('model.hint')}</p>
              <Select value={defaultModel || '_none_'} onValueChange={(v) => setDefaultModel(!v || v === '_none_' ? '' : v)}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 text-zinc-50">
                  <SelectValue placeholder={t('model.useAgentModel')} />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                  <SelectItem value="_none_">{t('model.useAgentModel')}</SelectItem>
                  {models.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {/* Section: Estado del CatBrain */}
            <section className="space-y-3 pb-6 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">{t('sections.status')}</h3>
              <div className="flex items-center justify-between">
                <Badge className={`${getStatusColor(project.status || 'draft')} text-white border-0`}>
                  {getStatusLabel(project.status || 'draft')}
                </Badge>
                {project.status !== 'draft' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetStatus}
                    disabled={resettingStatus}
                    className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    {resettingStatus ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />}
                    {t('resetStatus')}
                  </Button>
                )}
              </div>
            </section>

            {/* Section: Datos del CatBrain */}
            <section className="space-y-3 pb-6 border-b border-zinc-800/50">
              <h3 className="text-sm font-medium text-zinc-300 uppercase tracking-wider">{t('sections.data')}</h3>
              {stats ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.created')}</p>
                      <p className="text-zinc-300">{new Date(stats.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.lastModified')}</p>
                      <p className="text-zinc-300">{new Date(stats.updated_at).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.sources')}</p>
                      <p className="text-zinc-300">{stats.sources_count}</p>
                      {stats.sources_by_type.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {stats.sources_by_type.map(s => (
                            <span key={s.type} className="text-[10px] bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">
                              {s.type}: {s.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.versionsProcessed')}</p>
                      <p className="text-zinc-300">{stats.versions_count}</p>
                    </div>
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.disk')}</p>
                      <p className="text-zinc-300">{stats.disk_size}</p>
                    </div>
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.rag')}</p>
                      <p className="text-zinc-300">{stats.rag_enabled ? t('stats.ragIndexed') : t('stats.ragNotIndexed')}</p>
                    </div>
                  </div>

                  {/* RAG details */}
                  {stats.rag_collection && (
                    <div className="bg-zinc-900 rounded-lg p-3 space-y-1.5">
                      <p className="text-xs text-zinc-500">{t('stats.ragCollection')}</p>
                      <p className="text-zinc-300 text-xs font-mono truncate">{stats.rag_collection}</p>
                      <div className="flex gap-4 mt-1">
                        {stats.vectors_count !== null && (
                          <span className="text-xs text-zinc-400">{t('stats.vectors', { count: stats.vectors_count.toLocaleString() })}</span>
                        )}
                        {stats.embedding_model && (
                          <span className="text-xs text-zinc-500">{t('stats.model', { model: stats.embedding_model })}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Last processing */}
                  {stats.last_processing_at && (
                    <div className="bg-zinc-900 rounded-lg p-3">
                      <p className="text-xs text-zinc-500">{t('stats.lastProcessing')}</p>
                      <p className="text-zinc-300 text-xs">
                        {new Date(stats.last_processing_at).toLocaleString()}
                        {stats.last_processing_agent && (
                          <span className="text-zinc-500 ml-2">· {t('stats.agent', { name: stats.last_processing_agent })}</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Bot info */}
                  {stats.bot_info && (
                    <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
                      <p className="text-xs text-violet-400 font-medium">{t('stats.linkedBot')}</p>
                      <p className="text-zinc-300 text-sm mt-1">{stats.bot_info.name}</p>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">{stats.bot_info.id}</p>
                      {stats.bot_info.has_workspace && (
                        <span className="inline-block text-[10px] bg-green-500/10 text-green-400 rounded px-1.5 py-0.5 mt-1.5">{t('stats.workspaceActive')}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                </div>
              )}
            </section>

            {/* Section: Zona peligrosa */}
            <section className="space-y-3 border border-red-500/20 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {t('sections.danger')}
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-300">{t('danger.deleteCatBrain')}</p>
                    <p className="text-xs text-zinc-500">{t('danger.deleteCatBrainDesc')}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    {t('danger.delete')}
                  </Button>
                </div>

                <div className="border-t border-red-500/10 pt-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-300">{t('danger.cleanHistory')}</p>
                    <p className="text-xs text-zinc-500">{t('danger.cleanHistoryDesc')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCleanHistory}
                    disabled={cleaningHistory || (stats?.versions_count ?? 0) === 0}
                    className="bg-transparent border-red-500/20 text-red-400 hover:bg-red-500/10 flex-shrink-0"
                  >
                    {cleaningHistory ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <History className="w-4 h-4 mr-1.5" />}
                    {t('danger.clean')}
                  </Button>
                </div>

                <div className="border-t border-red-500/10 pt-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-300">{t('danger.deleteRag')}</p>
                    <p className="text-xs text-zinc-500">{t('danger.deleteRagDesc')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteRag}
                    disabled={deletingRag || !stats?.rag_enabled}
                    className="bg-transparent border-red-500/20 text-red-400 hover:bg-red-500/10 flex-shrink-0"
                  >
                    {deletingRag ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Database className="w-4 h-4 mr-1.5" />}
                    {t('danger.deleteRag')}
                  </Button>
                </div>
              </div>
            </section>
          </div>

          {/* Sticky save button */}
          <div className="sticky bottom-0 p-4 border-t border-zinc-800 bg-zinc-950">
            <Button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {t('save')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Agent selection dialog */}
      <Dialog open={showAgentDialog} onOpenChange={setShowAgentDialog}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-xl text-zinc-50">{t('agent.selectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[60vh] overflow-y-auto pr-2">
            {agents.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                {t('agent.noAgentsAvailable')}
              </div>
            ) : (
              <AgentListSelector
                agents={agents}
                value={selectedAgent}
                onValueChange={setSelectedAgent}
                idPrefix="settings-agent"
              >
                <AgentCreator
                  projectName={project.name}
                  projectDescription={project.description || undefined}
                  projectPurpose={project.purpose || undefined}
                  projectTechStack={project.tech_stack}
                  models={models}
                  onAgentCreated={(agent) => {
                    setAgents(prev => [...prev, { ...agent, description: agent.description || '' }]);
                    setSelectedAgent(agent.id);
                  }}
                />
              </AgentListSelector>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button
              variant="outline"
              onClick={() => setShowAgentDialog(false)}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
            >
              {t('agent.cancel')}
            </Button>
            <Button
              onClick={handleAgentSelect}
              className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
            >
              {t('agent.select')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete project dialog */}
      <DeleteProjectDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        projectName={project.name}
        onConfirm={handleDeleteProject}
      />
    </>
  );
}
