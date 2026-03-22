"use client";

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid, Play, Settings, Undo2, Redo2, Square, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExecutionState {
  isExecuting: boolean;
  completedSteps: number;
  totalSteps: number;
  elapsedSeconds: number;
  runId: string | null;
}

interface CanvasToolbarProps {
  canvasId: string;
  canvasName?: string;
  onNameChange?: (name: string) => void;
  saveStatus?: 'saved' | 'saving' | 'unsaved';
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onAutoLayout?: () => void;
  executionState?: ExecutionState;
  onExecute?: () => void;
  onCancel?: () => void;
  isScheduled?: boolean;
  onScheduleClick?: () => void;
}

export function CanvasToolbar({
  canvasId,
  canvasName = '',
  onNameChange,
  saveStatus = 'saved',
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onAutoLayout,
  executionState,
  onExecute,
  onCancel,
  isScheduled,
  onScheduleClick,
}: CanvasToolbarProps) {
  const [localName, setLocalName] = useState(canvasName);
  const t = useTranslations('canvas');

  // Sync localName when canvasName prop changes (initial load)
  if (localName === '' && canvasName !== '') {
    setLocalName(canvasName);
  }

  async function handleNameBlur() {
    if (localName !== canvasName) {
      try {
        await fetch(`/api/canvas/${canvasId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: localName }),
        });
        onNameChange?.(localName);
      } catch {
        // ignore save errors
      }
    }
  }

  const saveLabel =
    saveStatus === 'saved' ? t('toolbar.saved') :
    saveStatus === 'saving' ? t('toolbar.saving') :
    t('toolbar.unsaved');

  const dotColor =
    saveStatus === 'saved' ? 'bg-emerald-500' :
    saveStatus === 'saving' ? 'bg-violet-500 animate-pulse' :
    'bg-amber-500';

  const isExecuting = executionState?.isExecuting ?? false;
  const completedSteps = executionState?.completedSteps ?? 0;
  const totalSteps = executionState?.totalSteps ?? 0;
  const elapsedSeconds = executionState?.elapsedSeconds ?? 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800 sticky top-0 z-10 h-16">
      {/* Left section */}
      <div className="flex items-center gap-2 flex-1">
        <Link href="/canvas">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-zinc-100 h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <input
          type="text"
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="bg-transparent text-white font-semibold text-lg border-none outline-none focus:ring-1 focus:ring-violet-500 rounded px-2 min-w-0 flex-1 max-w-[300px]"
          placeholder={t('toolbar.namePlaceholder')}
        />
      </div>

      {/* Center section — undo/redo + save status OR execution progress */}
      <div className="flex items-center gap-2">
        {isExecuting ? (
          /* Execution progress display */
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="text-sm text-violet-300">
              {t('toolbar.executingStep', { completed: completedSteps, total: totalSteps, elapsed: elapsedSeconds })}
            </span>
          </div>
        ) : (
          /* Normal undo/redo + save status */
          <>
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-zinc-100 h-8 w-8 disabled:opacity-30"
              onClick={onUndo}
              disabled={!canUndo}
              title={t('toolbar.undoTitle')}
            >
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-zinc-100 h-8 w-8 disabled:opacity-30"
              onClick={onRedo}
              disabled={!canRedo}
              title={t('toolbar.redoTitle')}
            >
              <Redo2 className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 ml-1">
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span>{saveLabel}</span>
            </div>
            {isScheduled && (
              <button
                className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 ml-1 hover:bg-amber-500/20 transition-colors"
                onClick={onScheduleClick}
                title={t('toolbar.scheduledTooltip')}
              >
                <Clock className="w-3 h-3" />
                {t('toolbar.scheduled')}
              </button>
            )}
          </>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {!isExecuting && (
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-400 hover:text-zinc-100 gap-1.5"
            onClick={onAutoLayout}
          >
            <LayoutGrid className="w-4 h-4" />
            {t('toolbar.autoLayout')}
          </Button>
        )}
        {isExecuting ? (
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            onClick={onCancel}
          >
            <Square className="w-4 h-4" />
            {t('toolbar.cancel')}
          </Button>
        ) : (
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            onClick={onExecute}
          >
            <Play className="w-4 h-4" />
            {t('toolbar.execute')}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-zinc-400 hover:text-zinc-100 h-8 w-8"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
