import type { SupportedLanguage } from './language'

type TranslationResources = {
  common: {
    add: string
    apply: string
    back: string
    cancel: string
    close: string
    confirm: string
    continue: string
    create: string
    delete: string
    edit: string
    error: string
    loading: string
    name: string
    none: string
    open: string
    refresh: string
    remove: string
    save: string
    search: string
    settings: string
    tileCount_one: string
    tileCount_other: string
  }
  app: {
    welcome: string
    activeSurfaces: string
    createFirstWorkspace: string
    emptyWorkspace: string
    firstWorkspaceSetup: string
    newWorkspace: string
    openFolder: string
    manageWorkspaces: string
  }
  sidebar: {
    groups: string
    workspaceActions: string
    collapse: string
    open: string
  }
  settings: {
    active: string
    appearance: string
    aboutAndUpdates: string
    advanced: string
    browser: string
    canvas: string
    checkForUpdates: string
    checking: string
    currentVersion: string
    defaultStartPage: string
    delayNativeAttention: string
    delayNativeAttentionDescription: string
    density: string
    language: string
    languageDescription: string
    english: string
    spanish: string
    fonts: string
    gridAndSnapping: string
    gridSize: string
    gridVisible: string
    groupsCapability: string
    groupsCapabilityDescription: string
    homeUrl: string
    interfaceFontSize: string
    keyboardShortcutCatalog: string
    latestFound: string
    notificationsAndCreation: string
    openRawCanvasJson: string
    restartToInstall: string
    sections: string
    selectCategory: string
    settingsMatrix: string
    shortcuts: string
    shortcutClosePanelsOrClearSelection: string
    shortcutConfirmDialogAction: string
    shortcutFocusLeftSplitPanel: string
    shortcutFocusRightSplitPanel: string
    shortcutNavigation: string
    shortcutNextTab: string
    shortcutPreviousTab: string
    shortcutContextual: string
    shortcutToggleFullscreen: string
    shortcutWindow: string
    snapEnabled: string
    systemControls: string
    terminal: string
    terminalAttention: string
    terminalAttentionDescription: string
    textScale: string
    themeAndAttention: string
    tileContentFontSize: string
    tiles: string
    updateAvailable: string
    updateChecking: string
    updateDownloaded: string
    updateDownloading: string
    updateDownloadingProgress: string
    updateStatusAvailable: string
    updateStatusChecking: string
    updateStatusDownloaded: string
    updateStatusDownloading: string
    updateStatusError: string
    updateStatusIdle: string
    updateStatusUnsupported: string
    updateStatusUpToDate: string
    updateUnsupported: string
    updateUpToDate: string
    updateUnable: string
    updateWaiting: string
    versionAndReleases: string
    workspaceInternals: string
    theme: string
    light: string
    dark: string
    system: string
    fontSize: string
  }
  dialogs: {
    closeDialog: string
    confirmationRequired: string
    inputRequired: string
    value: string
    persistedStateWarning: string
  }
  workspace: {
    canvas: string
    grid: string
    workspace: string
    workspaceName: string
    workspaceSettings: string
    workspaceType: string
    rootFolder: string
    noFolderSelected: string
    initialCommand: string
    optionalCommand: string
    remoteTerminal: string
    saveWorkspace: string
    manageWorkspaces: string
    saveChanges: string
    saving: string
    untitledWorkspace: string
    noRootFolder: string
    selectFolder: string
    clearFolder: string
    remoteTerminalRequirements: string
    remoteTerminalHelpTitle: string
    remoteTerminalHelpMessage: string
    hostTailscaleOrLocal: string
    linuxUser: string
    sshPort: string
    terminalHistory: string
    closeRemoteTerminalHelp: string
    gotIt: string
    editWorkspace: string
    workspaceDraft: string
    applyDraft: string
    saveChangesFailed: string
    moveUp: string
    moveDown: string
    willRemove: string
    new: string
    confirmRemovalByName: string
    removeFromYira: string
    undoRemoval: string
    discardDraft: string
  }
  tile: {
    terminal: string
    note: string
    browser: string
    timer: string
    files: string
    board: string
    configure: string
    focus: string
    close: string
    detach: string
    attach: string
    newTerminal: string
    newNote: string
    newBrowser: string
    newTimer: string
    newFiles: string
    tileSettings: string
    untitled: string
    notifications: string
  }
  timer: {
    start: string
    pause: string
    reset: string
    minutes: string
  }
  files: {
    actions: string
    clearFilter: string
    copiedRelativePath: string
    copiedCurrentPath: string
    copyCurrentPath: string
    copyRelativePath: string
    directory: string
    emptyFolder: string
    file: string
    fileOperationFailed: string
    filterFolder: string
    folder: string
    ignored: string
    itemCount_one: string
    itemCount_other: string
    loadingFiles: string
    name: string
    noMatches: string
    noWorkspaceFolder: string
    noWorkspaceFolderMessage: string
    openFolder: string
    path: string
    revealInExplorer: string
    retry: string
    size: string
    type: string
    editor: string
    preview: string
    saved: string
    dirty: string
    conflict: string
    missing: string
    unsupported: string
    reload: string
    overwrite: string
  }
  terminal: {
    shellProfiles: string
    command: string
    optionalStartupCommand: string
    refreshTerminal: string
    restart: string
  }
  canvas: {
    clearSelection: string
    group: string
    groupColor: string
    lockGroup: string
    unlockGroup: string
    showAll: string
  }
  board: {
    addNote: string
    approve: string
    backlog: string
    boardView: string
    history: string
    newTask: string
    reject: string
    searchHistory: string
    workspaceBoard: string
  }
  update: {
    downloading: string
    restartToInstall: string
    restartToInstallMessage: string
    dismissBanner: string
  }
  shortcuts: {
    focus: string
    canvas: string
    grid: string
    split: string
    toggleSidebar: string
  }
}

const en: TranslationResources = {
  common: {
    add: 'Add',
    apply: 'Apply',
    back: 'Back',
    cancel: 'Cancel',
    close: 'Close',
    confirm: 'Confirm',
    continue: 'Continue',
    create: 'Create',
    delete: 'Delete',
    edit: 'Edit',
    error: 'Error',
    loading: 'Loading…',
    name: 'Name',
    none: 'None',
    open: 'Open',
    refresh: 'Refresh',
    remove: 'Remove',
    save: 'Save',
    search: 'Search',
    settings: 'Settings',
    tileCount_one: '{{count}} tile',
    tileCount_other: '{{count}} tiles',
  },
  app: {
    welcome: 'Welcome to {{name}}',
    activeSurfaces: 'Active Surfaces',
    createFirstWorkspace: 'Create your first workspace',
    emptyWorkspace: 'Create a terminal, note, browser, timer, files tile, or workspace board.',
    firstWorkspaceSetup: 'First Workspace Setup',
    newWorkspace: 'New Workspace',
    openFolder: 'Open Folder',
    manageWorkspaces: 'Manage Workspaces',
  },
  sidebar: {
    groups: 'Groups',
    workspaceActions: 'Workspace actions',
    collapse: 'Collapse sidebar',
    open: 'Open sidebar',
  },
  settings: {
    active: 'ACTIVE',
    appearance: 'Appearance',
    aboutAndUpdates: 'About & Updates',
    advanced: 'Advanced',
    browser: 'Browser',
    canvas: 'Canvas',
    checkForUpdates: 'Check for updates',
    checking: 'Checking…',
    currentVersion: 'Current version',
    defaultStartPage: 'Default start page',
    delayNativeAttention: 'Delay native attention',
    delayNativeAttentionDescription: 'Wait 10 seconds before requesting native window attention.',
    density: 'Density',
    language: 'Language',
    languageDescription: 'Choose the language used throughout Yira.',
    english: 'English',
    spanish: 'Español',
    fonts: 'Fonts',
    gridAndSnapping: 'Grid and snapping',
    gridSize: 'Grid size',
    gridVisible: 'Grid visible',
    groupsCapability: 'Groups capability',
    groupsCapabilityDescription: 'Show visual groups and apply group locks.',
    homeUrl: 'Home URL',
    interfaceFontSize: 'Interface font size',
    keyboardShortcutCatalog: 'Keyboard Shortcut catalog',
    latestFound: 'Latest found: v{{version}}',
    notificationsAndCreation: 'Notifications and creation',
    openRawCanvasJson: 'Open raw canvas JSON',
    restartToInstall: 'Restart to install',
    sections: 'Sections',
    selectCategory: 'Select a category to edit its controls.',
    settingsMatrix: 'Settings Matrix',
    shortcuts: 'Shortcuts',
    shortcutClosePanelsOrClearSelection: 'Close panels or clear selection',
    shortcutConfirmDialogAction: 'Confirm dialog action',
    shortcutFocusLeftSplitPanel: 'Focus left split panel',
    shortcutFocusRightSplitPanel: 'Focus right split panel',
    shortcutNavigation: 'Navigation',
    shortcutNextTab: 'Next tab',
    shortcutPreviousTab: 'Previous tab',
    shortcutContextual: 'Contextual',
    shortcutToggleFullscreen: 'Toggle fullscreen',
    shortcutWindow: 'Window',
    snapEnabled: 'Snap enabled',
    systemControls: 'Yira system controls',
    terminal: 'Terminal',
    terminalAttention: 'Terminal Attention',
    terminalAttentionDescription: 'Show output counters and request native attention while Yira is inactive.',
    textScale: 'Text scale',
    themeAndAttention: 'Theme and attention',
    tileContentFontSize: 'Tile content font size',
    tiles: 'Tiles',
    updateAvailable: 'Update {{version}} found. Download will continue in the background.',
    updateChecking: 'Checking GitHub Releases for a newer version.',
    updateDownloaded: 'Update {{version}} is ready. Restart Yira to install it.',
    updateDownloading: 'Downloading update.',
    updateDownloadingProgress: 'Downloading update ({{percent}}%).',
    updateStatusAvailable: 'AVAILABLE',
    updateStatusChecking: 'CHECKING',
    updateStatusDownloaded: 'DOWNLOADED',
    updateStatusDownloading: 'DOWNLOADING',
    updateStatusError: 'ERROR',
    updateStatusIdle: 'IDLE',
    updateStatusUnsupported: 'UNSUPPORTED',
    updateStatusUpToDate: 'UP TO DATE',
    updateUnsupported: 'Automatic updates are available only in installed builds.',
    updateUpToDate: 'You already have the latest published version.',
    updateUnable: 'Unable to check for updates right now.',
    updateWaiting: 'Check for updates manually or wait for the background check.',
    versionAndReleases: 'Version and releases',
    workspaceInternals: 'Workspace internals',
    theme: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    fontSize: 'Font size',
  },
  dialogs: {
    closeDialog: 'Close dialog',
    confirmationRequired: 'Confirmation Required',
    inputRequired: 'Input Required',
    value: 'Value',
    persistedStateWarning: 'This action changes persisted workspace state.',
  },
  workspace: {
    canvas: 'Canvas',
    grid: 'Grid',
    workspace: 'Workspace',
    workspaceName: 'Workspace name',
    workspaceSettings: 'Workspace Settings',
    workspaceType: 'Workspace type',
    rootFolder: 'Root folder',
    noFolderSelected: 'No folder selected',
    initialCommand: 'Initial command',
    optionalCommand: 'Optional command for new terminals',
    remoteTerminal: 'Remote terminal',
    saveWorkspace: 'Save Workspace',
    manageWorkspaces: 'Manage Workspaces',
    saveChanges: 'Save Changes',
    saving: 'Saving…',
    untitledWorkspace: 'Untitled Workspace',
    noRootFolder: 'No root folder',
    selectFolder: 'Select',
    clearFolder: 'Clear',
    remoteTerminalRequirements: 'Remote terminal requirements',
    remoteTerminalHelpTitle: 'Tailscale and SSH stay outside Yira',
    remoteTerminalHelpMessage: 'Use localhost with a local SSH server for the first test. For the notebook, install and sign in to Tailscale on both computers; the Linux notebook must run an SSH server and accept this user. Yira only starts the local SSH client; passwords, keys, host verification, and Tailnet permissions stay outside Yira.',
    hostTailscaleOrLocal: 'Host (Tailscale or local)',
    linuxUser: 'Linux user',
    sshPort: 'SSH port',
    terminalHistory: 'Workspace terminal history',
    closeRemoteTerminalHelp: 'Close remote terminal help',
    gotIt: 'Got it',
    editWorkspace: 'Edit workspace',
    workspaceDraft: 'Workspace Draft',
    applyDraft: 'Apply Draft',
    saveChangesFailed: 'Could not save workspace changes',
    moveUp: 'Move up',
    moveDown: 'Move down',
    willRemove: 'Will remove',
    new: 'New',
    confirmRemovalByName: 'Type {{name}}',
    removeFromYira: 'Remove from Yira',
    undoRemoval: 'Undo removal',
    discardDraft: 'Discard draft',
  },
  tile: {
    terminal: 'Terminal',
    note: 'Note',
    browser: 'Browser',
    timer: 'Timer',
    files: 'Files',
    board: 'Board',
    configure: 'Configure tile',
    focus: 'Focus tile',
    close: 'Close tile',
    detach: 'Detach tile',
    attach: 'Attach tile',
    newTerminal: 'New terminal',
    newNote: 'New note',
    newBrowser: 'New browser',
    newTimer: 'New timer',
    newFiles: 'New files',
    tileSettings: 'Tile Settings',
    untitled: 'Untitled',
    notifications: 'Notifications',
  },
  timer: {
    start: 'Start',
    pause: 'Pause',
    reset: 'Reset',
    minutes: 'Minutes',
  },
  files: {
    actions: 'Actions',
    clearFilter: 'Clear filter',
    copiedRelativePath: 'Copied {{path}}',
    copiedCurrentPath: 'Copied current path',
    copyCurrentPath: 'Copy current path',
    copyRelativePath: 'Copy relative path',
    directory: 'Directory',
    emptyFolder: 'Empty folder',
    file: 'File',
    fileOperationFailed: 'File operation failed',
    filterFolder: 'Filter folder',
    folder: 'Folder',
    ignored: 'Ignored',
    itemCount_one: '{{visible}}/{{total}} item',
    itemCount_other: '{{visible}}/{{total}} items',
    loadingFiles: 'Loading files',
    name: 'Name',
    noMatches: 'No matches',
    noWorkspaceFolder: 'No workspace folder',
    noWorkspaceFolderMessage: 'Set a root folder in workspace settings to browse files here.',
    openFolder: 'Open folder',
    path: 'PATH',
    revealInExplorer: 'Reveal in Explorer',
    retry: 'Retry',
    size: 'Size',
    type: 'Type',
    editor: 'Editor',
    preview: 'Preview',
    saved: 'Saved',
    dirty: 'Unsaved changes',
    conflict: 'Conflict',
    missing: 'This file no longer exists.',
    unsupported: 'This file cannot be edited as text.',
    reload: 'Reload',
    overwrite: 'Overwrite',
  },
  terminal: {
    shellProfiles: 'Shell Profiles',
    command: 'Command',
    optionalStartupCommand: 'Optional startup command',
    refreshTerminal: 'Refresh terminal',
    restart: 'Restart',
  },
  canvas: {
    clearSelection: 'Clear Selection',
    group: 'Group',
    groupColor: 'Group color',
    lockGroup: 'Lock group',
    unlockGroup: 'Unlock group',
    showAll: 'Show All',
  },
  board: {
    addNote: 'Add note',
    approve: 'Approve',
    backlog: 'Backlog',
    boardView: 'Board View',
    history: 'History',
    newTask: 'New Task',
    reject: 'Reject',
    searchHistory: 'Search history',
    workspaceBoard: 'Workspace Board',
  },
  update: {
    downloading: 'Yira is downloading the new version in the background.',
    restartToInstall: 'Restart to install',
    restartToInstallMessage: 'Restart Yira to install the downloaded version.',
    dismissBanner: 'Dismiss update banner',
  },
  shortcuts: {
    focus: 'Focus',
    canvas: 'Canvas',
    grid: 'Grid',
    split: 'Split',
    toggleSidebar: 'Toggle sidebar',
  },
}

const es: TranslationResources = {
  common: {
    add: 'Añadir',
    apply: 'Aplicar',
    back: 'Atrás',
    cancel: 'Cancelar',
    close: 'Cerrar',
    confirm: 'Confirmar',
    continue: 'Continuar',
    create: 'Crear',
    delete: 'Eliminar',
    edit: 'Editar',
    error: 'Error',
    loading: 'Cargando…',
    name: 'Nombre',
    none: 'Ninguno',
    open: 'Abrir',
    refresh: 'Actualizar',
    remove: 'Quitar',
    save: 'Guardar',
    search: 'Buscar',
    settings: 'Configuración',
    tileCount_one: '{{count}} panel',
    tileCount_other: '{{count}} paneles',
  },
  app: {
    welcome: 'Bienvenido a {{name}}',
    activeSurfaces: 'Superficies activas',
    createFirstWorkspace: 'Crea tu primer espacio de trabajo',
    emptyWorkspace: 'Crea una terminal, nota, navegador, temporizador, panel de archivos o tablero del espacio de trabajo.',
    firstWorkspaceSetup: 'Configuración del primer espacio de trabajo',
    newWorkspace: 'Nuevo espacio de trabajo',
    openFolder: 'Abrir carpeta',
    manageWorkspaces: 'Administrar espacios de trabajo',
  },
  sidebar: {
    groups: 'Grupos',
    workspaceActions: 'Acciones del espacio de trabajo',
    collapse: 'Contraer barra lateral',
    open: 'Abrir barra lateral',
  },
  settings: {
    active: 'ACTIVO',
    appearance: 'Apariencia',
    aboutAndUpdates: 'Acerca de y actualizaciones',
    advanced: 'Avanzado',
    browser: 'Navegador',
    canvas: 'Lienzo',
    checkForUpdates: 'Buscar actualizaciones',
    checking: 'Buscando…',
    currentVersion: 'Versión actual',
    defaultStartPage: 'Página de inicio predeterminada',
    delayNativeAttention: 'Demorar atención nativa',
    delayNativeAttentionDescription: 'Espera 10 segundos antes de solicitar atención nativa de la ventana.',
    density: 'Densidad',
    language: 'Idioma',
    languageDescription: 'Elige el idioma que se usa en Yira.',
    english: 'English',
    spanish: 'Español',
    fonts: 'Fuentes',
    gridAndSnapping: 'Cuadrícula y ajuste',
    gridSize: 'Tamaño de cuadrícula',
    gridVisible: 'Cuadrícula visible',
    groupsCapability: 'Función de grupos',
    groupsCapabilityDescription: 'Muestra grupos visuales y aplica bloqueos de grupo.',
    homeUrl: 'URL de inicio',
    interfaceFontSize: 'Tamaño de fuente de la interfaz',
    keyboardShortcutCatalog: 'Catálogo de atajos de teclado',
    latestFound: 'Última encontrada: v{{version}}',
    notificationsAndCreation: 'Notificaciones y creación',
    openRawCanvasJson: 'Abrir JSON sin procesar del lienzo',
    restartToInstall: 'Reiniciar para instalar',
    sections: 'Secciones',
    selectCategory: 'Selecciona una categoría para editar sus controles.',
    settingsMatrix: 'Matriz de configuración',
    shortcuts: 'Atajos',
    shortcutClosePanelsOrClearSelection: 'Cerrar paneles o limpiar selección',
    shortcutConfirmDialogAction: 'Confirmar acción del diálogo',
    shortcutFocusLeftSplitPanel: 'Enfocar panel dividido izquierdo',
    shortcutFocusRightSplitPanel: 'Enfocar panel dividido derecho',
    shortcutNavigation: 'Navegación',
    shortcutNextTab: 'Pestaña siguiente',
    shortcutPreviousTab: 'Pestaña anterior',
    shortcutContextual: 'Contextual',
    shortcutToggleFullscreen: 'Alternar pantalla completa',
    shortcutWindow: 'Ventana',
    snapEnabled: 'Ajuste activado',
    systemControls: 'Controles del sistema Yira',
    terminal: 'Terminal',
    terminalAttention: 'Atención de terminal',
    terminalAttentionDescription: 'Muestra contadores de salida y solicita atención nativa mientras Yira está inactivo.',
    textScale: 'Escala de texto',
    themeAndAttention: 'Tema y atención',
    tileContentFontSize: 'Tamaño de fuente del contenido del panel',
    tiles: 'Paneles',
    updateAvailable: 'Se encontró la actualización {{version}}. La descarga continuará en segundo plano.',
    updateChecking: 'Buscando una versión más reciente en GitHub Releases.',
    updateDownloaded: 'La actualización {{version}} está lista. Reinicia Yira para instalarla.',
    updateDownloading: 'Descargando actualización.',
    updateDownloadingProgress: 'Descargando actualización ({{percent}}%).',
    updateStatusAvailable: 'DISPONIBLE',
    updateStatusChecking: 'BUSCANDO',
    updateStatusDownloaded: 'DESCARGADA',
    updateStatusDownloading: 'DESCARGANDO',
    updateStatusError: 'ERROR',
    updateStatusIdle: 'EN ESPERA',
    updateStatusUnsupported: 'NO COMPATIBLE',
    updateStatusUpToDate: 'ACTUALIZADO',
    updateUnsupported: 'Las actualizaciones automáticas solo están disponibles en versiones instaladas.',
    updateUpToDate: 'Ya tienes la última versión publicada.',
    updateUnable: 'No se pueden buscar actualizaciones en este momento.',
    updateWaiting: 'Busca actualizaciones manualmente o espera la comprobación en segundo plano.',
    versionAndReleases: 'Versión y lanzamientos',
    workspaceInternals: 'Aspectos internos del espacio de trabajo',
    theme: 'Tema',
    light: 'Claro',
    dark: 'Oscuro',
    system: 'Sistema',
    fontSize: 'Tamaño de fuente',
  },
  dialogs: {
    closeDialog: 'Cerrar diálogo',
    confirmationRequired: 'Se requiere confirmación',
    inputRequired: 'Se requiere información',
    value: 'Valor',
    persistedStateWarning: 'Esta acción cambia el estado guardado del espacio de trabajo.',
  },
  workspace: {
    canvas: 'Lienzo',
    grid: 'Cuadrícula',
    workspace: 'Espacio de trabajo',
    workspaceName: 'Nombre del espacio de trabajo',
    workspaceSettings: 'Configuración del espacio de trabajo',
    workspaceType: 'Tipo de espacio de trabajo',
    rootFolder: 'Carpeta raíz',
    noFolderSelected: 'No se seleccionó ninguna carpeta',
    initialCommand: 'Comando inicial',
    optionalCommand: 'Comando opcional para nuevas terminales',
    remoteTerminal: 'Terminal remota',
    saveWorkspace: 'Guardar espacio de trabajo',
    manageWorkspaces: 'Administrar espacios de trabajo',
    saveChanges: 'Guardar cambios',
    saving: 'Guardando…',
    untitledWorkspace: 'Espacio de trabajo sin título',
    noRootFolder: 'Sin carpeta raíz',
    selectFolder: 'Seleccionar',
    clearFolder: 'Limpiar',
    remoteTerminalRequirements: 'Requisitos de la terminal remota',
    remoteTerminalHelpTitle: 'Tailscale y SSH se mantienen fuera de Yira',
    remoteTerminalHelpMessage: 'Usa localhost con un servidor SSH local para la primera prueba. Para la notebook, instala e inicia sesión en Tailscale en ambas computadoras; la notebook Linux debe ejecutar un servidor SSH y aceptar este usuario. Yira solo inicia el cliente SSH local; las contraseñas, claves, verificación del host y permisos de Tailnet se mantienen fuera de Yira.',
    hostTailscaleOrLocal: 'Host (Tailscale o local)',
    linuxUser: 'Usuario de Linux',
    sshPort: 'Puerto SSH',
    terminalHistory: 'Historial de terminal del espacio de trabajo',
    closeRemoteTerminalHelp: 'Cerrar ayuda de terminal remota',
    gotIt: 'Entendido',
    editWorkspace: 'Editar espacio de trabajo',
    workspaceDraft: 'Borrador del espacio de trabajo',
    applyDraft: 'Aplicar borrador',
    saveChangesFailed: 'No se pudieron guardar los cambios del espacio de trabajo',
    moveUp: 'Mover hacia arriba',
    moveDown: 'Mover hacia abajo',
    willRemove: 'Se eliminará',
    new: 'Nuevo',
    confirmRemovalByName: 'Escribe {{name}}',
    removeFromYira: 'Quitar de Yira',
    undoRemoval: 'Deshacer eliminación',
    discardDraft: 'Descartar borrador',
  },
  tile: {
    terminal: 'Terminal',
    note: 'Nota',
    browser: 'Navegador',
    timer: 'Temporizador',
    files: 'Archivos',
    board: 'Tablero',
    configure: 'Configurar panel',
    focus: 'Enfocar panel',
    close: 'Cerrar panel',
    detach: 'Separar panel',
    attach: 'Acoplar panel',
    newTerminal: 'Nueva terminal',
    newNote: 'Nueva nota',
    newBrowser: 'Nuevo navegador',
    newTimer: 'Nuevo temporizador',
    newFiles: 'Nuevos archivos',
    tileSettings: 'Configuración del panel',
    untitled: 'Sin título',
    notifications: 'Notificaciones',
  },
  timer: {
    start: 'Iniciar',
    pause: 'Pausar',
    reset: 'Restablecer',
    minutes: 'Minutos',
  },
  files: {
    actions: 'Acciones',
    clearFilter: 'Limpiar filtro',
    copiedRelativePath: 'Se copió {{path}}',
    copiedCurrentPath: 'Ruta actual copiada',
    copyCurrentPath: 'Copiar ruta actual',
    copyRelativePath: 'Copiar ruta relativa',
    directory: 'Directorio',
    emptyFolder: 'Carpeta vacía',
    file: 'Archivo',
    fileOperationFailed: 'La operación de archivo falló',
    filterFolder: 'Filtrar carpeta',
    folder: 'Carpeta',
    ignored: 'Ignorados',
    itemCount_one: '{{visible}}/{{total}} elemento',
    itemCount_other: '{{visible}}/{{total}} elementos',
    loadingFiles: 'Cargando archivos',
    name: 'Nombre',
    noMatches: 'Sin coincidencias',
    noWorkspaceFolder: 'Sin carpeta de espacio de trabajo',
    noWorkspaceFolderMessage: 'Define una carpeta raíz en la configuración del espacio de trabajo para explorar archivos aquí.',
    openFolder: 'Abrir carpeta',
    path: 'RUTA',
    revealInExplorer: 'Mostrar en el explorador',
    retry: 'Reintentar',
    size: 'Tamaño',
    type: 'Tipo',
    editor: 'Editor',
    preview: 'Vista previa',
    saved: 'Guardado',
    dirty: 'Cambios sin guardar',
    conflict: 'Conflicto',
    missing: 'Este archivo ya no existe.',
    unsupported: 'Este archivo no se puede editar como texto.',
    reload: 'Recargar',
    overwrite: 'Sobrescribir',
  },
  terminal: {
    shellProfiles: 'Perfiles de shell',
    command: 'Comando',
    optionalStartupCommand: 'Comando de inicio opcional',
    refreshTerminal: 'Actualizar terminal',
    restart: 'Reiniciar',
  },
  canvas: {
    clearSelection: 'Limpiar selección',
    group: 'Agrupar',
    groupColor: 'Color del grupo',
    lockGroup: 'Bloquear grupo',
    unlockGroup: 'Desbloquear grupo',
    showAll: 'Mostrar todo',
  },
  board: {
    addNote: 'Añadir nota',
    approve: 'Aprobar',
    backlog: 'Pendientes',
    boardView: 'Vista de tablero',
    history: 'Historial',
    newTask: 'Nueva tarea',
    reject: 'Rechazar',
    searchHistory: 'Buscar en el historial',
    workspaceBoard: 'Tablero del espacio de trabajo',
  },
  update: {
    downloading: 'Yira está descargando la nueva versión en segundo plano.',
    restartToInstall: 'Reiniciar para instalar',
    restartToInstallMessage: 'Reinicia Yira para instalar la versión descargada.',
    dismissBanner: 'Descartar aviso de actualización',
  },
  shortcuts: {
    focus: 'Enfocar',
    canvas: 'Lienzo',
    grid: 'Cuadrícula',
    split: 'Dividir',
    toggleSidebar: 'Alternar barra lateral',
  },
}

export const resources: Record<SupportedLanguage, { translation: TranslationResources }> = {
  en: { translation: en },
  es: { translation: es },
}

export type TranslationKeyResources = typeof en
