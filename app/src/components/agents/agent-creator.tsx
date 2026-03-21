"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, RotateCcw, Pencil, Check, Copy, Terminal, Zap, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import type { Skill } from '@/lib/types';

interface ModelGroup {
  provider: string;
  name: string;
  models: string[];
}

interface AgentCreatorProps {
  projectName: string;
  projectDescription?: string;
  projectPurpose?: string;
  projectTechStack?: string | string[] | null;
  models?: string[];
  onAgentCreated: (agent: { id: string; name: string; emoji: string; model: string; description: string }) => void;
}

interface GeneratedConfig {
  name: string;
  emoji: string;
  description: string;
  soul: string;
  agents: string;
  identity: string;
}

type CreationMode = 'manual' | 'from-skill' | 'ai-generate';

/** Banner that shows after agent creation with auto-restart countdown */
function CreationResultBanner({ result }: {
  result: { status: string; message?: string; warning?: string; restartCommand?: string };
}) {
  const t = useTranslations('agents');
  const [countdown, setCountdown] = useState(60);
  const isPending = result.status === 'created_pending_restart';

  useEffect(() => {
    if (!isPending) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPending]);

  if (result.status === 'active') {
    return (
      <div className="rounded-lg p-4 border bg-emerald-500/10 border-emerald-500/20">
        <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
          <Check className="w-4 h-4" />
          {result.message || t('creator.result.createdActive')}
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="rounded-lg p-4 space-y-3 border bg-violet-500/10 border-violet-500/20">
        <div className="flex items-center gap-2 text-violet-400 text-sm font-medium">
          {countdown > 0 ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          {countdown > 0
            ? t('creator.result.createdPending', { countdown })
            : t('creator.result.createdRestarted')
          }
        </div>
        {result.restartCommand && (
          <div className="flex items-center gap-2">
            <p className="text-[10px] text-zinc-500 flex-shrink-0">{t('creator.result.ifNotActive')}</p>
            <code className="flex-1 bg-zinc-950 rounded px-2 py-1 text-[10px] text-zinc-400 font-mono truncate">
              {result.restartCommand}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="text-zinc-500 hover:text-zinc-300 h-6 w-6 p-0 flex-shrink-0"
              onClick={() => {
                if (copyToClipboard(result.restartCommand!)) {
                  toast.success(t('creator.result.commandCopied'));
                } else {
                  toast.error(t('creator.result.copyError'));
                }
              }}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Fallback for other statuses (created_no_openclaw, etc.)
  return (
    <div className="rounded-lg p-4 space-y-2 border bg-amber-500/10 border-amber-500/20">
      <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
        <Terminal className="w-4 h-4" />
        {result.warning || result.message || t('creator.result.createdGeneric')}
      </div>
    </div>
  );
}

export function AgentCreator({
  projectName,
  projectDescription,
  projectPurpose,
  projectTechStack,
  models: legacyModels,
  onAgentCreated,
}: AgentCreatorProps) {
  const t = useTranslations('agents');
  const [mode, setMode] = useState<CreationMode | null>(null);

  // Common fields
  const [agentName, setAgentName] = useState(projectName ? `${t('creator.aiGenerate.expertIn', { name: projectName })}` : '');
  const [agentEmoji, setAgentEmoji] = useState('🤖');
  const [agentDesc, setAgentDesc] = useState(projectPurpose || '');
  const [agentModel, setAgentModel] = useState('');
  const [agentProvider, setAgentProvider] = useState('');

  // Model groups
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Skills (for from-skill mode)
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedConfig | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSoul, setEditSoul] = useState('');
  const [editAgents, setEditAgents] = useState('');
  const [editIdentity, setEditIdentity] = useState('');

  // Creation state
  const [creating, setCreating] = useState(false);
  const [creationResult, setCreationResult] = useState<{
    status: string;
    message?: string;
    warning?: string;
    restartCommand?: string;
  } | null>(null);

  // Fetch model groups on mount
  useEffect(() => {
    setLoadingModels(true);
    fetch('/api/settings/models')
      .then(res => res.ok ? res.json() : [])
      .then((groups: ModelGroup[]) => {
        setModelGroups(groups);
        if (!agentModel && groups.length > 0 && groups[0].models.length > 0) {
          setAgentModel(groups[0].models[0]);
          setAgentProvider(groups[0].provider);
        }
      })
      .catch(() => setModelGroups([]))
      .finally(() => setLoadingModels(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch skills when from-skill mode is selected
  useEffect(() => {
    if (mode !== 'from-skill' || skills.length > 0) return;
    setLoadingSkills(true);
    fetch('/api/skills')
      .then(res => res.ok ? res.json() : [])
      .then((data: Skill[]) => setSkills(data))
      .catch(() => setSkills([]))
      .finally(() => setLoadingSkills(false));
  }, [mode, skills.length]);

  const handleModelChange = (value: string) => {
    if (!value) return;
    const [provider, model] = value.includes('::') ? value.split('::') : ['litellm', value];
    setAgentModel(model);
    setAgentProvider(provider);
  };

  const currentSelectValue = agentProvider && agentModel ? `${agentProvider}::${agentModel}` : agentModel;
  const hasManagedModels = modelGroups.length > 0;
  const flatLegacy = legacyModels && legacyModels.length > 0 ? legacyModels : [];
  const selectedSkill = skills.find(s => s.id === selectedSkillId) || null;

  // ---- AI GENERATE ----
  const handleGenerate = async () => {
    if (!agentModel) { toast.error(t('creator.toasts.selectModelFirst')); return; }
    setGenerating(true);
    setGenerated(null);
    setEditing(false);
    try {
      let techStack;
      try {
        techStack = Array.isArray(projectTechStack) ? projectTechStack : projectTechStack ? JSON.parse(projectTechStack) : null;
      } catch { techStack = null; }

      const payload: Record<string, unknown> = {
        projectName,
        projectDescription,
        projectPurpose,
        projectTechStack: techStack,
        agentName,
        agentDescription: agentDesc,
        model: agentModel,
        provider: agentProvider || 'litellm',
      };

      if (mode === 'from-skill' && selectedSkill) {
        payload.mode = 'from-skill';
        payload.skillName = selectedSkill.name;
        payload.skillDescription = selectedSkill.description;
        payload.skillInstructions = selectedSkill.instructions;
      }

      const res = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t('creator.toasts.generateError'));
      }

      const data: GeneratedConfig = await res.json();
      setGenerated(data);
      if (data.name) setAgentName(data.name);
      if (data.emoji) setAgentEmoji(data.emoji);
      if (data.description) setAgentDesc(data.description);
      setEditSoul(data.soul);
      setEditAgents(data.agents);
      setEditIdentity(data.identity);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  // ---- CREATE AGENT ----
  const handleCreate = async () => {
    if (!agentName.trim() || !agentModel) return;
    setCreating(true);
    try {
      const payload: Record<string, string | undefined> = {
        name: agentName.trim(),
        emoji: agentEmoji || '🤖',
        model: agentModel,
        description: agentDesc.trim(),
      };

      if (generated) {
        payload.soul = editing ? editSoul : generated.soul;
        payload.agents = editing ? editAgents : generated.agents;
        payload.identity = editing ? editIdentity : generated.identity;
      }

      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(t('creator.toasts.createError'));
      const created = await res.json();

      setCreationResult({
        status: created.status,
        message: created.message,
        warning: created.warning,
        restartCommand: created.restartCommand,
      });

      // Silent AI refinement for manual mode
      if (mode === 'manual' && !generated && agentModel) {
        fetch('/api/agents/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'refine',
            agentName: agentName.trim(),
            agentDescription: agentDesc.trim(),
            projectName,
            projectPurpose,
            projectTechStack,
            model: agentModel,
            provider: agentProvider || 'litellm',
          }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(refined => {
            if (refined?.soul || refined?.agents) {
              fetch(`/api/agents/${created.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  soul: refined.soul || undefined,
                  agents: refined.agents || undefined,
                }),
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      if (created.status === 'active') {
        toast.success(t('creator.toasts.createdActive'), { description: created.message });
      } else if (created.warning) {
        toast.success(t('creator.toasts.created'), { description: created.warning, duration: 8000 });
      } else {
        toast.success(t('creator.toasts.createdName', { name: created.name }));
      }

      onAgentCreated(created);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const soulPreview = generated
    ? (editing ? editSoul : generated.soul).split('\n').slice(0, 3).join('\n')
    : '';

  // ---- MODE SELECTOR ----
  const modeCards: { key: CreationMode; icon: typeof PenLine; label: string; desc: string }[] = [
    { key: 'manual', icon: PenLine, label: t('creator.modes.manual'), desc: t('creator.modes.manualDesc') },
    { key: 'from-skill', icon: Zap, label: t('creator.modes.fromSkill'), desc: t('creator.modes.fromSkillDesc') },
    { key: 'ai-generate', icon: Sparkles, label: t('creator.modes.aiGenerate'), desc: t('creator.modes.aiGenerateDesc') },
  ];

  // ---- MODEL SELECTOR (shared) ----
  const renderModelSelector = () => (
    <div>
      <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.model')}</Label>
      {loadingModels ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {t('creator.fields.loadingModels')}
        </div>
      ) : hasManagedModels ? (
        <Select value={currentSelectValue} onValueChange={(v) => v && handleModelChange(v)}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50">
            <SelectValue placeholder={t('creator.fields.selectModel')} />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
            {modelGroups.map(group => (
              <SelectGroup key={group.provider}>
                <SelectLabel className="text-zinc-500 text-xs">{group.name}</SelectLabel>
                {group.models.map(m => (
                  <SelectItem key={`${group.provider}::${m}`} value={`${group.provider}::${m}`}>
                    {m}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select value={agentModel} onValueChange={(v) => { if (v) { setAgentModel(v); setAgentProvider('litellm'); } }}>
          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50">
            <SelectValue placeholder={t('creator.fields.selectModel')} />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
            {flatLegacy.length > 0 ? (
              flatLegacy.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))
            ) : (
              <SelectItem value="gemini-main">gemini-main</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  // ---- GENERATED PREVIEW (shared) ----
  const renderGeneratedPreview = () => {
    if (!generated) return null;
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{generated.emoji || agentEmoji}</span>
            <div>
              <p className="font-semibold text-zinc-50">{agentName}</p>
              <p className="text-xs text-zinc-400">{agentDesc}</p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 border-0">
            {agentModel}
          </Badge>
        </div>

        <div className="bg-zinc-950 rounded p-3">
          <p className="text-xs text-zinc-500 mb-1">{t('creator.preview.personality')}</p>
          <p className="text-xs text-zinc-400 whitespace-pre-line line-clamp-3">{soulPreview}</p>
        </div>

        {editing && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-zinc-500 mb-1 block">{t('creator.preview.soulLabel')}</Label>
              <Textarea
                value={editSoul}
                onChange={(e) => setEditSoul(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-xs font-mono h-40 resize-y"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500 mb-1 block">{t('creator.preview.agentsLabel')}</Label>
              <Textarea
                value={editAgents}
                onChange={(e) => setEditAgents(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-xs font-mono h-40 resize-y"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-500 mb-1 block">{t('creator.preview.identityLabel')}</Label>
              <Textarea
                value={editIdentity}
                onChange={(e) => setEditIdentity(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-xs font-mono h-32 resize-y"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Mode selector cards */}
      {!creationResult && (
        <div className="grid grid-cols-3 gap-3">
          {modeCards.map(({ key, icon: Icon, label, desc }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(mode === key ? null : key);
                setGenerated(null);
                setEditing(false);
              }}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center ${
                mode === key
                  ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{label}</span>
              <span className="text-[10px] leading-tight opacity-70">{desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ====== MANUAL MODE ====== */}
      {mode === 'manual' && !creationResult && (
        <div className="space-y-3 bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.emoji')}</Label>
              <Input
                value={agentEmoji}
                onChange={(e) => setAgentEmoji(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-center text-lg"
                maxLength={4}
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.agentName')}</Label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={t('creator.fields.agentNamePlaceholder')}
                className="bg-zinc-950 border-zinc-800 text-zinc-50"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.description')}</Label>
            <Textarea
              value={agentDesc}
              onChange={(e) => setAgentDesc(e.target.value)}
              placeholder={t('creator.fields.descriptionPlaceholder')}
              className="bg-zinc-950 border-zinc-800 text-zinc-50 h-20 resize-none"
            />
          </div>
          {renderModelSelector()}

          <p className="text-[10px] text-zinc-500">
            {t('creator.manual.autoRefineNote')}
          </p>

          <Button
            onClick={handleCreate}
            disabled={creating || !agentName.trim() || !agentModel}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            {t('creator.manual.createAgent')}
          </Button>
        </div>
      )}

      {/* ====== FROM SKILL MODE ====== */}
      {mode === 'from-skill' && !creationResult && (
        <div className="space-y-3 bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fromSkill.selectSkill')}</Label>
            {loadingSkills ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> {t('creator.fromSkill.loadingSkills')}
              </div>
            ) : skills.length === 0 ? (
              <p className="text-xs text-zinc-500 py-2">{t('creator.fromSkill.noSkills')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                {skills.map(skill => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => {
                      setSelectedSkillId(skill.id === selectedSkillId ? null : skill.id);
                      if (skill.id !== selectedSkillId) {
                        if (!agentName || agentName === t('creator.aiGenerate.expertIn', { name: projectName })) setAgentName(skill.name);
                        if (!agentDesc) setAgentDesc(skill.description || '');
                      }
                    }}
                    className={`flex items-center gap-2 p-2 rounded text-left text-sm transition-colors ${
                      selectedSkillId === skill.id
                        ? 'bg-violet-500/15 border border-violet-500/30 text-violet-300'
                        : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${selectedSkillId === skill.id ? 'text-violet-400' : 'text-zinc-600'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-xs truncate">{skill.name}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{skill.description}</p>
                    </div>
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 border-0 text-[9px] flex-shrink-0">
                      {skill.category}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedSkill && (
            <>
              <div className="grid grid-cols-[60px_1fr] gap-3">
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.emoji')}</Label>
                  <Input
                    value={agentEmoji}
                    onChange={(e) => setAgentEmoji(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-50 text-center text-lg"
                    maxLength={4}
                  />
                </div>
                <div>
                  <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.agentName')}</Label>
                  <Input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder={t('creator.fields.agentNamePlaceholder')}
                    className="bg-zinc-950 border-zinc-800 text-zinc-50"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.descriptionAlt')}</Label>
                <Textarea
                  value={agentDesc}
                  onChange={(e) => setAgentDesc(e.target.value)}
                  placeholder={t('creator.fields.descriptionAltPlaceholder')}
                  className="bg-zinc-950 border-zinc-800 text-zinc-50 h-16 resize-none"
                />
              </div>
              {renderModelSelector()}

              <Button
                onClick={handleGenerate}
                disabled={generating || !agentModel}
                variant="outline"
                className="w-full bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20"
              >
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                {generating ? t('creator.fromSkill.generatingFromSkill') : t('creator.fromSkill.generateFromSkill')}
              </Button>
            </>
          )}

          {generated && !generating && (
            <>
              {renderGeneratedPreview()}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t('creator.buttons.regenerate')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> {editing ? t('creator.buttons.hideEditor') : t('creator.buttons.edit')}
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating || !agentName.trim() || !agentModel}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white ml-auto">
                  {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  {t('creator.buttons.createAgent')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ====== AI GENERATE MODE ====== */}
      {mode === 'ai-generate' && !creationResult && (
        <div className="space-y-3 bg-zinc-900/30 border border-zinc-800 rounded-lg p-4">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.emoji')}</Label>
              <Input
                value={agentEmoji}
                onChange={(e) => setAgentEmoji(e.target.value)}
                className="bg-zinc-950 border-zinc-800 text-zinc-50 text-center text-lg"
                maxLength={4}
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.agentName')}</Label>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder={t('creator.aiGenerate.expertIn', { name: projectName || 'tu proyecto' })}
                className="bg-zinc-950 border-zinc-800 text-zinc-50"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400 mb-1 block">{t('creator.fields.descriptionAlt')}</Label>
            <Textarea
              value={agentDesc}
              onChange={(e) => setAgentDesc(e.target.value)}
              placeholder={t('creator.fields.descriptionPlaceholder')}
              className="bg-zinc-950 border-zinc-800 text-zinc-50 h-20 resize-none"
            />
          </div>
          {renderModelSelector()}

          <Button
            onClick={handleGenerate}
            disabled={generating || !agentModel}
            variant="outline"
            className="w-full bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300"
          >
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {generating ? t('creator.aiGenerate.generatingWithAI') : t('creator.aiGenerate.generateWithAI')}
          </Button>

          {generated && !generating && (
            <div className="space-y-3">
              {renderGeneratedPreview()}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> {t('creator.buttons.regenerate')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}
                  className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> {editing ? t('creator.buttons.hideEditor') : t('creator.buttons.edit')}
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={creating || !agentName.trim() || !agentModel}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white ml-auto">
                  {creating ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                  {t('creator.buttons.createAgent')}
                </Button>
              </div>
            </div>
          )}

          {!generated && !generating && (
            <Button
              onClick={handleCreate}
              disabled={creating || !agentName.trim() || !agentModel}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
            >
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t('creator.aiGenerate.createWithoutGenerate')}
            </Button>
          )}
        </div>
      )}

      {/* ====== CREATION RESULT ====== */}
      {creationResult && (
        <CreationResultBanner result={creationResult} />
      )}
    </div>
  );
}
