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
  activity: {
    activity: string
    openWorkspace: string
    goToTerminal: string
    emptyTitle: string
    emptyMessage: string
    terminals_one: string
    terminals_other: string
    statusActive: string
    statusUnread: string
    statusIdle: string
    agents: string
    windowFiveHour: string
    windowWeekly: string
    tokensToday: string
    sessionsToday: string
    topModel: string
    credits: string
    limitReached: string
    recentSessions: string
    noUsageData: string
    noTodayData: string
    noData: string
    projection: string
    beforeReset: string
    atReset: string
    hourlyTokens: string
    linesAdded: string
    linesRemoved: string
    showDetails: string
    hideDetails: string
    noCredits: string
    unlimitedCredits: string
    no: string
    context: string
    token: { cacheRead: string; cacheWrite: string; input: string; output: string; cached: string; reasoning: string }
    noAgentsEnabled: string
    enableAgentsHint: string
    all: string
    updatedAt: string
    indexing: string
    workspaces: string
    totalTokens: string
    sessionsSub: string
    inputOutput: string
    noCache: string
    cacheHit: string
    sessions: string
    withoutSubagents: string
    lines: string
    claudeOnly: string
    topWorkspace: string
    workspaceTokens: string
    tokensPerHour: string
    tokensPerDay: string
    planLimits: string
    byWorkspace: string
    byModel: string
    tokenMix: string
    period: { today: string; '7d': string; '30d': string }
    noPeriodData: string
    agentFilter: string
    periodFilter: string
    cacheReadAmount: string
  }
  terminalActivity: {
    'needs-input': string
    working: string
    unread: string
    output: string
    background: string
    done: string
    idle: string
    exited: string
    summary: string
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
    resumeError: string
    unknownTitle: string
    unknownDate: string
    cwdUnavailable: string
    model: string
    messages: string
    started: string
    lastActivity: string
  }
  agentsView: {
    title: string
    openAgentsView: string
    needsAttention: string
    worktreeKeptTitle: string
    worktreeKeptMessage: string
    worktreePathUnavailable: string
    closeSessionErrorTitle: string
    sessionCount: string
    newSession: string
    emptyTitle: string
    emptyDescription: string
    newAgentSession: string
    agentSession: string
    unknownTitle: string
    closeSession: string
    maximizeSession: string
    restoreSession: string
    statusWorking: string
    statusNeedsInput: string
    statusDone: string
    statusExited: string
    exitedMessage: string
    provider: string
    workspace: string
    closeDialog: string
    prompt: string
    promptPlaceholder: string
    worktree: string
    worktreeUnavailable: string
    createSession: string
    creatingSession: string
    shortcutLabel: string
  }
  settings: {
    active: string
    agentAlerts: string
    agentAlertsDescription: string
    agentHookSetup: string
    agentHookSetupDescription: string
    agentIntegrations: string
    agentInstalled: string
    agentNotInstalled: string
    agentDetecting: string
    enableAgent: string
    agentDisabled: string
    yiraHooks: string
    hooksInstalled: string
    hooksMissing: string
    install: string
    repair: string
    codexHooksHelp: string
    backToAbout: string
    configure: string
    uninstall: string
    appThemeDescription: string
    windowBackgroundEffect: string
    windowBackgroundNone: string
    windowBackgroundMica: string
    windowBackgroundAcrylic: string
    windowBackgroundTranslucent: string
    windowBackgroundRequiresRestart: string
    windowBackgroundAppliedAfterRestart: string
    windowBackgroundBlurHelp: string
    requiresWindows11: string
    defaultAppearanceDescription: string
    followAppTheme: string
    appearance: string
    aboutAndUpdates: string
    supportAndReports: string
    supportDescription: string
    publicReportsHint: string
    privacyPolicy: string
    reportBug: string
    supportLinkError: string
    termsOfUse: string
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
    legalDocumentEnglish: string
    legalDocumentLinkError: string
    legalDocuments: string
    legalDocumentsDescription: string
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
    newAgentSessionShortcut: string
    newAgentSessionShortcutDescription: string
    pressShortcut: string
    resetToDefault: string
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
    shortcutNewAgentSession: string
    shortcutPreviousTab: string
    shortcutContextual: string
    shortcutToggleFullscreen: string
    shortcutWindow: string
    snapEnabled: string
    systemControls: string
    terminal: string
    agents: string
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
    wakeOnLan: string
    wakeOnLanMacAddress: string
    wakeOnLanBroadcastAddress: string
    wakeOnLanUdpPort: string
    wakeOnLanInvalidMac: string
    wakeOnLanInvalidBroadcast: string
    terminalHistory: string
    agentProvider: string
    agentProviders: string
    noAgentProvider: string
    agentProviderHelp: string
    claude: string
    codex: string
    agentProviderArgs: string
    agentProviderArgsPlaceholder: string
    claudeUsageTitle: string
    claudeUsageDescription: string
    claudeUsageActive: string
    claudeUsageInactive: string
    claudeUsageChainable: string
    claudeUsageOutdated: string
    claudeUsageError: string
    claudeUsageLoading: string
    claudeUsageActivate: string
    claudeUsageRepair: string
    claudeUsageDeactivate: string
    claudeUsageEnabledMessage: string
    claudeUsageDisabledMessage: string
    claudeUsageActionError: string
    closeRemoteTerminalHelp: string
    gotIt: string
    editWorkspace: string
    workspaceDraft: string
    applyDraft: string
    saveChangesFailed: string
    willRemove: string
    new: string
    confirmRemovalByName: string
    removeFromYira: string
    undoRemoval: string
    discardDraft: string
    configure: string
    focus: string
    deactivate: string
    deactivateConfirmTitle: string
    deactivateConfirmMessage: string
    deactivateConfirm: string
    deactivateWarning: string
    attention_one: string
    attention_other: string
    gitDiffTooltip: string
    gitDiffUnavailable: string
  }
  sourceControl: {
    noChanges: string
    noCommits: string
    unknownDate: string
    noSubject: string
    commits: string
    loadingHistory: string
    loadHistoryError: string
    outgoing_one: string
    outgoing_other: string
    latestRemote: string
    noRemoteComparison: string
    latestLocal: string
    fetchRefs: string
    behind_one: string
    behind_other: string
    ahead_one: string
    ahead_other: string
    pullThenPush: string
    requiresUpstream: string
    working: string
    loading: string
    noBranch: string
    loadingSourceControl: string
    notGitRepository: string
    retry: string
    noUpstream: string
    stagedChanges: string
    changes: string
    commitMessage: string
    commit: string
    retryOperation: string
    stageFile: string
    unstageFile: string
    stagePath: string
    unstagePath: string
    loadStatusError: string
    loadHistoryErrorFallback: string
    onlyChanged: string
    listView: string
    treeView: string
    refreshAll: string
    noChangedRepositories: string
    repositories: string
    changed: string
    actionFetch: string
    actionSync: string
    repositoriesSummary: string
  }
  tile: {
    terminal: string
    agent: string
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
    newAgent: string
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
    markdownEdit: string
    markdownSplit: string
    markdownPreview: string
    imageUnavailable: string
    saved: string
    diffSideBySide: string
    diffInline: string
    openDiffFile: string
    diffLoading: string
    diffBinary: string
    diffTooLarge: string
    diffNoChanges: string
    diffStaged: string
    diffWorkingTree: string
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
    sshConnectionClosed: string
    reconnect: string
    reconnecting: string
    wakeOnLanPreparing: string
    wakeOnLanPacketSent: string
    wakeOnLanHostOnline: string
    wakeOnLanSshReady: string
    wakeOnLanUnconfirmed: string
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
  ui: {
    boardType: string
    boardContext: string
    boardRelated: string
    addNote: string
    deleteBacklogTask: string
    copyMcpConfig: string
    newTask: string
    searchHistory: string
    back: string
    forward: string
    reload: string
    openExternally: string
    webSurface: string
    createWorkspaceContent: string
    groupColor: string
    moveTile: string
    resizeSplit: string
    groupSettings: string
    groupName: string
    untitledGroup: string
    color: string
    lockGroup: string
    lockGroupDescription: string
    loadingNote: string
    noteUntitled: string
    noteEdited: string
    noteWordCount_one: string
    noteWordCount_other: string
    rawState: string
    applyJson: string
    noItemsOpen: string
    configureTile: string
    focusTile: string
    closeTile: string
    detachTile: string
    attachTile: string
    hours: string
    seconds: string
    loadDuration: string
    startTimer: string
    stopTimer: string
    resetTimer: string
    unableToLoadDirectory: string
    searchWorkspaceFiles: string
    searchFiles: string
    closeSearch: string
    typeToSearchFiles: string
    searching: string
    noFilesFound: string
    emptyFolder: string
    shellProfiles: string
    noteType: string
    updates: string
    dismissUpdateBanner: string
    noteSuffix: string
    closedTasks_one: string
    closedTasks_other: string
    taskCount_one: string
    taskCount_other: string
    taskFallback: string
    boardBacklog: string
    boardReady: string
    boardInProgress: string
    boardReview: string
    boardDone: string
    empty: string
    tileUnavailable: string
    loadingTile: string
    emptyGrid: string
    newTerminal: string
    newBrowser: string
    newTimer: string
    newNote: string
    editAction: string
    renameAction: string
    duplicateAction: string
    refreshAction: string
    muteActivity: string
    unmuteActivity: string
    muteNotifications: string
    unmuteNotifications: string
    lock: string
    unlock: string
    openMarkdownTile: string
    openFileTile: string
    copyPath: string
    openBrowserTile: string
    copyUrl: string
    copyText: string
    paste: string
    selectAll: string
    gridFull: string
    gridFullMessage: string
    createGroup: string
    editGroup: string
    ungroupTiles: string
    ungroupTilesMessage: string
    refreshTerminal: string
    refreshTerminalMessage: string
    refreshBrowser: string
    refreshBrowserMessage: string
    refreshNote: string
    refreshNoteMessage: string
    refreshTile: string
    refreshTileMessage: string
    captureTaskTitle: string
    captureWork: string
    title: string
    task: string
    deleteTask: string
    deleteTaskMessage: string
    rejectTask: string
    rejectTaskMessage: string
    requiredNote: string
    show: string
    editGroupAction: string
    ungroup: string
    removeTileFromGroup: string
    removeTileFromGroupMessage: string
    updateReady: string
    restartUpdateMessage: string
    downloadingUpdate: string
    updateFound: string
    noteEditMode: string
    notePreviewMode: string
    noteSplitMode: string
    tileTypeFile: string
    yiraTile: string
    tileComingSoon: string
    createGroupConfirm: string
    saveGroup: string
    saveTile: string
    keepRunning: string
    keepCurrent: string
    keepEditing: string
    keepTask: string
    keepInGroup: string
    remove: string
    updateProgress: string
    downloadingUpdateUnknown: string
    updateFoundUnknown: string
    editTile: string
    remoteSsh: string
    configureRemoteTerminalFirst: string
    opensshMissing: string
    createSshTerminal: string
    configureStatus: string
    opensshMissingStatus: string
    usage: string
    unavailable: string
    resetUnavailable: string
    usageResets: string
    fiveHourShort: string
    weeklyShort: string
    providerAgent: string
    downloadingUpdateMessage: string
    lockedStatus: string
    unlockedStatus: string
    errorStatus: string
    richStatus: string
    markdownStatus: string
    taskDetails: string
    createTask: string
    thisTile: string
    closeTileMessage: string
    keepOpen: string
    keepGroup: string
    ready: string
    missing: string
    richNote: string
    markdownNote: string
    command: string
    optionalStartupCommand: string
    toggleZoom: string
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
  activity: {
    activity: 'Activity',
    openWorkspace: 'Open workspace',
    goToTerminal: 'Go to terminal',
    emptyTitle: 'No active workspaces',
    emptyMessage: 'Open a workspace to see it here. Only workspaces visited in this session appear.',
    terminals_one: '{{count}} terminal',
    terminals_other: '{{count}} terminals',
    statusActive: 'Terminals active',
    statusUnread: 'Unreviewed output',
    statusIdle: 'No activity',
    agents: 'Agents',
    windowFiveHour: '5 h window',
    windowWeekly: 'Weekly',
    tokensToday: 'Tokens today',
    sessionsToday: 'Sessions today',
    topModel: 'Top model',
    credits: 'Credits',
    limitReached: 'Limit reached',
    recentSessions: 'Recent sessions',
    noUsageData: 'Usage data unavailable',
    noTodayData: 'No data for today',
    noData: 'No data',
    projection: 'Projection',
    beforeReset: 'before reset',
    atReset: 'at reset',
    hourlyTokens: 'Tokens by hour',
    linesAdded: 'Lines added',
    linesRemoved: 'Lines removed',
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    noCredits: 'None',
    unlimitedCredits: 'Unlimited',
    no: 'No',
    context: 'Context',
    noAgentsEnabled: 'No agents enabled',
    enableAgentsHint: 'Enable an agent in Settings › Agents to see its usage here.',
    all: 'All',
    updatedAt: 'Updated {{time}}',
    indexing: 'Indexing history…',
    workspaces: 'Workspaces',
    totalTokens: 'Total tokens',
    sessionsSub: '{{count}} sessions',
    inputOutput: 'Input + output',
    noCache: 'excluding cache',
    cacheHit: 'Cache hit',
    sessions: 'Sessions',
    withoutSubagents: 'without subagents',
    lines: 'Lines +/−',
    claudeOnly: 'reported by Claude only',
    topWorkspace: 'Most active workspace',
    workspaceTokens: 'tokens by workspace',
    tokensPerHour: 'Tokens per hour',
    tokensPerDay: 'Tokens per day',
    planLimits: 'Plan limits',
    byWorkspace: 'By workspace',
    byModel: 'By model',
    tokenMix: 'Token mix',
    period: { today: 'Today', '7d': '7 days', '30d': '30 days' },
    noPeriodData: 'No data in this period',
    agentFilter: 'Agent filter',
    periodFilter: 'Period filter',
    cacheReadAmount: '{{count}} read from cache',
    token: { cacheRead: 'Cache read', cacheWrite: 'Cache write', input: 'Input', output: 'Output', cached: 'Cached', reasoning: 'Reasoning' },
  },
  terminalActivity: {
    'needs-input': 'Needs input',
    working: 'Working',
    unread: 'Unreviewed activity',
    output: 'Terminals active',
    background: 'Running in background',
    done: 'Completed activity',
    idle: 'No detected activity',
    exited: 'Exited',
    summary: '{{working}} working; {{needsInput}} need input; {{done}} completed; {{unread}} unreviewed output events; {{recentOutput}} terminals with recent output; {{background}} running in background',
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
    resumeError: 'Unable to resume this agent session.',
    unknownTitle: 'Untitled session',
    unknownDate: 'Unknown date',
    cwdUnavailable: 'cwd unavailable',
    model: 'Model',
    messages: 'Messages',
    started: 'Started',
    lastActivity: 'Last activity',
  },
  agentsView: {
    title: 'Agents',
    openAgentsView: 'Open Agents View ({{count}} sessions)',
    needsAttention: '{{count}} sessions need attention',
    worktreeKeptTitle: 'Worktree kept',
    worktreeKeptMessage: 'The worktree has changes and was kept at {{path}}.',
    worktreePathUnavailable: 'an unknown path',
    closeSessionErrorTitle: 'Could not close agent session',
    sessionCount: '{{count}} sessions',
    newSession: 'New session',
    emptyTitle: 'No agent sessions in this view',
    emptyDescription: 'Start a session to see its live terminal here.',
    newAgentSession: 'New agent session',
    agentSession: 'Agent Session',
    unknownTitle: 'Untitled session',
    closeSession: 'Close session',
    maximizeSession: 'Maximize session',
    restoreSession: 'Restore session',
    statusWorking: 'Working',
    statusNeedsInput: 'Needs input',
    statusDone: 'Done',
    statusExited: 'Exited',
    exitedMessage: 'Session exited',
    provider: 'Provider',
    workspace: 'Workspace',
    closeDialog: 'Close dialog',
    prompt: 'Prompt',
    promptPlaceholder: 'Describe what you want the agent to do. Enter starts the session; Shift+Enter adds a line.',
    worktree: 'Run in a git worktree',
    worktreeUnavailable: 'Git worktrees are unavailable for this workspace.',
    createSession: 'Create session',
    creatingSession: 'Creating session…',
    shortcutLabel: 'Shortcut: {{shortcut}}',
  },
  settings: {
    active: 'ACTIVE',
    agentAlerts: 'Agent alerts',
    agentAlertsDescription: 'Show semantic completion and intervention alerts from configured Codex and Claude hooks.',
    agentHookSetup: 'Codex and Claude hooks',
    agentHookSetupDescription: 'Configure or repair only Yira-managed hooks. Codex requires approving new hooks with /hooks.',
    agentIntegrations: 'Agent integrations',
    agentInstalled: '{{path}} found',
    agentNotInstalled: 'Not installed on this machine',
    agentDetecting: 'Checking installation…',
    enableAgent: 'Enable agent',
    agentDisabled: 'Off. Yira does not read its files or show it in Activity.',
    yiraHooks: 'Yira hooks',
    hooksInstalled: 'Installed',
    hooksMissing: 'Not installed',
    install: 'Install',
    repair: 'Repair',
    codexHooksHelp: 'Codex asks you to approve new hooks with /hooks.',
    backToAbout: 'Back to About',
    configure: 'Configure',
    uninstall: 'Uninstall',
    appThemeDescription: 'Applies to the interface and terminals that follow the application theme.',
    windowBackgroundEffect: 'Window background effect',
    windowBackgroundNone: 'None',
    windowBackgroundMica: 'Mica',
    windowBackgroundAcrylic: 'Acrylic',
    windowBackgroundTranslucent: 'Translucent',
    windowBackgroundRequiresRestart: 'Yira must restart for this setting to take effect.',
    windowBackgroundAppliedAfterRestart: 'It will be applied when Yira restarts.',
    windowBackgroundBlurHelp: 'Blur depends on your desktop: in GNOME, use the Blur my Shell extension (Applications, Yira class); in KDE, Hyprland, and other compositors, add a blur rule for the Yira class.',
    requiresWindows11: 'Requires Windows 11 or Linux',
    defaultAppearanceDescription: 'Light, dark, and system modes apply to Default. The other presets use their own dark palette.',
    followAppTheme: 'Default · Follow application',
    appearance: 'Appearance',
    aboutAndUpdates: 'About & Updates',
    supportAndReports: 'Support and reports',
    supportDescription: 'This public GitHub repository hosts bug reports, questions, and suggestions.',
    publicReportsHint: 'Reports are public. A GitHub account is required to submit a report.',
    privacyPolicy: 'Privacy Policy',
    reportBug: 'Report a bug',
    supportLinkError: 'Could not open the browser. Copy the repository link and open it in your browser.',
    termsOfUse: 'Terms of Use / EULA',
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
    legalDocumentEnglish: 'This document is provided in English and is included in this Yira build for offline reading.',
    legalDocumentLinkError: 'Could not open this link in the browser. Copy the link and open it in your browser.',
    legalDocuments: 'Legal documents',
    legalDocumentsDescription: 'Read the versioned documents included with this Yira build. No internet connection is required.',
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
    newAgentSessionShortcut: 'New agent session shortcut',
    newAgentSessionShortcutDescription: 'Press a key combination that includes Ctrl, Cmd, or Alt to set the shortcut.',
    pressShortcut: 'Press a shortcut…',
    resetToDefault: 'Reset to default',
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
    shortcutNewAgentSession: 'New agent session',
    shortcutPreviousTab: 'Previous tab',
    shortcutContextual: 'Contextual',
    shortcutToggleFullscreen: 'Toggle fullscreen',
    shortcutWindow: 'Window',
    snapEnabled: 'Snap enabled',
    systemControls: 'Yira system controls',
    terminal: 'Terminal',
    agents: 'Agents',
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
    wakeOnLan: 'Wake-on-LAN',
    wakeOnLanMacAddress: 'MAC address',
    wakeOnLanBroadcastAddress: 'Broadcast address',
    wakeOnLanUdpPort: 'UDP port',
    wakeOnLanInvalidMac: 'Enter a valid MAC address.',
    wakeOnLanInvalidBroadcast: 'Enter a valid IPv4 broadcast address.',
    terminalHistory: 'Workspace terminal history',
    agentProvider: 'Agent provider',
    agentProviders: 'Agent providers',
    noAgentProvider: 'No agent provider',
    agentProviderHelp: 'Choose one provider for this workspace. Its arguments stay saved when you switch providers.',
    claude: 'Claude',
    codex: 'Codex',
    agentProviderArgs: 'Arguments (one per line)',
    agentProviderArgsPlaceholder: '--model\nvalue',
    claudeUsageTitle: 'Claude usage data',
    claudeUsageDescription: 'Yira adds a managed status line to Claude Code settings (~/.claude/settings.json) to read the usage limits (5 hours and weekly), context, cost, changed lines, and model that Claude Code provides. It saves them locally in ~/.claude/statusline/. Nothing leaves this machine. If you already have a custom status line, it stays visible because Yira runs it after saving the data; disabling this restores it. This applies to new Claude Code sessions.',
    claudeUsageActive: 'Active',
    claudeUsageInactive: 'Not active',
    claudeUsageChainable: 'A custom status line is configured and will be preserved.',
    claudeUsageOutdated: 'Needs repair',
    claudeUsageError: 'Configuration error',
    claudeUsageLoading: 'Checking Claude Code configuration…',
    claudeUsageActivate: 'Activate',
    claudeUsageRepair: 'Repair',
    claudeUsageDeactivate: 'Deactivate',
    claudeUsageEnabledMessage: 'Claude usage capture is enabled.',
    claudeUsageDisabledMessage: 'Claude usage capture is disabled.',
    claudeUsageActionError: 'The Claude Code configuration could not be updated.',
    closeRemoteTerminalHelp: 'Close remote terminal help',
    gotIt: 'Got it',
    editWorkspace: 'Edit workspace',
    workspaceDraft: 'Workspace Draft',
    applyDraft: 'Apply Draft',
    saveChangesFailed: 'Could not save workspace changes',
    willRemove: 'Will remove',
    new: 'New',
    confirmRemovalByName: 'Type {{name}}',
    removeFromYira: 'Remove from Yira',
    undoRemoval: 'Undo removal',
    discardDraft: 'Discard draft',
    configure: 'Configure workspace',
    focus: 'Focus workspace',
    deactivate: 'Deactivate workspace',
    deactivateConfirmTitle: 'Deactivate {{name}}?',
    deactivateConfirmMessage: 'All terminals in this workspace will be closed, including running Claude or Codex sessions and any process started in them. Unsaved terminal work will be lost. The workspace stays in the list and you can open it again.',
    deactivateConfirm: 'Deactivate',
    deactivateWarning: 'Processes running in these terminals will be stopped.',
    attention_one: '{{count}} terminal output event in this workspace',
    attention_other: '{{count}} terminal output events in this workspace',
    gitDiffTooltip: 'Includes repositories at the workspace root, in its direct child folders, and those selected in settings. Net diff of pending commits and uncommitted changes since the common ancestor with the known remote reference (+{{additions}} −{{deletions}}). It may not represent the latest push.',
    gitDiffUnavailable: 'Git diff unavailable for this workspace.',
  },
  sourceControl: {
    noChanges: 'No changes',
    noCommits: 'No commits',
    unknownDate: 'Unknown date',
    noSubject: '(no subject)',
    commits: 'Commits',
    loadingHistory: 'Loading history…',
    loadHistoryError: 'Unable to load history: {{error}}',
    outgoing_one: '{{count}} to push',
    outgoing_other: '{{count}} to push',
    latestRemote: 'Latest remote',
    noRemoteComparison: 'No remote comparison available',
    latestLocal: 'Latest local',
    fetchRefs: 'Fetch refs',
    behind_one: '{{count}} behind',
    behind_other: '{{count}} behind',
    ahead_one: '{{count}} ahead',
    ahead_other: '{{count}} ahead',
    pullThenPush: 'Pull then push',
    requiresUpstream: '{{action}} requires an upstream branch',
    working: 'Working…',
    loading: 'Loading…',
    noBranch: 'No branch',
    loadingSourceControl: 'Loading source control…',
    notGitRepository: 'This workspace is not a Git repository.',
    retry: 'Retry',
    noUpstream: 'No upstream',
    stagedChanges: 'Staged Changes',
    changes: 'Changes',
    commitMessage: 'Commit message',
    commit: 'Commit',
    retryOperation: 'Retry operation',
    stageFile: 'Stage file',
    unstageFile: 'Unstage file',
    stagePath: 'Stage {{path}}',
    unstagePath: 'Unstage {{path}}',
    loadStatusError: 'Unable to load source control status',
    loadHistoryErrorFallback: 'Unable to load commit history',
    onlyChanged: 'Only changed',
    listView: 'List view',
    treeView: 'Tree view',
    refreshAll: 'Refresh all',
    noChangedRepositories: 'No changed repositories',
    repositories: 'repositories',
    changed: 'changed',
    actionFetch: 'Fetch',
    actionSync: 'Sync',
    repositoriesSummary: 'Repositories ({{count}}) · {{changed}} changed',
  },
  tile: {
    terminal: 'Terminal',
    agent: 'Agent',
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
    newAgent: 'New agent',
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
    markdownEdit: 'Edit Markdown',
    markdownSplit: 'Edit and preview Markdown',
    markdownPreview: 'View rendered Markdown',
    imageUnavailable: 'Image unavailable',
    saved: 'Saved',
    diffSideBySide: 'Side by side',
    diffInline: 'Inline',
    openDiffFile: 'Open file',
    diffLoading: 'Loading diff…',
    diffBinary: 'Binary files cannot be shown as text.',
    diffTooLarge: 'This file is too large to display.',
    diffNoChanges: 'No differences.',
    diffStaged: 'Staged',
    diffWorkingTree: 'Working Tree',
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
    sshConnectionClosed: 'SSH connection closed',
    reconnect: 'Reconnect',
    reconnecting: 'Reconnecting…',
    wakeOnLanPreparing: 'Preparing remote computer…',
    wakeOnLanPacketSent: 'Packet sent; waiting for response…',
    wakeOnLanHostOnline: 'Computer responding; waiting for SSH…',
    wakeOnLanSshReady: 'SSH ready; connecting…',
    wakeOnLanUnconfirmed: 'No response; activation not confirmed',
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
  ui: {
    boardType: 'TYPE',
    boardContext: 'CONTEXT',
    boardRelated: 'RELATED',
    addNote: 'Add note',
    deleteBacklogTask: 'Delete backlog task',
    copyMcpConfig: 'Copy MCP config command',
    newTask: 'New Task',
    searchHistory: 'Search history',
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    openExternally: 'Open externally',
    webSurface: 'Web Surface',
    createWorkspaceContent: 'Create a terminal, note, browser, timer, or workspace board.',
    groupColor: 'Group color',
    moveTile: 'Move tile',
    resizeSplit: 'Resize split',
    groupSettings: 'Group Settings',
    groupName: 'Group name',
    untitledGroup: 'Untitled Group',
    color: 'Color',
    lockGroup: 'Lock group',
    lockGroupDescription: 'Prevent moving or resizing the group and its tiles.',
    loadingNote: 'Loading note...',
    noteUntitled: 'Untitled',
    noteEdited: 'Edited {{time}}',
    noteWordCount_one: '{{count}} word',
    noteWordCount_other: '{{count}} words',
    rawState: 'Raw State',
    applyJson: 'Apply JSON',
    noItemsOpen: 'No items open',
    configureTile: 'Configure tile',
    focusTile: 'Focus tile',
    closeTile: 'Close tile',
    detachTile: 'Detach tile',
    attachTile: 'Attach tile',
    hours: 'Hours',
    seconds: 'Seconds',
    loadDuration: 'Load duration',
    startTimer: 'Start timer',
    stopTimer: 'Stop timer',
    resetTimer: 'Reset timer',
    unableToLoadDirectory: 'Unable to load directory',
    searchWorkspaceFiles: 'Search workspace files',
    searchFiles: 'Search files',
    closeSearch: 'Close search',
    typeToSearchFiles: 'Type to search files',
    searching: 'Searching…',
    noFilesFound: 'No files found',
    emptyFolder: 'Empty folder',
    shellProfiles: 'Shell Profiles',
    noteType: 'Note Type',
    updates: 'Updates',
    dismissUpdateBanner: 'Dismiss update banner',
    noteSuffix: 'NOTE',
    closedTasks_one: '{{count}} closed task',
    closedTasks_other: '{{count}} closed tasks',
    taskCount_one: '{{count}} task',
    taskCount_other: '{{count}} tasks',
    taskFallback: 'Task',
    boardBacklog: 'Backlog',
    boardReady: 'Ready',
    boardInProgress: 'In Progress',
    boardReview: 'Review',
    boardDone: 'Done',
    empty: '[ EMPTY ]',
    tileUnavailable: '[ TILE UNAVAILABLE ]',
    loadingTile: '[ LOADING TILE ]',
    emptyGrid: '[ EMPTY GRID ]',
    newTerminal: 'New Terminal',
    newBrowser: 'New Browser',
    newTimer: 'New Timer',
    newNote: 'New Note',
    editAction: 'Edit',
    renameAction: 'Rename',
    duplicateAction: 'Duplicate',
    refreshAction: 'Refresh',
    muteActivity: 'Mute Activity',
    unmuteActivity: 'Unmute Activity',
    muteNotifications: 'Mute Notifications',
    unmuteNotifications: 'Unmute Notifications',
    lock: 'Lock',
    unlock: 'Unlock',
    openMarkdownTile: 'Open in Markdown tile',
    openFileTile: 'Open in file tile',
    copyPath: 'Copy path',
    openBrowserTile: 'Open in Browser tile',
    copyUrl: 'Copy URL',
    copyText: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    gridFull: 'Grid is full',
    gridFullMessage: 'Grid workspaces can contain at most {{count}} tiles.',
    createGroup: 'Create group',
    editGroup: 'Edit group',
    ungroupTiles: 'Ungroup tiles',
    ungroupTilesMessage: 'Ungroup "{{name}}" and keep its tiles separate on the canvas?',
    refreshTerminal: 'Refresh terminal',
    refreshTerminalMessage: 'Refresh "{{label}}"? This restarts the terminal and stops any running process in that session.',
    refreshBrowser: 'Refresh browser tile',
    refreshBrowserMessage: 'Refresh "{{label}}"? This reloads the current web surface.',
    refreshNote: 'Refresh note tile',
    refreshNoteMessage: 'Refresh "{{label}}"? This reloads the note from saved state and may discard recent unsaved changes.',
    refreshTile: 'Refresh tile',
    refreshTileMessage: 'Refresh "{{label}}"? This reloads the surface from saved state and may discard recent unsaved changes.',
    captureTaskTitle: 'Capture the task title.',
    captureWork: 'Capture the work to be done.',
    title: 'Title',
    task: 'Task',
    deleteTask: 'Delete task',
    deleteTaskMessage: 'Delete "{{title}}" from Backlog?',
    rejectTask: 'Reject task',
    rejectTaskMessage: 'Explain why "{{title}}" is returning to In Progress.',
    requiredNote: 'Required note',
    show: 'Show',
    editGroupAction: 'Edit Group',
    ungroup: 'Ungroup',
    removeTileFromGroup: 'Remove tile from group',
    removeTileFromGroupMessage: 'Remove "{{tile}}" from "{{group}}"? The tile will be moved outside the group frame.',
    updateReady: 'Update {{version}} is ready',
    restartUpdateMessage: 'Restart Yira to install the downloaded version.',
    downloadingUpdate: 'Downloading update {{version}}',
    updateFound: 'Update {{version}} found',
    noteEditMode: 'Edit',
    notePreviewMode: 'Preview',
    noteSplitMode: 'Split',
    tileTypeFile: 'File',
    yiraTile: 'Yira Tile',
    tileComingSoon: '{{tile}} coming soon',
    createGroupConfirm: 'Create Group',
    saveGroup: 'Save Group',
    saveTile: 'Save {{tile}}',
    keepRunning: 'Keep Running',
    keepCurrent: 'Keep Current',
    keepEditing: 'Keep Editing',
    keepTask: 'Keep Task',
    keepInGroup: 'Keep In Group',
    remove: 'Remove',
    updateProgress: '{{percent}}% completed in the background.',
    downloadingUpdateUnknown: 'Downloading update',
    updateFoundUnknown: 'Update found',
    editTile: 'Edit {{tile}}',
    remoteSsh: 'Remote SSH',
    configureRemoteTerminalFirst: 'Configure Remote terminal in Workspace Settings first',
    opensshMissing: 'OpenSSH client is missing on this computer',
    createSshTerminal: 'Create a terminal connected through SSH',
    configureStatus: '[ CONFIGURE ]',
    opensshMissingStatus: '[ OPENSSH MISSING ]',
    usage: 'usage',
    unavailable: 'unavailable',
    resetUnavailable: 'reset unavailable',
    usageResets: 'resets {{date}}',
    fiveHourShort: '5 h',
    weeklyShort: 'wk.',
    providerAgent: '{{provider}} agent',
    downloadingUpdateMessage: 'The update is downloading in the background.',
    lockedStatus: '[ LOCKED ]',
    unlockedStatus: '[ UNLOCKED ]',
    errorStatus: '[ ERROR ]',
    richStatus: '[ RICH ]',
    markdownStatus: '[ MARKDOWN ]',
    taskDetails: 'Task Details',
    createTask: 'Create Task',
    thisTile: 'this tile',
    closeTileMessage: 'Close "{{label}}"? Any running session or unsaved surface state may be lost.',
    keepOpen: 'Keep Open',
    keepGroup: 'Keep Group',
    ready: 'Ready',
    missing: 'Missing',
    richNote: 'Rich Note',
    markdownNote: 'Markdown Note',
    command: 'Command',
    optionalStartupCommand: 'Optional startup command',
    toggleZoom: 'Toggle zoom 100%',
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
  activity: {
    activity: 'Actividad',
    openWorkspace: 'Abrir espacio de trabajo',
    goToTerminal: 'Ir a la terminal',
    emptyTitle: 'Sin espacios de trabajo activos',
    emptyMessage: 'Abre un espacio de trabajo para verlo aquí. Solo aparecen los visitados en esta sesión.',
    terminals_one: '{{count}} terminal',
    terminals_other: '{{count}} terminales',
    statusActive: 'Terminales activas',
    statusUnread: 'Salida sin revisar',
    statusIdle: 'Sin actividad',
    agents: 'Agentes',
    windowFiveHour: 'Ventana 5 h',
    windowWeekly: 'Semanal',
    tokensToday: 'Tokens hoy',
    sessionsToday: 'Sesiones hoy',
    topModel: 'Modelo más usado',
    credits: 'Créditos',
    limitReached: 'Límite alcanzado',
    recentSessions: 'Sesiones recientes',
    noUsageData: 'Sin datos de usage',
    noTodayData: 'Sin datos de hoy',
    noData: 'Sin datos',
    projection: 'Proyección',
    beforeReset: 'antes del reset',
    atReset: 'al reset',
    hourlyTokens: 'Tokens por hora',
    linesAdded: 'Líneas añadidas',
    linesRemoved: 'Líneas eliminadas',
    showDetails: 'Mostrar detalle',
    hideDetails: 'Ocultar detalle',
    noCredits: 'Sin créditos',
    unlimitedCredits: 'Ilimitados',
    no: 'No',
    context: 'Contexto',
    noAgentsEnabled: 'No hay agentes activados',
    enableAgentsHint: 'Activa un agente en Configuración › Agentes para ver su uso aquí.',
    all: 'Todos',
    updatedAt: 'Actualizado {{time}}',
    indexing: 'Indexando historial…',
    workspaces: 'Espacios de trabajo',
    totalTokens: 'Tokens totales',
    sessionsSub: '{{count}} sesiones',
    inputOutput: 'Entrada + salida',
    noCache: 'sin caché',
    cacheHit: 'Uso de caché',
    sessions: 'Sesiones',
    withoutSubagents: 'sin subagentes',
    lines: 'Líneas +/−',
    claudeOnly: 'solo lo reporta Claude',
    topWorkspace: 'Espacio más activo',
    workspaceTokens: 'tokens por espacio',
    tokensPerHour: 'Tokens por hora',
    tokensPerDay: 'Tokens por día',
    planLimits: 'Límites del plan',
    byWorkspace: 'Por espacio',
    byModel: 'Por modelo',
    tokenMix: 'Mezcla de tokens',
    period: { today: 'Hoy', '7d': '7 días', '30d': '30 días' },
    noPeriodData: 'Sin datos en este período',
    agentFilter: 'Filtro de agente',
    periodFilter: 'Filtro de período',
    cacheReadAmount: '{{count}} leídos de caché',
    token: { cacheRead: 'Lectura de caché', cacheWrite: 'Escritura de caché', input: 'Entrada', output: 'Salida', cached: 'En caché', reasoning: 'Razonamiento' },
  },
  terminalActivity: {
    'needs-input': 'Requiere intervención',
    working: 'Trabajando',
    unread: 'Actividad sin revisar',
    output: 'Terminales activas',
    background: 'En segundo plano',
    done: 'Actividad finalizada',
    idle: 'Sin actividad detectada',
    exited: 'Finalizada',
    summary: '{{working}} trabajando; {{needsInput}} requieren intervención; {{done}} finalizados; {{unread}} eventos de salida sin revisar; {{recentOutput}} terminales con salida reciente; {{background}} en segundo plano',
  },
  agentsView: {
    title: 'Agentes',
    openAgentsView: 'Abrir vista de agentes ({{count}} sesiones)',
    needsAttention: '{{count}} sesiones requieren atención',
    worktreeKeptTitle: 'Worktree conservado',
    worktreeKeptMessage: 'El worktree tiene cambios y se conservó en {{path}}.',
    worktreePathUnavailable: 'una ruta desconocida',
    closeSessionErrorTitle: 'No se pudo cerrar la sesión del agente',
    sessionCount: '{{count}} sesiones',
    newSession: 'Nueva sesión',
    emptyTitle: 'No hay sesiones de agentes en esta vista',
    emptyDescription: 'Inicia una sesión para ver aquí su terminal en vivo.',
    newAgentSession: 'Nueva sesión de agente',
    agentSession: 'Sesión de agente',
    unknownTitle: 'Sesión sin título',
    closeSession: 'Cerrar sesión',
    maximizeSession: 'Maximizar sesión',
    restoreSession: 'Restaurar sesión',
    statusWorking: 'Trabajando',
    statusNeedsInput: 'Requiere intervención',
    statusDone: 'Terminada',
    statusExited: 'Finalizada',
    exitedMessage: 'La sesión terminó',
    provider: 'Proveedor',
    workspace: 'Espacio de trabajo',
    closeDialog: 'Cerrar diálogo',
    prompt: 'Instrucción',
    promptPlaceholder: 'Describe qué quieres que haga el agente. Enter inicia la sesión; Shift+Enter agrega una línea.',
    worktree: 'Ejecutar en un worktree de Git',
    worktreeUnavailable: 'Los worktrees de Git no están disponibles en este espacio de trabajo.',
    createSession: 'Crear sesión',
    creatingSession: 'Creando sesión…',
    shortcutLabel: 'Atajo: {{shortcut}}',
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
    resumeError: 'No se pudo reanudar esta sesión de agente.',
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
    agentIntegrations: 'Integraciones de agentes',
    agentInstalled: 'Se encontró {{path}}',
    agentNotInstalled: 'No está instalado en esta máquina',
    agentDetecting: 'Comprobando instalación…',
    enableAgent: 'Activar agente',
    agentDisabled: 'Apagado. Yira no lee sus archivos ni lo muestra en Actividad.',
    yiraHooks: 'Hooks de Yira',
    hooksInstalled: 'Instalados',
    hooksMissing: 'No instalados',
    install: 'Instalar',
    repair: 'Reparar',
    codexHooksHelp: 'Codex pide aprobar hooks nuevos con /hooks.',
    backToAbout: 'Volver a Acerca de',
    configure: 'Configurar',
    uninstall: 'Desinstalar',
    appThemeDescription: 'Se aplica a la interfaz y a las terminales que siguen el tema de la aplicación.',
    windowBackgroundEffect: 'Efecto de fondo de ventana',
    windowBackgroundNone: 'Ninguno',
    windowBackgroundMica: 'Mica',
    windowBackgroundAcrylic: 'Acrylic',
    windowBackgroundTranslucent: 'Translúcido',
    windowBackgroundRequiresRestart: 'Requiere reiniciar Yira.',
    windowBackgroundAppliedAfterRestart: 'Se aplicará al reiniciar Yira.',
    windowBackgroundBlurHelp: 'El desenfoque depende del escritorio: en GNOME usa la extensión Blur my Shell (Applications, clase Yira); en KDE, Hyprland y otros compositores, una regla de blur para la clase Yira.',
    requiresWindows11: 'Requiere Windows 11 o Linux',
    defaultAppearanceDescription: 'Los modos claro, oscuro y del sistema se aplican a Default. Los otros temas usan su propia paleta oscura.',
    followAppTheme: 'Default · Seguir aplicación',
    appearance: 'Apariencia',
    aboutAndUpdates: 'Acerca de y actualizaciones',
    supportAndReports: 'Soporte y reportes',
    supportDescription: 'Este repositorio público de GitHub recibe reportes de errores, preguntas y sugerencias.',
    publicReportsHint: 'Los reportes son públicos. Necesitas una cuenta de GitHub para enviar un reporte.',
    privacyPolicy: 'Política de privacidad',
    reportBug: 'Reportar un error',
    supportLinkError: 'No se pudo abrir el navegador. Copia el enlace del repositorio y ábrelo en tu navegador.',
    termsOfUse: 'Términos de uso / EULA',
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
    legalDocumentEnglish: 'Este documento está disponible en inglés y está incluido en esta versión de Yira para lectura sin conexión.',
    legalDocumentLinkError: 'No se pudo abrir este enlace en el navegador. Copia el enlace y ábrelo en tu navegador.',
    legalDocuments: 'Documentos legales',
    legalDocumentsDescription: 'Lee los documentos versionados incluidos en esta versión de Yira. No se requiere conexión a Internet.',
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
    newAgentSessionShortcut: 'Atajo para nueva sesión de agente',
    newAgentSessionShortcutDescription: 'Pulsa una combinación que incluya Ctrl, Cmd o Alt para definir el atajo.',
    pressShortcut: 'Pulsa un atajo…',
    resetToDefault: 'Restablecer valor predeterminado',
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
    shortcutNewAgentSession: 'Nueva sesión de agente',
    shortcutPreviousTab: 'Pestaña anterior',
    shortcutContextual: 'Contextual',
    shortcutToggleFullscreen: 'Alternar pantalla completa',
    shortcutWindow: 'Ventana',
    snapEnabled: 'Ajuste activado',
    systemControls: 'Controles del sistema Yira',
    terminal: 'Terminal',
    agents: 'Agentes',
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
    wakeOnLan: 'Wake-on-LAN',
    wakeOnLanMacAddress: 'Dirección MAC',
    wakeOnLanBroadcastAddress: 'Dirección broadcast',
    wakeOnLanUdpPort: 'Puerto UDP',
    wakeOnLanInvalidMac: 'Escribe una dirección MAC válida.',
    wakeOnLanInvalidBroadcast: 'Escribe una dirección broadcast IPv4 válida.',
    terminalHistory: 'Historial de terminal del espacio de trabajo',
    agentProvider: 'Proveedor de agente',
    agentProviders: 'Proveedores de agentes',
    noAgentProvider: 'Sin proveedor de agente',
    agentProviderHelp: 'Elige un proveedor para este espacio de trabajo. Sus argumentos se conservan al cambiar de proveedor.',
    claude: 'Claude',
    codex: 'Codex',
    agentProviderArgs: 'Argumentos (uno por línea)',
    agentProviderArgsPlaceholder: '--model\nvalor',
    claudeUsageTitle: 'Datos de uso de Claude',
    claudeUsageDescription: 'Yira agrega una línea de estado administrada a la configuración de Claude Code (~/.claude/settings.json) para leer los límites de uso (5 horas y semanal), contexto, costo, líneas cambiadas y modelo que Claude Code proporciona. Los guarda localmente en ~/.claude/statusline/. Nada sale de esta máquina. Si ya tienes una línea de estado propia, seguirá visible porque Yira la ejecuta después de guardar los datos; al desactivar se restaura. Se aplica a las nuevas sesiones de Claude Code.',
    claudeUsageActive: 'Activo',
    claudeUsageInactive: 'No activo',
    claudeUsageChainable: 'Hay una línea de estado propia y se conservará.',
    claudeUsageOutdated: 'Necesita reparación',
    claudeUsageError: 'Error de configuración',
    claudeUsageLoading: 'Consultando la configuración de Claude Code…',
    claudeUsageActivate: 'Activar',
    claudeUsageRepair: 'Reparar',
    claudeUsageDeactivate: 'Desactivar',
    claudeUsageEnabledMessage: 'La captura de uso de Claude está activada.',
    claudeUsageDisabledMessage: 'La captura de uso de Claude está desactivada.',
    claudeUsageActionError: 'No se pudo actualizar la configuración de Claude Code.',
    closeRemoteTerminalHelp: 'Cerrar ayuda de terminal remota',
    gotIt: 'Entendido',
    editWorkspace: 'Editar espacio de trabajo',
    workspaceDraft: 'Borrador del espacio de trabajo',
    applyDraft: 'Aplicar borrador',
    saveChangesFailed: 'No se pudieron guardar los cambios del espacio de trabajo',
    willRemove: 'Se eliminará',
    new: 'Nuevo',
    confirmRemovalByName: 'Escribe {{name}}',
    removeFromYira: 'Quitar de Yira',
    undoRemoval: 'Deshacer eliminación',
    discardDraft: 'Descartar borrador',
    configure: 'Configurar espacio de trabajo',
    focus: 'Enfocar espacio de trabajo',
    deactivate: 'Desactivar espacio de trabajo',
    deactivateConfirmTitle: '¿Desactivar {{name}}?',
    deactivateConfirmMessage: 'Se cerrarán todas las terminales de este espacio de trabajo, incluidas las sesiones de Claude o Codex en curso y cualquier proceso iniciado en ellas. Se perderá el trabajo no guardado en las terminales. El espacio de trabajo sigue en la lista y puedes abrirlo de nuevo.',
    deactivateConfirm: 'Desactivar',
    deactivateWarning: 'Se detendrán los procesos que corren en estas terminales.',
    attention_one: '{{count}} evento de salida de terminal en este espacio de trabajo',
    attention_other: '{{count}} eventos de salida de terminal en este espacio de trabajo',
    gitDiffTooltip: 'Incluye los repositorios de la raíz, de las carpetas hijas directas y los seleccionados en la configuración. Diff neto de commits pendientes y cambios sin commit desde el ancestro común con la referencia remota conocida (+{{additions}} −{{deletions}}). Puede no representar el último push.',
    gitDiffUnavailable: 'El diff de Git no está disponible para este espacio de trabajo.',
  },
  sourceControl: {
    noChanges: 'Sin cambios',
    noCommits: 'No hay commits',
    unknownDate: 'Fecha desconocida',
    noSubject: '(sin asunto)',
    commits: 'Commits',
    loadingHistory: 'Cargando historial…',
    loadHistoryError: 'No se pudo cargar el historial: {{error}}',
    outgoing_one: '{{count}} por subir',
    outgoing_other: '{{count}} por subir',
    latestRemote: 'Últimos en remoto',
    noRemoteComparison: 'No hay comparación remota',
    latestLocal: 'Últimos locales',
    fetchRefs: 'Obtener referencias',
    behind_one: '{{count}} detrás',
    behind_other: '{{count}} detrás',
    ahead_one: '{{count}} por delante',
    ahead_other: '{{count}} por delante',
    pullThenPush: 'Pull y luego Push',
    requiresUpstream: '{{action}} requiere una rama upstream',
    working: 'En curso…',
    loading: 'Cargando…',
    noBranch: 'Sin rama',
    loadingSourceControl: 'Cargando control de código fuente…',
    notGitRepository: 'Este espacio de trabajo no es un repositorio de Git.',
    retry: 'Reintentar',
    noUpstream: 'Sin upstream',
    stagedChanges: 'Cambios preparados',
    changes: 'Cambios',
    commitMessage: 'Mensaje del commit',
    commit: 'Crear commit',
    retryOperation: 'Reintentar operación',
    stageFile: 'Preparar archivo',
    unstageFile: 'Quitar archivo de los preparados',
    stagePath: 'Preparar {{path}}',
    unstagePath: 'Quitar {{path}} de los preparados',
    loadStatusError: 'No se pudo cargar el estado del control de código fuente',
    loadHistoryErrorFallback: 'No se pudo cargar el historial de commits',
    onlyChanged: 'Solo con cambios',
    listView: 'Vista de lista',
    treeView: 'Vista de árbol',
    refreshAll: 'Actualizar todo',
    noChangedRepositories: 'No hay repositorios con cambios',
    repositories: 'repositorios',
    changed: 'con cambios',
    actionFetch: 'Obtener',
    actionSync: 'Sincronizar',
    repositoriesSummary: 'Repositorios ({{count}}) · {{changed}} con cambios',
  },
  tile: {
    terminal: 'Terminal',
    agent: 'Agente',
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
    newAgent: 'Nuevo agente',
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
    markdownEdit: 'Editar Markdown',
    markdownSplit: 'Editar y previsualizar Markdown',
    markdownPreview: 'Ver Markdown renderizado',
    imageUnavailable: 'Imagen no disponible',
    saved: 'Guardado',
    diffSideBySide: 'Lado a lado',
    diffInline: 'En línea',
    openDiffFile: 'Abrir archivo',
    diffLoading: 'Cargando diff…',
    diffBinary: 'No se pueden mostrar archivos binarios como texto.',
    diffTooLarge: 'Este archivo es demasiado grande para mostrarlo.',
    diffNoChanges: 'No hay diferencias.',
    diffStaged: 'Preparado',
    diffWorkingTree: 'Árbol de trabajo',
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
    sshConnectionClosed: 'Conexión SSH cerrada',
    reconnect: 'Reconectar',
    reconnecting: 'Reconectando…',
    wakeOnLanPreparing: 'Preparando computadora remota…',
    wakeOnLanPacketSent: 'Paquete enviado; esperando respuesta…',
    wakeOnLanHostOnline: 'Equipo responde; esperando SSH…',
    wakeOnLanSshReady: 'SSH listo; conectando…',
    wakeOnLanUnconfirmed: 'Sin respuesta; activación no confirmada',
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
  ui: {
    boardType: 'TIPO',
    boardContext: 'CONTEXTO',
    boardRelated: 'RELACIONADAS',
    addNote: 'Añadir nota',
    deleteBacklogTask: 'Eliminar tarea pendiente',
    copyMcpConfig: 'Copiar comando de configuración de MCP',
    newTask: 'Nueva tarea',
    searchHistory: 'Buscar en el historial',
    back: 'Atrás',
    forward: 'Adelante',
    reload: 'Recargar',
    openExternally: 'Abrir externamente',
    webSurface: 'Superficie web',
    createWorkspaceContent: 'Crea una terminal, una nota, un navegador, un temporizador o un tablero del espacio de trabajo.',
    groupColor: 'Color del grupo',
    moveTile: 'Mover panel',
    resizeSplit: 'Cambiar tamaño de la división',
    groupSettings: 'Configuración del grupo',
    groupName: 'Nombre del grupo',
    untitledGroup: 'Grupo sin título',
    color: 'Color',
    lockGroup: 'Bloquear grupo',
    lockGroupDescription: 'Evita mover o cambiar el tamaño del grupo y sus paneles.',
    loadingNote: 'Cargando nota...',
    noteUntitled: 'Sin título',
    noteEdited: 'Editado {{time}}',
    noteWordCount_one: '{{count}} palabra',
    noteWordCount_other: '{{count}} palabras',
    rawState: 'Estado sin procesar',
    applyJson: 'Aplicar JSON',
    noItemsOpen: 'No hay elementos abiertos',
    configureTile: 'Configurar panel',
    focusTile: 'Enfocar panel',
    closeTile: 'Cerrar panel',
    detachTile: 'Separar panel',
    attachTile: 'Acoplar panel',
    hours: 'Horas',
    seconds: 'Segundos',
    loadDuration: 'Cargar duración',
    startTimer: 'Iniciar temporizador',
    stopTimer: 'Detener temporizador',
    resetTimer: 'Restablecer temporizador',
    unableToLoadDirectory: 'No se pudo cargar la carpeta',
    searchWorkspaceFiles: 'Buscar archivos del espacio de trabajo',
    searchFiles: 'Buscar archivos',
    closeSearch: 'Cerrar búsqueda',
    typeToSearchFiles: 'Escribe para buscar archivos',
    searching: 'Buscando…',
    noFilesFound: 'No se encontraron archivos',
    emptyFolder: 'Carpeta vacía',
    shellProfiles: 'Perfiles de shell',
    noteType: 'Tipo de nota',
    updates: 'Actualizaciones',
    dismissUpdateBanner: 'Descartar aviso de actualización',
    noteSuffix: 'NOTA',
    closedTasks_one: '{{count}} tarea cerrada',
    closedTasks_other: '{{count}} tareas cerradas',
    taskCount_one: '{{count}} tarea',
    taskCount_other: '{{count}} tareas',
    taskFallback: 'Tarea',
    boardBacklog: 'Pendientes',
    boardReady: 'Listo',
    boardInProgress: 'En curso',
    boardReview: 'Revisión',
    boardDone: 'Completado',
    empty: '[ VACÍO ]',
    tileUnavailable: '[ PANEL NO DISPONIBLE ]',
    loadingTile: '[ CARGANDO PANEL ]',
    emptyGrid: '[ CUADRÍCULA VACÍA ]',
    newTerminal: 'Nueva terminal',
    newBrowser: 'Nuevo navegador',
    newTimer: 'Nuevo temporizador',
    newNote: 'Nueva nota',
    editAction: 'Editar',
    renameAction: 'Cambiar nombre',
    duplicateAction: 'Duplicar',
    refreshAction: 'Actualizar',
    muteActivity: 'Silenciar actividad',
    unmuteActivity: 'Reactivar actividad',
    muteNotifications: 'Silenciar notificaciones',
    unmuteNotifications: 'Reactivar notificaciones',
    lock: 'Bloquear',
    unlock: 'Desbloquear',
    openMarkdownTile: 'Abrir en un panel Markdown',
    openFileTile: 'Abrir en un panel de archivo',
    copyPath: 'Copiar ruta',
    openBrowserTile: 'Abrir en un panel del navegador',
    copyUrl: 'Copiar URL',
    copyText: 'Copiar',
    paste: 'Pegar',
    selectAll: 'Seleccionar todo',
    gridFull: 'La cuadrícula está llena',
    gridFullMessage: 'Los espacios de trabajo en cuadrícula admiten hasta {{count}} paneles.',
    createGroup: 'Crear grupo',
    editGroup: 'Editar grupo',
    ungroupTiles: 'Separar paneles del grupo',
    ungroupTilesMessage: '¿Separar "{{name}}" y dejar sus paneles sueltos en el lienzo?',
    refreshTerminal: 'Actualizar terminal',
    refreshTerminalMessage: '¿Actualizar "{{label}}"? Esto reiniciará la terminal y detendrá los procesos que estén en esa sesión.',
    refreshBrowser: 'Actualizar panel del navegador',
    refreshBrowserMessage: '¿Actualizar "{{label}}"? Se volverá a cargar la página actual.',
    refreshNote: 'Actualizar panel de notas',
    refreshNoteMessage: '¿Actualizar "{{label}}"? Se volverá a cargar la nota guardada y podrían perderse los cambios recientes sin guardar.',
    refreshTile: 'Actualizar panel',
    refreshTileMessage: '¿Actualizar "{{label}}"? Se volverá a cargar el contenido guardado y podrían perderse los cambios recientes sin guardar.',
    captureTaskTitle: 'Escribe el título de la tarea.',
    captureWork: 'Describe el trabajo que hay que hacer.',
    title: 'Título',
    task: 'Tarea',
    deleteTask: 'Eliminar tarea',
    deleteTaskMessage: '¿Eliminar "{{title}}" de Pendientes?',
    rejectTask: 'Rechazar tarea',
    rejectTaskMessage: 'Explica por qué "{{title}}" vuelve a En curso.',
    requiredNote: 'Nota obligatoria',
    show: 'Mostrar',
    editGroupAction: 'Editar grupo',
    ungroup: 'Separar del grupo',
    removeTileFromGroup: 'Quitar panel del grupo',
    removeTileFromGroupMessage: '¿Quitar "{{tile}}" de "{{group}}"? El panel quedará fuera del marco del grupo.',
    updateReady: 'La actualización {{version}} está lista',
    restartUpdateMessage: 'Reinicia Yira para instalar la versión descargada.',
    downloadingUpdate: 'Descargando la actualización {{version}}',
    updateFound: 'Se encontró la actualización {{version}}',
    noteEditMode: 'Editar',
    notePreviewMode: 'Vista previa',
    noteSplitMode: 'Dividir',
    tileTypeFile: 'Archivo',
    yiraTile: 'Panel de Yira',
    tileComingSoon: '{{tile}} estará disponible próximamente',
    createGroupConfirm: 'Crear grupo',
    saveGroup: 'Guardar grupo',
    saveTile: 'Guardar {{tile}}',
    keepRunning: 'Seguir ejecutando',
    keepCurrent: 'Conservar actual',
    keepEditing: 'Seguir editando',
    keepTask: 'Conservar tarea',
    keepInGroup: 'Mantener en el grupo',
    remove: 'Quitar',
    updateProgress: '{{percent}}% completado en segundo plano.',
    downloadingUpdateUnknown: 'Descargando actualización',
    updateFoundUnknown: 'Se encontró una actualización',
    editTile: 'Editar {{tile}}',
    remoteSsh: 'SSH remoto',
    configureRemoteTerminalFirst: 'Primero configura la terminal remota en los ajustes del espacio de trabajo',
    opensshMissing: 'OpenSSH no está instalado en este equipo',
    createSshTerminal: 'Crear una terminal conectada por SSH',
    configureStatus: '[ CONFIGURAR ]',
    opensshMissingStatus: '[ FALTA OPENSSH ]',
    usage: 'uso',
    unavailable: 'no disponible',
    resetUnavailable: 'reinicio no disponible',
    usageResets: 'se restablece {{date}}',
    fiveHourShort: '5 h',
    weeklyShort: 'sem.',
    providerAgent: 'agente de {{provider}}',
    downloadingUpdateMessage: 'La actualización se está descargando en segundo plano.',
    lockedStatus: '[ BLOQUEADO ]',
    unlockedStatus: '[ DESBLOQUEADO ]',
    errorStatus: '[ ERROR ]',
    richStatus: '[ FORMATO ]',
    markdownStatus: '[ MARKDOWN ]',
    taskDetails: 'Detalles de la tarea',
    createTask: 'Crear tarea',
    thisTile: 'este panel',
    closeTileMessage: '¿Cerrar "{{label}}"? Se podría perder una sesión en curso o el estado de una superficie sin guardar.',
    keepOpen: 'Mantener abierto',
    keepGroup: 'Mantener grupo',
    ready: 'Disponible',
    missing: 'No disponible',
    richNote: 'Nota con formato',
    markdownNote: 'Nota Markdown',
    command: 'Comando',
    optionalStartupCommand: 'Comando de inicio opcional',
    toggleZoom: 'Alternar zoom al 100%',
  },
}

export const resources: Record<SupportedLanguage, { translation: TranslationResources }> = {
  en: { translation: en },
  es: { translation: es },
}

export type TranslationKeyResources = typeof en
