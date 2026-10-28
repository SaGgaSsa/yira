import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentActiveSessionSnapshot, AgentProvider, UserSettings, WorkspaceConfig } from '@shared/types'
import { useAgentSessionSnapshot } from '@/hooks/useAgentSessionSnapshot'
import { getEffectiveAgentProvider } from '@/utils/effectiveAgent'
import { selectAgentsViewSessions } from '@/utils/agentsViewSessions'
import { isShortcutCaptureTarget, matchesShortcut } from '@/utils/shortcutResolver'

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
  /** Temporary sessions of the active workspace, shown as session tiles in the workspace views. */
  sessions: ReturnType<typeof selectAgentsViewSessions>
  /** True while the command palette is open, on either step. */
  sessionDialogOpen: boolean
  commandPaletteStep: CommandPaletteStep | null
  /** True when the new-session step was reached from the palette step. */
  sessionDialogFromPalette: boolean
  sessionDialogInitialWorkspaceId: string | null
  /** Prompt text prefilled when the new-session step opens. */
  sessionDialogInitialPrompt: string
  sessionDialogFocusRequestId: number
  openNewSessionDialog: () => void
  /** Opens the new-session step directly with `prompt` already written. */
  openNewSessionDialogWithPrompt: (prompt: string) => void
  /** Opens the new-session step, preselecting `workspaceId` when given. */
  showNewSessionStep: (workspaceId?: string, prompt?: string) => void
  backToPalette: () => void
  closeSessionDialog: () => void
}

export type CommandPaletteStep = 'palette' | 'new-session'

interface SessionDialogRequest {
  step: CommandPaletteStep
  fromPalette: boolean
  initialWorkspaceId: string | null
  initialPrompt?: string
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
  const [sessionDialogRequest, setSessionDialogRequest] = useState<SessionDialogRequest | null>(null)

  const openNewSessionDialog = useCallback(() => {
    setSessionDialogRequest((current) => ({
      step: 'new-session',
      fromPalette: current?.step === 'new-session' ? current.fromPalette : false,
      initialWorkspaceId: workspaceId || null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  const openNewSessionDialogWithPrompt = useCallback((prompt: string) => {
    setSessionDialogRequest((current) => ({
      step: 'new-session',
      fromPalette: false,
      initialWorkspaceId: workspaceId || null,
      initialPrompt: prompt,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  const showNewSessionStep = useCallback((targetWorkspaceId?: string, prompt?: string) => {
    setSessionDialogRequest((current) => ({
      step: 'new-session',
      fromPalette: current ? current.step === 'palette' || current.fromPalette : false,
      initialWorkspaceId: targetWorkspaceId || workspaceId || null,
      ...(prompt === undefined ? {} : { initialPrompt: prompt }),
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  const backToPalette = useCallback(() => {
    setSessionDialogRequest((current) => ({
      step: 'palette',
      fromPalette: false,
      initialWorkspaceId: workspaceId || null,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [workspaceId])

  // The shortcut opens the palette first; pressed again it moves on to the new-session step.
  const handleNewSessionShortcut = useCallback(() => {
    setSessionDialogRequest((current) => {
      if (!current) {
        return { step: 'palette', fromPalette: false, initialWorkspaceId: workspaceId || null, requestId: 1 }
      }
      return {
        step: 'new-session',
        fromPalette: current.step === 'palette' || current.fromPalette,
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

  const closeSessionDialog = useCallback(() => setSessionDialogRequest(null), [])

  return {
    effectiveProvider,
    snapshot: sessionSnapshot,
    sessions,
    sessionDialogOpen: sessionDialogRequest !== null,
    commandPaletteStep: sessionDialogRequest?.step ?? null,
    sessionDialogFromPalette: sessionDialogRequest?.fromPalette ?? false,
    sessionDialogInitialWorkspaceId: sessionDialogRequest?.initialWorkspaceId ?? null,
    sessionDialogInitialPrompt: sessionDialogRequest?.initialPrompt ?? '',
    sessionDialogFocusRequestId: sessionDialogRequest?.requestId ?? 0,
    openNewSessionDialog,
    openNewSessionDialogWithPrompt,
    showNewSessionStep,
    backToPalette,
    closeSessionDialog,
  }
}
