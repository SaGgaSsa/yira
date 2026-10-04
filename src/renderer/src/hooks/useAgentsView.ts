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
}

export interface AgentsViewState {
  effectiveProvider: AgentProvider | undefined
  snapshot: AgentActiveSessionSnapshot
  sessions: ReturnType<typeof selectAgentsViewSessions>
  isOpen: boolean
  sessionDialogOpen: boolean
  sessionDialogInitialWorkspaceId: string | null
  sessionDialogFocusRequestId: number
  focusedSessionId: string | null
  toggle: () => void
  close: () => void
  openForSession: (tileId: string) => void
  openNewSessionDialog: () => void
  closeSessionDialog: () => void
}

function isShortcutCaptureTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, '[data-agent-shortcut-capture]'))
}

interface SessionDialogRequest {
  initialWorkspaceId: string | null
  requestId: number
}

export function useAgentsView({
  workspaceId,
  workspaceConfig,
  agents,
  newSessionShortcut,
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
      initialWorkspaceId: workspaceId || null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isShortcutCaptureTarget(event.target) || !matchesShortcut(event, newSessionShortcut)) return

      event.preventDefault()
      event.stopPropagation()
      openNewSessionDialog()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [newSessionShortcut, openNewSessionDialog])

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
    sessionDialogInitialWorkspaceId: sessionDialogRequest?.initialWorkspaceId ?? null,
    sessionDialogFocusRequestId: sessionDialogRequest?.requestId ?? 0,
    focusedSessionId: focusedSession?.scope === scopeKey ? focusedSession.tileId : null,
    toggle,
    close,
    openForSession,
    openNewSessionDialog,
    closeSessionDialog,
  }
}
