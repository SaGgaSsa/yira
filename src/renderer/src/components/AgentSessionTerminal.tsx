import React, { useMemo } from 'react'
import type { AgentActiveSession, FileTileOpenOptions, TileState, WorkspaceConfig } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { TerminalTileWrapper } from './TerminalTile'

interface AgentSessionTerminalProps {
  session: AgentActiveSession
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  isFocused: boolean
  isVisible: boolean
  onFocus: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
}

/** Renders the daemon-backed session through Yira's regular terminal runtime. */
export function AgentSessionTerminal({
  session,
  workspaceId,
  workspaceConfig,
  isFocused,
  isVisible,
  onFocus,
  onOpenBrowserTile,
  onOpenFileTile,
}: AgentSessionTerminalProps): React.ReactElement {
  const { t } = useTranslation()
  const tile = useMemo<TileState>(() => ({
    id: session.tileId,
    type: 'terminal',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    zIndex: 0,
    agent: {
      provider: session.provider,
      sessionId: session.sessionId,
      surface: 'agents-view',
    },
  }), [session.provider, session.sessionId, session.tileId])

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <TerminalTileWrapper
        tile={tile}
        workspaceId={workspaceId}
        workspaceConfig={workspaceConfig}
        isFocused={isFocused}
        isVisible={isVisible}
        edgeToEdge
        onFocus={onFocus}
        onUpdate={() => undefined}
        onDelete={() => undefined}
        onOpenBrowserTile={onOpenBrowserTile}
        onOpenFileTile={onOpenFileTile}
      />
      {session.status === 'exited' && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-border-visible bg-bg-primary/95 px-2.5 py-1.5 text-xs text-text-secondary">
          {t('agentsView.exitedMessage')}
        </div>
      )}
    </div>
  )
}
