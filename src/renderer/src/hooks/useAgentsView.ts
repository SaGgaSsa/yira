import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentActiveSessionSnapshot, AgentProvider, UserSettings, WorkspaceConfig } from '@shared/types'
import { useAgentSessionSnapshot } from '@/hooks/useAgentSessionSnapshot'
import { getEffectiveAgentProvider } from '@/utils/effectiveAgent'
import { selectAgentsViewSessions } from '@/utils/agentsViewSessions'
import { matchesShortcut } from '@/utils/shortcutResolver'

interface UseAgentsViewOptions {
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  agents: UserSettings['agents']
  newSessionShortcut: string
  /** When false the shortcut is ignored, for example while only the home screen is available. */
  newSessionShortcutEnabled?: boolean
}

export interface AgentsViewState {
  effectiveProvider: AgentProvider | undefined
  snapshot: AgentActiveSessionSnapshot
  sessions: ReturnType<typeof selectAgentsViewSessions>
  isOpen: boolean
  /** True while the Activity palette is open, on either step. */
  sessionDialogOpen: boolean
  activityPaletteStep: ActivityPaletteStep | null
  /** True when the new-session step was reached from the Activity step. */
  sessionDialogFromActivity: boolean
  sessionDialogInitialWorkspaceId: string | null
  sessionDialogFocusRequestId: number
  focusedSessionId: string | null
  toggle: () => void
  close: () => void
  openForSession: (tileId: string) => void
  openNewSessionDialog: () => void
  /** Opens the new-session step, preselecting `workspaceId` when given. */
  showNewSessionStep: (workspaceId?: string) => void
  backToActivity: () => void
  closeSessionDialog: () => void
}

export type ActivityPaletteStep = 'activity' | 'new-session'

function isShortcutCaptureTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, '[data-agent-shortcut-capture]'))
}

interface SessionDialogRequest {
  step: ActivityPaletteStep
  fromActivity: boolean
  initialWorkspaceId: string | null
  requestId: number
}

export function useAgentsView({
  workspaceId,
  workspaceConfig,
  agents,
  newSessionShortcut,
  newSessionShortcutEnabled = true,
}: UseAgentsViewOptions): AgentsViewState {
  const sessionSnapshot = useAgentSessionSnapshot(Boolean(workspaceId))
  const selectedProvider = getEffectiveAgentProvider(workspaceConfig, agents)
  const effectiveProvider = workspaceId && selectedProvider && workspaceConfig.agentProviders[selectedProvider]?.enabled === true
    ? selectedProvider
    : undefined
  const sessions = useMemo(
    () => selectAgentsViewSessions(sessionSnapshot, workspaceId),
    [sessionSnapshot, workspaceId],
  )
  const scopeKey = `${workspaceId}:${effectiveProvider ?? 'none'}`
  const [openViewScope, setOpenViewScope] = useState<string | null>(null)
  const [sessionDialogRequest, setSessionDialogRequest] = useState<SessionDialogRequest | null>(null)
  const [focusedSession, setFocusedSession] = useState<{ scope: string; tileId: string } | null>(null)
  const previousScopeRef = useRef(scopeKey)

  useEffect(() => {
    if (previousScopeRef.current === scopeKey) return
    previousScopeRef.current = scopeKey
    setOpenViewScope(null)
    setFocusedSession(null)
  }, [scopeKey])

  const openNewSessionDialog = useCallback(() => {
    setSessionDialogRequest((current) => ({
      step: 'new-session',
      fromActivity: current?.step === 'new-session' ? current.fromActivity : false,
      initialWorkspaceId: workspaceId || null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  const showNewSessionStep = useCallback((targetWorkspaceId?: string) => {
    setSessionDialogRequest((current) => ({
      step: 'new-session',
      fromActivity: current ? current.step === 'activity' || current.fromActivity : false,
      initialWorkspaceId: targetWorkspaceId || workspaceId || null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  const backToActivity = useCallback(() => {
    setSessionDialogRequest((current) => ({
      step: 'activity',
      fromActivity: false,
      initialWorkspaceId: workspaceId || null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  // The shortcut opens the Activity step first; pressed again it moves on to the new-session step.
  const handleNewSessionShortcut = useCallback(() => {
    setSessionDialogRequest((current) => {
      if (!current) {
        return { step: 'activity', fromActivity: false, initialWorkspaceId: workspaceId || null, requestId: 1 }
      }
      return {
        step: 'new-session',
        fromActivity: current.step === 'activity' || current.fromActivity,
        initialWorkspaceId: current.step === 'new-session' ? current.initialWorkspaceId : workspaceId || null,
        requestId: current.requestId + 1,
      }
    })
  }, [workspaceId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!newSessionShortcutEnabled) return
      if (isShortcutCaptureTarget(event.target) || !matchesShortcut(event, newSessionShortcut)) return

      event.preventDefault()
      event.stopPropagation()
      handleNewSessionShortcut()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleNewSessionShortcut, newSessionShortcut, newSessionShortcutEnabled])

  const toggle = useCallback(() => {
    if (!effectiveProvider) return
    setOpenViewScope((current) => current === scopeKey ? null : scopeKey)
  }, [effectiveProvider, scopeKey])

  const close = useCallback(() => setOpenViewScope(null), [])

  const openForSession = useCallback((tileId: string) => {
    if (!effectiveProvider) return
    setOpenViewScope(scopeKey)
    setFocusedSession({ scope: scopeKey, tileId })
  }, [effectiveProvider, scopeKey])

  const closeSessionDialog = useCallback(() => setSessionDialogRequest(null), [])

  return {
    effectiveProvider,
    snapshot: sessionSnapshot,
    sessions,
    isOpen: Boolean(effectiveProvider) && openViewScope === scopeKey,
    sessionDialogOpen: sessionDialogRequest !== null,
    activityPaletteStep: sessionDialogRequest?.step ?? null,
    sessionDialogFromActivity: sessionDialogRequest?.fromActivity ?? false,
    sessionDialogInitialWorkspaceId: sessionDialogRequest?.initialWorkspaceId ?? null,
    sessionDialogFocusRequestId: sessionDialogRequest?.requestId ?? 0,
    focusedSessionId: focusedSession?.scope === scopeKey ? focusedSession.tileId : null,
    toggle,
    close,
    openForSession,
    openNewSessionDialog,
    showNewSessionStep,
    backToActivity,
    closeSessionDialog,
  }
}
