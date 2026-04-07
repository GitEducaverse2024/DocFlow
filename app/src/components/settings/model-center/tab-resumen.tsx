'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

// ---- Types (duplicated from health.ts to avoid importing server-only module) ----

interface ProviderHealth {
  provider: string
  status: 'connected' | 'error'
  latency_ms: number | null
  model_count: number
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

// ---- Helpers ----

function relativeTime(
  isoDate: string,
  t: (key: string) => string
): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000))
  if (diff < 60) return `${t('ago')} ${diff}${t('seconds')}`
  if (diff < 3600) return `${t('ago')} ${Math.floor(diff / 60)}${t('minutes')}`
  return `${t('ago')} ${Math.floor(diff / 3600)}${t('hours')}`
}

function semaphoreColor(status: string): string {
  switch (status) {
    case 'connected':
    case 'direct':
      return 'bg-emerald-500'
    case 'fallback':
      return 'bg-amber-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-zinc-500'
  }
}

function statusBadgeVariant(status: string): string {
  switch (status) {
    case 'connected':
    case 'direct':
      return 'text-emerald-400 border-emerald-500/30'
    case 'fallback':
      return 'text-amber-400 border-amber-500/30'
    case 'error':
      return 'text-red-400 border-red-500/30'
    default:
      return 'text-zinc-400 border-zinc-500/30'
  }
}

// ---- Component ----

export function TabResumen() {
  const t = useTranslations('settings.modelCenter.resumen')

  const [healthData, setHealthData] = useState<HealthResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [timeLabel, setTimeLabel] = useState('')

  // Fetch health data (cached on mount, force on verify)
  const fetchHealth = useCallback(async (force = false) => {
    const url = force ? '/api/models/health?force=true' : '/api/models/health'
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Health API returned ${res.status}`)
    return (await res.json()) as HealthResult
  }, [])

  // Initial load
  useEffect(() => {
    let cancelled = false
    fetchHealth()
      .then((data) => {
        if (!cancelled) {
          setHealthData(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [fetchHealth])

  // Update relative time every 30s
  useEffect(() => {
    if (!healthData?.checked_at) return

    const update = () => setTimeLabel(relativeTime(healthData.checked_at, t))
    update()
    const interval = setInterval(update, 30_000)
    return () => clearInterval(interval)
  }, [healthData?.checked_at, t])

  // Verify: discovery refresh -> MID sync -> health check (force)
  const handleVerify = async () => {
    setVerifying(true)
    try {
      const refreshRes = await fetch('/api/discovery/refresh', { method: 'POST' })
      if (!refreshRes.ok) throw new Error(`Discovery refresh failed: ${refreshRes.status}`)

      const syncRes = await fetch('/api/mid/sync', { method: 'POST' })
      if (!syncRes.ok) throw new Error(`MID sync failed: ${syncRes.status}`)

      const data = await fetchHealth(true)
      setHealthData(data)
      toast.success(t('verifySuccess'))
    } catch (err) {
      toast.error(`${t('verifyError')}: ${(err as Error).message}`)
    } finally {
      setVerifying(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    )
  }

  // No data state
  if (!healthData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button
            onClick={handleVerify}
            disabled={verifying}
            className="bg-gradient-to-r from-violet-600 to-purple-700 text-white"
          >
            {verifying ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            {verifying ? t('verifying') : t('verify')}
          </Button>
        </div>
        <p className="text-sm text-zinc-400 text-center py-8">{t('noData')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top bar: timestamp + verify button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>{t('lastCheck')}: {timeLabel}</span>
          {healthData.cached && (
            <Badge variant="outline" className="text-xs text-zinc-500 border-zinc-700">
              ({t('cached')})
            </Badge>
          )}
        </div>
        <Button
          onClick={handleVerify}
          disabled={verifying}
          className="bg-gradient-to-r from-violet-600 to-purple-700 text-white"
        >
          {verifying ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {verifying ? t('verifying') : t('verify')}
        </Button>
      </div>

      {/* Providers section */}
      <Card className="bg-zinc-900/80 border border-zinc-800">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4">{t('providers')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {healthData.providers.map((p) => (
              <div
                key={p.provider}
                className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
              >
                <span className={`mt-1 w-3 h-3 rounded-full shrink-0 ${semaphoreColor(p.status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-zinc-100">{p.provider}</span>
                    <Badge variant="outline" className={`text-xs ${statusBadgeVariant(p.status)}`}>
                      {t(`status.${p.status}`)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                    <span>{p.latency_ms !== null ? `${p.latency_ms}ms` : '—'}</span>
                    <span>{p.model_count} {t('models')}</span>
                  </div>
                  {p.error && (
                    <p className="text-xs text-red-400 mt-1 truncate">{p.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Aliases section */}
      <Card className="bg-zinc-900/80 border border-zinc-800">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4">{t('aliases')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {healthData.aliases.map((a) => (
              <div
                key={a.alias}
                className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
              >
                <span className={`mt-1 w-3 h-3 rounded-full shrink-0 ${semaphoreColor(a.resolution_status)}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm text-zinc-100">{a.alias}</span>
                    <Badge variant="outline" className={`text-xs ${statusBadgeVariant(a.resolution_status)}`}>
                      {t(`status.${a.resolution_status}`)}
                    </Badge>
                  </div>
                  {a.resolution_status === 'fallback' ? (
                    <div className="mt-1 text-xs text-zinc-400">
                      <span className="text-zinc-500">{t('configuredModel')}:</span>{' '}
                      <span className="font-mono">{a.configured_model}</span>
                      <span className="mx-1 text-zinc-600">{'->'}</span>
                      <span className="text-zinc-500">{t('resolvedModel')}:</span>{' '}
                      <span className="font-mono text-amber-400">{a.resolved_model}</span>
                    </div>
                  ) : a.resolved_model ? (
                    <p className="text-xs text-zinc-400 font-mono mt-1 truncate">
                      {a.resolved_model}
                    </p>
                  ) : null}
                  {a.error && (
                    <p className="text-xs text-red-400 mt-1 truncate">{a.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
