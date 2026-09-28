import { resolveTerminalThemeId } from '@/utils/terminalTheme'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FileTileOpenOptions, RemotePreparationResult, RemotePreparationStatus, TerminalCreateOptions, TerminalExitEvent, TileState, WorkspaceConfig } from '@shared/types'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isTerminalInputAttended } from '@/utils/terminalAttention'
import { buildTerminalStartupCommand } from '@/utils/terminalLaunch'
import { getTerminalContainerBackground } from '@/utils/terminalTheme'
import { buildTerminalContextMenuItems } from '@/utils/terminalContextMenu'
import type { TerminalLinkTarget } from '@/utils/terminalContextMenu'
import { ContextMenu, type MenuItem } from './ContextMenu'
import {
  useTerminalRuntimeContext,
  type TerminalRuntimeCreateRequest,
} from './TerminalRuntimeProvider'
import type { TerminalRuntime, TerminalRuntimeSnapshot, TerminalRuntimeViewOptions } from '@/utils/terminalRuntime'
import type { TerminalRuntimeRegistry } from '@/utils/terminalRuntimeRegistry'

interface Props {
  tile: TileState
  workspaceId: string
  workspaceConfig: WorkspaceConfig
  isFocused: boolean
  edgeToEdge?: boolean
  isVisible?: boolean
  autoFocus?: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onDelete: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
}

interface RemoteTerminalReconnectNoticeProps {
  visible: boolean
  reconnecting: boolean
  onReconnect: () => void
  message?: string
  reconnectLabel?: string
  reconnectingLabel?: string
}

export function RemoteTerminalReconnectNotice({
  visible,
  reconnecting,
  onReconnect,
  message = 'SSH connection closed',
  reconnectLabel = 'Reconnect',
  reconnectingLabel = 'Reconnecting…',
}: RemoteTerminalReconnectNoticeProps): React.ReactElement | null {
  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border-visible bg-bg-tertiary/95 px-3 py-2 text-xs text-text-secondary shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded border border-border-visible px-2 py-1 text-text-display transition-colors hover:bg-hover-bg disabled:cursor-wait disabled:opacity-60"
        disabled={reconnecting}
        onClick={onReconnect}
      >
        <RefreshCw size={12} className={reconnecting ? 'animate-spin' : undefined} />
        <span>{reconnecting ? reconnectingLabel : reconnectLabel}</span>
      </button>
    </div>
  )
}

export async function restartTerminalAfterExit(
  destroy: () => Promise<void>,
  restart: () => void,
): Promise<void> {
  await destroy()
  restart()
}

export function getRemoteTerminalExitEvent(
  connection: TileState['terminalConnection'],
  exitEvent: TerminalExitEvent | undefined,
): TerminalExitEvent | null {
  return connection === 'remote-ssh' && exitEvent ? exitEvent : null
}

export interface RemoteTerminalPreparationOptions {
  isCancelled: () => boolean
  prepare: () => Promise<RemotePreparationResult>
  create: () => Promise<void>
}

export async function prepareRemoteTerminal({
  isCancelled,
  prepare,
  create,
}: RemoteTerminalPreparationOptions): Promise<void> {
  await prepare()
  if (isCancelled()) return
  await create()
}

export type RemotePreparationProgressSubscription = (
  workspaceId: string,
  callback: (status: RemotePreparationStatus) => void,
) => () => void

/**
 * Keep the progress callback inert after cancellation. The preload cleanup is
 * still called exactly once, even if React runs more than one teardown path.
 */
export function subscribeToRemotePreparationProgress(
  subscribe: RemotePreparationProgressSubscription,
  workspaceId: string,
  onProgress: (status: RemotePreparationStatus) => void,
): () => void {
  let active = true
  let unsubscribe: (() => void) | null = null

  unsubscribe = subscribe(workspaceId, (status) => {
    if (!active) return
    onProgress(status)
  })

  return () => {
    if (!active) return
    active = false
    const cleanup = unsubscribe
    unsubscribe = null
    cleanup?.()
  }
}

export type RemotePreparationMessageKey =
  | 'terminal.wakeOnLanPreparing'
  | 'terminal.wakeOnLanPacketSent'
  | 'terminal.wakeOnLanHostOnline'
  | 'terminal.wakeOnLanSshReady'
  | 'terminal.wakeOnLanUnconfirmed'

export function getRemotePreparationMessageKey(
  status: RemotePreparationStatus,
): RemotePreparationMessageKey {
  switch (status) {
    case 'packet-sent':
      return 'terminal.wakeOnLanPacketSent'
    case 'host-online':
      return 'terminal.wakeOnLanHostOnline'
    case 'ssh-ready':
      return 'terminal.wakeOnLanSshReady'
    case 'unconfirmed':
      return 'terminal.wakeOnLanUnconfirmed'
    case 'checking':
    default:
      return 'terminal.wakeOnLanPreparing'
  }
}

interface RemoteTerminalPreparingNoticeProps {
  visible: boolean
  message?: string
}

export function RemoteTerminalPreparingNotice({
  visible,
  message = 'Preparing remote computer…',
}: RemoteTerminalPreparingNoticeProps): React.ReactElement | null {
  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-10 flex items-center justify-center bg-bg-tertiary/90 text-sm text-text-secondary"
    >
      <div className="flex items-center gap-2 rounded-md border border-border-visible bg-bg-tertiary/95 px-4 py-3 shadow-lg">
        <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  )
}

export interface TerminalOutputHandlerOptions {
  data: string
  term: {
    textarea?: Element | null
    write: (data: string) => void
  }
  attentionEnabled: boolean
  notificationsMuted: boolean
  isWindowFocused: boolean
  activeElement: Element | null
  markActivity: () => void
  clearActivity: () => void
}

export interface TerminalInputFocusListenerOptions {
  terminalInput: EventTarget | null | undefined
  textarea: Element | null | undefined
  isWindowFocused: () => boolean
  getActiveElement: () => Element | null
  attentionEnabled: () => boolean
  clearActivity: () => void
}

export function handleTerminalOutput({
  data,
  term,
  attentionEnabled,
  notificationsMuted,
  isWindowFocused,
  activeElement,
  markActivity,
  clearActivity,
}: TerminalOutputHandlerOptions): void {
  term.write(data)

  if (!attentionEnabled || notificationsMuted) return

  if (isTerminalInputAttended(isWindowFocused, term.textarea, activeElement)) {
    clearActivity()
    return
  }

  markActivity()
}

/**
 * Agent alerts are handled semantically by the main process. Keep them out of
 * the PTY stream so Yira never appends its own status text to the terminal.
 */
export function handleTerminalAgentAlert(
  _state: unknown,
  _term: { write: (data: string) => void },
): void {}

export function registerTerminalInputFocusListener({
  terminalInput,
  textarea,
  isWindowFocused,
  getActiveElement,
  attentionEnabled,
  clearActivity,
}: TerminalInputFocusListenerOptions): () => void {
  const handleFocus = () => {
    if (!isTerminalInputAttended(isWindowFocused(), textarea, getActiveElement())) return
    if (!attentionEnabled()) return
    clearActivity()
  }

  terminalInput?.addEventListener('focus', handleFocus)
  return () => terminalInput?.removeEventListener('focus', handleFocus)
}

export function shouldRegisterTerminalMarkdownLinks(
  connection: TileState['terminalConnection'],
  workspaceRootPath: string | undefined,
  hasOpenFileTile: boolean,
): boolean {
  return connection !== 'remote-ssh' && Boolean(workspaceRootPath?.trim()) && hasOpenFileTile
}

const EMPTY_RUNTIME_SNAPSHOT: TerminalRuntimeSnapshot = {
  preparing: false,
  reconnecting: false,
  exitEvent: null,
  error: null,
  title: null,
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function attachTerminalRuntimeHost(
  runtime: Pick<TerminalRuntime, 'attachHost'>,
  host: HTMLElement,
  viewOptions: TerminalRuntimeViewOptions,
  registry: Pick<TerminalRuntimeRegistry<TerminalRuntime>, 'park'>,
  target: TerminalSessionTarget,
): () => void {
  runtime.attachHost(host, viewOptions)
  return () => registry.park(target)
}

export function TerminalTileWrapper({
  tile,
  workspaceId,
  workspaceConfig,
  isFocused,
  edgeToEdge = false,
  isVisible = true,
  autoFocus = false,
  onFocus,
  onUpdate,
  onDelete: _onDelete,
  onOpenBrowserTile,
  onOpenFileTile,
}: Props): React.ReactElement {
  const { t } = useTranslation()
  const {
    registry,
    createRuntime,
    getHoveredLinkTarget,
  } = useTerminalRuntimeContext()
  const containerRef = useRef<HTMLDivElement>(null)
  const target = useMemo<TerminalSessionTarget>(() => ({ workspaceId, tileId: tile.id }), [tile.id, workspaceId])
  const terminalConnection = tile.terminalConnection === 'remote-ssh' ? 'remote-ssh' : undefined
  const isRemoteSsh = terminalConnection === 'remote-ssh'
  const shouldPrepareRemote = isRemoteSsh && workspaceConfig.remoteTerminal?.wakeOnLan?.enabled === true
  const workspaceRootPath = workspaceConfig.rootFolderPath?.trim() ?? ''
  const attentionEnabled = useSettingsStore((s) => s.terminal.attentionEnabled)
  const attentionEnabledRef = useRef(attentionEnabled)
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)
  const terminalThemeId = useSettingsStore((s) => resolveTerminalThemeId(s.terminal.themeId, s.themeId))
  const windowBackgroundMaterial = useSettingsStore((s) => s.windowBackgroundMaterial)
  const [runtime, setRuntime] = useState<TerminalRuntime | null>(null)
  const [acquirePending, setAcquirePending] = useState(true)
  const [acquireError, setAcquireError] = useState<string | null>(null)
  const [acquireExitEvent, setAcquireExitEvent] = useState<TerminalExitEvent | null>(null)
  const [reconnectPending, setReconnectPending] = useState(false)
  const [acquireGeneration, setAcquireGeneration] = useState(0)
  const [preparationStatus, setPreparationStatus] = useState<RemotePreparationStatus | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; selectionText: string; linkTarget?: TerminalLinkTarget } | null>(null)

  const onFocusRef = useRef(onFocus)
  const onOpenBrowserTileRef = useRef(onOpenBrowserTile)
  const onOpenFileTileRef = useRef(onOpenFileTile)
  onFocusRef.current = onFocus
  onOpenBrowserTileRef.current = onOpenBrowserTile
  onOpenFileTileRef.current = onOpenFileTile

  const runtimeOnFocus = useCallback(() => {
    onFocusRef.current()
  }, [])
  const runtimeOpenBrowserTile = useCallback((url: string) => {
    onOpenBrowserTileRef.current?.(url)
  }, [])
  const runtimeOpenFileTile = useCallback((relativePath: string, options?: FileTileOpenOptions) => {
    return onOpenFileTileRef.current?.(relativePath, options)
  }, [])
  const hasOpenFileTile = Boolean(onOpenFileTile)

  const createOptions = useMemo<TerminalCreateOptions>(() => ({
    shellProfileId: tile.shellProfileId ?? 'bash',
    connection: terminalConnection,
    remoteTerminal: isRemoteSsh ? workspaceConfig.remoteTerminal : undefined,
    remoteStartupCommand: isRemoteSsh ? tile.startupCommand : undefined,
    workspaceId: workspaceId || undefined,
    workspaceDir: isRemoteSsh ? undefined : workspaceConfig.rootFolderPath,
    wslStartInHome: !isRemoteSsh && tile.shellProfileId === 'wsl' && !workspaceConfig.rootFolderPath,
    initialCommand: isRemoteSsh ? undefined : buildTerminalStartupCommand(tile, workspaceConfig),
    terminalHistoryEnabled: workspaceConfig.terminalHistoryEnabled !== false,
    agent: isRemoteSsh ? undefined : tile.agent,
    agentProviderConfig: !isRemoteSsh && tile.agent
      ? workspaceConfig.agentProviders[tile.agent.provider]
      : undefined,
  }), [
    isRemoteSsh,
    terminalConnection,
    tile.agent,
    tile.shellProfileId,
    tile.startupCommand,
    workspaceConfig,
    workspaceId,
  ])

  const viewOptions = useMemo<TerminalRuntimeViewOptions>(() => ({
    visible: isVisible,
    edgeToEdge,
    autoFocus,
    fontSize: tileFontSizePx,
    themeId: terminalThemeId,
    translucent: windowBackgroundMaterial !== 'none',
    notificationsMuted: tile.notificationsMuted === true,
    workspaceRootPath,
    onFocus: runtimeOnFocus,
    onOpenBrowserTile: runtimeOpenBrowserTile,
    onOpenFileTile: hasOpenFileTile ? runtimeOpenFileTile : undefined,
  }), [
    autoFocus,
    edgeToEdge,
    isVisible,
    runtimeOnFocus,
    runtimeOpenBrowserTile,
    runtimeOpenFileTile,
    hasOpenFileTile,
    terminalThemeId,
    tile.notificationsMuted,
    windowBackgroundMaterial,
    tileFontSizePx,
    workspaceRootPath,
  ])

  const activeRuntime = runtime && runtime.target.workspaceId === target.workspaceId && runtime.target.tileId === target.tileId
    ? runtime
    : null
  const activeRuntimeRef = useRef<TerminalRuntime | null>(null)
  activeRuntimeRef.current = activeRuntime

  const pendingSnapshot = useMemo<TerminalRuntimeSnapshot>(() => ({
    ...EMPTY_RUNTIME_SNAPSHOT,
    preparing: acquirePending || reconnectPending,
    reconnecting: reconnectPending,
    exitEvent: reconnectPending ? null : acquireExitEvent,
    error: acquireError,
  }), [acquireError, acquireExitEvent, acquirePending, reconnectPending])
  const subscribeToRuntime = useCallback((listener: () => void): (() => void) => (
    activeRuntime?.subscribe(listener) ?? (() => {})
  ), [activeRuntime])
  const getRuntimeSnapshot = useCallback((): TerminalRuntimeSnapshot => (
    activeRuntime?.getSnapshot() ?? pendingSnapshot
  ), [activeRuntime, pendingSnapshot])
  const runtimeSnapshot = useSyncExternalStore(
    subscribeToRuntime,
    getRuntimeSnapshot,
    getRuntimeSnapshot,
  )
  const snapshot = useMemo<TerminalRuntimeSnapshot>(() => {
    if (!activeRuntime) return pendingSnapshot
    if (!reconnectPending) return runtimeSnapshot

    return {
      ...runtimeSnapshot,
      preparing: true,
      reconnecting: true,
      exitEvent: null,
      error: acquireError ?? runtimeSnapshot.error,
    }
  }, [acquireError, activeRuntime, pendingSnapshot, reconnectPending, runtimeSnapshot])

  const clearAttentionIfAttended = useCallback(() => {
    const terminalInput = activeRuntimeRef.current?.terminal?.textarea
    const isWindowFocused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
    if (!isTerminalInputAttended(isWindowFocused, terminalInput, document.activeElement)) return
    if (!attentionEnabledRef.current) return

    useCanvasStore.getState().clearTerminalAttention(tile.id)
    void activeRuntimeRef.current?.acknowledgeAgentAlert()
  }, [tile.id])

  const focusTerminal = useCallback(() => {
    const currentRuntime = activeRuntimeRef.current
    if (currentRuntime) {
      currentRuntime.focus()
      return
    }
    onFocusRef.current()
  }, [])

  const openMarkdownFileTile = useCallback((relativePath: string, options: FileTileOpenOptions = { markdownView: 'preview' }): void | Promise<void> => {
    const currentRuntime = activeRuntimeRef.current
    if (currentRuntime) return currentRuntime.openFileTile(relativePath, options)
    const openFileTile = onOpenFileTileRef.current
    if (!openFileTile) return

    try {
      return Promise.resolve(openFileTile(relativePath, options)).catch((error: unknown) => {
        console.error('[TerminalTile] Failed to open Markdown file tile:', error)
      })
    } catch (error) {
      console.error('[TerminalTile] Failed to open Markdown file tile:', error)
    }
  }, [])

  const copySelection = useCallback(async (selectionSnapshot?: string) => {
    const currentRuntime = activeRuntimeRef.current
    const selection = selectionSnapshot ?? (currentRuntime?.hasSelection() ? currentRuntime.getSelection() : '')
    if (!selection) return
    currentRuntime?.focus()
    try {
      await window.electron.clipboard.writeText(selection)
    } catch (error) {
      console.error('[TerminalTile] Failed to copy terminal selection:', error)
    }
  }, [])

  const pasteClipboard = useCallback(async () => {
    const currentRuntime = activeRuntimeRef.current
    if (!currentRuntime) return
    const text = await window.electron.clipboard.readText()
    if (!text) return
    currentRuntime.focus()
    currentRuntime.paste(text)
  }, [])

  const reconnectRemoteTerminal = useCallback(async () => {
    const currentRuntime = activeRuntimeRef.current
    if (!isRemoteSsh || reconnectPending || snapshot.reconnecting) return

    setReconnectPending(true)
    setAcquirePending(true)
    setAcquireError(null)
    setAcquireExitEvent(null)
    setPreparationStatus(shouldPrepareRemote ? 'checking' : null)
    currentRuntime?.setReconnecting(true)
    setRuntime(null)

    try {
      await registry.destroy(target)
      setAcquireGeneration((generation) => generation + 1)
    } catch (error) {
      const message = getErrorMessage(error)
      console.error('[TerminalTile] Failed to restart remote SSH terminal:', error)
      setReconnectPending(false)
      setAcquirePending(false)
      setAcquireError(message)
      setAcquireExitEvent({ exitCode: -1 })
    }
  }, [isRemoteSsh, reconnectPending, registry, shouldPrepareRemote, snapshot.reconnecting, target])

  useEffect(() => {
    attentionEnabledRef.current = attentionEnabled
    if (!attentionEnabled) return
    clearAttentionIfAttended()
  }, [attentionEnabled, clearAttentionIfAttended])

  useEffect(() => {
    if (tile.notificationsMuted !== true) return
    useCanvasStore.getState().clearTerminalAttention(tile.id)
  }, [tile.id, tile.notificationsMuted])

  useEffect(() => {
    window.addEventListener('focus', clearAttentionIfAttended)
    return () => window.removeEventListener('focus', clearAttentionIfAttended)
  }, [clearAttentionIfAttended])

  useEffect(() => {
    let active = true
    setRuntime(null)
    setAcquirePending(true)
    setAcquireError(null)
    setAcquireExitEvent(null)
    setPreparationStatus(shouldPrepareRemote ? 'checking' : null)

    let preparationProgressCleanup: (() => void) | null = null

    const releasePreparationProgress = (): void => {
      const cleanup = preparationProgressCleanup
      preparationProgressCleanup = null
      cleanup?.()
    }

    const subscribeToPreparationProgress = (): void => {
      if (!active || !shouldPrepareRemote || preparationProgressCleanup) return

      preparationProgressCleanup = subscribeToRemotePreparationProgress(
        window.electron.terminal.onPreparationProgress,
        target.workspaceId,
        (status) => {
          if (!active) return
          setPreparationStatus(status)
        },
      )
    }

    // Subscribe before acquire. A shared registry creation may already be
    // running, so this tile must be ready for its progress events.
    subscribeToPreparationProgress()

    const request: TerminalRuntimeCreateRequest = {
      target,
      createOptions,
      viewOptions,
      markdownBaseDirectory: tile.agent?.cwd ?? '',
    }
    const create = async (): Promise<TerminalRuntime> => {
      if (shouldPrepareRemote) {
        await window.electron.terminal.prepareRemote(target.workspaceId)
      }
      return createRuntime(request)
    }

    registry.acquire(target, create).then(
      (nextRuntime) => {
        releasePreparationProgress()
        if (!active) return
        setRuntime(nextRuntime)
        setAcquirePending(false)
        setAcquireError(null)
        setAcquireExitEvent(null)
        setReconnectPending(false)
        setPreparationStatus(null)
      },
      (error: unknown) => {
        releasePreparationProgress()
        if (!active) return
        const message = getErrorMessage(error)
        setAcquirePending(false)
        setAcquireError(message)
        if (isRemoteSsh) setAcquireExitEvent({ exitCode: -1 })
        setReconnectPending(false)
      },
    )

    return () => {
      active = false
      releasePreparationProgress()
    }
  // `viewOptions` is intentionally captured when a target starts. Mutable view
  // callbacks and dimensions are applied by the layout effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acquireGeneration, target])

  // Park in a layout cleanup so the runtime root moves to the parking root
  // before React removes the host DOM node. This is also the pending-creation
  // cancellation path: the registry parks the runtime when it becomes ready.
  const attachedRuntimeRef = useRef<TerminalRuntime | null>(null)
  const hostCleanupRef = useRef<(() => void) | null>(null)
  useLayoutEffect(() => {
    return () => {
      const cleanup = hostCleanupRef.current
      hostCleanupRef.current = null
      attachedRuntimeRef.current = null
      if (cleanup) cleanup()
      else registry.park(target)
    }
  }, [registry, target])

  useLayoutEffect(() => {
    const runtime = activeRuntime
    const host = containerRef.current
    if (!runtime || !host) {
      const cleanup = hostCleanupRef.current
      hostCleanupRef.current = null
      attachedRuntimeRef.current = null
      cleanup?.()
      return
    }

    if (attachedRuntimeRef.current !== runtime) {
      const cleanup = hostCleanupRef.current
      hostCleanupRef.current = null
      cleanup?.()
      attachedRuntimeRef.current = runtime
      hostCleanupRef.current = attachTerminalRuntimeHost(runtime, host, viewOptions, registry, target)
      return
    }

    runtime.updateView(viewOptions)
  }, [activeRuntime, registry, target, viewOptions])

  useEffect(() => {
    if (!activeRuntime) return
    if (isFocused && !autoFocus) activeRuntime.focus()
  }, [activeRuntime, autoFocus, isFocused])

  useEffect(() => {
    if (!activeRuntime) return
    const state = useCanvasStore.getState()
    if (state.activeWorkspaceId !== workspaceId) return
    if (snapshot.title === null) state.clearTerminalTitle(tile.id)
    else state.setTerminalTitle(tile.id, snapshot.title)
  }, [activeRuntime, snapshot.title, tile.id, workspaceId])

  const menuItems: MenuItem[] = buildTerminalContextMenuItems({
    selectedText: menuPosition?.selectionText ?? '',
    notificationsMuted: tile.notificationsMuted === true,
    linkTarget: menuPosition?.linkTarget,
    onCopySelection: () => {
      void copySelection(menuPosition?.selectionText)
    },
    onPaste: () => {
      void pasteClipboard()
    },
    onSelectAll: () => {
      const currentRuntime = activeRuntimeRef.current
      currentRuntime?.focus()
      currentRuntime?.selectAll()
    },
    onToggleNotifications: () => {
      onUpdate({ notificationsMuted: tile.notificationsMuted ? undefined : true })
    },
    onOpenBrowserTile: onOpenBrowserTile
      ? (url) => {
          const currentRuntime = activeRuntimeRef.current
          if (currentRuntime) currentRuntime.openBrowserTile(url)
          else onOpenBrowserTileRef.current?.(url)
        }
      : undefined,
    onOpenFileTile: openMarkdownFileTile,
    onOpenExternal: (url) => {
      void window.electron.shell.openExternal(url).catch((error: unknown) => {
        console.error('[TerminalTile] Failed to open terminal link externally:', error)
      })
    },
    onCopyLink: (url) => {
      void window.electron.clipboard.writeText(url).catch((error: unknown) => {
        console.error('[TerminalTile] Failed to copy terminal link:', error)
      })
    },
  })

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        data-terminal-title={snapshot.title ?? undefined}
        style={{ background: getTerminalContainerBackground(terminalThemeId, windowBackgroundMaterial !== 'none'), overflow: 'hidden' }}
        onMouseDown={focusTerminal}
        onContextMenu={(event) => {
          event.preventDefault()
          focusTerminal()
          const currentRuntime = activeRuntimeRef.current
          const selectionText = currentRuntime?.hasSelection() ? currentRuntime.getSelection() : ''
          setMenuPosition({
            x: event.clientX,
            y: event.clientY,
            selectionText,
            linkTarget: getHoveredLinkTarget(target),
          })
        }}
      />
      <RemoteTerminalPreparingNotice
        visible={isRemoteSsh && snapshot.preparing}
        message={t(getRemotePreparationMessageKey(preparationStatus ?? 'checking'))}
      />
      <RemoteTerminalReconnectNotice
        visible={!snapshot.preparing && isRemoteSsh && (snapshot.exitEvent !== null || snapshot.reconnecting)}
        reconnecting={snapshot.reconnecting}
        message={t('terminal.sshConnectionClosed', 'SSH connection closed')}
        reconnectLabel={t('terminal.reconnect', 'Reconnect')}
        reconnectingLabel={t('terminal.reconnecting', 'Reconnecting…')}
        onReconnect={() => {
          void reconnectRemoteTerminal()
        }}
      />
      {menuPosition && (
        <ContextMenu
          x={menuPosition.x}
          y={menuPosition.y}
          items={menuItems}
          onClose={() => setMenuPosition(null)}
        />
      )}
      {snapshot.error && (
        <div
          role="alert"
          className="absolute inset-x-3 bottom-3 z-20 rounded-md border border-red-400/50 bg-red-950/80 px-3 py-2 text-xs text-red-200"
        >
          {snapshot.error}
        </div>
      )}
    </div>
  )
}
