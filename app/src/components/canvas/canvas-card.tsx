"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Pencil, Trash2 } from 'lucide-react';

interface CanvasListItem {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  mode: 'agents' | 'catbrains' | 'projects' | 'mixed';
  status: string;
  thumbnail: string | null;
  tags: string | null;
  is_template: number;
  node_count: number;
  created_at: string;
  updated_at: string;
}

interface CanvasCardProps {
  canvas: CanvasListItem;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const MODE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  agents: { label: 'Agentes', badgeClass: 'bg-violet-500/20 text-violet-400 border-violet-500/20' },
  catbrains: { label: 'CatBrains', badgeClass: 'bg-violet-500/20 text-violet-400 border-violet-500/20' },
  projects: { label: 'CatBrains', badgeClass: 'bg-violet-500/20 text-violet-400 border-violet-500/20' }, // backward compat
  mixed: { label: 'Mixto', badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffHr < 24) return `hace ${diffHr}h`;
  if (diffDay < 30) return `hace ${diffDay}d`;
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function CanvasCard({ canvas, onEdit, onDelete }: CanvasCardProps) {
  const modeCfg = MODE_CONFIG[canvas.mode] || MODE_CONFIG.agents;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors flex flex-col overflow-hidden">
      {/* Thumbnail */}
      <div className="relative w-full h-[120px] bg-zinc-950 flex items-center justify-center overflow-hidden">
        {canvas.thumbnail ? (
          <img
            src={`data:image/svg+xml,${encodeURIComponent(canvas.thumbnail)}`}
            alt={`Vista previa de ${canvas.name}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full bg-zinc-800/50 flex items-center justify-center">
            <span className="text-4xl opacity-30">{canvas.emoji}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        {/* Name + emoji */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{canvas.emoji}</span>
          <h3 className="text-zinc-200 font-medium truncate flex-1">{canvas.name}</h3>
        </div>

        {/* Description */}
        {canvas.description && (
          <p className="text-zinc-400 text-sm line-clamp-1 mb-3">{canvas.description}</p>
        )}

        {/* Bottom row */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-800/50 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs border ${modeCfg.badgeClass}`}>
              {modeCfg.label}
            </Badge>
            <span className="text-zinc-500">{canvas.node_count || 0} nodos</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{timeAgo(canvas.updated_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3">
          <Link href={`/canvas/${canvas.id}`} className="flex-1">
            <Button
              size="sm"
              variant="outline"
              className="w-full bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 h-7"
              onClick={() => onEdit(canvas.id)}
            >
              <Pencil className="w-3 h-3 mr-1" />
              Editar
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent border-zinc-700 text-red-400 hover:bg-red-500/10 hover:border-red-500/30 h-7 px-2"
            onClick={() => onDelete(canvas.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
