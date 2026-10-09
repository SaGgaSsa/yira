export const MIN_CONTENT_WIDTH = 480

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
  windowWidth: number
  sidePanelWidth: number
  narrowOverride: { sidebar: boolean; workspacePanel: boolean }
}

export interface PanelLayout {
  agentSessionMaximized: boolean
  sidebarHidden: boolean
  sidebarHiddenByWidth: boolean
  tilesHidden: boolean
  workspacePanelSuppressed: boolean
  workspacePanelVisible: boolean
  workspacePanelShown: boolean
  workspacePanelHiddenByWidth: boolean
  narrowWindow: boolean
}

export function resolvePanelLayout(input: PanelLayoutInput): PanelLayout {
  const agentSessionMaximized = input.maximizedSessionId !== null && input.mainView === 'agents'
  const sidebarHiddenWithoutWidth = input.sidebarCollapsed || agentSessionMaximized
  // Focus hides the panel outside Agents so it remains available beside agent sessions.
  const focusSuppressesWorkspacePanel = input.workspacePanelHiddenByFocus && input.mainView !== 'agents'
  // A reveal belongs to the maximized session, so switching sessions hides the panel again.
  const maximizedSessionSuppressesWorkspacePanel = agentSessionMaximized
    && input.workspacePanelRevealedForSessionId !== input.maximizedSessionId
  const workspacePanelSuppressed = focusSuppressesWorkspacePanel || maximizedSessionSuppressesWorkspacePanel
  const workspacePanelVisibleWithoutWidth = input.workspacePanelOpen && !workspacePanelSuppressed
  const workspacePanelShownWithoutWidth = workspacePanelVisibleWithoutWidth
    && (input.mainView === 'workspace' || input.mainView === 'agents')
  const narrowWindow = input.windowWidth - 2 * input.sidePanelWidth < MIN_CONTENT_WIDTH
  // The right panel gives way first, counting the sidebar only when it would be on screen.
  const sidebarWidthWithoutWidthRule = sidebarHiddenWithoutWidth ? 0 : input.sidePanelWidth
  const workspacePanelHiddenByWidth = workspacePanelShownWithoutWidth
    && !input.narrowOverride.workspacePanel
    && input.windowWidth - sidebarWidthWithoutWidthRule - input.sidePanelWidth < MIN_CONTENT_WIDTH
  const workspacePanelVisible = workspacePanelVisibleWithoutWidth && !workspacePanelHiddenByWidth
  const workspacePanelShown = workspacePanelVisible
    && (input.mainView === 'workspace' || input.mainView === 'agents')
  const sidebarHiddenByWidth = !sidebarHiddenWithoutWidth
    && !input.narrowOverride.sidebar
    && input.windowWidth - input.sidePanelWidth - (workspacePanelShown ? input.sidePanelWidth : 0) < MIN_CONTENT_WIDTH
  const sidebarHidden = sidebarHiddenWithoutWidth || sidebarHiddenByWidth
  const tilesHidden = input.mainView !== 'workspace'

  return {
    agentSessionMaximized,
    sidebarHidden,
    sidebarHiddenByWidth,
    tilesHidden,
    workspacePanelSuppressed,
    workspacePanelVisible,
    workspacePanelShown,
    workspacePanelHiddenByWidth,
    narrowWindow,
  }
}
