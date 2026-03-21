// Re-export conveniente para uso en componentes cliente
// Uso: const t = useT('nav') → t('dashboard')
// O:   const t = useT() → t('common.save')
export { useTranslations as useT } from 'next-intl';
