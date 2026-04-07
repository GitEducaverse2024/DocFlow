'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { getTierStyle } from '@/lib/ui/tier-styles'

/* ── Duplicated types (client component cannot import server-only modules) ── */

interface AliasRow {
  alias: string
  model_key: string
  description: string
  is_active: number
}

interface MidEntry {
  id: number
  model_key: string
  display_name: string
  provider: string
  tier: string | null
  best_use: string | null
  cost_notes: string | null
  capabilities: string[]
  status: string
}

interface ProviderHealth {
  name: string
  status: 'connected' | 'error'
  models_count: number
  latency_ms: number
  error: string | null
}

interface AliasHealth {
  alias: string
  configured_model: string
  resolved_model: string | null
  resolution_status: 'direct' | 'fallback' | 'error'
  error: string | null
  latency_ms: number
}

interface HealthResult {
  providers: ProviderHealth[]
  aliases: AliasHealth[]
  checked_at: string
  cached: boolean
}

/* ── Component ── */

export function TabEnrutamiento() {
  const t = useTranslations('settings.modelCenter.enrutamiento')

  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [midModels, setMidModels] = useState<MidEntry[]>([])
  const [healthResult, setHealthResult] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingAlias, setUpdatingAlias] = useState<string | null>(null)

  /* Confirmation dialog state */
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    alias: string
    modelKey: string
    modelName: string
  }>({ open: false, alias: '', modelKey: '', modelName: '' })

  /* ── Data fetch ── */
  useEffect(() => {
    ;(async () => {
      try {
        const [aliasRes, midRes, healthRes] = await Promise.all([
          fetch('/api/aliases'),
          fetch('/api/mid?status=active'),
          fetch('/api/models/health'),
        ])

        if (aliasRes.ok) {
          const data = await aliasRes.json()
          setAliases(Array.isArray(data?.aliases) ? data.aliases : [])
        }
        if (midRes.ok) {
          const data = await midRes.json()
          setMidModels(Array.isArray(data?.models) ? data.models : [])
        }
        if (healthRes.ok) {
          const data = await healthRes.json()
          setHealthResult(data)
        }
      } catch (e) {
        console.error('Error loading routing data', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /* ── Derived data ── */
  const connectedProviders = useMemo(() => {
    if (!healthResult?.providers) return new Set<string>()
    return new Set(
      healthResult.providers
        .filter((p) => p.status === 'connected')
        .map((p) => p.name)
    )
  }, [healthResult])

  const aliasHealthMap = useMemo(() => {
    const map: Record<string, AliasHealth> = {}
    if (healthResult?.aliases) {
      for (const ah of healthResult.aliases) {
        map[ah.alias] = ah
      }
    }
    return map
  }, [healthResult])

  const midByKey = useMemo(() => {
    const map: Record<string, MidEntry> = {}
    for (const m of midModels) map[m.model_key] = m
    return map
  }, [midModels])

  /* ── Model change handler ── */
  const applyModelChange = useCallback(
    async (alias: string, newKey: string) => {
      const prev = aliases.find((a) => a.alias === alias)?.model_key
      setUpdatingAlias(alias)
      /* Optimistic update */
      setAliases((cur) =>
        cur.map((a) => (a.alias === alias ? { ...a, model_key: newKey } : a))
      )
      try {
        const res = await fetch('/api/alias-routing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias, model_key: newKey }),
        })
        const data = await res.json()
        if (!res.ok || data?.error) throw new Error(data?.error ?? 'update failed')
        toast.success(t('updated'))
      } catch {
        /* Revert on error */
        if (prev) {
          setAliases((cur) =>
            cur.map((a) => (a.alias === alias ? { ...a, model_key: prev } : a))
          )
        }
        toast.error(t('updateError'))
      } finally {
        setUpdatingAlias(null)
      }
    },
    [aliases, t]
  )

  const handleModelSelect = useCallback(
    (alias: string, newKey: string) => {
      const mid = midByKey[newKey]
      const providerName = mid?.provider ?? ''
      const isAvailable = connectedProviders.has(providerName)

      if (!isAvailable) {
        setConfirmDialog({
          open: true,
          alias,
          modelKey: newKey,
          modelName: mid?.display_name ?? newKey,
        })
        return
      }
      applyModelChange(alias, newKey)
    },
    [midByKey, connectedProviders, applyModelChange]
  )

  /* ── Semaphore helper ── */
  const renderSemaphore = (alias: string) => {
    const ah = aliasHealthMap[alias]
    if (!ah) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-zinc-600 shrink-0" />
          {t('sinDatos')}
        </span>
      )
    }
    const statusConfig: Record<string, { color: string; label: string }> = {
      direct: { color: 'bg-emerald-500', label: t('directo') },
      fallback: { color: 'bg-amber-500', label: t('fallback') },
      error: { color: 'bg-red-500', label: t('error') },
    }
    const cfg = statusConfig[ah.resolution_status] ?? statusConfig.error
    return (
      <span className="flex items-center gap-1.5 text-xs text-zinc-300">
        <span className={`w-2 h-2 rounded-full ${cfg.color} shrink-0`} />
        {cfg.label}
      </span>
    )
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        <span className="ml-2 text-sm text-zinc-400">{t('loading')}</span>
      </div>
    )
  }

  if (aliases.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-8 text-center">{t('noAliases')}</p>
    )
  }

  /* ── Table ── */
  return (
    <>
      {/* Header row (hidden on mobile) */}
      <div className="hidden md:grid md:grid-cols-[minmax(140px,1fr)_minmax(200px,2fr)_120px_100px] gap-3 px-3 pb-2 text-xs text-zinc-500 uppercase tracking-wider">
        <span>{t('alias')}</span>
        <span>{t('modelo')}</span>
        <span>{t('estado')}</span>
        <span>{t('tier')}</span>
      </div>

      <div className="space-y-1.5">
        {aliases.map((a) => {
          const currentMid = midByKey[a.model_key]
          const tier = currentMid?.tier ?? null
          return (
            <div
              key={a.alias}
              className="flex flex-col md:grid md:grid-cols-[minmax(140px,1fr)_minmax(200px,2fr)_120px_100px] gap-3 p-3 bg-zinc-950/40 border border-zinc-800 rounded items-center"
            >
              {/* Alias */}
              <div className="w-full md:w-auto">
                <div className="text-sm font-mono text-zinc-200">{a.alias}</div>
                {a.description && (
                  <div className="text-xs text-zinc-500 line-clamp-1">{a.description}</div>
                )}
              </div>

              {/* Model dropdown */}
              <div className="w-full md:w-auto min-w-0">
                <Select
                  value={a.model_key}
                  onValueChange={(v) => handleModelSelect(a.alias, String(v))}
                  disabled={updatingAlias === a.alias}
                >
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50 h-8 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50 max-h-80">
                    {midModels.map((m) => {
                      const isAvail = connectedProviders.has(m.provider)
                      return (
                        <SelectItem key={m.model_key} value={m.model_key}>
                          <span className={`font-mono text-xs ${isAvail ? '' : 'text-zinc-600'}`}>
                            {m.model_key}
                          </span>
                          {!isAvail && (
                            <span className="inline-flex items-center gap-0.5 ml-1">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              <span className="text-[10px] text-zinc-600">({t('noDisponible')})</span>
                            </span>
                          )}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Semaphore */}
              <div className="w-full md:w-auto">
                {renderSemaphore(a.alias)}
              </div>

              {/* Tier badge */}
              <div className="w-full md:w-auto flex items-center gap-2">
                {currentMid ? (
                  <Badge variant="outline" className={`${getTierStyle(tier)} text-xs`}>
                    {tier ?? '—'}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-600/20 border-amber-500/40 text-amber-300 text-xs">
                    {t('sinFicha')}
                  </Badge>
                )}
                {updatingAlias === a.alias && (
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirmation dialog for unavailable models */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog((prev) => ({ ...prev, open }))
        }
      >
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              {t('confirmarCambio')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {t('confirmarDescripcion', { model: confirmDialog.modelName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700">
              {t('cancelar')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                applyModelChange(confirmDialog.alias, confirmDialog.modelKey)
              }}
            >
              {t('cambiar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
