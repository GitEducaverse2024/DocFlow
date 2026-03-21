"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, Loader2, Copy, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const SECTIONS = [
  'navigation',
  'projects',
  'sources',
  'processing',
  'rag',
  'chat',
  'agents',
  'workers',
  'skills',
  'tasks',
  'canvas',
  'connectors',
  'catbot',
  'dashboard',
  'settings',
] as const;

export function TestAiGenerator() {
  const t = useTranslations('testing');
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string>(SECTIONS[0]);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    setGeneratedCode('');
    setError('');

    try {
      const res = await fetch('/api/testing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }

      const data = await res.json();
      setGeneratedCode(data.code || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('aiGenerator.generateError'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setGeneratedCode('');
      setError('');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        {t('aiGenerator.trigger')}
      </DialogTrigger>

      <DialogContent className="bg-zinc-900 border border-zinc-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">
            {t('aiGenerator.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Section selector */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              {t('aiGenerator.section')}
            </label>
            <select
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500 capitalize"
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {generating ? t('aiGenerator.generating') : t('aiGenerator.generate')}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-950/40 border border-red-500/20 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Generated code */}
          {generatedCode && (
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-zinc-400 font-medium">
                  {t('aiGenerator.generatedCode')}
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  {copied ? t('aiGenerator.copied') : t('aiGenerator.copy')}
                </button>
              </div>
              <div className="rounded-md bg-zinc-950 border border-zinc-800 p-3 max-h-80 overflow-auto">
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                  <code>{generatedCode}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Close button */}
          <div className="flex justify-end">
            <button
              onClick={() => handleOpenChange(false)}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
            >
              {t('aiGenerator.close')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
