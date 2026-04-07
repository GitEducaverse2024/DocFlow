'use client'

import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Filter } from 'lucide-react'

export interface ModelosFilters {
  tier: 'all' | 'Elite' | 'Pro' | 'Libre'
  provider: string
  enUsoOnly: boolean
}

interface Props {
  filters: ModelosFilters
  onFiltersChange: (f: ModelosFilters) => void
  providers: string[]
}

export function TabModelosFilters({ filters, onFiltersChange, providers }: Props) {
  const t = useTranslations('settings.modelCenter.modelos')

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <Filter className="w-4 h-4 text-zinc-400" />

      {/* Tier filter */}
      <Select
        value={filters.tier}
        onValueChange={(v) => onFiltersChange({ ...filters, tier: v as ModelosFilters['tier'] })}
      >
        <SelectTrigger className="w-[160px] bg-zinc-900/80 border-zinc-800 text-zinc-200">
          <SelectValue placeholder={t('filters.tier')} />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800">
          <SelectItem value="all">{t('filters.tierAll')}</SelectItem>
          <SelectItem value="Elite">Elite</SelectItem>
          <SelectItem value="Pro">Pro</SelectItem>
          <SelectItem value="Libre">Libre</SelectItem>
        </SelectContent>
      </Select>

      {/* Provider filter */}
      <Select
        value={filters.provider}
        onValueChange={(v) => onFiltersChange({ ...filters, provider: v ?? 'all' })}
      >
        <SelectTrigger className="w-[180px] bg-zinc-900/80 border-zinc-800 text-zinc-200">
          <SelectValue placeholder={t('filters.provider')} />
        </SelectTrigger>
        <SelectContent className="bg-zinc-900 border-zinc-800">
          <SelectItem value="all">{t('filters.providerAll')}</SelectItem>
          {providers.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* En uso only toggle */}
      <Button
        variant={filters.enUsoOnly ? 'default' : 'outline'}
        size="sm"
        onClick={() => onFiltersChange({ ...filters, enUsoOnly: !filters.enUsoOnly })}
        className={
          filters.enUsoOnly
            ? 'bg-violet-600 hover:bg-violet-700 text-white border-violet-500'
            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-zinc-200'
        }
      >
        {t('filters.enUsoOnly')}
      </Button>
    </div>
  )
}
