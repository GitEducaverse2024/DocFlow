'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Cpu, LayoutDashboard, Key, GitBranch } from 'lucide-react'
import { TabResumen } from './tab-resumen'
import { TabProveedores } from './tab-proveedores'
import { TabModelos } from './tab-modelos'
import { TabEnrutamiento } from './tab-enrutamiento'

const TABS = [
  { key: 'resumen', icon: LayoutDashboard },
  { key: 'proveedores', icon: Key },
  { key: 'modelos', icon: Cpu },
  { key: 'enrutamiento', icon: GitBranch },
] as const

type TabKey = typeof TABS[number]['key']

function isValidTab(value: string | null): value is TabKey {
  return value !== null && TABS.some(t => t.key === value)
}

export function ModelCenterShell() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('settings.modelCenter')

  const tabParam = searchParams.get('tab')
  const activeTab: TabKey = isValidTab(tabParam) ? tabParam : 'resumen'

  const handleTabChange = (key: TabKey) => {
    router.replace(`/settings?tab=${key}`, { scroll: false })
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">{t('description')}</p>

      {/* Tab bar — horizontal, full width, same pattern as CatPower */}
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

      {/* Content — full width, no columns */}
      <div className="animate-fade-in">
        {activeTab === 'resumen' && <TabResumen />}
        {activeTab === 'proveedores' && <TabProveedores />}
        {activeTab === 'modelos' && <TabModelos />}
        {activeTab === 'enrutamiento' && <TabEnrutamiento />}
      </div>
    </section>
  )
}
