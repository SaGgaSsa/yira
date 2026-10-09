import { resolveMainView, resolvePanelLayout, type PanelLayout, type PanelLayoutInput } from './layoutState'

function assertMainView(
  name: string,
  input: Parameters<typeof resolveMainView>[0],
  expected: ReturnType<typeof resolveMainView>,
): void {
  const actual = resolveMainView(input)
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`)
}

function panelInput(overrides: Partial<PanelLayoutInput> = {}): PanelLayoutInput {
  const { narrowOverride, ...otherOverrides } = overrides
  return {
    mainView: 'workspace',
    sidebarCollapsed: false,
    workspacePanelOpen: true,
    workspacePanelHiddenByFocus: false,
    maximizedSessionId: null,
    workspacePanelRevealedForSessionId: null,
    windowWidth: 1920,
    sidePanelWidth: 344,
    ...otherOverrides,
    narrowOverride: {
      sidebar: narrowOverride?.sidebar ?? false,
      workspacePanel: narrowOverride?.workspacePanel ?? false,
    },
  }
}

function expectedLayout(overrides: Partial<PanelLayout> = {}): PanelLayout {
  return {
    agentSessionMaximized: false,
    sidebarHidden: false,
    sidebarHiddenByWidth: false,
    tilesHidden: false,
    workspacePanelSuppressed: false,
    workspacePanelVisible: true,
    workspacePanelShown: true,
    workspacePanelHiddenByWidth: false,
    narrowWindow: false,
    ...overrides,
  }
}

function assertPanelLayout(
  name: string,
  input: Partial<PanelLayoutInput>,
  expected: Partial<PanelLayout>,
): void {
  const actual = resolvePanelLayout(panelInput(input))
  const resolvedExpected = expectedLayout(expected)
  const keys: (keyof PanelLayout)[] = [
    'agentSessionMaximized',
    'sidebarHidden',
    'sidebarHiddenByWidth',
    'tilesHidden',
    'workspacePanelSuppressed',
    'workspacePanelVisible',
    'workspacePanelShown',
    'workspacePanelHiddenByWidth',
    'narrowWindow',
  ]

  for (const key of keys) {
    if (actual[key] !== resolvedExpected[key]) {
      throw new Error(`${name}: expected ${key}=${resolvedExpected[key]}, got ${actual[key]}`)
    }
  }
}

assertMainView('Activity has highest priority', {
  hasWorkspace: true,
  activityOpen: true,
  agentsViewOpen: true,
  homeOpen: true,
}, 'activity')
assertMainView('Agents takes priority over Home', {
  hasWorkspace: true,
  activityOpen: false,
  agentsViewOpen: true,
  homeOpen: true,
}, 'agents')
assertMainView('Home is selected when open', {
  hasWorkspace: true,
  activityOpen: false,
  agentsViewOpen: false,
  homeOpen: true,
}, 'home')
assertMainView('Workspace is selected when no overlay is open', {
  hasWorkspace: true,
  activityOpen: false,
  agentsViewOpen: false,
  homeOpen: false,
}, 'workspace')
assertMainView('Home is selected without a workspace', {
  hasWorkspace: false,
  activityOpen: false,
  agentsViewOpen: false,
  homeOpen: false,
}, 'home')

assertPanelLayout('Wide workspace layout shows both panels', {}, {})

assertPanelLayout('A narrow window hides the workspace panel first', {
  windowWidth: 1000,
}, {
  workspacePanelVisible: false,
  workspacePanelShown: false,
  workspacePanelHiddenByWidth: true,
  narrowWindow: true,
})

assertPanelLayout('An 800 px window hides both panels', {
  windowWidth: 800,
}, {
  sidebarHidden: true,
  sidebarHiddenByWidth: true,
  workspacePanelVisible: false,
  workspacePanelShown: false,
  workspacePanelHiddenByWidth: true,
  narrowWindow: true,
})

assertPanelLayout('Revealing the right panel hides the sidebar when space is insufficient', {
  windowWidth: 800,
  narrowOverride: { sidebar: false, workspacePanel: true },
}, {
  sidebarHidden: true,
  sidebarHiddenByWidth: true,
  workspacePanelVisible: true,
  workspacePanelShown: true,
  narrowWindow: true,
})

assertPanelLayout('Revealing the sidebar keeps it visible while the right panel stays hidden', {
  windowWidth: 800,
  narrowOverride: { sidebar: true, workspacePanel: false },
}, {
  sidebarHidden: false,
  sidebarHiddenByWidth: false,
  workspacePanelVisible: false,
  workspacePanelShown: false,
  workspacePanelHiddenByWidth: true,
  narrowWindow: true,
})

assertPanelLayout('Home does not reserve width for its hidden workspace panel', {
  mainView: 'home',
  windowWidth: 900,
}, {
  tilesHidden: true,
  workspacePanelVisible: true,
  workspacePanelShown: false,
  sidebarHidden: false,
  sidebarHiddenByWidth: false,
  workspacePanelHiddenByWidth: false,
  narrowWindow: true,
})

assertPanelLayout('A user-collapsed sidebar leaves the right panel visible at 900 px', {
  sidebarCollapsed: true,
  windowWidth: 900,
}, {
  sidebarHidden: true,
  sidebarHiddenByWidth: false,
  workspacePanelVisible: true,
  workspacePanelShown: true,
  workspacePanelHiddenByWidth: false,
  narrowWindow: true,
})

assertPanelLayout('A user-collapsed sidebar still lets the right panel give way at 750 px', {
  sidebarCollapsed: true,
  windowWidth: 750,
}, {
  sidebarHidden: true,
  sidebarHiddenByWidth: false,
  workspacePanelVisible: false,
  workspacePanelShown: false,
  workspacePanelHiddenByWidth: true,
  narrowWindow: true,
})

assertPanelLayout('Focus hides the workspace panel', {
  workspacePanelHiddenByFocus: true,
}, {
  workspacePanelSuppressed: true,
  workspacePanelVisible: false,
  workspacePanelShown: false,
})

assertPanelLayout('Revealing the Focus panel clears its suppression', {}, {})

assertPanelLayout('Focus does not hide the panel in Agents', {
  mainView: 'agents',
  workspacePanelHiddenByFocus: true,
}, {
  tilesHidden: true,
  workspacePanelSuppressed: false,
})

assertPanelLayout('A maximized session hides the panel and sidebar', {
  mainView: 'agents',
  maximizedSessionId: 'session-a',
}, {
  agentSessionMaximized: true,
  sidebarHidden: true,
  tilesHidden: true,
  workspacePanelSuppressed: true,
  workspacePanelVisible: false,
  workspacePanelShown: false,
})

assertPanelLayout('A reveal for the maximized session shows the panel', {
  mainView: 'agents',
  maximizedSessionId: 'session-a',
  workspacePanelRevealedForSessionId: 'session-a',
}, {
  agentSessionMaximized: true,
  sidebarHidden: true,
  tilesHidden: true,
  workspacePanelSuppressed: false,
  workspacePanelVisible: true,
  workspacePanelShown: true,
})

assertPanelLayout('A reveal for another session keeps the panel hidden', {
  mainView: 'agents',
  maximizedSessionId: 'session-b',
  workspacePanelRevealedForSessionId: 'session-a',
}, {
  agentSessionMaximized: true,
  sidebarHidden: true,
  tilesHidden: true,
  workspacePanelSuppressed: true,
  workspacePanelVisible: false,
  workspacePanelShown: false,
})

assertPanelLayout('Home hides tiles and the workspace panel on screen', {
  mainView: 'home',
}, {
  tilesHidden: true,
  workspacePanelShown: false,
})

assertPanelLayout('Activity hides tiles and the workspace panel on screen', {
  mainView: 'activity',
}, {
  tilesHidden: true,
  workspacePanelShown: false,
})

assertPanelLayout('A closed workspace panel preference stays closed', {
  workspacePanelOpen: false,
}, {
  workspacePanelVisible: false,
  workspacePanelShown: false,
})
