import i18next from 'i18next'
import { resources } from './resources'

const i18n = i18next.createInstance()

await i18n.init({
  lng: 'es',
  fallbackLng: 'en',
  resources,
  interpolation: { escapeValue: false },
})

if (i18n.t('app.welcome', { name: 'Yira' }) !== 'Bienvenido a Yira') {
  throw new Error('Spanish resources must translate interpolated values')
}

if (i18n.t('common.tileCount', { count: 2 }) !== '2 paneles') {
  throw new Error('Spanish resources must translate pluralized values')
}
