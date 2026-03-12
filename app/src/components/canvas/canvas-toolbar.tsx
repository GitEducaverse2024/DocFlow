"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid, Play, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CanvasToolbarProps {
  canvasId: string;
  canvasName?: string;
  onNameChange?: (name: string) => void;
  saveStatus?: 'saved' | 'saving' | 'unsaved';
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'unsaved') => void;
}

export function CanvasToolbar({
  canvasId,
  canvasName = '',
  onNameChange,
  saveStatus = 'saved',
}: CanvasToolbarProps) {
  const [localName, setLocalName] = useState(canvasName);

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
    saveStatus === 'saved' ? 'Guardado' :
    saveStatus === 'saving' ? 'Guardando...' :
    'Sin guardar';

  const dotColor =
    saveStatus === 'saved' ? 'bg-emerald-500' :
    saveStatus === 'saving' ? 'bg-violet-500 animate-pulse' :
    'bg-amber-500';

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
          placeholder="Sin nombre"
        />
      </div>

      {/* Center section — save status */}
      <div className="flex items-center gap-1.5 text-sm text-zinc-400">
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span>{saveLabel}</span>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-zinc-100 gap-1.5"
          onClick={() => {/* Plan 03 wires dagre layout */}}
        >
          <LayoutGrid className="w-4 h-4" />
          Auto-organizar
        </Button>
        <Button
          size="sm"
          className="bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
          disabled
        >
          <Play className="w-4 h-4" />
          Ejecutar
        </Button>
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
