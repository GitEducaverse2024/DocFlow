'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'

export function TabModelosPlaceholder() {
  const t = useTranslations('settings.modelCenter')

  return (
    <Card className="bg-zinc-900/80 border border-zinc-800">
      <CardContent className="p-8 flex items-center justify-center">
        <p className="text-zinc-400 text-sm">{t('placeholder.modelos')}</p>
      </CardContent>
    </Card>
  )
}
