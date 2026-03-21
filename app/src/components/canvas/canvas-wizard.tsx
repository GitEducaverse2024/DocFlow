"use client";

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Bot, Layers, FileText, ChevronLeft, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'sonner';

interface CanvasWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
  initialMode?: 'agents' | 'catbrains' | 'projects' | 'mixed' | 'template';
  initialTemplateId?: string;
}

interface CanvasTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  preview_svg: string | null;
  times_used: number;
}

type ModeType = 'agents' | 'catbrains' | 'projects' | 'mixed' | 'template';

const PRESET_EMOJIS = ['🔷', '🚀', '📊', '🤖', '📝', '⚡', '🎯', '🔄', '📋', '💡', '🛠️', '⭐'];

const MODE_CARDS_STATIC = [
  {
    mode: 'agents' as ModeType,
    labelKey: 'wizard.modeAgents' as const,
    descKey: 'wizard.modeAgentsDesc' as const,
    icon: Bot,
    color: 'violet',
    borderHover: 'hover:border-violet-500/50',
    iconClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
  },
  {
    mode: 'catbrains' as ModeType,
    labelKey: 'wizard.modeCatBrains' as const,
    descKey: 'wizard.modeCatBrainsDesc' as const,
    icon: null,
    color: 'violet',
    borderHover: 'hover:border-violet-500/50',
    iconClass: 'text-violet-400',
    bgClass: 'bg-violet-500/10',
  },
  {
    mode: 'mixed' as ModeType,
    labelKey: 'wizard.modeMixed' as const,
    descKey: 'wizard.modeMixedDesc' as const,
    icon: Layers,
    color: 'emerald',
    borderHover: 'hover:border-emerald-500/50',
    iconClass: 'text-emerald-400',
    bgClass: 'bg-emerald-500/10',
  },
  {
    mode: 'template' as ModeType,
    labelKey: 'wizard.modeTemplate' as const,
    descKey: 'wizard.modeTemplateDesc' as const,
    icon: FileText,
    color: 'amber',
    borderHover: 'hover:border-amber-500/50',
    iconClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
  },
];

function resetState() {
  return {
    step: 1 as 1 | 2,
    mode: null as ModeType | null,
    selectedTemplateId: null as string | null,
    name: '',
    description: '',
    emoji: '🔷',
    tags: '',
    loading: false,
    templates: [] as CanvasTemplate[],
  };
}

export function CanvasWizard({ open, onClose, onCreated, initialMode, initialTemplateId }: CanvasWizardProps) {
  const t = useTranslations('canvas');
  const [state, setState] = useState(resetState());

  // Reset on close
  useEffect(() => {
    if (!open) {
      setState(resetState());
    }
  }, [open]);

  // Auto-advance if initialMode is provided
  useEffect(() => {
    if (open && initialMode) {
      setState(prev => ({
        ...prev,
        mode: initialMode,
        step: 2,
        selectedTemplateId: initialTemplateId || null,
      }));
      if (initialMode === 'template') {
        fetchTemplates(initialTemplateId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, initialTemplateId]);

  async function fetchTemplates(preSelectId?: string) {
    try {
      const res = await fetch('/api/canvas/templates');
      if (res.ok) {
        const data = await res.json();
        setState(prev => {
          const targetId = preSelectId || prev.selectedTemplateId;
          if (targetId) {
            const found = data.find((tk: CanvasTemplate) => tk.id === targetId);
            if (found) {
              return { ...prev, templates: data, selectedTemplateId: targetId, name: found.name };
            }
          }
          return { ...prev, templates: data };
        });
      }
    } catch {
      // ignore
    }
  }

  function handleSelectMode(mode: ModeType) {
    setState(prev => ({ ...prev, mode, step: 2 }));
    if (mode === 'template') {
      fetchTemplates();
    }
  }

  function handleBack() {
    setState(prev => ({ ...prev, step: 1, selectedTemplateId: null }));
  }

  async function handleSubmit() {
    if (!state.name.trim()) return;
    setState(prev => ({ ...prev, loading: true }));

    const tagsArray = state.tags
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    try {
      let res: Response;

      if (state.mode === 'template' && state.selectedTemplateId) {
        res = await fetch('/api/canvas/from-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: state.selectedTemplateId,
            name: state.name.trim(),
            description: state.description.trim() || null,
            emoji: state.emoji,
            tags: tagsArray,
          }),
        });
      } else {
        res = await fetch('/api/canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.name.trim(),
            description: state.description.trim() || null,
            emoji: state.emoji,
            mode: state.mode === 'template' ? 'agents' : state.mode,
            tags: tagsArray,
          }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('toasts.createError'));
      }

      const data = await res.json();
      onCreated(data.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toasts.createError');
      toast.error(message);
    } finally {
      setState(prev => ({ ...prev, loading: false }));
    }
  }

  const canSubmit = state.name.trim().length > 0 && !state.loading;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800 text-zinc-50">
        <DialogHeader>
          <DialogTitle className="text-zinc-50">
            {state.step === 1 ? t('wizard.titleStep1') : t('wizard.titleStep2')}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {state.step === 1
              ? t('wizard.descriptionStep1')
              : t('wizard.descriptionStep2')}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Mode selection */}
        {state.step === 1 && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            {MODE_CARDS_STATIC.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.mode}
                  onClick={() => handleSelectMode(card.mode)}
                  className={`flex flex-col items-start gap-2 p-4 rounded-lg bg-zinc-900 border border-zinc-800 ${card.borderHover} transition-colors text-left`}
                >
                  <div className={`p-2 rounded-lg ${card.bgClass}`}>
                    {Icon ? <Icon className={`w-5 h-5 ${card.iconClass}`} /> : <Image src="/Images/icon/ico_catbrain.png" alt="CatBrain" width={20} height={20} />}
                  </div>
                  <div>
                    <p className="font-medium text-zinc-200 text-sm">{t(card.labelKey)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-tight">{t(card.descKey)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Details */}
        {state.step === 2 && (
          <div className="mt-2 space-y-4">
            {/* Template selection */}
            {state.mode === 'template' && !state.selectedTemplateId && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-zinc-300">{t('wizard.selectTemplate')}</p>
                {state.templates.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500 text-sm bg-zinc-900 rounded-lg border border-zinc-800">
                    {t('wizard.noTemplates')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1">
                    {state.templates.map(tmpl => (
                      <button
                        key={tmpl.id}
                        onClick={() => setState(prev => ({ ...prev, selectedTemplateId: tmpl.id, name: tmpl.name }))}
                        className="flex items-start gap-3 p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg transition-colors text-left"
                      >
                        <span className="text-2xl">{tmpl.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-zinc-200 text-sm font-medium truncate">{tmpl.name}</p>
                          {tmpl.description && (
                            <p className="text-zinc-500 text-xs line-clamp-1 mt-0.5">{tmpl.description}</p>
                          )}
                          <p className="text-zinc-600 text-xs mt-1">{t('list.uses', { count: tmpl.times_used })}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Form — show always unless in template mode waiting for selection */}
            {(state.mode !== 'template' || state.selectedTemplateId) && (
              <>
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">
                    {t('wizard.canvasName')} <span className="text-red-400">*</span>
                  </label>
                  <Input
                    value={state.name}
                    onChange={e => setState(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('wizard.canvasNamePlaceholder')}
                    className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder-zinc-500 focus:border-violet-500"
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">{t('wizard.descriptionOptional')}</label>
                  <Textarea
                    value={state.description}
                    onChange={e => setState(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t('wizard.descriptionPlaceholder')}
                    className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder-zinc-500 focus:border-violet-500 resize-none"
                    rows={2}
                  />
                </div>

                {/* Emoji picker */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">{t('wizard.emoji')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_EMOJIS.map(em => (
                      <button
                        key={em}
                        onClick={() => setState(prev => ({ ...prev, emoji: em }))}
                        className={`w-9 h-9 text-lg rounded-md border transition-colors ${
                          state.emoji === em
                            ? 'border-violet-500 bg-violet-500/20'
                            : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                    <Input
                      value={state.emoji}
                      onChange={e => setState(prev => ({ ...prev, emoji: e.target.value }))}
                      className="w-16 h-9 bg-zinc-900 border-zinc-700 text-zinc-50 text-center p-1 text-lg"
                      maxLength={2}
                      title={t('wizard.customEmojiTitle')}
                    />
                  </div>
                </div>

                {/* Tags */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">{t('wizard.tags')}</label>
                  <Input
                    value={state.tags}
                    onChange={e => setState(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder={t('wizard.tagsPlaceholder')}
                    className="bg-zinc-900 border-zinc-700 text-zinc-50 placeholder-zinc-500 focus:border-violet-500"
                  />
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                onClick={handleBack}
                className="bg-transparent border-zinc-700 text-zinc-400 hover:text-zinc-50"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                {t('wizard.back')}
              </Button>
              {(state.mode !== 'template' || state.selectedTemplateId) && (
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white disabled:opacity-50"
                >
                  {state.loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('wizard.createAndOpen')}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
