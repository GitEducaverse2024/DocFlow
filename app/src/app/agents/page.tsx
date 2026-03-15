"use client";

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Plus, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/page-header';
import { CatPawCard } from '@/components/agents/catpaw-card';
import { CatPawWithCounts } from '@/lib/types/catpaw';

type ModeFilter = 'all' | 'chat' | 'processor' | 'hybrid';

const modeButtons: { value: ModeFilter; label: string; activeClass: string }[] = [
  { value: 'all', label: 'Todos', activeClass: 'bg-zinc-700 text-zinc-50' },
  { value: 'chat', label: 'Chat', activeClass: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
  { value: 'processor', label: 'Procesador', activeClass: 'bg-teal-500/20 text-teal-400 border-teal-500/30' },
  { value: 'hybrid', label: 'Hibrido', activeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
];

function parseDepartmentTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AgentsPage() {
  const router = useRouter();
  const [paws, setPaws] = useState<CatPawWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [departmentFilter, setDepartmentFilter] = useState('');

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

  // Derive unique departments from all paws
  const allDepartments = useMemo(() => {
    const tags = new Set<string>();
    paws.forEach((p) => {
      parseDepartmentTags(p.department_tags).forEach((t) => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [paws]);

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = paws;

    if (modeFilter !== 'all') {
      result = result.filter((p) => p.mode === modeFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    if (departmentFilter) {
      result = result.filter((p) => {
        const tags = parseDepartmentTags(p.department_tags);
        return tags.includes(departmentFilter);
      });
    }

    return result;
  }, [paws, modeFilter, search, departmentFilter]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 space-y-6 animate-slide-up">
      <PageHeader
        title="Agentes"
        description="Gestiona tus CatPaws: agentes de chat, procesadores e hibridos"
        icon={
          <Image
            src="/Images/icon/catpaw.png"
            alt="CatPaw"
            width={24}
            height={24}
          />
        }
        action={
          <Button
            onClick={() => router.push('/agents/new')}
            className="bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear CatPaw
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Mode toggle buttons */}
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          {modeButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => setModeFilter(btn.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                modeFilter === btn.value
                  ? btn.activeClass
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre..."
            className="pl-9 bg-zinc-900 border-zinc-800 text-zinc-50 placeholder:text-zinc-500"
          />
        </div>

        {/* Department filter */}
        {allDepartments.length > 0 && (
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-300 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            <option value="">Todos departamentos</option>
            {allDepartments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((paw) => (
            <CatPawCard
              key={paw.id}
              paw={paw}
              onClick={() => router.push(`/agents/${paw.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Image
            src="/Images/icon/catpaw.png"
            alt="No agents"
            width={48}
            height={48}
            className="opacity-30 mb-4"
          />
          <p className="text-zinc-400 font-medium">No se encontraron agentes</p>
          <p className="text-sm text-zinc-500 mt-1">
            {paws.length === 0
              ? 'Crea tu primer CatPaw para comenzar'
              : 'Intenta con otros filtros de busqueda'}
          </p>
          {paws.length === 0 && (
            <Button
              onClick={() => router.push('/agents/new')}
              variant="outline"
              size="sm"
              className="mt-4 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Crear CatPaw
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
