export interface AgentAlertDecisionInput {
  enabled: boolean
  windowFocused: boolean
  activeWorkspaceId: string | null
  alertWorkspaceId: string | null
  tileMuted: boolean
}

export interface AgentAlertDecision {
  toast: boolean
  sound: boolean
}

export interface AgentAlertNotificationTextInput {
  providerLabel: string
  workspaceName: string | null
  sessionTitle: string | null
  eventLabel: string
  detail?: string | null
}

export interface AgentAlertNotificationText {
  title: string
  body: string
}

export function decideAgentAlertNotification(
  input: AgentAlertDecisionInput,
): AgentAlertDecision {
  if (!input.enabled || input.tileMuted) return { toast: false, sound: false }

  if (!input.windowFocused) return { toast: true, sound: true }

  if (input.alertWorkspaceId && input.alertWorkspaceId !== input.activeWorkspaceId) {
    return { toast: false, sound: true }
  }

  return { toast: false, sound: false }
}

export function buildAgentAlertNotificationText(
  input: AgentAlertNotificationTextInput,
): AgentAlertNotificationText {
  const workspaceName = input.workspaceName?.trim()
  const title = workspaceName
    ? `${input.providerLabel} · ${workspaceName}`
    : input.providerLabel
  const sessionTitle = input.sessionTitle?.trim()
  const body = sessionTitle
    ? `${input.eventLabel} — ${sessionTitle}`
    : input.eventLabel
  const detail = input.detail?.trim()

  return {
    title,
    body: detail ? `${body}\n${detail}` : body,
  }
}
