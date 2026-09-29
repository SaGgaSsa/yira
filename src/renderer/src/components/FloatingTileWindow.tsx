import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelBottomClose } from 'lucide-react'
import type { ShellProfileId, TileState, WorkspaceConfig } from '@shared/types'
import { createFloatingFileNavigationRequest } from '@shared/floatingNavigation'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'
import { useCanvasStore } from '@/store/canvasStore'
import { getTileTypeLabel, TileContent, TILE_META } from './TileContent'
import { getTerminalDisplayTitle } from '@/utils/terminalDisplayTitle'
import { getTileWindowTitle } from '@/utils/windowTitle'
import { windowBufferRegistry } from '@/utils/windowBufferRegistry'

interface FloatingTileSnapshot {
  workspaceId: string
  workspaceName: string
  workspaceConfig: WorkspaceConfig
  tile: TileState
  terminalTitle?: string
}

function isSnapshot(value: unknown): value is FloatingTileSnapshot {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<FloatingTileSnapshot>
  return typeof candidate.workspaceId === 'string' &&
    typeof candidate.workspaceName === 'string' &&
    Boolean(candidate.workspaceConfig) &&
    Boolean(candidate.tile) &&
    typeof candidate.tile?.id === 'string'
}

function getParams(): { workspaceId: string; tileId: string } {
  const params = new URLSearchParams(window.location.search)
  return {
    workspaceId: params.get('workspaceId') ?? '',
    tileId: params.get('tileId') ?? '',
  }
}

export function FloatingTileWindow(): React.ReactElement {
  const { t } = useTranslation()
  const [{ workspaceId, tileId }] = useState(getParams)
  const [tile, setTile] = useState<TileState | null>(null)
  const [initialTerminalTitle, setInitialTerminalTitle] = useState<string | undefined>()
  const liveTerminalTitle = useCanvasStore((s) => s.terminalTitles[tileId])
  const terminalTitle = liveTerminalTitle ?? initialTerminalTitle
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const workspaceName = useCanvasStore((s) => s.activeWorkspaceName)
  const setWorkspace = useCanvasStore((s) => s.setWorkspace)
  const setProfiles = useCanvasStore((s) => s.setProfiles)

  useEffect(() => {
    let cancelled = false

    async function loadSnapshot(): Promise<void> {
      if (!workspaceId || !tileId) {
        setLoadFailed(true)
        return
      }

      const [snapshot, profiles] = await Promise.all([
        window.electron.floating.getTileSnapshot(workspaceId, tileId),
        window.electron.shellProfiles.list(),
      ])
      if (cancelled) return
      if (!isSnapshot(snapshot)) {
        setLoadFailed(true)
        return
      }

      const normalizedConfig = normalizeWorkspaceConfig(snapshot.workspaceConfig)
      setWorkspace(snapshot.workspaceId, snapshot.workspaceName, normalizedConfig)
      setProfiles(profiles.map((profile) => ({
        id: profile.id as ShellProfileId,
        label: profile.label,
        available: profile.available,
      })))
      setTile(snapshot.tile)
      setInitialTerminalTitle(snapshot.terminalTitle)
      setWorkspaceConfig(normalizedConfig)
    }

    void loadSnapshot()
    return () => {
      cancelled = true
    }
  }, [setProfiles, setWorkspace, tileId, workspaceId])

  const title = useMemo(() => {
    if (!tile) return 'Yira Tile'
    if (tile.type === 'terminal') return getTerminalDisplayTitle(tile, terminalTitle ? { [tile.id]: terminalTitle } : {})
    return tile.label?.trim() || getTileTypeLabel(tile.type, t)
  }, [t, terminalTitle, tile])

  const windowTitle = getTileWindowTitle(tile, terminalTitle && tile ? { [tile.id]: terminalTitle } : {}, workspaceName)
  useEffect(() => {
    void window.electron.window.setTitle(windowTitle)
  }, [windowTitle])

  const updateTile = useCallback(async (patch: Partial<TileState>) => {
    if (!tile) return
    const nextTile = { ...tile, ...patch }
    setTile(nextTile)
    await window.electron.floating.updateTile(workspaceId, tile.id, patch)
  }, [tile, workspaceId])

  useEffect(() => window.electron.window.onClosePreparationRequest(async ({ phase }) => {
    if (phase === 'flush') await windowBufferRegistry.flush()
  }), [])

  if (loadFailed) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary text-text-secondary">
            <span className="nd-label">{t('ui.tileUnavailable')}</span>
      </div>
    )
  }

  if (!tile || !workspaceConfig) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg-primary text-text-secondary">
            <span className="nd-label">{t('ui.loadingTile')}</span>
      </div>
    )
  }

  const Icon = TILE_META[tile.type].icon

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-tertiary px-3">
        <Icon size={15} className="shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1 truncate text-sm text-text-display">{title}</div>
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
          title={t('ui.attachTile')}
          onClick={() => {
            void window.electron.floating.requestAttach(tile.id)
          }}
        >
          <PanelBottomClose size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <TileContent
          tile={tile}
          workspaceId={workspaceId}
          workspaceConfig={workspaceConfig}
          isFocused
          edgeToEdge
          onFocus={() => undefined}
          onUpdate={updateTile}
          onOpenFileTile={(relativePath, options) => {
            void window.electron.floating.requestNavigation(
              tile.id,
              createFloatingFileNavigationRequest(relativePath, options),
            ).catch((error: unknown) => {
              console.error('[FloatingTileWindow] Failed to request file navigation:', error)
            })
          }}
          onOpenBrowserTile={(url) => {
            void window.electron.floating.requestNavigation(tile.id, { kind: 'browser', target: url }).catch((error: unknown) => {
              console.error('[FloatingTileWindow] Failed to request browser navigation:', error)
            })
          }}
          workspaceRootPath={workspaceConfig?.rootFolderPath ?? ''}
          isVisible
        />
      </div>
    </div>
  )
}
