'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import {
  Eye,
  EyeOff,
  Trash2,
  FlaskConical,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ---- Types (duplicated to avoid importing server-only modules) ----

interface ProviderConfig {
  id: string
  provider: string
  api_key: string | null
  endpoint: string | null
  has_key: boolean
  is_active: number
  last_tested: string | null
  test_status: string
}

interface ProviderHealth {
  provider: string
  status: string // 'connected' | 'error'
  latency_ms: number | null
  model_count: number
  error?: string
}

interface HealthResult {
  providers: ProviderHealth[]
  checked_at: string
  cached: boolean
}

const PROVIDER_META: Record<
  string,
  { emoji: string; name: string; description: string; models: string[]; needsKey: boolean }
> = {
  openai: { emoji: '\u{1F7E2}', name: 'OpenAI', description: 'GPT-4o, GPT-4o-mini, GPT-5.4', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-5.4'], needsKey: true },
  anthropic: { emoji: '\u{1F7E4}', name: 'Anthropic (Claude)', description: 'Claude Sonnet 4.6, Claude Opus 4.6', models: ['claude-sonnet-4-6', 'claude-opus-4-6'], needsKey: true },
  google: { emoji: '\u{1F535}', name: 'Google (Gemini)', description: 'Gemini 2.5 Pro, Gemini 2.5 Flash', models: ['gemini-2.5-pro', 'gemini-2.5-flash'], needsKey: true },
  litellm: { emoji: '\u26A1', name: 'LiteLLM (Gateway local)', description: 'Proxy local con modelos de tu routing.yaml', models: [], needsKey: false },
  ollama: { emoji: '\u{1F999}', name: 'Ollama (Local)', description: 'Modelos locales en tu GPU. No requiere API key', models: [], needsKey: false },
}

// ---- Component ----

export function TabProveedores() {
  const t = useTranslations('settings.modelCenter.proveedores')

  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [healthMap, setHealthMap] = useState<Record<string, ProviderHealth>>({})
  const [loading, setLoading] = useState(true)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)

  // Per-provider UI state
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [newKeyValue, setNewKeyValue] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({})
  const [editingEndpoint, setEditingEndpoint] = useState<Record<string, boolean>>({})
  const [endpointValue, setEndpointValue] = useState<Record<string, string>>({})
  const [savingEndpoint, setSavingEndpoint] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResult, setTestResult] = useState<Record<string, { status: string; models?: number; error?: string }>>({})
  const [confirmDelete, setConfirmDelete] = useState<Record<string, boolean>>({})

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/api-keys')
      if (res.ok) {
        const data: ProviderConfig[] = await res.json()
        setProviders(data)
      }
    } catch {
      // silently fail
    }
  }, [])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/models/health')
      if (res.ok) {
        const data: HealthResult = await res.json()
        const map: Record<string, ProviderHealth> = {}
        for (const p of data.providers) {
          map[p.provider] = p
        }
        setHealthMap(map)
      }
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchProviders(), fetchHealth()]).then(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchProviders, fetchHealth])

  // ---- Actions ----

  const handleTest = async (provider: string) => {
    setTesting((prev) => ({ ...prev, [provider]: true }))
    setTestResult((prev) => ({ ...prev, [provider]: undefined as unknown as typeof prev[string] }))
    try {
      const res = await fetch(`/api/settings/api-keys/${provider}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'ok') {
        const meta = PROVIDER_META[provider]
        toast.success(t('testSuccess', { name: meta?.name ?? provider }))
        setTestResult((prev) => ({ ...prev, [provider]: { status: 'ok', models: data.models?.length } }))
      } else {
        const meta = PROVIDER_META[provider]
        toast.error(t('testError', { name: meta?.name ?? provider, error: data.error ?? 'Unknown error' }))
        setTestResult((prev) => ({ ...prev, [provider]: { status: 'failed', error: data.error } }))
      }
      await fetchProviders()
      await fetchHealth()
    } catch (err) {
      const meta = PROVIDER_META[provider]
      toast.error(t('testError', { name: meta?.name ?? provider, error: (err as Error).message }))
      setTestResult((prev) => ({ ...prev, [provider]: { status: 'failed', error: (err as Error).message } }))
    } finally {
      setTesting((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const handleSaveKey = async (provider: string) => {
    const key = newKeyValue[provider]
    if (!key?.trim()) return
    setSavingKey((prev) => ({ ...prev, [provider]: true }))
    try {
      const res = await fetch(`/api/settings/api-keys/${provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key.trim() }),
      })
      if (res.ok) {
        const meta = PROVIDER_META[provider]
        toast.success(t('keySaved', { name: meta?.name ?? provider }))
        setNewKeyValue((prev) => ({ ...prev, [provider]: '' }))
        await fetchProviders()
        // Auto-test after saving key
        await handleTest(provider)
      } else {
        toast.error(t('keySaveError'))
      }
    } catch {
      toast.error(t('keySaveError'))
    } finally {
      setSavingKey((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const handleDeleteKey = async (provider: string) => {
    try {
      const res = await fetch(`/api/settings/api-keys/${provider}`, { method: 'DELETE' })
      if (res.ok) {
        const meta = PROVIDER_META[provider]
        toast.success(t('keyDeleted', { name: meta?.name ?? provider }))
        setConfirmDelete((prev) => ({ ...prev, [provider]: false }))
        setTestResult((prev) => ({ ...prev, [provider]: undefined as unknown as typeof prev[string] }))
        await fetchProviders()
        await fetchHealth()
      } else {
        toast.error(t('keyDeleteError'))
      }
    } catch {
      toast.error(t('keyDeleteError'))
    }
  }

  const handleSaveEndpoint = async (provider: string) => {
    const ep = endpointValue[provider]
    setSavingEndpoint((prev) => ({ ...prev, [provider]: true }))
    try {
      const res = await fetch(`/api/settings/api-keys/${provider}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: ep?.trim() || null }),
      })
      if (res.ok) {
        const meta = PROVIDER_META[provider]
        toast.success(t('endpointSaved', { name: meta?.name ?? provider }))
        setEditingEndpoint((prev) => ({ ...prev, [provider]: false }))
        await fetchProviders()
      } else {
        toast.error(t('endpointError'))
      }
    } catch {
      toast.error(t('endpointError'))
    } finally {
      setSavingEndpoint((prev) => ({ ...prev, [provider]: false }))
    }
  }

  const toggleExpand = (provider: string) => {
    setExpandedProvider((prev) => (prev === provider ? null : provider))
  }

  // ---- Helpers ----

  function getSemaphoreColor(provider: string): string {
    const health = healthMap[provider]
    if (!health) return 'bg-zinc-600'
    return health.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
  }

  function getModelCount(provider: string): number {
    return healthMap[provider]?.model_count ?? 0
  }

  function getStatusLabel(config: ProviderConfig): string {
    if (config.test_status === 'ok') return t('connected')
    if (config.test_status === 'failed') return t('error')
    if (config.test_status === 'untested' && config.has_key) return t('untested')
    if (!config.has_key && PROVIDER_META[config.provider]?.needsKey) return t('notConfigured')
    return t('untested')
  }

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        <span className="ml-2 text-sm text-zinc-400">{t('loading')}</span>
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <p className="text-sm text-zinc-400 text-center py-8">{t('noProviders')}</p>
    )
  }

  return (
    <div className="space-y-2">
      {providers.map((config) => {
        const meta = PROVIDER_META[config.provider]
        const isExpanded = expandedProvider === config.provider
        const modelCount = getModelCount(config.provider)

        return (
          <Card
            key={config.provider}
            className="bg-zinc-900/80 border border-zinc-800 hover:border-violet-800/30 transition-colors overflow-hidden"
          >
            {/* Collapsed header - always visible */}
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left"
              onClick={() => toggleExpand(config.provider)}
            >
              <span className="text-lg">{meta?.emoji ?? '?'}</span>
              <span className="font-semibold text-sm text-zinc-50 flex-1">
                {meta?.name ?? config.provider}
              </span>
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${getSemaphoreColor(config.provider)}`}
              />
              {modelCount > 0 && (
                <Badge variant="outline" className="text-xs text-zinc-400 border-zinc-700">
                  {modelCount === 1 ? t('modelsSingular') : t('models', { count: modelCount })}
                </Badge>
              )}
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              )}
            </button>

            {/* Expanded content */}
            <div
              className={`transition-all duration-200 overflow-hidden ${
                isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-4 pb-4 space-y-4 border-t border-zinc-800">
                {/* API Key section */}
                {meta?.needsKey ? (
                  <div className="pt-3">
                    <label className="text-xs text-zinc-500 block mb-1">{t('apiKey')}</label>
                    {config.has_key ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type={showKey[config.provider] ? 'text' : 'password'}
                          value="sk-****************************"
                          readOnly
                          className="flex-1 font-mono text-xs bg-zinc-800/50 border-zinc-700 text-zinc-300"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-zinc-400 hover:text-zinc-200"
                          onClick={() => setShowKey((prev) => ({ ...prev, [config.provider]: !prev[config.provider] }))}
                          title={showKey[config.provider] ? t('hideKey') : t('showKey')}
                        >
                          {showKey[config.provider] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </Button>
                        {!confirmDelete[config.provider] ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => setConfirmDelete((prev) => ({ ...prev, [config.provider]: true }))}
                            title={t('delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-red-400">{t('deleteConfirm')}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-400 hover:text-red-300 text-xs"
                              onClick={() => handleDeleteKey(config.provider)}
                            >
                              {t('confirm')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-zinc-400 text-xs"
                              onClick={() => setConfirmDelete((prev) => ({ ...prev, [config.provider]: false }))}
                            >
                              {t('cancel')}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="password"
                          placeholder={t('enterKey')}
                          value={newKeyValue[config.provider] ?? ''}
                          onChange={(e) => setNewKeyValue((prev) => ({ ...prev, [config.provider]: e.target.value }))}
                          className="flex-1 font-mono text-xs bg-zinc-800/50 border-zinc-700 text-zinc-300"
                        />
                        <Button
                          size="sm"
                          disabled={!newKeyValue[config.provider]?.trim() || savingKey[config.provider]}
                          className="bg-gradient-to-r from-violet-600 to-purple-700 text-white text-xs"
                          onClick={() => handleSaveKey(config.provider)}
                        >
                          {savingKey[config.provider] ? (
                            <Loader2 className="w-3 h-3 animate-spin mr-1" />
                          ) : null}
                          {savingKey[config.provider] ? t('saving') : t('save')}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pt-3">
                    <span className="text-xs text-zinc-500">{t('noKeyNeeded')}</span>
                  </div>
                )}

                {/* Endpoint section */}
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">{t('endpoint')}</label>
                  {editingEndpoint[config.provider] ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={endpointValue[config.provider] ?? ''}
                        onChange={(e) => setEndpointValue((prev) => ({ ...prev, [config.provider]: e.target.value }))}
                        className="flex-1 font-mono text-xs bg-zinc-800/50 border-zinc-700 text-zinc-300"
                      />
                      <Button
                        size="sm"
                        disabled={savingEndpoint[config.provider]}
                        className="bg-gradient-to-r from-violet-600 to-purple-700 text-white text-xs"
                        onClick={() => handleSaveEndpoint(config.provider)}
                      >
                        {savingEndpoint[config.provider] ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : null}
                        OK
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-zinc-400 text-xs"
                        onClick={() => setEditingEndpoint((prev) => ({ ...prev, [config.provider]: false }))}
                      >
                        {t('cancel')}
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="font-mono text-xs text-zinc-300 underline decoration-dotted cursor-pointer hover:text-zinc-100 transition-colors"
                      onClick={() => {
                        setEndpointValue((prev) => ({ ...prev, [config.provider]: config.endpoint ?? '' }))
                        setEditingEndpoint((prev) => ({ ...prev, [config.provider]: true }))
                      }}
                    >
                      {config.endpoint || t('notSet')}
                    </button>
                  )}
                </div>

                {/* Test button + result */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testing[config.provider]}
                    className="border-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs"
                    onClick={() => handleTest(config.provider)}
                  >
                    {testing[config.provider] ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <FlaskConical className="w-3 h-3 mr-1" />
                    )}
                    {testing[config.provider] ? t('testing') : t('test')}
                  </Button>

                  <span className="text-xs text-zinc-500">{getStatusLabel(config)}</span>

                  {testResult[config.provider]?.status === 'ok' && testResult[config.provider]?.models != null && (
                    <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                      {t('modelsAvailable', { count: testResult[config.provider].models })}
                    </Badge>
                  )}
                  {testResult[config.provider]?.status === 'failed' && testResult[config.provider]?.error && (
                    <span className="text-xs text-red-400 truncate max-w-[200px]">
                      {testResult[config.provider].error}
                    </span>
                  )}
                </div>

                {/* Last tested */}
                {config.last_tested && (
                  <p className="text-xs text-zinc-600">
                    {t('lastTested')}: {new Date(config.last_tested).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
