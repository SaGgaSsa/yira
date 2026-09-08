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

for (const [key, expected] of [
  ['workspace.sourceControl', 'Source Control'],
  ['workspace.repository', 'Repositorio'],
  ['workspace.selectRepositories', 'Seleccionar repositorios'],
  ['workspace.noRepositoriesConfigured', 'No hay repositorios configurados'],
  ['workspace.pin', 'Fijar espacio de trabajo'],
  ['workspace.unpin', 'Desfijar espacio de trabajo'],
] as const) {
  if (i18n.t(key) !== expected) throw new Error(`Spanish source control copy must translate ${key}`)
}

await i18n.changeLanguage('en')
for (const [key, expected] of [
  ['workspace.sourceControl', 'Source Control'],
  ['workspace.repository', 'Repository'],
  ['workspace.selectRepositories', 'Select repositories'],
  ['workspace.noRepositoriesConfigured', 'No repositories configured'],
  ['workspace.pin', 'Pin workspace'],
  ['workspace.unpin', 'Unpin workspace'],
] as const) {
  if (i18n.t(key) !== expected) throw new Error(`English source control copy must translate ${key}`)
}
