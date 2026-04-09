'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface LearnedEntry {
  id: string
  knowledge_path: string
  category: string
  content: string
  learned_from: string
  confidence: number
  validated: boolean
  access_count: number
  created_at: string
  updated_at: string
}

interface KnowledgeStats {
  total: number
  staging: number
  validated: number
  avgAccessCount: number
}

export function TabLearnedEntries() {
  const t = useTranslations('settings.knowledge')
  const [entries, setEntries] = useState<LearnedEntry[]>([])
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showValidated, setShowValidated] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/catbot/knowledge/entries?validated=${showValidated}`).then(r => r.json()),
      fetch('/api/catbot/knowledge/stats').then(r => r.json()),
    ])
      .then(([entriesRes, statsData]) => {
        setEntries(entriesRes.entries ?? entriesRes)
        setStats(statsData)
      })
      .catch(() => toast.error(t('errors.loadFailed')))
      .finally(() => setLoading(false))
  }, [showValidated, t])

  const handleValidate = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    try {
      const res = await fetch('/api/catbot/knowledge/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'validate' }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('entries.entryValidated'))
      if (stats) setStats({ ...stats, staging: stats.staging - 1, validated: stats.validated + 1 })
    } catch {
      toast.error(t('errors.actionFailed'))
    }
  }

  const handleReject = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    try {
      const res = await fetch('/api/catbot/knowledge/entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'reject' }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('entries.entryRejected'))
      if (stats) setStats({ ...stats, staging: stats.staging - 1, total: stats.total - 1 })
    } catch {
      toast.error(t('errors.actionFailed'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t('stats.total'), value: stats.total },
            { label: t('stats.staging'), value: stats.staging },
            { label: t('stats.validated'), value: stats.validated },
            { label: t('stats.avgAccess'), value: stats.avgAccessCount },
          ].map((s) => (
            <Card key={s.label} className="bg-zinc-900/80 border-zinc-800">
              <CardContent className="p-3">
                <p className="text-xs text-zinc-400">{s.label}</p>
                <p className="text-lg font-semibold text-zinc-50">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowValidated(false)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            !showValidated ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('entries.staging')}
        </button>
        <button
          onClick={() => setShowValidated(true)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            showValidated ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('entries.validated')}
        </button>
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500 py-8 text-center">{t('entries.noEntries')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="text-left py-2 px-3 font-medium">{t('entries.content')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('entries.area')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('entries.category')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('entries.date')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('entries.accessCount')}</th>
                {!showValidated && <th className="text-left py-2 px-3 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 px-3 text-zinc-200 max-w-xs truncate">
                    {entry.content.length > 100 ? entry.content.slice(0, 100) + '...' : entry.content}
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
                      {entry.knowledge_path}
                    </Badge>
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
                      {entry.category}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-3 text-zinc-400">{entry.access_count}</td>
                  {!showValidated && (
                    <td className="py-2 px-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleValidate(entry.id)}
                          className="p-1 rounded hover:bg-emerald-900/50 text-emerald-400 transition-colors"
                          title={t('entries.validate')}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReject(entry.id)}
                          className="p-1 rounded hover:bg-red-900/50 text-red-400 transition-colors"
                          title={t('entries.reject')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
