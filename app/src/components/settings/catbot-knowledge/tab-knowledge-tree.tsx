'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface TreeArea {
  id: string
  name: string
  path: string
  updated_at: string
  counts: {
    tools: number
    concepts: number
    howto: number
    dont: number
    common_errors: number
    endpoints: number
    sources: number
  }
  completeness: number
}

function getSemaphoreColor(completeness: number): string {
  if (completeness >= 1.0) return 'bg-emerald-500'
  if (completeness >= 0.57) return 'bg-amber-500'
  return 'bg-red-500'
}

export function TabKnowledgeTree() {
  const t = useTranslations('settings.knowledge')
  const [areas, setAreas] = useState<TreeArea[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/catbot/knowledge/tree')
      .then(r => r.json())
      .then((res) => setAreas(res.areas ?? res))
      .catch(() => toast.error(t('errors.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {areas.map((area) => (
        <Card key={area.id} className="bg-zinc-900/80 border-zinc-800 hover:border-violet-800/30 transition-colors">
          <CardContent className="p-4">
            {/* Header: name + semaphore */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-100">{area.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">
                  {Math.round(area.completeness * 100)}%
                </span>
                <div className={`w-3 h-3 rounded-full ${getSemaphoreColor(area.completeness)}`} />
              </div>
            </div>

            {/* Counts grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-3">
              {[
                { key: 'tools', value: area.counts.tools },
                { key: 'concepts', value: area.counts.concepts },
                { key: 'howto', value: area.counts.howto },
                { key: 'dont', value: area.counts.dont },
                { key: 'errors', value: area.counts.common_errors },
                { key: 'endpoints', value: area.counts.endpoints },
                { key: 'sources', value: area.counts.sources },
              ].map(({ key, value }) => (
                <div key={key} className="flex justify-between">
                  <span className="text-zinc-400">{t(`tree.${key}`)}</span>
                  <span className="text-zinc-200 font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Updated at */}
            <p className="text-xs text-zinc-500">
              {t('tree.updatedAt')}: {area.updated_at}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
