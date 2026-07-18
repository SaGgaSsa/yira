export type SupportedLanguage = 'en' | 'es'

export function resolveSupportedLanguage(locale?: string | null): SupportedLanguage {
  return locale?.toLowerCase().startsWith('es-') || locale?.toLowerCase() === 'es'
    ? 'es'
    : 'en'
}
