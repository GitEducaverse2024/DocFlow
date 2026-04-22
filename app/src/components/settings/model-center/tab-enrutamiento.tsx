'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { getTierStyle } from '@/lib/ui/tier-styles'

/* ── Duplicated types (client component cannot import server-only modules) ── */

// Phase 161 (v30.0): AliasRow enriched by Plan 02 JOIN with model_intelligence on
// server side of GET /api/aliases. Flat `reasoning_effort`/`max_tokens`/`thinking_budget`
// at the root; nested `capabilities` object (or null when model_key has no
// model_intelligence row — namespace-mismatch fallback).
interface AliasRow {
  alias: string
  model_key: string
  description: string
  is_active: number
  reasoning_effort: 'off' | 'low' | 'medium' | 'high' | null
  max_tokens: number | null
  thinking_budget: number | null
  capabilities: {
    supports_reasoning: boolean | null
    max_tokens_cap: number | null
    is_local: boolean | null
  } | null
}

// Phase 161 (v30.0): TARGET-model cap shape sourced from /api/models client-side
// Map (per CONTEXT.md § 2 Data source). Same field names as AliasRow.capabilities
// for interchangeability in helpers.
interface ModelCaps {
  supports_reasoning: boolean | null
  max_tokens_cap: number | null
  is_local: boolean | null
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
  provider: string
  status: 'connected' | 'error'
  model_count: number
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

  /* Phase 161 (v30.0): expand-row state, per-row dirty tracking, and the
   * TARGET-model cap Map built from /api/models (Phase 158-02 flat root shape).
   * The Map is the PRIMARY source for resolving TARGET-model capabilities in the
   * expand panel AND during the "user picked new model in dropdown, not yet
   * saved" window. Per CONTEXT.md § 2 Data source L61-62. */
  const [expandedAlias, setExpandedAlias] = useState<string | null>(null)
  const [dirtyRows, setDirtyRows] = useState<
    Record<string, { max_tokens?: number | null; thinking_budget?: number | null }>
  >({})
  const [modelCapsMap, setModelCapsMap] = useState<Map<string, ModelCaps>>(new Map())

  /* Confirmation dialog state */
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    alias: string
    modelKey: string
    modelName: string
  }>({ open: false, alias: '', modelKey: '', modelName: '' })

  /* ── Data fetch ── */
  // Phase 161: extract aliases fetch into a reusable callback so PATCH success
  // handlers can refetch just the enriched rows without re-fetching /api/mid or
  // /api/models/health (both stable within a session).
  const loadAliases = useCallback(async () => {
    try {
      const res = await fetch('/api/aliases')
      if (!res.ok) return
      const data = await res.json()
      setAliases(Array.isArray(data?.aliases) ? data.aliases : [])
    } catch (e) {
      console.error('Error loading aliases', e)
    }
  }, [])

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

  /* Phase 161 (v30.0): fetch /api/models once on mount and build a
   * Map<model_id, capabilities>. Used by `getTargetCapabilities` to resolve
   * TARGET-model caps before the /api/aliases refetch completes after a model
   * dropdown change (the optimistic update has already overwritten row.model_key,
   * but row.capabilities still reflects the previous model until refetch).
   *
   * /api/models route.ts L108 maps to `{ id, ..., supports_reasoning, ... }` —
   * flat root per Phase 158-02. Verified `id` is the stable identifier that
   * matches `model_aliases.model_key`. */
  useEffect(() => {
    let aborted = false
    ;(async () => {
      try {
        const res = await fetch('/api/models')
        if (!res.ok) return
        const data = await res.json()
        if (aborted) return
        const map = new Map<string, ModelCaps>()
        const items = (data?.models ?? []) as Array<{
          id: string
          supports_reasoning: boolean | null
          max_tokens_cap: number | null
          is_local: boolean | null
        }>
        for (const m of items) {
          if (!m?.id) continue
          map.set(m.id, {
            supports_reasoning: m.supports_reasoning,
            max_tokens_cap: m.max_tokens_cap,
            is_local: m.is_local,
          })
        }
        setModelCapsMap(map)
      } catch {
        /* Silent: leave map empty; getTargetCapabilities falls back to row.capabilities. */
      }
    })()
    return () => {
      aborted = true
    }
  }, [])

  /* ── Derived data ── */
  const connectedProviders = useMemo(() => {
    if (!healthResult?.providers) return new Set<string>()
    return new Set(
      healthResult.providers
        .filter((p) => p.status === 'connected')
        .map((p) => p.provider)
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

  /* Phase 161 (v30.0): Resolve target capabilities for the expand panel.
   *
   * Priority (per CONTEXT.md § 2 Data source):
   *   1. modelCapsMap.get(row.model_key)  — canonical /api/models source, reflects
   *      the TARGET model even during the "picked new model in dropdown, not yet
   *      saved" window (when row.capabilities still reflects the previous model
   *      because /api/aliases hasn't been refetched yet).
   *   2. row.capabilities                 — fallback when the Map has no entry
   *      (e.g. /api/models fetch failed, or model_key is not in the catalog).
   *   3. null                             — fallback of fallback: no signal either
   *      way → UI shows t('capabilitiesDesconocidas').
   *
   * Callers treat `null` as "unknown cap" and still render the max_tokens input
   * (always visible per UI-02) but hide reasoning-dependent controls. */
  const getTargetCapabilities = useCallback(
    (alias: string): ModelCaps | null => {
      const row = aliases.find((a) => a.alias === alias)
      if (!row) return null
      const fromMap = modelCapsMap.get(row.model_key)
      if (fromMap) return fromMap
      return row.capabilities
    },
    [aliases, modelCapsMap]
  )

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
        // Phase 161 (v30.0): refetch so row.capabilities reflects the new model.
        loadAliases()
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
    [aliases, loadAliases, t]
  )

  /* Phase 161 (v30.0): reasoning_effort auto-save (mirrors applyModelChange).
   * Optimistic update + PATCH + toast + revert on error. On success refetch via
   * loadAliases so capabilities + persisted reasoning_effort re-sync. */
  const applyReasoningEffort = useCallback(
    async (alias: string, value: 'off' | 'low' | 'medium' | 'high') => {
      const row = aliases.find((a) => a.alias === alias)
      if (!row) return
      const prevEffort = row.reasoning_effort
      setUpdatingAlias(alias)
      setAliases((cur) =>
        cur.map((a) => (a.alias === alias ? { ...a, reasoning_effort: value } : a))
      )
      try {
        const res = await fetch('/api/alias-routing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alias,
            model_key: row.model_key,
            reasoning_effort: value,
          }),
        })
        const data = await res.json()
        if (!res.ok || data?.error) throw new Error(data?.error ?? 'update failed')
        toast.success(t('guardado'))
        loadAliases()
      } catch (err) {
        setAliases((cur) =>
          cur.map((a) =>
            a.alias === alias ? { ...a, reasoning_effort: prevEffort } : a
          )
        )
        const msg = err instanceof Error ? err.message : t('guardadoError')
        toast.error(msg)
      } finally {
        setUpdatingAlias(null)
      }
    },
    [aliases, loadAliases, t]
  )

  /* Phase 161 (v30.0): dirty-state tracking for max_tokens / thinking_budget.
   * Empty string serializes as null (CFG-02j reset per Phase 159-03). Invalid
   * numeric input (NaN) keeps the previous value. */
  const updateDirtyField = useCallback(
    (
      alias: string,
      field: 'max_tokens' | 'thinking_budget',
      rawValue: string
    ) => {
      setDirtyRows((cur) => {
        const existing = cur[alias] ?? {}
        let next: number | null
        if (rawValue === '') {
          next = null
        } else {
          const parsed = Number(rawValue)
          if (!Number.isFinite(parsed)) return cur
          next = parsed
        }
        return { ...cur, [alias]: { ...existing, [field]: next } }
      })
    },
    []
  )

  /* Phase 161 (v30.0): explicit Guardar — commits dirtyRows[alias] via PATCH.
   * Preserves reasoning_effort in the body (per CONTEXT.md § 3) so it survives
   * the extended-body write path of Phase 159-03. On success clears the dirty
   * entry and refetches; on error toasts the backend message unchanged. */
  const saveRow = useCallback(
    async (alias: string) => {
      const row = aliases.find((a) => a.alias === alias)
      if (!row) return
      const dirty = dirtyRows[alias]
      if (!dirty || Object.keys(dirty).length === 0) return
      setUpdatingAlias(alias)
      try {
        const body: Record<string, unknown> = {
          alias,
          model_key: row.model_key,
          reasoning_effort: row.reasoning_effort,
        }
        if ('max_tokens' in dirty) body.max_tokens = dirty.max_tokens ?? null
        if ('thinking_budget' in dirty)
          body.thinking_budget = dirty.thinking_budget ?? null
        const res = await fetch('/api/alias-routing', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok || data?.error) throw new Error(data?.error ?? 'update failed')
        toast.success(t('guardado'))
        setDirtyRows((cur) => {
          const nxt = { ...cur }
          delete nxt[alias]
          return nxt
        })
        loadAliases()
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('guardadoError')
        toast.error(msg)
      } finally {
        setUpdatingAlias(null)
      }
    },
    [aliases, dirtyRows, loadAliases, t]
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
          const isExpanded = expandedAlias === a.alias
          return (
            // Phase 161 (v30.0): outer wrapper has ZERO visual styling (no border,
            // bg, padding, margin) — preserves the existing 4-col row's exact look
            // for collapsed users (zero-regression filter per CONTEXT.md).
            <div key={a.alias}>
              <div
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

                {/* Tier badge + expand chevron (Phase 161 v30.0) */}
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
                  <button
                    type="button"
                    aria-label={isExpanded ? t('colapsar') : t('expandir')}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedAlias(isExpanded ? null : a.alias)
                    }
                    className="ml-auto p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>

              {/* Phase 161 (v30.0): expand panel with 3 conditional controls.
                  Visibility rules (per UI-01..03 + CONTEXT.md § 1):
                    - reasoning_effort Select: TARGET supports_reasoning === true
                    - max_tokens Input: always visible
                    - thinking_budget Input: TARGET supports_reasoning === true
                  Target caps resolve via getTargetCapabilities (Map-first, then
                  row.capabilities fallback, then null → t('capabilitiesDesconocidas')). */}
              {isExpanded && (() => {
                const targetCaps = getTargetCapabilities(a.alias)
                const reasoningSupported = targetCaps?.supports_reasoning === true
                const maxTokensCap = targetCaps?.max_tokens_cap ?? null
                const dirty = dirtyRows[a.alias] ?? {}
                const currentMaxTokens =
                  'max_tokens' in dirty ? dirty.max_tokens ?? null : a.max_tokens
                const currentThinking =
                  'thinking_budget' in dirty
                    ? dirty.thinking_budget ?? null
                    : a.thinking_budget
                const isDirty = Object.keys(dirty).length > 0
                const maxTokensExceedsCap =
                  currentMaxTokens !== null &&
                  maxTokensCap !== null &&
                  currentMaxTokens > maxTokensCap
                const thinkingExceedsMax =
                  currentThinking !== null &&
                  currentMaxTokens !== null &&
                  currentThinking > currentMaxTokens

                return (
                  <div
                    data-testid="enrutamiento-expand-panel"
                    className="mt-1 p-3 bg-zinc-950/40 border border-zinc-800 rounded space-y-3"
                  >
                    <p className="text-xs text-zinc-500 uppercase tracking-wider">
                      {t('avanzado')}
                    </p>

                    {targetCaps === null && (
                      <p className="text-sm text-zinc-500">
                        {t('capabilitiesDesconocidas')}
                      </p>
                    )}

                    {/* UI-01: Inteligencia (reasoning_effort) — auto-save on select */}
                    {reasoningSupported && (
                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-400">
                          {t('inteligencia')}
                        </Label>
                        <Select
                          value={a.reasoning_effort ?? 'off'}
                          onValueChange={(v) =>
                            applyReasoningEffort(
                              a.alias,
                              v as 'off' | 'low' | 'medium' | 'high'
                            )
                          }
                          disabled={updatingAlias === a.alias}
                        >
                          <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-50 h-8 text-sm w-full md:w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-50">
                            <SelectItem value="off">
                              {t('inteligenciaOff')}
                            </SelectItem>
                            <SelectItem value="low">
                              {t('inteligenciaLow')}
                            </SelectItem>
                            <SelectItem value="medium">
                              {t('inteligenciaMedium')}
                            </SelectItem>
                            <SelectItem value="high">
                              {t('inteligenciaHigh')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* UI-02: max_tokens — always visible */}
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">
                        {t('maxTokens')}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder={
                          maxTokensCap !== null
                            ? String(maxTokensCap)
                            : t('maxTokensHelperSinCap')
                        }
                        value={currentMaxTokens ?? ''}
                        onChange={(e) =>
                          updateDirtyField(a.alias, 'max_tokens', e.target.value)
                        }
                        className={`bg-zinc-950 border-zinc-800 text-zinc-50 h-8 text-sm w-full md:w-56 ${
                          maxTokensExceedsCap ? 'border-red-500' : ''
                        }`}
                      />
                      <p className="text-xs text-zinc-500">
                        {maxTokensCap !== null
                          ? t('maxTokensHelper', { cap: maxTokensCap })
                          : t('maxTokensHelperSinCap')}
                      </p>
                    </div>

                    {/* UI-03: thinking_budget — visible when TARGET reasoning supported */}
                    {reasoningSupported && (
                      <div className="space-y-1">
                        <Label className="text-xs text-zinc-400">
                          {t('thinkingBudget')}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={currentThinking ?? ''}
                          onChange={(e) =>
                            updateDirtyField(
                              a.alias,
                              'thinking_budget',
                              e.target.value
                            )
                          }
                          className={`bg-zinc-950 border-zinc-800 text-zinc-50 h-8 text-sm w-full md:w-56 ${
                            thinkingExceedsMax ? 'border-red-500' : ''
                          }`}
                        />
                        <p className="text-xs text-zinc-500">
                          {currentMaxTokens !== null
                            ? t('thinkingBudgetHelper', {
                                current: currentMaxTokens,
                              })
                            : t('thinkingBudgetHelperSinMax')}
                        </p>
                      </div>
                    )}

                    {/* Non-reasoning model messaging (distinct from unknown-caps branch) */}
                    {!reasoningSupported && targetCaps !== null && (
                      <p className="text-xs text-zinc-500">
                        {t('sinSoporteReasoning')}
                      </p>
                    )}

                    {/* Explicit Guardar — enabled only when row is dirty */}
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => saveRow(a.alias)}
                        disabled={!isDirty || updatingAlias === a.alias}
                      >
                        {t('guardar')}
                      </Button>
                    </div>
                  </div>
                )
              })()}
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
