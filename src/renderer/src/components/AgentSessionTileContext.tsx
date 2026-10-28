import React from 'react'
import type { TileState } from '@shared/types'
import { isAgentSessionTile } from '@/utils/agentSessionTiles'

export interface AgentSessionTilePinState {
  disabled: boolean
  title: string
}

export interface AgentSessionTileActions {
  /** Pin state of a temporary session tile; null hides the pin action. */
  getPinState: (tileId: string) => AgentSessionTilePinState | null
  pinSessionTile: (tileId: string) => void
}

export const AgentSessionTileContext = React.createContext<AgentSessionTileActions | null>(null)

export interface AgentSessionTileButtonProps {
  temporary?: boolean
  onPin?: () => void
  pinDisabled?: boolean
  pinTitle?: string
}

/** Props for TileActionButtons when `tile` is a temporary agent session. */
export function useAgentSessionTileButtons(tile: TileState): AgentSessionTileButtonProps {
  const context = React.useContext(AgentSessionTileContext)
  if (!isAgentSessionTile(tile)) return {}

  const pinState = context?.getPinState(tile.id) ?? null
  return {
    temporary: true,
    onPin: context && pinState ? () => context.pinSessionTile(tile.id) : undefined,
    pinDisabled: pinState?.disabled,
    pinTitle: pinState?.title,
  }
}
