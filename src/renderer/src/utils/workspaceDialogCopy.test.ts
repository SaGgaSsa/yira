import i18next from 'i18next'
import { resources } from '../i18n/resources'
import { getWorkspaceDialogCopy } from './workspaceDialogCopy'

const i18n = i18next.createInstance()

await i18n.init({
  lng: 'es',
  fallbackLng: 'en',
  resources,
  interpolation: { escapeValue: false },
})

const translate = (key: string) => i18n.t(key)
const firstWorkspaceCopy = getWorkspaceDialogCopy('first', translate)
if (firstWorkspaceCopy.title !== 'Crea tu primer espacio de trabajo') {
  throw new Error('first-workspace dialog title must use the Spanish i18n resource')
}
if (firstWorkspaceCopy.eyebrow !== 'Configuración del primer espacio de trabajo') {
  throw new Error('first-workspace dialog eyebrow must use the Spanish i18n resource')
}
if (firstWorkspaceCopy.confirmLabel !== 'Nuevo espacio de trabajo') {
  throw new Error('first-workspace dialog confirm label must use the Spanish i18n resource')
}

const newWorkspaceCopy = getWorkspaceDialogCopy('new', translate)
if (newWorkspaceCopy.title !== 'Nuevo espacio de trabajo') {
  throw new Error('new-workspace dialog title must use the Spanish i18n resource')
}
if (newWorkspaceCopy.eyebrow !== 'Configuración del espacio de trabajo') {
  throw new Error('new-workspace dialog eyebrow must use the Spanish i18n resource')
}
if (newWorkspaceCopy.confirmLabel !== 'Nuevo espacio de trabajo') {
  throw new Error('new-workspace dialog confirm label must use the Spanish i18n resource')
}
