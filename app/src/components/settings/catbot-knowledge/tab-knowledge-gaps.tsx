'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2, CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface KnowledgeGap {
  id: string
  knowledge_path: string
  query: string
  context: string
  reported_at: string
  resolved: boolean
  resolved_at: string | null
}

export function TabKnowledgeGaps() {
  const t = useTranslations('settings.knowledge')
  const [gaps, setGaps] = useState<KnowledgeGap[]>([])
  const [loading, setLoading] = useState(true)
  const [filterResolved, setFilterResolved] = useState<'pending' | 'resolved'>('pending')
  const [filterArea, setFilterArea] = useState('')
  const [areas, setAreas] = useState<string[]>([])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('resolved', filterResolved === 'resolved' ? 'true' : 'false')
    if (filterArea) params.set('area', filterArea)

    fetch(`/api/catbot/knowledge/gaps?${params}`)
      .then(r => r.json())
      .then((res) => {
        const data: KnowledgeGap[] = res.gaps ?? res
        setGaps(data)
        if (!filterArea) {
          const uniqueAreas = Array.from(new Set(data.map(g => g.knowledge_path))).sort()
          setAreas(uniqueAreas)
        }
      })
      .catch(() => toast.error(t('errors.loadFailed')))
      .finally(() => setLoading(false))
  }, [filterResolved, filterArea, t])

  const handleResolve = async (id: string) => {
    setGaps(prev => prev.filter(g => g.id !== id))
    try {
      const res = await fetch('/api/catbot/knowledge/gaps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'resolve' }),
      })
      if (!res.ok) throw new Error()
      toast.success(t('gaps.gapResolved'))
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
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setFilterResolved('pending')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            filterResolved === 'pending' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('gaps.pending')}
        </button>
        <button
          onClick={() => setFilterResolved('resolved')}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            filterResolved === 'resolved' ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {t('gaps.resolved')}
        </button>
        <select
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 focus:border-violet-500 focus:outline-none"
        >
          <option value="">{t('gaps.allAreas')}</option>
          {areas.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {gaps.length === 0 ? (
        <p className="text-sm text-zinc-500 py-8 text-center">{t('gaps.noGaps')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="text-left py-2 px-3 font-medium">{t('gaps.query')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('entries.area')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('gaps.reportedAt')}</th>
                <th className="text-left py-2 px-3 font-medium">{t('gaps.context')}</th>
                <th className="text-left py-2 px-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr key={gap.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 px-3 text-zinc-200">{gap.query}</td>
                  <td className="py-2 px-3">
                    <Badge variant="outline" className="text-xs border-zinc-700 text-zinc-300">
                      {gap.knowledge_path}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-zinc-400 whitespace-nowrap">
                    {new Date(gap.reported_at).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-3 text-zinc-400 max-w-xs truncate">
                    {gap.context ? (gap.context.length > 80 ? gap.context.slice(0, 80) + '...' : gap.context) : '-'}
                  </td>
                  <td className="py-2 px-3">
                    {filterResolved === 'pending' ? (
                      <button
                        onClick={() => handleResolve(gap.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {t('gaps.resolve')}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">
                        {gap.resolved_at ? new Date(gap.resolved_at).toLocaleDateString() : '-'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
