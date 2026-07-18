import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import type { SupportedLanguage } from './language'
import { resources } from './resources'

export const i18n = i18next.createInstance()

export async function initializeI18n(language: SupportedLanguage = 'en'): Promise<void> {
  if (i18n.isInitialized) {
    await i18n.changeLanguage(language)
    return
  }

  await i18n
    .use(initReactI18next)
    .init({
      fallbackLng: 'en',
      lng: language,
      resources,
      interpolation: {
        escapeValue: false,
      },
    })
}
