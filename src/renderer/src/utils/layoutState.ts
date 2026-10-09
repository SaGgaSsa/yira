export type MainView = 'workspace' | 'activity' | 'agents' | 'home'

export function resolveMainView(input: {
  hasWorkspace: boolean
  activityOpen: boolean
  agentsViewOpen: boolean
  homeOpen: boolean
}): MainView {
  if (input.activityOpen) return 'activity'
  if (input.agentsViewOpen) return 'agents'
  if (input.homeOpen || !input.hasWorkspace) return 'home'
  return 'workspace'
}

export interface PanelLayoutInput {
  mainView: MainView
  sidebarCollapsed: boolean
  workspacePanelOpen: boolean
  workspacePanelHiddenByFocus: boolean
  maximizedSessionId: string | null
  workspacePanelRevealedForSessionId: string | null
}

export interface PanelLayout {
  agentSessionMaximized: boolean
  sidebarHidden: boolean
  tilesHidden: boolean
  workspacePanelSuppressed: boolean
  workspacePanelVisible: boolean
  workspacePanelShown: boolean
}

export function resolvePanelLayout(input: PanelLayoutInput): PanelLayout {
  const agentSessionMaximized = input.maximizedSessionId !== null && input.mainView === 'agents'
  const sidebarHidden = input.sidebarCollapsed || agentSessionMaximized
  // Focus hides the panel outside Agents so it remains available beside agent sessions.
  const focusSuppressesWorkspacePanel = input.workspacePanelHiddenByFocus && input.mainView !== 'agents'
  // A reveal belongs to the maximized session, so switching sessions hides the panel again.
  const maximizedSessionSuppressesWorkspacePanel = agentSessionMaximized
    && input.workspacePanelRevealedForSessionId !== input.maximizedSessionId
  const workspacePanelSuppressed = focusSuppressesWorkspacePanel || maximizedSessionSuppressesWorkspacePanel
  const workspacePanelVisible = input.workspacePanelOpen && !workspacePanelSuppressed
  const tilesHidden = input.mainView !== 'workspace'
  const workspacePanelShown = workspacePanelVisible
    && (input.mainView === 'workspace' || input.mainView === 'agents')

  return {
    agentSessionMaximized,
    sidebarHidden,
    tilesHidden,
    workspacePanelSuppressed,
    workspacePanelVisible,
    workspacePanelShown,
  }
}
