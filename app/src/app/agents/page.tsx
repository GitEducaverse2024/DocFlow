"use client";

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Plus, Loader2, Search, ChevronRight,
  Building2, User, Grid3X3,
  Crown, Briefcase, Megaphone, TrendingUp, Wrench, Truck, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/page-header';
import { CatPawCard } from '@/components/agents/catpaw-card';
import { CatPawChatSheet } from '@/components/agents/catpaw-chat-sheet';
import { CatPawWithCounts } from '@/lib/types/catpaw';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type ModeFilter = 'all' | 'chat' | 'processor' | 'hybrid';

const MODE_KEYS: ModeFilter[] = ['all', 'chat', 'processor', 'hybrid'];

const modeActiveClasses: Record<ModeFilter, string> = {
  all: 'bg-zinc-700 text-zinc-50',
  chat: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  processor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  hybrid: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

const STORAGE_KEY = 'catpaw-sections-state';

type Department = 'direction' | 'business' | 'marketing' | 'finance' | 'production' | 'logistics' | 'hr' | 'personal' | 'other';
type GroupKey = 'empresa' | 'personal' | 'otros';

const DEPT_TO_GROUP: Record<Department, GroupKey> = {
  direction: 'empresa', business: 'empresa', marketing: 'empresa',
  finance: 'empresa', production: 'empresa', logistics: 'empresa', hr: 'empresa',
  personal: 'personal', other: 'otros',
};

const EMPRESA_DEPTS: Department[] = ['direction', 'business', 'marketing', 'finance', 'production', 'logistics', 'hr'];

const DEPT_ICONS: Record<Department, typeof Crown> = {
  direction: Crown, business: Briefcase, marketing: Megaphone,
  finance: TrendingUp, production: Wrench, logistics: Truck, hr: Users,
  personal: User, other: Grid3X3,
};

const GROUP_ICONS: Record<GroupKey, typeof Building2> = {
  empresa: Building2, personal: User, otros: Grid3X3,
};

const GROUP_COLORS: Record<GroupKey, { border: string; text: string; badgeBg: string; badgeBorder: string; subBorder: string; subText: string }> = {
  empresa: {
    border: 'border-violet-400',
    text: 'text-violet-400',
    badgeBg: 'bg-violet-500/10',
    badgeBorder: 'border-violet-500/20',
    subBorder: 'border-violet-800/50',
    subText: 'text-violet-400/70',
  },
  personal: {
    border: 'border-sky-400',
    text: 'text-sky-400',
    badgeBg: 'bg-sky-500/10',
    badgeBorder: 'border-sky-500/20',
    subBorder: 'border-sky-800/50',
    subText: 'text-sky-400/70',
  },
  otros: {
    border: 'border-zinc-400',
    text: 'text-zinc-400',
    badgeBg: 'bg-zinc-700/50',
    badgeBorder: 'border-zinc-700',
    subBorder: 'border-zinc-700/50',
    subText: 'text-zinc-400/70',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSectionsState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSectionsState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function matchesSearch(paw: CatPawWithCounts, query: string): boolean {
  const q = query.toLowerCase();
  if (paw.name.toLowerCase().includes(q)) return true;
  if (paw.description?.toLowerCase().includes(q)) return true;
  if (paw.model.toLowerCase().includes(q)) return true;
  if (paw.department_tags?.toLowerCase().includes(q)) return true;
  return false;
}

function groupPawsByDepartment(paws: CatPawWithCounts[]): Record<Department, CatPawWithCounts[]> {
  const groups: Record<string, CatPawWithCounts[]> = {};
  for (const dept of Object.keys(DEPT_TO_GROUP)) {
    groups[dept] = [];
  }
  for (const paw of paws) {
    const dept = (paw.department || 'other') as Department;
    const key = dept in DEPT_TO_GROUP ? dept : 'other';
    groups[key].push(paw);
  }
  return groups as Record<Department, CatPawWithCounts[]>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface GroupSectionProps {
  groupKey: GroupKey;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function GroupSection({ groupKey, label, count, expanded, onToggle, children }: GroupSectionProps) {
  const colors = GROUP_COLORS[groupKey];
  const Icon = GROUP_ICONS[groupKey];
  const isEmpty = count === 0;
  const t = useTranslations('agents');

  return (
    <div className={`border-l-[3px] ${colors.border} rounded-r-lg`}>
      <button
        onClick={isEmpty ? undefined : onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 bg-zinc-900/60 hover:bg-zinc-800/40 rounded-r-lg transition-colors ${isEmpty ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
      >
        {!isEmpty && (
          <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        )}
        <Icon className={`w-5 h-5 ${colors.text}`} />
        <span className="font-semibold text-zinc-100">{label}</span>
        {isEmpty ? (
          <span className="ml-auto text-xs text-zinc-500 italic">({t('section.empty')})</span>
        ) : (
          <Badge className={`ml-auto ${colors.badgeBg} ${colors.text} border ${colors.badgeBorder} hover:${colors.badgeBg}`}>
            {count}
          </Badge>
        )}
      </button>
      {expanded && !isEmpty && (
        <div className="py-2">
          {children}
        </div>
      )}
    </div>
  );
}

interface SubSectionProps {
  groupKey: GroupKey;
  dept: Department;
  label: string;
  paws: CatPawWithCounts[];
  expanded: boolean;
  onToggle: () => void;
  searchTerm: string;
  onClickPaw: (paw: CatPawWithCounts) => void;
  onChatPaw: (paw: CatPawWithCounts) => void;
}

function SubSection({ groupKey, dept, label, paws, expanded, onToggle, searchTerm, onClickPaw, onChatPaw }: SubSectionProps) {
  const colors = GROUP_COLORS[groupKey];
  const Icon = DEPT_ICONS[dept];
  const isEmpty = paws.length === 0;

  return (
    <div className={`ml-6 border-l-2 ${colors.subBorder}`}>
      <button
        onClick={isEmpty ? undefined : onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-zinc-800/30 rounded-r ${isEmpty ? 'opacity-50 cursor-default' : 'cursor-pointer'}`}
      >
        {!isEmpty && (
          <ChevronRight className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
        )}
        <Icon className={`w-4 h-4 ${colors.subText}`} />
        <span className="text-sm text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-500 ml-auto">{paws.length}</span>
      </button>
      {expanded && !isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3">
          {paws.map((paw) => (
            <CatPawCard
              key={paw.id}
              paw={paw}
              highlight={searchTerm}
              onClick={() => onClickPaw(paw)}
              onChat={() => onChatPaw(paw)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FlatSectionCardsProps {
  paws: CatPawWithCounts[];
  searchTerm: string;
  onClickPaw: (paw: CatPawWithCounts) => void;
  onChatPaw: (paw: CatPawWithCounts) => void;
}

function FlatSectionCards({ paws, searchTerm, onClickPaw, onChatPaw }: FlatSectionCardsProps) {
  if (paws.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 ml-6">
      {paws.map((paw) => (
        <CatPawCard
          key={paw.id}
          paw={paw}
          highlight={searchTerm}
          onClick={() => onClickPaw(paw)}
          onChat={() => onChatPaw(paw)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const t = useTranslations('agents');
  const router = useRouter();
  const [paws, setPaws] = useState<CatPawWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [chatPaw, setChatPaw] = useState<CatPawWithCounts | null>(null);
  const [sections, setSections] = useState<Record<string, boolean>>({});
  const [hasLoadedStorage, setHasLoadedStorage] = useState(false);

  // Load paws
  useEffect(() => {
    async function fetchPaws() {
      try {
        const res = await fetch('/api/cat-paws');
        if (res.ok) {
          setPaws(await res.json());
        }
      } catch (e) {
        console.error('Error fetching CatPaws:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchPaws();
  }, []);

  // Load localStorage state after paws are available
  useEffect(() => {
    if (loading || hasLoadedStorage) return;
    const stored = loadSectionsState();
    if (Object.keys(stored).length > 0) {
      setSections(stored);
    } else {
      // Default: empresa expanded, most populated subdept expanded
      const byDept = groupPawsByDepartment(paws);
      let maxDept: Department = 'direction';
      let maxCount = 0;
      for (const dept of EMPRESA_DEPTS) {
        if (byDept[dept].length > maxCount) {
          maxCount = byDept[dept].length;
          maxDept = dept;
        }
      }
      const defaults: Record<string, boolean> = {
        empresa: true,
        personal: false,
        otros: false,
      };
      for (const dept of EMPRESA_DEPTS) {
        defaults[`empresa.${dept}`] = dept === maxDept;
      }
      setSections(defaults);
    }
    setHasLoadedStorage(true);
  }, [loading, paws, hasLoadedStorage]);

  // Persist sections state
  useEffect(() => {
    if (hasLoadedStorage) {
      saveSectionsState(sections);
    }
  }, [sections, hasLoadedStorage]);

  const toggleSection = useCallback((key: string) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Filter by mode
  const modeFiltered = useMemo(() => {
    if (modeFilter === 'all') return paws;
    return paws.filter((p) => p.mode === modeFilter);
  }, [paws, modeFilter]);

  // Filter by search
  const searchQuery = search.trim();
  const isSearching = searchQuery.length > 0;

  const searchFiltered = useMemo(() => {
    if (!isSearching) return modeFiltered;
    return modeFiltered.filter((p) => matchesSearch(p, searchQuery));
  }, [modeFiltered, isSearching, searchQuery]);

  // Group paws by department
  const byDept = useMemo(() => groupPawsByDepartment(searchFiltered), [searchFiltered]);

  // Compute group counts
  const empresaCount = useMemo(() => EMPRESA_DEPTS.reduce((sum, d) => sum + byDept[d].length, 0), [byDept]);
  const personalCount = byDept.personal.length;
  const otrosCount = byDept.other.length;

  // Compute section expansion (search overrides localStorage)
  const getSectionExpanded = useCallback((key: string): boolean => {
    if (isSearching) {
      // When searching, expand sections that have results
      if (key === 'empresa') return empresaCount > 0;
      if (key === 'personal') return personalCount > 0;
      if (key === 'otros') return otrosCount > 0;
      // Subdept
      if (key.startsWith('empresa.')) {
        const dept = key.split('.')[1] as Department;
        return byDept[dept].length > 0;
      }
      return false;
    }
    return !!sections[key];
  }, [isSearching, sections, byDept, empresaCount, personalCount, otrosCount]);

  const handleClickPaw = useCallback((paw: CatPawWithCounts) => {
    router.push(`/agents/${paw.id}`);
  }, [router]);

  const handleChatPaw = useCallback((paw: CatPawWithCounts) => {
    setChatPaw(paw);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const hasAnyResults = searchFiltered.length > 0;

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 space-y-6 animate-slide-up">
      <PageHeader
        title={t('title')}
        description={t('description')}
        icon={
          <Image
            src="/Images/icon/catpaw.png"
            alt="CatPaw"
            width={120}
            height={120}
            className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28"
          />
        }
        action={
          <Button
            onClick={() => router.push('/agents/new')}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('newCatPaw')}
          </Button>
        }
      />

      {/* Search input — full width */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
        />
      </div>

      {/* Mode filter pills */}
      <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800 w-fit">
        {MODE_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setModeFilter(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              modeFilter === key
                ? modeActiveClasses[key]
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t(`modes.${key}`)}
          </button>
        ))}
      </div>

      {/* Directory sections */}
      {isSearching && !hasAnyResults ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Image
            src="/Images/icon/catpaw.png"
            alt="No results"
            width={48}
            height={48}
            className="opacity-30 mb-4"
          />
          <p className="text-zinc-400 font-medium">{t('search.noResults')}</p>
          <p className="text-sm text-zinc-500 mt-1">{t('search.noResultsHint')}</p>
        </div>
      ) : !isSearching && paws.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Image
            src="/Images/icon/catpaw.png"
            alt="No agents"
            width={48}
            height={48}
            className="opacity-30 mb-4"
          />
          <p className="text-zinc-400 font-medium">{t('noResults')}</p>
          <p className="text-sm text-zinc-500 mt-1">{t('noResultsEmpty')}</p>
          <Button
            onClick={() => router.push('/agents/new')}
            variant="outline"
            size="sm"
            className="mt-4 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            {t('newCatPaw')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Empresa */}
          <GroupSection
            groupKey="empresa"
            label={t('section.company')}
            count={empresaCount}
            expanded={getSectionExpanded('empresa')}
            onToggle={() => toggleSection('empresa')}
          >
            {EMPRESA_DEPTS.map((dept) => (
              <SubSection
                key={dept}
                groupKey="empresa"
                dept={dept}
                label={t(`department.${dept}`)}
                paws={byDept[dept]}
                expanded={getSectionExpanded(`empresa.${dept}`)}
                onToggle={() => toggleSection(`empresa.${dept}`)}
                searchTerm={isSearching ? searchQuery : ''}
                onClickPaw={handleClickPaw}
                onChatPaw={handleChatPaw}
              />
            ))}
          </GroupSection>

          {/* Personal */}
          <GroupSection
            groupKey="personal"
            label={t('section.personal')}
            count={personalCount}
            expanded={getSectionExpanded('personal')}
            onToggle={() => toggleSection('personal')}
          >
            <FlatSectionCards
              paws={byDept.personal}
              searchTerm={isSearching ? searchQuery : ''}
              onClickPaw={handleClickPaw}
              onChatPaw={handleChatPaw}
            />
          </GroupSection>

          {/* Otros */}
          <GroupSection
            groupKey="otros"
            label={t('section.other')}
            count={otrosCount}
            expanded={getSectionExpanded('otros')}
            onToggle={() => toggleSection('otros')}
          >
            <FlatSectionCards
              paws={byDept.other}
              searchTerm={isSearching ? searchQuery : ''}
              onClickPaw={handleClickPaw}
              onChatPaw={handleChatPaw}
            />
          </GroupSection>
        </div>
      )}

      {chatPaw && (
        <CatPawChatSheet
          pawId={chatPaw.id}
          pawName={chatPaw.name}
          pawEmoji={chatPaw.avatar_emoji || '🐾'}
          open={!!chatPaw}
          onOpenChange={(open) => { if (!open) setChatPaw(null); }}
        />
      )}
    </div>
  );
}
