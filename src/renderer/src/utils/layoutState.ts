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
  // True when the current view hides the panel by default (Focus with tiles).
  focusViewActive: boolean
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
  workspacePanelRevealedInFocus: boolean
  workspacePanelRevealedForMaximizedSession: boolean
  workspacePanelRevealedInNarrowWindow: boolean
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
  const workspacePanelTooWide = workspacePanelShownWithoutWidth
    && input.windowWidth - sidebarWidthWithoutWidthRule - input.sidePanelWidth < MIN_CONTENT_WIDTH
  const workspacePanelHiddenByWidth = workspacePanelTooWide && !input.narrowOverride.workspacePanel
  const workspacePanelVisible = workspacePanelVisibleWithoutWidth && !workspacePanelHiddenByWidth
  const workspacePanelShown = workspacePanelVisible
    && (input.mainView === 'workspace' || input.mainView === 'agents')
  const sidebarHiddenByWidth = !sidebarHiddenWithoutWidth
    && !input.narrowOverride.sidebar
    && input.windowWidth - input.sidePanelWidth - (workspacePanelShown ? input.sidePanelWidth : 0) < MIN_CONTENT_WIDTH
  const sidebarHidden = sidebarHiddenWithoutWidth || sidebarHiddenByWidth
  const tilesHidden = input.mainView !== 'workspace'
  // Temporary reveals: hiding the panel again undoes the reveal instead of saving the preference.
  const workspacePanelRevealedInFocus = workspacePanelShown
    && input.focusViewActive
    && !input.workspacePanelHiddenByFocus
    && input.mainView !== 'agents'
  const workspacePanelRevealedForMaximizedSession = workspacePanelShown
    && agentSessionMaximized
    && input.workspacePanelRevealedForSessionId === input.maximizedSessionId
  const workspacePanelRevealedInNarrowWindow = workspacePanelShown
    && workspacePanelTooWide
    && input.narrowOverride.workspacePanel

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
    workspacePanelRevealedInFocus,
    workspacePanelRevealedForMaximizedSession,
    workspacePanelRevealedInNarrowWindow,
  }
}
