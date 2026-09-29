import type { SupportedLanguage } from '@shared/language'

type MainTextKey =
  | 'installUpdateTitle' | 'installUpdateOneTerminal' | 'installUpdateManyTerminals'
  | 'installUpdateDetail' | 'installUpdate' | 'later'
  | 'unsavedFileDrafts' | 'collectDraftsFailed' | 'saveWorkspaceFailed'
  | 'closeTerminalsFailed' | 'retry' | 'closeWithoutSaving' | 'cancel'
  | 'remoteHostUnresolved' | 'wakeOnLanFailed' | 'hostRespondedSshUnavailable'
  | 'wakeUnconfirmed' | 'sshOutsideDeadline' | 'selectWorkspaceRootFolder' | 'openProjectFolder'
  | 'automaticUpdatesUnavailable' | 'newVersionAvailable' | 'alreadyLatestVersion'
  | 'downloadingLatestUpdate' | 'updateReady' | 'checkingUpdatesBackground' | 'checkingUpdates'
  | 'startupUpdateTimeout' | 'manualUpdateTimeout'
  | 'updateNetworkError' | 'updateMissingMetadata' | 'updateUnauthorized' | 'updateInvalidMetadata' | 'updateGenericError'

const texts: Record<SupportedLanguage, Record<MainTextKey, string>> = {
  en: {
    installUpdateTitle: 'Install update',
    installUpdateOneTerminal: '1 terminal is open. It will be closed to install the update.',
    installUpdateManyTerminals: '{{count}} terminals are open. They will be closed to install the update.',
    installUpdateDetail: 'Processes running in them, including agents, will stop. You can install the update later.',
    installUpdate: 'Install and restart',
    later: 'Later',
    unsavedFileDrafts: 'Unsaved file drafts',
    collectDraftsFailed: 'Yira could not collect every open file draft.',
    saveWorkspaceFailed: 'Yira could not save the current workspace.',
    closeTerminalsFailed: 'Yira could not close every terminal session.',
    retry: 'Retry',
    closeWithoutSaving: 'Close without saving',
    cancel: 'Cancel',
    remoteHostUnresolved: 'Could not resolve the remote host',
    wakeOnLanFailed: 'Could not send Wake-on-LAN',
    hostRespondedSshUnavailable: 'Host responded, but SSH was unavailable after 60 seconds',
    wakeUnconfirmed: 'No response; wake-up was not confirmed after 60 seconds',
    sshOutsideDeadline: 'SSH responded outside the 60-second deadline',
    selectWorkspaceRootFolder: 'Select Workspace Root Folder',
    openProjectFolder: 'Open Project Folder',
    automaticUpdatesUnavailable: 'Automatic updates are only available in installed builds.',
    newVersionAvailable: 'A new version is available. Downloading in the background.',
    alreadyLatestVersion: 'You are already on the latest version.',
    downloadingLatestUpdate: 'Downloading the latest update in the background.',
    updateReady: 'The update is ready to install. Restart Yira to apply it.',
    checkingUpdatesBackground: 'Checking for updates in the background.',
    checkingUpdates: 'Checking for updates.',
    startupUpdateTimeout: 'Update check timed out. Yira will keep working offline.',
    manualUpdateTimeout: 'Update check timed out. Yira is still usable offline; try again later.',
    updateNetworkError: 'Unable to reach GitHub. Check your internet connection and try again.',
    updateMissingMetadata: 'This Yira release is missing update information. Try again later or download the latest version from GitHub Releases.',
    updateUnauthorized: 'GitHub could not authorize the update check. Try again later.',
    updateInvalidMetadata: 'GitHub returned invalid update information. Try again later.',
    updateGenericError: 'Unable to check for updates right now. Try again later.',
  },
  es: {
    installUpdateTitle: 'Instalar actualización',
    installUpdateOneTerminal: 'Hay 1 terminal abierta. Se cerrará al instalar la actualización.',
    installUpdateManyTerminals: 'Hay {{count}} terminales abiertas. Se cerrarán al instalar la actualización.',
    installUpdateDetail: 'Los procesos que se ejecutan en ellas, incluidos los agentes, se detendrán. Puedes instalar la actualización más tarde.',
    installUpdate: 'Instalar y reiniciar',
    later: 'Más tarde',
    unsavedFileDrafts: 'Borradores de archivos sin guardar',
    collectDraftsFailed: 'Yira no pudo recopilar todos los borradores de archivos abiertos.',
    saveWorkspaceFailed: 'Yira no pudo guardar el espacio de trabajo actual.',
    closeTerminalsFailed: 'Yira no pudo cerrar todas las sesiones de terminal.',
    retry: 'Reintentar',
    closeWithoutSaving: 'Cerrar sin guardar',
    cancel: 'Cancelar',
    remoteHostUnresolved: 'No se pudo resolver el host remoto',
    wakeOnLanFailed: 'No se pudo enviar Wake-on-LAN',
    hostRespondedSshUnavailable: 'El equipo respondió, pero SSH no estuvo disponible tras 60 segundos',
    wakeUnconfirmed: 'Sin respuesta; no se confirmó la activación tras 60 segundos',
    sshOutsideDeadline: 'SSH respondió fuera del plazo de 60 segundos',
    selectWorkspaceRootFolder: 'Seleccionar carpeta raíz del espacio de trabajo',
    openProjectFolder: 'Abrir carpeta del proyecto',
    automaticUpdatesUnavailable: 'Las actualizaciones automáticas solo están disponibles en las versiones instaladas.',
    newVersionAvailable: 'Hay una versión nueva disponible. Se está descargando en segundo plano.',
    alreadyLatestVersion: 'Ya tienes la versión más reciente.',
    downloadingLatestUpdate: 'Se está descargando la última actualización en segundo plano.',
    updateReady: 'La actualización está lista. Reinicia Yira para instalarla.',
    checkingUpdatesBackground: 'Buscando actualizaciones en segundo plano.',
    checkingUpdates: 'Buscando actualizaciones.',
    startupUpdateTimeout: 'Se agotó el tiempo de búsqueda. Yira seguirá funcionando sin conexión.',
    manualUpdateTimeout: 'Se agotó el tiempo de búsqueda. Puedes seguir usando Yira sin conexión; inténtalo más tarde.',
    updateNetworkError: 'No se pudo conectar con GitHub. Comprueba tu conexión a internet e inténtalo de nuevo.',
    updateMissingMetadata: 'A esta versión de Yira le falta información de actualización. Inténtalo más tarde o descarga la última versión desde GitHub Releases.',
    updateUnauthorized: 'GitHub no pudo autorizar la búsqueda de actualizaciones. Inténtalo más tarde.',
    updateInvalidMetadata: 'GitHub devolvió información de actualización no válida. Inténtalo más tarde.',
    updateGenericError: 'No se pudieron buscar actualizaciones ahora. Inténtalo más tarde.',
  },
}

let currentLanguage: SupportedLanguage = 'en'

export function setMainLanguage(language: SupportedLanguage): void {
  currentLanguage = language
}

export function getMainLanguage(): SupportedLanguage {
  return currentLanguage
}

export function mainText(key: MainTextKey, values: Record<string, string | number> = {}): string {
  return texts[currentLanguage][key].replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(values[name] ?? ''))
}
