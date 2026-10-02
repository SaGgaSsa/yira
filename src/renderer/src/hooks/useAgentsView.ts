import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentActiveSessionSnapshot, AgentProvider, AgentSessionCreateResult, UserSettings, WorkspaceConfig } from '@shared/types'
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
  worktreeAvailable: boolean
  isOpen: boolean
  sessionDialogOpen: boolean
  focusedSessionId: string | null
  toggle: () => void
  close: () => void
  openForSession: (tileId: string) => void
  openNewSessionDialog: () => void
  closeSessionDialog: () => void
  onSessionCreated: (result: AgentSessionCreateResult) => void
}

function isShortcutCaptureTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const closest = (target as { closest?: unknown }).closest
  return typeof closest === 'function' && Boolean(closest.call(target, '[data-agent-shortcut-capture]'))
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
  const [sessionDialogScope, setSessionDialogScope] = useState<string | null>(null)
  const [focusedSession, setFocusedSession] = useState<{ scope: string; tileId: string } | null>(null)
  const [worktreeAvailable, setWorktreeAvailable] = useState(false)
  const previousScopeRef = useRef(scopeKey)
  const capabilityRequestRef = useRef(0)

  useEffect(() => {
    if (previousScopeRef.current === scopeKey) return
    previousScopeRef.current = scopeKey
    setOpenViewScope(null)
    setSessionDialogScope(null)
    setFocusedSession(null)
  }, [scopeKey])

  useEffect(() => {
    const requestId = ++capabilityRequestRef.current
    setWorktreeAvailable(false)
    if (!workspaceId || !effectiveProvider) return

    void window.electron.agents.sessionCapabilities(workspaceId)
      .then((capabilities) => {
        if (requestId !== capabilityRequestRef.current) return
        setWorktreeAvailable(capabilities.provider === effectiveProvider && capabilities.worktreeAvailable)
      })
      .catch(() => {
        if (requestId === capabilityRequestRef.current) setWorktreeAvailable(false)
      })

    return () => {
      capabilityRequestRef.current += 1
    }
  }, [agents, effectiveProvider, workspaceConfig, workspaceId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!effectiveProvider || sessionDialogScope === scopeKey || isShortcutCaptureTarget(event.target)) return
      if (!matchesShortcut(event, newSessionShortcut)) return

      event.preventDefault()
      event.stopPropagation()
      setSessionDialogScope(scopeKey)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [effectiveProvider, newSessionShortcut, scopeKey, sessionDialogScope])

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

  const openNewSessionDialog = useCallback(() => {
    if (effectiveProvider) setSessionDialogScope(scopeKey)
  }, [effectiveProvider, scopeKey])

  const closeSessionDialog = useCallback(() => setSessionDialogScope(null), [])

  const onSessionCreated = useCallback((result: AgentSessionCreateResult) => {
    setSessionDialogScope(null)
    setOpenViewScope(scopeKey)
    setFocusedSession({ scope: scopeKey, tileId: result.tileId })
  }, [scopeKey])

  return {
    effectiveProvider,
    snapshot: sessionSnapshot,
    sessions,
    worktreeAvailable,
    isOpen: Boolean(effectiveProvider) && openViewScope === scopeKey,
    sessionDialogOpen: Boolean(effectiveProvider) && sessionDialogScope === scopeKey,
    focusedSessionId: focusedSession?.scope === scopeKey ? focusedSession.tileId : null,
    toggle,
    close,
    openForSession,
    openNewSessionDialog,
    closeSessionDialog,
    onSessionCreated,
  }
}
