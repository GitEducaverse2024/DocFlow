'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * Tab Pipelines — 4th tab in Settings → Conocimiento de CatBot.
 * Phase 130 Plan 05 Task 2 (PIPE-08 closure).
 *
 * Shows active + recent intent_jobs (async CatFlow pipelines) for the current
 * user. Auto-refreshes every 10s. Tapping "Ver propuesta" on an
 * awaiting_approval job deep-links to /catflow/{canvas_id}.
 */

interface PipelineJob {
  id: string
  pipeline_phase: string
  status: string
  tool_name: string | null
  progress_message: { message?: string; goal?: string; [k: string]: unknown }
  canvas_id: string | null
  channel: string
  error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

const PHASE_COLORS: Record<string, string> = {
  pending: 'bg-zinc-700 text-zinc-200',
  strategist: 'bg-blue-700 text-blue-100',
  decomposer: 'bg-indigo-700 text-indigo-100',
  architect: 'bg-violet-700 text-violet-100',
  architect_retry: 'bg-violet-800 text-violet-100',
  awaiting_approval: 'bg-amber-600 text-amber-50',
  awaiting_user: 'bg-orange-600 text-orange-50',
  running: 'bg-emerald-600 text-emerald-50',
  completed: 'bg-green-700 text-green-50',
  failed: 'bg-red-700 text-red-100',
  cancelled: 'bg-zinc-600 text-zinc-200',
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return iso
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'hace segundos'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return `hace ${days} d`
}

export function TabPipelines() {
  const [jobs, setJobs] = useState<PipelineJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      // Dev fallback: single-user 'web:default'. Replace with session-based
      // resolution when project-wide auth is in place.
      const res = await fetch('/api/intent-jobs?user_id=web:default', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { jobs: PipelineJob[] }
      setJobs(data.jobs)
      setError(null)
      setLastRefresh(new Date())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const interval = setInterval(() => {
      void load()
    }, 10_000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando pipelines...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-red-400">
        Error cargando pipelines: {error}
        <Button size="sm" variant="outline" className="ml-3" onClick={() => void load()}>
          <RefreshCw className="w-3 h-3 mr-1" /> Reintentar
        </Button>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="p-8 text-zinc-400 text-sm">
        No hay pipelines activos ni recientes. Cuando CatBot enqueue un async CatFlow aparecera aqui
        en tiempo real.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-zinc-500 pb-2">
        <span>
          {jobs.length} pipeline{jobs.length === 1 ? '' : 's'}
        </span>
        {lastRefresh && <span>Actualizado {formatRelative(lastRefresh.toISOString())}</span>}
      </div>

      {jobs.map(job => {
        const title = String(job.progress_message.goal ?? job.tool_name ?? `Pipeline ${job.id.slice(0, 8)}`)
        const message = job.progress_message.message as string | undefined
        const phaseClass = PHASE_COLORS[job.pipeline_phase] ?? 'bg-zinc-700 text-zinc-200'
        const showApprove = job.pipeline_phase === 'awaiting_approval' && job.canvas_id

        return (
          <Card key={job.id} className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-100 truncate">{title}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {job.channel} · {formatRelative(job.created_at)} · {job.id.slice(0, 8)}
                </div>
              </div>
              <Badge className={phaseClass}>{job.pipeline_phase}</Badge>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {message && <p className="text-zinc-300">{message}</p>}
              {job.error && <p className="text-red-400 text-xs">{job.error}</p>}
              {showApprove && (
                <Link href={`/catflow/${job.canvas_id}`} className="inline-block">
                  <Button size="sm" variant="outline">
                    <ExternalLink className="w-3 h-3 mr-1" /> Ver propuesta
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
