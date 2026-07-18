import { i18n, initializeI18n } from './index'

await initializeI18n('es')

if (i18n.language !== 'es') {
  throw new Error('Initialization must use the requested supported language')
}

if (i18n.t('settings.language') !== 'Idioma') {
  throw new Error('Initialization must expose Spanish translations')
}

await initializeI18n('en')

if (i18n.t('settings.language') !== 'Language') {
  throw new Error('Initialization must allow switching back to English')
}
