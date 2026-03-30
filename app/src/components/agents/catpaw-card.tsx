"use client";

import { type ReactNode } from 'react';
import { CatPawWithCounts } from '@/lib/types/catpaw';
import {
  Brain, Plug, Users, Sparkles, MessageSquare,
  Crown, Briefcase, Megaphone, TrendingUp, Wrench, Truck, User, Grid3X3,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CatPawCardProps {
  paw: CatPawWithCounts;
  onClick?: () => void;
  onChat?: () => void;
  highlight?: string;
}

const modeBadgeStyles: Record<string, string> = {
  chat: 'bg-violet-500/20 text-violet-400 border border-violet-500/30',
  processor: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
  hybrid: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
};

type Department = 'direction' | 'business' | 'marketing' | 'finance' | 'production' | 'logistics' | 'hr' | 'personal' | 'other';
type GroupKey = 'empresa' | 'personal' | 'otros';

const DEPT_GROUP: Record<Department, GroupKey> = {
  direction: 'empresa', business: 'empresa', marketing: 'empresa',
  finance: 'empresa', production: 'empresa', logistics: 'empresa', hr: 'empresa',
  personal: 'personal', other: 'otros',
};

const GROUP_BADGE_STYLES: Record<GroupKey, string> = {
  empresa: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  personal: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  otros: 'bg-zinc-700/50 text-zinc-400 border-zinc-700',
};

const DEPT_ICONS: Record<Department, typeof Crown> = {
  direction: Crown, business: Briefcase, marketing: Megaphone,
  finance: TrendingUp, production: Wrench, logistics: Truck, hr: Users,
  personal: User, other: Grid3X3,
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

/** Highlight matching text with yellow mark */
function highlightText(text: string, query: string): ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <>
      {before}
      <mark className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{match}</mark>
      {after}
    </>
  );
}

export function CatPawCard({ paw, onClick, onChat, highlight }: CatPawCardProps) {
  const t = useTranslations('agents');
  const modeBg = modeBadgeStyles[paw.mode] || modeBadgeStyles.chat;
  const departments = parseDepartmentTags(paw.department_tags);

  // Department badge
  const dept = (paw.department || 'other') as Department;
  const groupKey = DEPT_GROUP[dept] || 'otros';
  const DeptIcon = DEPT_ICONS[dept] || Grid3X3;
  const badgeStyle = GROUP_BADGE_STYLES[groupKey];

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
          <h3 className="font-semibold text-zinc-50 truncate">
            {highlight ? highlightText(paw.name, highlight) : paw.name}
          </h3>
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

      {/* Department badge + model + tags */}
      <div className="flex flex-wrap gap-1.5">
        {/* Department badge */}
        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border ${badgeStyle}`}>
          <DeptIcon className="w-3 h-3" />
          {t(`department.${dept}`)}
        </span>
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
