'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Cpu } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TabResumen } from './tab-resumen'
import { TabProveedores } from './tab-proveedores'
import { TabModelos } from './tab-modelos'
import { TabEnrutamientoPlaceholder } from './tab-enrutamiento-placeholder'

const VALID_TABS = ['resumen', 'proveedores', 'modelos', 'enrutamiento'] as const
type TabValue = typeof VALID_TABS[number]

const TAB_INDEX_MAP: Record<TabValue, number> = {
  resumen: 0,
  proveedores: 1,
  modelos: 2,
  enrutamiento: 3,
}

const INDEX_TAB_MAP: TabValue[] = ['resumen', 'proveedores', 'modelos', 'enrutamiento']

function isValidTab(value: string | null): value is TabValue {
  return value !== null && VALID_TABS.includes(value as TabValue)
}

export function ModelCenterShell() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('settings.modelCenter')

  const tabParam = searchParams.get('tab')
  const activeTab: TabValue = isValidTab(tabParam) ? tabParam : 'resumen'
  const activeIndex = TAB_INDEX_MAP[activeTab]

  const handleTabChange = (index: number | null) => {
    if (index === null) return
    const newTab = INDEX_TAB_MAP[index]
    if (newTab) {
      router.replace(`/settings?tab=${newTab}`, { scroll: false })
    }
  }

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-2">
        <Cpu className="w-5 h-5 text-violet-400" />
        <h2 className="text-xl font-semibold text-zinc-50">{t('title')}</h2>
      </div>
      <p className="text-sm text-zinc-400 mb-6">{t('description')}</p>

      <Tabs
        value={activeIndex}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-1 w-full">
          {VALID_TABS.map((tab, idx) => (
            <TabsTrigger
              key={tab}
              value={idx}
              className="flex-1 data-[active]:bg-violet-600 data-[active]:text-white data-[active]:border-violet-500 rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {t(`tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4">
          <TabsContent value={0}>
            <TabResumen />
          </TabsContent>
          <TabsContent value={1}>
            <TabProveedores />
          </TabsContent>
          <TabsContent value={2}>
            <TabModelos />
          </TabsContent>
          <TabsContent value={3}>
            <TabEnrutamientoPlaceholder />
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}
