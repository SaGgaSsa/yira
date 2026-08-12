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
    workspaces: string
    workspaceCount_one: string
    workspaceCount_other: string
    emptyWorkspaces: string
    workspaceActions: string
    collapse: string
    open: string
  }
  agents: {
    title: string
    unconfigured: string
    configureWorkspace: string
    running: string
    noRunning: string
    history: string
    loadHistory: string
    refreshHistory: string
    searchPlaceholder: string
    idleHistory: string
    loadingHistory: string
    historyError: string
    noHistory: string
    noSearchResults: string
    historyMore: string
    resume: string
    unknownTitle: string
    unknownDate: string
    cwdUnavailable: string
    model: string
    messages: string
    started: string
    lastActivity: string
  }
  settings: {
    active: string
    agentAlerts: string
    agentAlertsDescription: string
    agentHookSetup: string
    agentHookSetupDescription: string
    configure: string
    uninstall: string
    appearance: string
    aboutAndUpdates: string
    advanced: string
    browser: string
    canvas: string
    checkForUpdates: string
    checking: string
    currentVersion: string
    defaultStartPage: string
    delayTimerNativeAttention: string
    delayTimerNativeAttentionDescription: string
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
    terminalActivity: string
    terminalActivityDescription: string
    timerNativeAttention: string
    timerNativeAttentionDescription: string
    textScale: string
    themeAndActivity: string
    tileContentFontSize: string
    tiles: string
    updateAvailable: string
    updateChecking: string
    updateDiagnostics: string
    updateDiagnosticsDescription: string
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
    general: string
    terminal: string
    agents: string
    sourceControl: string
    repository: string
    selectRepositories: string
    noRepositoriesConfigured: string
    configureSourceControl: string
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
    agentProvider: string
    agentProviders: string
    noAgentProvider: string
    agentProviderHelp: string
    claude: string
    codex: string
    agentProviderArgs: string
    agentProviderArgsPlaceholder: string
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
    configure: string
    focus: string
    attention_one: string
    attention_other: string
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
    temporary: string
    markdownEdit: string
    markdownSplit: string
    markdownPreview: string
    imageUnavailable: string
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
    close: string
    history: string
    newTask: string
    open: string
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
    workspaces: 'Workspaces',
    workspaceCount_one: '{{count}} workspace',
    workspaceCount_other: '{{count}} workspaces',
    emptyWorkspaces: 'Create a workspace to see it here.',
    workspaceActions: 'Workspace actions',
    collapse: 'Collapse sidebar',
    open: 'Open sidebar',
  },
  agents: {
    title: 'Agents',
    unconfigured: 'Choose an agent provider in this workspace to view its sessions and history.',
    configureWorkspace: 'Configure workspace',
    running: 'Running sessions',
    noRunning: 'No running agent sessions',
    history: 'History',
    loadHistory: 'Load history',
    refreshHistory: 'Refresh history',
    searchPlaceholder: 'Search title or preview',
    idleHistory: 'History is loaded on demand.',
    loadingHistory: 'Loading local history…',
    historyError: 'Unable to load local history.',
    noHistory: 'No agent history found.',
    noSearchResults: 'No history matches this search.',
    historyMore: 'More local sessions are available.',
    resume: 'Resume',
    unknownTitle: 'Untitled session',
    unknownDate: 'Unknown date',
    cwdUnavailable: 'cwd unavailable',
    model: 'Model',
    messages: 'Messages',
    started: 'Started',
    lastActivity: 'Last activity',
  },
  settings: {
    active: 'ACTIVE',
    agentAlerts: 'Agent alerts',
    agentAlertsDescription: 'Show semantic completion and intervention alerts from configured Codex and Claude hooks.',
    agentHookSetup: 'Codex and Claude hooks',
    agentHookSetupDescription: 'Configure or repair only Yira-managed hooks. Codex requires approving new hooks with /hooks.',
    configure: 'Configure',
    uninstall: 'Uninstall',
    appearance: 'Appearance',
    aboutAndUpdates: 'About & Updates',
    advanced: 'Advanced',
    browser: 'Browser',
    canvas: 'Canvas',
    checkForUpdates: 'Check for updates',
    checking: 'Checking…',
    currentVersion: 'Current version',
    defaultStartPage: 'Default start page',
    delayTimerNativeAttention: 'Delay timer native attention',
    delayTimerNativeAttentionDescription: 'Wait 10 seconds before requesting native attention for completed timers.',
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
    terminalActivity: 'Terminal activity',
    terminalActivityDescription: 'Show or hide output counters. Terminal output does not request native attention.',
    timerNativeAttention: 'Timer native attention',
    timerNativeAttentionDescription: 'Allow this timer to request native attention when it completes.',
    textScale: 'Text scale',
    themeAndActivity: 'Theme and activity',
    tileContentFontSize: 'Tile content font size',
    tiles: 'Tiles',
    updateAvailable: 'Update {{version}} found. Download will continue in the background.',
    updateChecking: 'Checking GitHub Releases for a newer version.',
    updateDiagnostics: 'Update diagnostics',
    updateDiagnosticsDescription: 'Store local update events to help investigate update failures.',
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
    general: 'General',
    terminal: 'Terminal',
    agents: 'Agents',
    sourceControl: 'Source Control',
    repository: 'Repository',
    selectRepositories: 'Select repositories',
    noRepositoriesConfigured: 'No repositories configured',
    configureSourceControl: 'Configure Source Control',
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
    agentProvider: 'Agent provider',
    agentProviders: 'Agent providers',
    noAgentProvider: 'No agent provider',
    agentProviderHelp: 'Choose one provider for this workspace. Its arguments stay saved when you switch providers.',
    claude: 'Claude',
    codex: 'Codex',
    agentProviderArgs: 'Arguments (one per line)',
    agentProviderArgsPlaceholder: '--model\nvalue',
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
    configure: 'Configure workspace',
    focus: 'Focus workspace',
    attention_one: '{{count}} terminal output event in this workspace',
    attention_other: '{{count}} terminal output events in this workspace',
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
    temporary: 'Temporary',
    markdownEdit: 'Edit Markdown',
    markdownSplit: 'Edit and preview Markdown',
    markdownPreview: 'View rendered Markdown',
    imageUnavailable: 'Image unavailable',
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
    close: 'Close board',
    history: 'History',
    newTask: 'New Task',
    open: 'Open board',
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
    workspaces: 'Espacios de trabajo',
    workspaceCount_one: '{{count}} espacio de trabajo',
    workspaceCount_other: '{{count}} espacios de trabajo',
    emptyWorkspaces: 'Crea un espacio de trabajo para verlo aquí.',
    workspaceActions: 'Acciones del espacio de trabajo',
    collapse: 'Contraer barra lateral',
    open: 'Abrir barra lateral',
  },
  agents: {
    title: 'Agentes',
    unconfigured: 'Elige un proveedor de agente en este espacio de trabajo para ver sus sesiones e historial.',
    configureWorkspace: 'Configurar espacio de trabajo',
    running: 'Sesiones activas',
    noRunning: 'No hay sesiones de agentes activas',
    history: 'Historial',
    loadHistory: 'Cargar historial',
    refreshHistory: 'Actualizar historial',
    searchPlaceholder: 'Buscar título o vista previa',
    idleHistory: 'El historial se carga bajo demanda.',
    loadingHistory: 'Cargando historial local…',
    historyError: 'No se pudo cargar el historial local.',
    noHistory: 'No se encontró historial de agentes.',
    noSearchResults: 'Ningún historial coincide con esta búsqueda.',
    historyMore: 'Hay más sesiones locales disponibles.',
    resume: 'Reanudar',
    unknownTitle: 'Sesión sin título',
    unknownDate: 'Fecha desconocida',
    cwdUnavailable: 'cwd no disponible',
    model: 'Modelo',
    messages: 'Mensajes',
    started: 'Inicio',
    lastActivity: 'Última actividad',
  },
  settings: {
    active: 'ACTIVO',
    agentAlerts: 'Alertas de agentes',
    agentAlertsDescription: 'Muestra alertas semánticas de finalización e intervención de los hooks configurados de Codex y Claude.',
    agentHookSetup: 'Hooks de Codex y Claude',
    agentHookSetupDescription: 'Configura o repara sólo hooks administrados por Yira. Codex requiere aprobar los nuevos hooks con /hooks.',
    configure: 'Configurar',
    uninstall: 'Desinstalar',
    appearance: 'Apariencia',
    aboutAndUpdates: 'Acerca de y actualizaciones',
    advanced: 'Avanzado',
    browser: 'Navegador',
    canvas: 'Lienzo',
    checkForUpdates: 'Buscar actualizaciones',
    checking: 'Buscando…',
    currentVersion: 'Versión actual',
    defaultStartPage: 'Página de inicio predeterminada',
    delayTimerNativeAttention: 'Demorar atención nativa de temporizadores',
    delayTimerNativeAttentionDescription: 'Espera 10 segundos antes de solicitar atención nativa para temporizadores completados.',
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
    terminalActivity: 'Actividad de terminal',
    terminalActivityDescription: 'Muestra u oculta los contadores de salida. La salida de terminal no solicita atención nativa.',
    timerNativeAttention: 'Atención nativa del temporizador',
    timerNativeAttentionDescription: 'Permite que este temporizador solicite atención nativa cuando termine.',
    textScale: 'Escala de texto',
    themeAndActivity: 'Tema y actividad',
    tileContentFontSize: 'Tamaño de fuente del contenido del panel',
    tiles: 'Paneles',
    updateAvailable: 'Se encontró la actualización {{version}}. La descarga continuará en segundo plano.',
    updateChecking: 'Buscando una versión más reciente en GitHub Releases.',
    updateDiagnostics: 'Diagnósticos de actualizaciones',
    updateDiagnosticsDescription: 'Guarda eventos locales de actualización para investigar fallos de actualización.',
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
    general: 'General',
    terminal: 'Terminal',
    agents: 'Agentes',
    sourceControl: 'Source Control',
    repository: 'Repositorio',
    selectRepositories: 'Seleccionar repositorios',
    noRepositoriesConfigured: 'No hay repositorios configurados',
    configureSourceControl: 'Configurar Source Control',
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
    agentProvider: 'Proveedor de agente',
    agentProviders: 'Proveedores de agentes',
    noAgentProvider: 'Sin proveedor de agente',
    agentProviderHelp: 'Elige un proveedor para este espacio de trabajo. Sus argumentos se conservan al cambiar de proveedor.',
    claude: 'Claude',
    codex: 'Codex',
    agentProviderArgs: 'Argumentos (uno por línea)',
    agentProviderArgsPlaceholder: '--model\nvalor',
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
    configure: 'Configurar espacio de trabajo',
    focus: 'Enfocar espacio de trabajo',
    attention_one: '{{count}} evento de salida de terminal en este espacio de trabajo',
    attention_other: '{{count}} eventos de salida de terminal en este espacio de trabajo',
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
    temporary: 'Temporal',
    markdownEdit: 'Editar Markdown',
    markdownSplit: 'Editar y previsualizar Markdown',
    markdownPreview: 'Ver Markdown renderizado',
    imageUnavailable: 'Imagen no disponible',
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
    close: 'Cerrar tablero',
    history: 'Historial',
    newTask: 'Nueva tarea',
    open: 'Abrir tablero',
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
