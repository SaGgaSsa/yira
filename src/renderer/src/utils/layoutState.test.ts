import { resolveMainView, resolvePanelLayout, type PanelLayout, type PanelLayoutInput } from './layoutState'

function assertMainView(
  name: string,
  input: Parameters<typeof resolveMainView>[0],
  expected: ReturnType<typeof resolveMainView>,
): void {
  const actual = resolveMainView(input)
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`)
}

function assertPanelLayout(name: string, input: PanelLayoutInput, expected: PanelLayout): void {
  const actual = resolvePanelLayout(input)
  const keys: (keyof PanelLayout)[] = [
    'agentSessionMaximized',
    'sidebarHidden',
    'tilesHidden',
    'workspacePanelSuppressed',
    'workspacePanelVisible',
    'workspacePanelShown',
  ]

  for (const key of keys) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${name}: expected ${key}=${expected[key]}, got ${actual[key]}`)
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

assertPanelLayout('Workspace layout', {
  mainView: 'workspace',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: false,
  workspacePanelSuppressed: false,
  workspacePanelVisible: true,
  workspacePanelShown: true,
})

assertPanelLayout('Focus hides the workspace panel', {
  mainView: 'workspace',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: true,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: false,
  workspacePanelSuppressed: true,
  workspacePanelVisible: false,
  workspacePanelShown: false,
})

assertPanelLayout('Revealing the Focus panel clears its suppression', {
  mainView: 'workspace',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: false,
  workspacePanelSuppressed: false,
  workspacePanelVisible: true,
  workspacePanelShown: true,
})

assertPanelLayout('Focus does not hide the panel in Agents', {
  mainView: 'agents',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: true,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: true,
  workspacePanelSuppressed: false,
  workspacePanelVisible: true,
  workspacePanelShown: true,
})

assertPanelLayout('A maximized session hides the panel and sidebar', {
  mainView: 'agents',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
  maximizedSessionId: 'session-a',
  workspacePanelRevealedForSessionId: null,
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
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
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
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
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

assertPanelLayout('Home hides tiles and the workspace panel', {
  mainView: 'home',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: true,
  workspacePanelSuppressed: false,
  workspacePanelVisible: true,
  workspacePanelShown: false,
})

assertPanelLayout('Activity hides tiles and the workspace panel', {
  mainView: 'activity',
  sidebarCollapsed: false,
  workspacePanelOpen: true,
  workspacePanelHiddenByFocus: false,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: true,
  workspacePanelSuppressed: false,
  workspacePanelVisible: true,
  workspacePanelShown: false,
})

assertPanelLayout('A closed workspace panel preference stays closed', {
  mainView: 'workspace',
  sidebarCollapsed: false,
  workspacePanelOpen: false,
  workspacePanelHiddenByFocus: false,
  maximizedSessionId: null,
  workspacePanelRevealedForSessionId: null,
}, {
  agentSessionMaximized: false,
  sidebarHidden: false,
  tilesHidden: false,
  workspacePanelSuppressed: false,
  workspacePanelVisible: false,
  workspacePanelShown: false,
})
