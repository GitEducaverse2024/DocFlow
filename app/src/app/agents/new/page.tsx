"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, MessageSquare, Cog, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader } from '@/components/layout/page-header';
import Image from 'next/image';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

// --- Types ---

type Mode = 'chat' | 'processor' | 'hybrid';

interface SkillOption {
  id: string;
  name: string;
}

interface CatBrainOption {
  id: string;
  name: string;
}

interface ConnectorOption {
  id: string;
  name: string;
  type: string;
}

interface CatPawOption {
  id: string;
  name: string;
  avatar_emoji: string;
}

interface LinkedCatBrain {
  catbrain_id: string;
  query_mode: 'rag' | 'connector' | 'both';
  priority: number;
}

interface LinkedConnector {
  connector_id: string;
  usage_hint: string;
}

interface LinkedAgent {
  target_paw_id: string;
  relationship: 'collaborator' | 'delegate' | 'supervisor';
}

// --- Constants ---

const COLOR_PRESETS = [
  { name: 'violet', value: '#8B5CF6' },
  { name: 'teal', value: '#14B8A6' },
  { name: 'amber', value: '#F59E0B' },
  { name: 'rose', value: '#F43F5E' },
  { name: 'blue', value: '#3B82F6' },
  { name: 'emerald', value: '#10B981' },
];

const MODE_KEYS: Mode[] = ['chat', 'processor', 'hybrid'];
const MODE_ICONS: Record<Mode, React.ReactNode> = {
  chat: <MessageSquare className="w-5 h-5" />,
  processor: <Cog className="w-5 h-5" />,
  hybrid: <Zap className="w-5 h-5" />,
};
const MODE_COLORS: Record<Mode, string> = {
  chat: 'violet',
  processor: 'teal',
  hybrid: 'amber',
};

const TONE_KEYS = ['profesional', 'casual', 'tecnico', 'creativo', 'formal'];
const OUTPUT_FORMAT_OPTIONS = ['markdown', 'json', 'text', 'csv'];

// --- Stepper ---

function Stepper({ currentStep, stepLabels }: { currentStep: number; stepLabels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {stepLabels.map((label, i) => {
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isComplete
                    ? 'bg-violet-600 text-white'
                    : isCurrent
                    ? 'bg-violet-500/20 text-violet-400 border-2 border-violet-500'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}
              >
                {isComplete ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-xs mt-1.5 ${isCurrent || isComplete ? 'text-zinc-300' : 'text-zinc-600'}`}>
                {label}
              </span>
            </div>
            {i < stepLabels.length - 1 && (
              <div className={`w-12 h-0.5 mx-2 mb-5 ${i < currentStep ? 'bg-violet-600' : 'bg-zinc-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Mode color helpers ---

function modeColorClass(mode: Mode, selected: boolean) {
  if (!selected) return 'border-zinc-700 bg-zinc-900 hover:border-zinc-600';
  switch (mode) {
    case 'chat': return 'border-violet-500 bg-violet-500/10';
    case 'processor': return 'border-teal-500 bg-teal-500/10';
    case 'hybrid': return 'border-amber-500 bg-amber-500/10';
  }
}

// --- Main component ---

export default function NewAgentWizard() {
  const t = useTranslations('agents');
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const stepLabels = t.raw('new.steps') as string[];

  // Step 1 — Identity
  const [name, setName] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState('\uD83D\uDC31');
  const [avatarColor, setAvatarColor] = useState('#8B5CF6');
  const [departmentTags, setDepartmentTags] = useState('');
  const [mode, setMode] = useState<Mode>('chat');
  const [description, setDescription] = useState('');

  // Step 2 — Personality
  const [systemPrompt, setSystemPrompt] = useState('');
  const [tone, setTone] = useState('profesional');
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [processingInstructions, setProcessingInstructions] = useState('');
  const [outputFormat, setOutputFormat] = useState('markdown');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Step 3 — Skills
  const [availableSkills, setAvailableSkills] = useState<SkillOption[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // Step 4 — Connections
  const [availableCatBrains, setAvailableCatBrains] = useState<CatBrainOption[]>([]);
  const [linkedCatBrains, setLinkedCatBrains] = useState<LinkedCatBrain[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<ConnectorOption[]>([]);
  const [linkedConnectors, setLinkedConnectors] = useState<LinkedConnector[]>([]);
  const [availablePaws, setAvailablePaws] = useState<CatPawOption[]>([]);
  const [linkedAgents, setLinkedAgents] = useState<LinkedAgent[]>([]);

  // Fetch skills when reaching step 3
  useEffect(() => {
    if (step === 2 && availableSkills.length === 0) {
      fetch('/api/skills')
        .then((r) => r.json())
        .then((data) => {
          const skills = Array.isArray(data) ? data : data.skills || [];
          setAvailableSkills(skills);
        })
        .catch(() => {});
    }
  }, [step, availableSkills.length]);

  // Fetch connections data when reaching step 4
  useEffect(() => {
    if (step === 3) {
      Promise.all([
        fetch('/api/catbrains?limit=100').then((r) => r.json()).catch(() => []),
        fetch('/api/connectors').then((r) => r.json()).catch(() => []),
        fetch('/api/cat-paws').then((r) => r.json()).catch(() => []),
      ]).then(([cb, cn, paws]) => {
        const catbrains = Array.isArray(cb) ? cb : cb.data || cb.catbrains || [];
        setAvailableCatBrains(catbrains);
        const connectors = Array.isArray(cn) ? cn : cn.data || cn.connectors || [];
        setAvailableConnectors(connectors);
        setAvailablePaws(Array.isArray(paws) ? paws : paws.data || []);
      });
    }
  }, [step]);

  // Fetch available models on mount
  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data.models) ? data.models : [];
        setAvailableModels(list);
        if (!model) {
          const defaultModel = list.includes('gemini-main') ? 'gemini-main' : list[0] || '';
          setModel(defaultModel);
        }
      })
      .catch(() => setAvailableModels([]))
      .finally(() => setModelsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canNext = () => {
    if (step === 0) return name.trim().length > 0;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // 1. Create CatPaw
      const tags = departmentTags.split(',').map((tag) => tag.trim()).filter(Boolean);
      const pawBody = {
        name: name.trim(),
        avatar_emoji: avatarEmoji,
        avatar_color: avatarColor,
        department_tags: tags.length > 0 ? tags : null,
        mode,
        description: description.trim() || null,
        system_prompt: systemPrompt.trim() || null,
        tone,
        model,
        temperature,
        max_tokens: maxTokens,
        processing_instructions: (mode === 'processor' || mode === 'hybrid') ? processingInstructions.trim() || null : null,
        output_format: (mode === 'processor' || mode === 'hybrid') ? outputFormat : 'markdown',
      };

      const pawRes = await fetch('/api/cat-paws', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pawBody),
      });

      if (!pawRes.ok) {
        const err = await pawRes.json();
        throw new Error(err.error || t('new.toasts.createError'));
      }

      const newPaw = await pawRes.json();
      const pawId = newPaw.id;

      // 2. Link skills
      for (const skillId of selectedSkills) {
        await fetch(`/api/cat-paws/${pawId}/skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill_id: skillId }),
        });
      }

      // 3. Link catbrains
      for (const cb of linkedCatBrains) {
        await fetch(`/api/cat-paws/${pawId}/catbrains`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cb),
        });
      }

      // 4. Link connectors
      for (const cn of linkedConnectors) {
        await fetch(`/api/cat-paws/${pawId}/connectors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cn),
        });
      }

      // 5. Link agents
      for (const ag of linkedAgents) {
        await fetch(`/api/cat-paws/${pawId}/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ag),
        });
      }

      toast.success(t('new.toasts.created'));
      router.push(`/agents/${pawId}`);
    } catch (err) {
      toast.error((err as Error).message || t('new.toasts.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render helpers for each step ---

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.identity.name')}</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('new.identity.namePlaceholder')}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
        />
      </div>

      {/* Avatar Emoji + Color */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-zinc-300">{t('new.identity.emoji')}</Label>
          <Input
            value={avatarEmoji}
            onChange={(e) => setAvatarEmoji(e.target.value)}
            className="bg-zinc-900 border-zinc-800 text-zinc-50 text-2xl text-center"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-zinc-300">{t('new.identity.color')}</Label>
          <div className="flex gap-2 mt-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setAvatarColor(c.value)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  avatarColor === c.value ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Department Tags */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.identity.departments')}</Label>
        <Input
          value={departmentTags}
          onChange={(e) => setDepartmentTags(e.target.value)}
          placeholder={t('new.identity.departmentsPlaceholder')}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
        />
        <p className="text-xs text-zinc-500">{t('new.identity.departmentsHelp')}</p>
      </div>

      {/* Mode selector */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.identity.mode')}</Label>
        <div className="grid grid-cols-3 gap-3">
          {MODE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer ${modeColorClass(key, mode === key)}`}
            >
              <div className={`${mode === key ? `text-${MODE_COLORS[key]}-400` : 'text-zinc-500'}`}>
                {MODE_ICONS[key]}
              </div>
              <span className={`text-sm font-medium ${mode === key ? 'text-zinc-200' : 'text-zinc-400'}`}>
                {t(`modes.${key}`)}
              </span>
              <span className="text-xs text-zinc-500 text-center">{t(`modeDescriptions.${key}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.identity.description')}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('new.identity.descriptionPlaceholder')}
          rows={3}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500 resize-none"
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* System Prompt */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.personality.systemPrompt')}</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={t('new.personality.systemPromptPlaceholder')}
          rows={6}
          className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500 resize-none"
        />
      </div>

      {/* Tone */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.personality.tone')}</Label>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          {TONE_KEYS.map((key) => (
            <option key={key} value={key}>{t(`tones.${key}`)}</option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.personality.model')}</Label>
        {modelsLoading ? (
          <div className="flex items-center gap-2 h-9 px-3 bg-zinc-900 border border-zinc-800 rounded-md">
            <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            <span className="text-xs text-zinc-500">{t('new.personality.loadingModels')}</span>
          </div>
        ) : availableModels.length > 0 ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gemini-main"
            className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
          />
        )}
      </div>

      {/* Temperature */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.personality.temperature', { value: temperature })}</Label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          className="w-full accent-violet-500"
        />
        <div className="flex justify-between text-xs text-zinc-600">
          <span>{t('new.personality.temperaturePrecise')}</span>
          <span>{t('new.personality.temperatureCreative')}</span>
        </div>
      </div>

      {/* Max tokens */}
      <div className="space-y-2">
        <Label className="text-zinc-300">{t('new.personality.maxTokens')}</Label>
        <Input
          type="number"
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
          className="bg-zinc-900 border-zinc-800 text-zinc-50"
        />
      </div>

      {/* Processor/Hybrid fields */}
      {(mode === 'processor' || mode === 'hybrid') && (
        <>
          <div className="space-y-2">
            <Label className="text-zinc-300">{t('new.personality.processingInstructions')}</Label>
            <Textarea
              value={processingInstructions}
              onChange={(e) => setProcessingInstructions(e.target.value)}
              placeholder={t('new.personality.processingInstructionsPlaceholder')}
              rows={4}
              className="bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500 resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-300">{t('new.personality.outputFormat')}</Label>
            <select
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              {OUTPUT_FORMAT_OPTIONS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">{t('new.skills.description')}</p>
      {availableSkills.length === 0 ? (
        <p className="text-zinc-500 text-sm py-4">{t('new.skills.noSkills')}</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
          {availableSkills.map((skill) => (
            <label
              key={skill.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors"
            >
              <Checkbox
                checked={selectedSkills.includes(skill.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedSkills((prev) => [...prev, skill.id]);
                  } else {
                    setSelectedSkills((prev) => prev.filter((id) => id !== skill.id));
                  }
                }}
              />
              <span className="text-zinc-300 text-sm">{skill.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const toggleCatBrain = (id: string) => {
    setLinkedCatBrains((prev) => {
      const exists = prev.find((cb) => cb.catbrain_id === id);
      if (exists) return prev.filter((cb) => cb.catbrain_id !== id);
      return [...prev, { catbrain_id: id, query_mode: 'rag', priority: 1 }];
    });
  };

  const toggleConnector = (id: string) => {
    setLinkedConnectors((prev) => {
      const exists = prev.find((cn) => cn.connector_id === id);
      if (exists) return prev.filter((cn) => cn.connector_id !== id);
      return [...prev, { connector_id: id, usage_hint: '' }];
    });
  };

  const toggleAgent = (id: string) => {
    setLinkedAgents((prev) => {
      const exists = prev.find((ag) => ag.target_paw_id === id);
      if (exists) return prev.filter((ag) => ag.target_paw_id !== id);
      return [...prev, { target_paw_id: id, relationship: 'collaborator' }];
    });
  };

  const renderStep4 = () => (
    <div className="space-y-6">
      {/* CatBrains */}
      <details open className="group">
        <summary className="cursor-pointer text-zinc-200 font-medium text-sm flex items-center gap-2">
          CatBrains ({availableCatBrains.length}){linkedCatBrains.length > 0 && <span className="text-violet-400 text-xs ml-1">{t('new.connections.selected', { count: linkedCatBrains.length })}</span>}
        </summary>
        <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto pr-2">
          {availableCatBrains.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('new.connections.noAvailableCatBrains')}</p>
          ) : (
            availableCatBrains.map((cb) => {
              const linked = linkedCatBrains.find((l) => l.catbrain_id === cb.id);
              return (
                <div key={cb.id} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={!!linked}
                      onCheckedChange={() => toggleCatBrain(cb.id)}
                    />
                    <span className="text-zinc-300 text-sm">{cb.name}</span>
                  </label>
                  {linked && (
                    <div className="flex gap-3 pl-7">
                      <select
                        value={linked.query_mode}
                        onChange={(e) => {
                          setLinkedCatBrains((prev) =>
                            prev.map((l) => l.catbrain_id === cb.id ? { ...l, query_mode: e.target.value as LinkedCatBrain['query_mode'] } : l)
                          );
                        }}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1"
                      >
                        <option value="rag">{t('new.connections.queryMode.rag')}</option>
                        <option value="connector">{t('new.connections.queryMode.connector')}</option>
                        <option value="both">{t('new.connections.queryMode.both')}</option>
                      </select>
                      <Input
                        type="number"
                        value={linked.priority}
                        onChange={(e) => {
                          setLinkedCatBrains((prev) =>
                            prev.map((l) => l.catbrain_id === cb.id ? { ...l, priority: parseInt(e.target.value) || 1 } : l)
                          );
                        }}
                        className="w-20 bg-zinc-800 border-zinc-700 text-zinc-300 text-xs h-7"
                        placeholder={t('new.connections.priority')}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </details>

      {/* Connectors */}
      <details className="group">
        <summary className="cursor-pointer text-zinc-200 font-medium text-sm flex items-center gap-2">
          {t('card.connectors')} ({availableConnectors.length}){linkedConnectors.length > 0 && <span className="text-violet-400 text-xs ml-1">{t('new.connections.selected', { count: linkedConnectors.length })}</span>}
        </summary>
        <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto pr-2">
          {availableConnectors.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('new.connections.noAvailableConnectors')}</p>
          ) : (
            availableConnectors.map((cn) => {
              const linked = linkedConnectors.find((l) => l.connector_id === cn.id);
              return (
                <div key={cn.id} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={!!linked}
                      onCheckedChange={() => toggleConnector(cn.id)}
                    />
                    <span className="text-zinc-300 text-sm">{cn.name}</span>
                    <span className="text-xs text-zinc-500">{cn.type}</span>
                  </label>
                  {linked && (
                    <div className="pl-7">
                      <Input
                        value={linked.usage_hint}
                        onChange={(e) => {
                          setLinkedConnectors((prev) =>
                            prev.map((l) => l.connector_id === cn.id ? { ...l, usage_hint: e.target.value } : l)
                          );
                        }}
                        placeholder={t('new.connections.usageHint')}
                        className="bg-zinc-800 border-zinc-700 text-zinc-300 text-xs h-7"
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </details>

      {/* CatPaws */}
      <details className="group">
        <summary className="cursor-pointer text-zinc-200 font-medium text-sm flex items-center gap-2">
          CatPaws ({availablePaws.length}){linkedAgents.length > 0 && <span className="text-violet-400 text-xs ml-1">{t('new.connections.selected', { count: linkedAgents.length })}</span>}
        </summary>
        <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto pr-2">
          {availablePaws.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('new.connections.noAvailablePaws')}</p>
          ) : (
            availablePaws.map((paw) => {
              const linked = linkedAgents.find((l) => l.target_paw_id === paw.id);
              return (
                <div key={paw.id} className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <Checkbox
                      checked={!!linked}
                      onCheckedChange={() => toggleAgent(paw.id)}
                    />
                    <span className="text-lg">{paw.avatar_emoji}</span>
                    <span className="text-zinc-300 text-sm">{paw.name}</span>
                  </label>
                  {linked && (
                    <div className="pl-7">
                      <select
                        value={linked.relationship}
                        onChange={(e) => {
                          setLinkedAgents((prev) =>
                            prev.map((l) => l.target_paw_id === paw.id ? { ...l, relationship: e.target.value as LinkedAgent['relationship'] } : l)
                          );
                        }}
                        className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1"
                      >
                        <option value="collaborator">{t('new.connections.relationship.collaborator')}</option>
                        <option value="delegate">{t('new.connections.relationship.delegate')}</option>
                        <option value="supervisor">{t('new.connections.relationship.supervisor')}</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </details>
    </div>
  );

  const stepContent = [renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 animate-slide-up">
      <PageHeader
        title={t('new.title')}
        description={t('new.description')}
        icon={
          <Image src="/Images/icon/catpaw.png" alt="CatPaw" width={24} height={24} />
        }
      />

      <Stepper currentStep={step} stepLabels={stepLabels} />

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        {stepContent[step]()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 0) router.push('/agents');
            else setStep((s) => s - 1);
          }}
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {step === 0 ? t('new.buttons.cancel') : t('new.buttons.back')}
        </Button>

        {step < stepLabels.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            {t('new.buttons.next')}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canNext()}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            {t('new.buttons.create')}
          </Button>
        )}
      </div>
    </div>
  );
}
