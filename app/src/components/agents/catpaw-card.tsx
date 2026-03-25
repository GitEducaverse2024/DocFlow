"use client";

import { CatPawWithCounts } from '@/lib/types/catpaw';
import { Brain, Plug, Users, Sparkles, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CatPawCardProps {
  paw: CatPawWithCounts;
  onClick?: () => void;
  onChat?: () => void;
}

const modeBadgeStyles: Record<string, string> = {
  chat: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  processor: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
  hybrid: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
};

function parseDepartmentTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CatPawCard({ paw, onClick, onChat }: CatPawCardProps) {
  const t = useTranslations('agents');
  const modeBg = modeBadgeStyles[paw.mode] || modeBadgeStyles.chat;
  const departments = parseDepartmentTags(paw.department_tags);

  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer p-4 flex flex-col gap-3 ${
        !paw.is_active ? 'opacity-50' : ''
      }`}
    >
      {/* Top: emoji + name + mode badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl flex-shrink-0">{paw.avatar_emoji || '🐾'}</span>
          <h3 className="font-semibold text-zinc-50 truncate">{paw.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onChat && (
            <button
              onClick={(e) => { e.stopPropagation(); onChat(); }}
              title={t('detail.chat.openChatTooltip')}
              className="p-1.5 rounded-md text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${modeBg}`}>
            {t(`modes.${paw.mode}`)}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 line-clamp-2 min-h-[2.5rem]">
        {paw.description || t('noDescription')}
      </p>

      {/* Model + department tags */}
      <div className="flex flex-wrap gap-1.5">
        <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded-md">
          {paw.model}
        </span>
        {departments.map((tag) => (
          <span
            key={tag}
            className="bg-zinc-800/60 text-zinc-400 text-xs px-2 py-0.5 rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Bottom: relation counts */}
      <div className="flex items-center gap-4 pt-1 border-t border-zinc-800/50">
        <div className="flex items-center gap-1 text-xs text-zinc-500" title={t('card.skills')}>
          <Sparkles className="w-3.5 h-3.5" />
          <span>{paw.skills_count}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500" title={t('card.catbrains')}>
          <Brain className="w-3.5 h-3.5" />
          <span>{paw.catbrains_count}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500" title={t('card.connectors')}>
          <Plug className="w-3.5 h-3.5" />
          <span>{paw.connectors_count}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-zinc-500" title={t('card.agents')}>
          <Users className="w-3.5 h-3.5" />
          <span>{paw.agents_count}</span>
        </div>
      </div>
    </div>
  );
}
