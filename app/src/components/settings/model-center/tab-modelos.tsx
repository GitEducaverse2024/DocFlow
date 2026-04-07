'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Pencil, DollarSign } from 'lucide-react'
import { getTierStyle } from '@/lib/ui/tier-styles'
import { MidEditDialog } from '@/components/settings/mid-edit-dialog'
import { type MidEntry } from '@/components/settings/mid-cards-grid'
import { TabModelosFilters, type ModelosFilters } from './tab-modelos-filters'
import { toast } from 'sonner'

interface MidEntryExt extends MidEntry {
  auto_created?: number
}

interface AliasRow {
  alias: string
  model_key: string
  description: string
  is_active: number
}

const TIER_ORDER: Array<'Elite' | 'Pro' | 'Libre'> = ['Elite', 'Pro', 'Libre']

/**
 * Build a map of model_key -> alias names.
 * Alias model_key may not directly match MID model_key (e.g. alias uses "gemini-main",
 * MID uses "google/gemini-2.5-pro"). We do fuzzy matching: exact, endsWith, or contains.
 */
function buildUsageMap(models: MidEntryExt[], aliases: AliasRow[]): Map<string, string[]> {
  const usageMap = new Map<string, string[]>()

  for (const alias of aliases) {
    const aliasKey = alias.model_key.toLowerCase()
    let matched = false

    for (const model of models) {
      const midKey = model.model_key.toLowerCase()

      if (midKey === aliasKey || midKey.endsWith('/' + aliasKey) || midKey.includes(aliasKey)) {
        const existing = usageMap.get(model.model_key) ?? []
        existing.push(alias.alias)
        usageMap.set(model.model_key, existing)
        matched = true
        break
      }
    }

    if (!matched) {
      console.debug(`[TabModelos] Alias "${alias.alias}" (model_key="${alias.model_key}") did not match any MID entry`)
    }
  }

  return usageMap
}

export function TabModelos() {
  const t = useTranslations('settings.modelCenter.modelos')
  const [models, setModels] = useState<MidEntryExt[]>([])
  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<ModelosFilters>({
    tier: 'all',
    provider: 'all',
    enUsoOnly: false,
  })
  const [editingModel, setEditingModel] = useState<MidEntry | null>(null)
  const [editingCostId, setEditingCostId] = useState<number | null>(null)
  const [costValue, setCostValue] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [midRes, aliasRes] = await Promise.all([
          fetch('/api/mid?status=active'),
          fetch('/api/aliases'),
        ])

        if (!midRes.ok) throw new Error('Failed to fetch MID models')
        if (!aliasRes.ok) throw new Error('Failed to fetch aliases')

        const midData = await midRes.json()
        const aliasData = await aliasRes.json()

        setModels(Array.isArray(midData?.models) ? midData.models : [])
        setAliases(Array.isArray(aliasData?.aliases) ? aliasData.aliases : [])
      } catch (err) {
        console.error('[TabModelos] fetch error', err)
        toast.error(String(err))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const usageMap = buildUsageMap(models, aliases)

  // Extract unique providers for the filter dropdown
  const providers = Array.from(new Set(models.map((m) => m.provider))).sort()

  // Apply filters
  const filtered = models.filter((m) => {
    if (filters.tier !== 'all' && m.tier !== filters.tier) return false
    if (filters.provider !== 'all' && m.provider !== filters.provider) return false
    if (filters.enUsoOnly && !(usageMap.has(m.model_key))) return false
    return true
  })

  // Group by tier
  const isSinClasificar = (m: MidEntryExt) =>
    m.auto_created === 1 && (m.best_use?.startsWith('Auto-detectado') || m.tier === null)

  const grouped: Record<string, MidEntryExt[]> = {
    Elite: [],
    Pro: [],
    Libre: [],
    sinClasificar: [],
  }

  for (const m of filtered) {
    if (isSinClasificar(m)) {
      grouped.sinClasificar.push(m)
    } else {
      const key = m.tier ?? 'sinClasificar'
      if (key === 'sinClasificar' || !grouped[key]) {
        grouped.sinClasificar.push(m)
      } else {
        grouped[key].push(m)
      }
    }
  }

  const sections: Array<{ label: string; displayLabel: string; items: MidEntryExt[] }> = []
  for (const tier of TIER_ORDER) {
    if (grouped[tier].length > 0) {
      sections.push({ label: tier, displayLabel: tier, items: grouped[tier] })
    }
  }
  if (grouped.sinClasificar.length > 0) {
    sections.push({ label: 'sinClasificar', displayLabel: t('sinClasificar'), items: grouped.sinClasificar })
  }

  const handleCostEdit = (model: MidEntryExt) => {
    setEditingCostId(model.id)
    setCostValue(model.cost_notes ?? '')
  }

  const handleCostSave = async (modelId: number) => {
    const original = models.find((m) => m.id === modelId)
    // Optimistic update
    setModels((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, cost_notes: costValue } : m))
    )
    setEditingCostId(null)

    try {
      const res = await fetch(`/api/mid/${modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_notes: costValue }),
      })
      if (!res.ok) throw new Error('PATCH failed')
      toast.success(t('costSaved'))
    } catch {
      // Revert on error
      if (original) {
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, cost_notes: original.cost_notes } : m))
        )
      }
      toast.error(t('costError'))
    }
  }

  const handleSaved = (updated: MidEntry) => {
    setModels((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)))
    setEditingModel(null)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">{t('loading')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 bg-zinc-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <TabModelosFilters filters={filters} onFiltersChange={setFilters} providers={providers} />

      {sections.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">{t('noModels')}</p>
      ) : (
        <div className="space-y-8">
          {sections.map(({ label, displayLabel, items }) => (
            <div key={label}>
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-zinc-50">{displayLabel}</h3>
                <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-400">
                  {items.length}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((model) => {
                  const aliasNames = usageMap.get(model.model_key) ?? []
                  const isInUse = aliasNames.length > 0

                  return (
                    <Card
                      key={model.id}
                      className="bg-zinc-900/80 border border-zinc-800 hover:border-violet-800/30 transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-zinc-100 truncate">
                              {model.display_name}
                            </h4>
                            <p className="text-xs text-zinc-500 truncate">{model.model_key}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-zinc-500 hover:text-zinc-200"
                            onClick={() => setEditingModel(model)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap gap-1.5 mb-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] border-zinc-700 text-zinc-400"
                          >
                            {model.provider}
                          </Badge>
                          {model.tier && (
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${getTierStyle(model.tier)}`}
                            >
                              {model.tier}
                            </Badge>
                          )}
                          {model.cost_tier && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-zinc-700 text-zinc-400"
                            >
                              {model.cost_tier}
                            </Badge>
                          )}
                        </div>

                        {model.best_use && (
                          <p className="text-xs text-zinc-400 mb-2 line-clamp-2">
                            {model.best_use}
                          </p>
                        )}

                        {/* Inline cost notes editing */}
                        <div className="mt-2 pt-2 border-t border-zinc-800/60">
                          <div className="flex items-center gap-1 mb-1">
                            <DollarSign className="w-3 h-3 text-zinc-500" />
                            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                              {t('costNotes')}
                            </span>
                          </div>
                          {editingCostId === model.id ? (
                            <Input
                              value={costValue}
                              onChange={(e) => setCostValue(e.target.value)}
                              onBlur={() => handleCostSave(model.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCostSave(model.id)
                                if (e.key === 'Escape') setEditingCostId(null)
                              }}
                              autoFocus
                              className="h-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 focus:border-violet-500"
                              placeholder={t('costNotesPlaceholder')}
                            />
                          ) : (
                            <button
                              onClick={() => handleCostEdit(model)}
                              className="group flex items-center gap-1 w-full text-left"
                            >
                              <span className={`text-xs ${model.cost_notes ? 'text-zinc-300' : 'text-zinc-600 italic'}`}>
                                {model.cost_notes || t('costNotesPlaceholder')}
                              </span>
                              <Pencil className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </button>
                          )}
                        </div>

                        {isInUse && (
                          <div className="mt-2 pt-2 border-t border-zinc-800">
                            <Badge className="bg-emerald-600/20 border-emerald-500/40 text-emerald-300 text-[10px]">
                              {t('enUso')} ({aliasNames.length})
                            </Badge>
                            <p className="text-[10px] text-zinc-500 mt-1 truncate">
                              {t('usedBy', { aliases: aliasNames.join(', ') })}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <MidEditDialog
        model={editingModel}
        open={editingModel !== null}
        onClose={() => setEditingModel(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}
