import type { AgentActiveSession, AgentProvider, AgentSessionSurface, TileState } from '@shared/types'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { isTileDetached } from '@shared/floatingTiles'
import { getAgentSessionSurface } from './activityPalette'
import { getAgentSessionTitle, getTerminalDisplayTitle } from './terminalDisplayTitle'
import { getWorkspaceAgentEntries } from './workspaceSidebarSections'

export interface AgentTextSendTarget {
  id: string
  label: string
  workspaceId: string
  provider: AgentProvider
  surface: AgentSessionSurface
}

export interface BuildAgentTextSendTargetsInput {
  workspaceId: string | null
  sessions: readonly AgentActiveSession[]
  tiles: readonly TileState[]
  terminalTitles: Record<string, string>
  agentTitles: Record<string, string>
  sourceTileId?: string
}

const PROVIDER_NAMES: Record<AgentProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
}

export function buildAgentTextSendTargets({
  workspaceId,
  sessions,
  tiles,
  terminalTitles,
  agentTitles,
  sourceTileId,
}: BuildAgentTextSendTargetsInput): AgentTextSendTarget[] {
  if (!workspaceId) return []

  const tilesById = new Map(tiles.map((tile) => [tile.id, tile]))

  return getWorkspaceAgentEntries(workspaceId, sessions).flatMap<AgentTextSendTarget>((session) => {
    const surface = getAgentSessionSurface(session)
    if (session.tileId === sourceTileId) return []

    if (surface === 'tile') {
      const tile = tilesById.get(session.tileId)
      if (!tile || isTileDetached(tile)) return []

      return [{
        id: session.tileId,
        label: getTerminalDisplayTitle(tile, terminalTitles, agentTitles),
        workspaceId: session.workspaceId,
        provider: session.provider,
        surface,
      }]
    }

    return [{
      id: session.tileId,
      label: getAgentSessionTitle(session) || PROVIDER_NAMES[session.provider],
      workspaceId: session.workspaceId,
      provider: session.provider,
      surface,
    }]
  })
}

export interface AgentTerminalRuntime {
  focus: () => void
  paste: (text: string) => void
}

export interface AgentTerminalRuntimeRegistry<T extends AgentTerminalRuntime = AgentTerminalRuntime> {
  get: (target: TerminalSessionTarget) => T | undefined
  subscribe: (listener: () => void) => () => void
}

export function waitForAgentTerminalRuntime<T extends AgentTerminalRuntime>(
  registry: AgentTerminalRuntimeRegistry<T>,
  target: TerminalSessionTarget,
  timeoutMs = 3000,
): Promise<T | null> {
  const runtime = registry.get(target)
  if (runtime) return Promise.resolve(runtime)

  return new Promise((resolve) => {
    let settled = false
    let unsubscribe = () => {}
    const timeout = setTimeout(() => finish(null), timeoutMs)

    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      unsubscribe()
      resolve(value)
    }

    const checkForRuntime = () => {
      const nextRuntime = registry.get(target)
      if (nextRuntime) finish(nextRuntime)
    }

    unsubscribe = registry.subscribe(checkForRuntime)
    if (settled) {
      unsubscribe()
      return
    }
    checkForRuntime()
  })
}
