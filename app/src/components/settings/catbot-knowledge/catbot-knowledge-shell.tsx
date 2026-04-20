'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Brain, BookOpen, AlertCircle, Workflow } from 'lucide-react'
import { TabLearnedEntries } from './tab-learned-entries'
import { TabKnowledgeGaps } from './tab-knowledge-gaps'
import { TabPipelines } from './tab-pipelines'

const TABS = [
  { key: 'learned', icon: BookOpen },
  { key: 'gaps', icon: AlertCircle },
  { key: 'pipelines', icon: Workflow },
] as const

type TabKey = typeof TABS[number]['key']

function isValidTab(value: string | null): value is TabKey {
  return value !== null && TABS.some(t => t.key === value)
}

export function CatBotKnowledge() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('settings.knowledge')

  const tabParam = searchParams.get('ktab')
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : 'learned'

  const handleTabChange = (key: TabKey) => {
    router.replace(`/settings?ktab=${key}`, { scroll: false })
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">{t('description')}</p>

      <div className="border-b border-zinc-800 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-zinc-800 text-white border-b-2 border-violet-500'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(`tabs.${tab.key}`)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="animate-fade-in">
        {activeTab === 'learned' && <TabLearnedEntries />}
        {activeTab === 'gaps' && <TabKnowledgeGaps />}
        {activeTab === 'pipelines' && <TabPipelines />}
      </div>
    </section>
  )
}
