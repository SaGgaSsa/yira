import React, { useEffect, useRef, useState, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { FileTileOpenOptions, RemotePreparationResult, TerminalExitEvent, TileState } from '@shared/types'
import type { TerminalSessionIdentity } from '@shared/terminalSessionIdentity'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isTerminalInputAttended } from '@/utils/terminalAttention'
import { buildTerminalStartupCommand } from '@/utils/terminalLaunch'
import { createTerminalFitScheduler } from '@/utils/terminalFitScheduler'
import { sanitizeTerminalReplayBuffer } from '@/utils/terminalReplaySanitizer'
import { createTerminalReplayController } from '@/utils/terminalReplay'
import { canFitTerminalAfterActivation } from '@/utils/terminalActivationFit'
import { getTerminalContainerBackground, getXtermTheme } from '@/utils/terminalTheme'
import { buildTerminalContextMenuItems } from '@/utils/terminalContextMenu'
import { createTerminalMarkdownLinkProvider } from '@/utils/terminalMarkdownLinks'
import type { TerminalLinkTarget } from '@/utils/terminalContextMenu'
import { shouldOpenTerminalLink } from '@/utils/terminalLinkActivation'
import {
  decodeOsc52ClipboardPayload,
  getTerminalContextSelectionSnapshot,
  isTerminalCopyShortcut,
} from '@/utils/terminalClipboard'
import { ContextMenu, type MenuItem } from './ContextMenu'

interface Props {
  tile: TileState
  isFocused: boolean
  edgeToEdge?: boolean
  isVisible?: boolean
  autoFocus?: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onDelete: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  terminalActivationGeneration?: number
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

function applyTerminalPadding(container: HTMLElement | null, edgeToEdge: boolean): void {
  const xtermEl = container?.querySelector('.xterm') as HTMLElement | null
  if (!xtermEl) return
  const horizontalPadding = edgeToEdge ? '0px' : '14px'
  const verticalPadding = edgeToEdge ? '0px' : '12px'
  xtermEl.style.paddingLeft = horizontalPadding
  xtermEl.style.paddingRight = horizontalPadding
  xtermEl.style.paddingTop = verticalPadding
  xtermEl.style.paddingBottom = verticalPadding
}

export function shouldRegisterTerminalMarkdownLinks(
  connection: TileState['terminalConnection'],
  workspaceRootPath: string | undefined,
  hasOpenFileTile: boolean,
): boolean {
  return connection !== 'remote-ssh' && Boolean(workspaceRootPath?.trim()) && hasOpenFileTile
}

export function TerminalTileWrapper({ tile, isFocused, edgeToEdge = false, isVisible = true, autoFocus = false, onFocus, onUpdate, onDelete, onOpenBrowserTile, onOpenFileTile, terminalActivationGeneration = 0 }: Props): React.ReactElement {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionIdentityRef = useRef<TerminalSessionIdentity | null>(null)
  const fitSchedulerRef = useRef(createTerminalFitScheduler())
  const isVisibleRef = useRef(isVisible)
  const currentActivationGenerationRef = useRef(terminalActivationGeneration)
  const replaySequenceRef = useRef(0)
  const currentReplayGenerationRef = useRef<number | null>(null)
  const completedReplayGenerationRef = useRef<number | null>(null)
  const isStaleRef = useRef(false)
  const attentionEnabled = useSettingsStore((s) => s.terminal.attentionEnabled)
  const attentionEnabledRef = useRef(attentionEnabled)
  const notificationsMutedRef = useRef(tile.notificationsMuted === true)
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)
  const terminalThemeId = useSettingsStore((s) => s.terminal.themeId)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; selectionText: string; linkTarget?: TerminalLinkTarget } | null>(null)
  const [terminalExit, setTerminalExit] = useState<TerminalExitEvent | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [sessionGeneration, setSessionGeneration] = useState(0)
  const hoveredLinkTargetRef = useRef<TerminalLinkTarget | null>(null)
  const onOpenFileTileRef = useRef<Props['onOpenFileTile']>(onOpenFileTile)
  onOpenFileTileRef.current = onOpenFileTile
  isVisibleRef.current = isVisible
  currentActivationGenerationRef.current = terminalActivationGeneration

  const openMarkdownFileTile = useCallback((relativePath: string, options: FileTileOpenOptions = { markdownView: 'preview' }): void | Promise<void> => {
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

  const focusTerminal = useCallback(() => {
    onFocus()
    termRef.current?.focus()
  }, [onFocus])

  const clearAttentionIfAttended = useCallback(() => {
    if (!isTerminalInputAttended(document.hasFocus(), termRef.current?.textarea, document.activeElement)) return

    if (!attentionEnabledRef.current) return

    useCanvasStore.getState().clearTerminalAttention(tile.id)
  }, [tile.id])

  const copySelection = useCallback(async (selectionSnapshot?: string) => {
    const term = termRef.current
    const selection = selectionSnapshot ?? (term?.hasSelection() ? term.getSelection() : '')
    if (!selection) return
    term?.focus()
    try {
      await window.electron.clipboard.writeText(selection)
    } catch (error) {
      console.error('[TerminalTile] Failed to copy terminal selection:', error)
    }
  }, [])

  const pasteClipboard = useCallback(async () => {
    const term = termRef.current
    if (!term) return
    const text = await window.electron.clipboard.readText()
    if (!text) return
    term.focus()
    term.paste(text)
  }, [])

  const reconnectRemoteTerminal = useCallback(async () => {
    if (reconnecting || tile.terminalConnection !== 'remote-ssh') return
    const identity = sessionIdentityRef.current
    setReconnecting(true)

    try {
      if (identity) {
        await restartTerminalAfterExit(
          () => window.electron.terminal.destroy(identity),
          () => {
            setTerminalExit(null)
            setSessionGeneration((generation) => generation + 1)
          },
        )
      } else {
        setTerminalExit(null)
        setSessionGeneration((generation) => generation + 1)
      }
    } catch (error) {
      console.error('[TerminalTile] Failed to restart remote SSH terminal:', error)
      setReconnecting(false)
    }
  }, [reconnecting, tile.id, tile.terminalConnection])

  // Fit terminal to container
  const doFit = useCallback((requestedReplayGeneration = completedReplayGenerationRef.current) => {
    if (!isVisibleRef.current) {
      fitSchedulerRef.current.cancelPending()
      return
    }
    if (!fitRef.current || !termRef.current || !containerRef.current) return
    const identity = sessionIdentityRef.current
    if (!identity) return
    const activationGeneration = currentActivationGenerationRef.current
    if (!canFitTerminalAfterActivation({
      isVisible: isVisibleRef.current,
      activationGeneration,
      currentActivationGeneration: currentActivationGenerationRef.current,
      replayGeneration: requestedReplayGeneration,
      currentReplayGeneration: currentReplayGenerationRef.current,
      isStale: isStaleRef.current,
    })) {
      fitSchedulerRef.current.cancelPending()
      return
    }
    try {
      fitSchedulerRef.current.requestFit(fitRef.current, (cols, rows) => {
        if (sessionIdentityRef.current !== identity) return
        if (!canFitTerminalAfterActivation({
          isVisible: isVisibleRef.current,
          activationGeneration,
          currentActivationGeneration: currentActivationGenerationRef.current,
          replayGeneration: requestedReplayGeneration,
          currentReplayGeneration: currentReplayGenerationRef.current,
          isStale: isStaleRef.current,
        })) return
        window.electron.terminal.resize(identity, cols, rows)
      })
    } catch { /* ignore */ }
  }, [tile.id])

  useEffect(() => {
    attentionEnabledRef.current = attentionEnabled
    if (!attentionEnabled) return
    clearAttentionIfAttended()
  }, [attentionEnabled, clearAttentionIfAttended, tile.id])

  useEffect(() => {
    notificationsMutedRef.current = tile.notificationsMuted === true
    if (tile.notificationsMuted !== true) return
    useCanvasStore.getState().clearTerminalAttention(tile.id)
  }, [tile.id, tile.notificationsMuted])

  // Create terminal + PTY on mount
  useEffect(() => {
    if (!containerRef.current) return

    const replayGeneration = replaySequenceRef.current + 1
    replaySequenceRef.current = replayGeneration
    currentReplayGenerationRef.current = replayGeneration
    completedReplayGenerationRef.current = null
    isStaleRef.current = false

    const { activeWorkspaceId, activeWorkspaceConfig: workspaceConfig } = useCanvasStore.getState()
    const isRemoteSsh = tile.terminalConnection === 'remote-ssh'
    const shouldPrepareRemote = isRemoteSsh && workspaceConfig.remoteTerminal?.wakeOnLan?.enabled === true
    setPreparing(shouldPrepareRemote)

    // Create xterm instance
    const term = new Terminal({
      theme: getXtermTheme(useSettingsStore.getState().terminal.themeId),
      fontFamily: '"IBM Plex Mono", "JetBrains Mono", "Consolas", monospace',
      fontSize: useSettingsStore.getState().tileFontSizePx,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    const webLinksAddon = new WebLinksAddon((event, url) => {
      if (!shouldOpenTerminalLink(event.button)) return
      void window.electron.shell.openExternal(url).catch((error: unknown) => {
        console.error('[TerminalTile] Failed to open terminal link externally:', error)
      })
    }, {
      hover: (_event, url) => {
        hoveredLinkTargetRef.current = { kind: 'web', value: url }
      },
      leave: () => {
        if (hoveredLinkTargetRef.current?.kind === 'web') {
          hoveredLinkTargetRef.current = null
        }
      },
    })
    term.loadAddon(webLinksAddon)

    // Clear container to prevent leftover DOM from StrictMode double-mount
    containerRef.current.innerHTML = ''
    term.open(containerRef.current)

    if (isVisible) applyTerminalPadding(containerRef.current, edgeToEdge)

    termRef.current = term
    fitRef.current = fitAddon

    const markdownLinkDisposer = shouldRegisterTerminalMarkdownLinks(
      tile.terminalConnection,
      workspaceConfig.rootFolderPath,
      Boolean(onOpenFileTileRef.current),
    )
      ? term.registerLinkProvider(createTerminalMarkdownLinkProvider(term, {
          baseDirectory: tile.agent?.cwd ?? '',
          onActivate: (relativePath) => openMarkdownFileTile(relativePath, { markdownView: 'preview' }),
          onHover: (relativePath) => {
            hoveredLinkTargetRef.current = { kind: 'markdown', value: relativePath }
          },
          onLeave: (relativePath) => {
            const current = hoveredLinkTargetRef.current
            if (current?.kind === 'markdown' && current.value === relativePath) {
              hoveredLinkTargetRef.current = null
            }
          },
        }))
      : null

    term.attachCustomKeyEventHandler((event) => {
      if (!isTerminalCopyShortcut(event)) return true

      const selection = getTerminalContextSelectionSnapshot(term)
      if (!selection) return true

      void window.electron.clipboard.writeText(selection).catch((error: unknown) => {
        console.error('[TerminalTile] Failed to copy terminal selection:', error)
      })
      return false
    })

    const terminalInput = term.textarea
    const removeTerminalInputFocusListener = registerTerminalInputFocusListener({
      terminalInput,
      textarea: terminalInput,
      isWindowFocused: () => document.hasFocus(),
      getActiveElement: () => document.activeElement,
      attentionEnabled: () => attentionEnabledRef.current,
      clearActivity: () => {
        useCanvasStore.getState().clearTerminalAttention(tile.id)
        const identity = sessionIdentityRef.current
        if (identity) void window.electron.terminal.acknowledgeAgentAlert(identity)
      },
    })
    window.addEventListener('focus', clearAttentionIfAttended)

    // ResizeObserver for container size changes
    const ro = new ResizeObserver(() => doFit())
    if (containerRef.current.parentElement) {
      ro.observe(containerRef.current.parentElement)
    }

    // Create PTY session
    let cancelled = false
    let ptyUnsub: (() => void) | null = null
    let exitUnsub: (() => void) | null = null
    let agentAlertUnsub: (() => void) | null = null
    let inputDisposer: { dispose: () => void } | null = null
    let replayController: ReturnType<typeof createTerminalReplayController> | null = null
    const titleDisposer = term.onTitleChange((title) => {
      useCanvasStore.getState().setTerminalTitle(tile.id, title)
    })
    const osc52Disposer = term.parser.registerOscHandler(52, async (data) => {
      const text = decodeOsc52ClipboardPayload(data)
      if (text === null) return true

      try {
        await window.electron.clipboard.writeText(text)
      } catch (error) {
        console.error('[TerminalTile] Failed to write OSC 52 clipboard payload:', error)
      }
      return true
    })
    const initialCommand = isRemoteSsh ? undefined : buildTerminalStartupCommand(tile, workspaceConfig)

    const createPty = async (): Promise<void> => {
      setPreparing(false)
      await window.electron.terminal
        .create({ tileId: tile.id, workspaceId: activeWorkspaceId }, {
          shellProfileId: tile.shellProfileId ?? 'bash',
          connection: isRemoteSsh ? 'remote-ssh' : undefined,
          remoteTerminal: isRemoteSsh ? workspaceConfig.remoteTerminal : undefined,
          remoteStartupCommand: isRemoteSsh ? tile.startupCommand : undefined,
          workspaceId: activeWorkspaceId || undefined,
          workspaceDir: isRemoteSsh ? undefined : workspaceConfig.rootFolderPath,
          wslStartInHome: !isRemoteSsh && tile.shellProfileId === 'wsl' && !workspaceConfig.rootFolderPath,
          initialCommand,
          terminalHistoryEnabled: workspaceConfig.terminalHistoryEnabled !== false,
          agent: isRemoteSsh ? undefined : tile.agent,
          agentProviderConfig: !isRemoteSsh && tile.agent
            ? workspaceConfig.agentProviders[tile.agent.provider]
            : undefined,
        })
        .then(async ({ identity: createdIdentity }) => {
          if (cancelled) return
          sessionIdentityRef.current = createdIdentity
          const isCurrent = () => !cancelled && sessionIdentityRef.current === createdIdentity
          replayController = createTerminalReplayController({
            isCurrent,
            write: (data, callback) => term.write(data, callback),
            onData: (data) => {
              handleTerminalOutput({
                data,
                term,
                attentionEnabled: attentionEnabledRef.current,
                notificationsMuted: notificationsMutedRef.current,
                isWindowFocused: document.hasFocus(),
                activeElement: document.activeElement,
                markActivity: () => {
                  useCanvasStore.getState().markTerminalOutput(tile.id)
                },
                clearActivity: () => {
                  useCanvasStore.getState().clearTerminalAttention(tile.id)
                },
              })
            },
            onExit: (exitEvent) => {
              if (!isCurrent() || !isRemoteSsh) return
              setTerminalExit(exitEvent)
              setReconnecting(false)
            },
            onReplayComplete: () => {
              if (!isCurrent()) return
              completedReplayGenerationRef.current = replayGeneration
              doFit(replayGeneration)
            },
          })

          // Register identity-specific listeners before attaching the renderer.
          ptyUnsub = window.electron.terminal.onData(createdIdentity, replayController.onData)
          exitUnsub = window.electron.terminal.onExit(createdIdentity, replayController.onExit)
          agentAlertUnsub = window.electron.terminal.onAgentAlert(tile.id, (state: unknown) => {
            handleTerminalAgentAlert(state, term)
          })

          // Send user input to PTY
          inputDisposer = term.onData((data: string) => {
            if (!isCurrent()) return
            void window.electron.terminal.write(createdIdentity, data)
          })

          const attached = await window.electron.terminal.attach(createdIdentity)
          if (!isCurrent()) return
          setReconnecting(false)
          useCanvasStore.getState().registerTerminalCreated(tile.id)
          // Replay now owns the ordered equivalent of: if (buffer) term.write(sanitizeTerminalReplayBuffer(buffer))
          replayController.replay({
            buffer: sanitizeTerminalReplayBuffer(attached.buffer),
            exitEvent: attached.exitEvent,
          })
        })
    }

    const handleStartError = (err: unknown): void => {
      if (cancelled) return
      setPreparing(false)
      const error = err instanceof Error ? err : new Error(String(err))
      term.write(`\r\n\x1b[31mFailed to start terminal: ${error.message}\x1b[0m\r\n`)
      if (isRemoteSsh) {
        setTerminalExit({ exitCode: -1 })
        setReconnecting(false)
      }
    }

    const start = shouldPrepareRemote
      ? prepareRemoteTerminal({
          isCancelled: () => cancelled,
          prepare: () => window.electron.terminal.prepareRemote(activeWorkspaceId),
          create: createPty,
        })
      : createPty()
    void start.catch(handleStartError)

    // Cleanup on unmount / before re-run
    return () => {
      cancelled = true
      isStaleRef.current = true
      fitSchedulerRef.current.cancelPending()
      ro.disconnect()
      removeTerminalInputFocusListener()
      window.removeEventListener('focus', clearAttentionIfAttended)
      ptyUnsub?.()
      exitUnsub?.()
      agentAlertUnsub?.()
      inputDisposer?.dispose()
      replayController?.dispose()
      markdownLinkDisposer?.dispose()
      osc52Disposer.dispose()
      titleDisposer.dispose()
      const identity = sessionIdentityRef.current
      if (identity) window.electron?.terminal?.detach?.(identity)
      sessionIdentityRef.current = null
      currentReplayGenerationRef.current = null
      completedReplayGenerationRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [
    clearAttentionIfAttended,
    doFit,
    tile.agent?.cwd,
    tile.agent?.provider,
    tile.agent?.sessionId,
    tile.id,
    tile.shellProfileId,
    tile.terminalConnection,
    sessionGeneration,
  ])

  useEffect(() => {
    if (!isVisible) {
      fitSchedulerRef.current.cancelPending()
      return
    }
    applyTerminalPadding(containerRef.current, edgeToEdge)
    doFit()
  }, [edgeToEdge, doFit, isVisible, terminalActivationGeneration])

  // Re-fit on width/height changes
  useEffect(() => {
    doFit()
  }, [tile.width, tile.height, doFit])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = tileFontSizePx
    doFit()
  }, [tileFontSizePx, doFit])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = getXtermTheme(terminalThemeId)
  }, [terminalThemeId])

  useEffect(() => {
    if (isFocused) {
      termRef.current?.focus()
    }
  }, [isFocused])

  useEffect(() => {
    if (autoFocus) {
      termRef.current?.focus()
    }
  }, [autoFocus])

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
      termRef.current?.focus()
      termRef.current?.selectAll()
    },
    onToggleNotifications: () => {
      onUpdate({ notificationsMuted: tile.notificationsMuted ? undefined : true })
    },
    onOpenBrowserTile,
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
        style={{ background: getTerminalContainerBackground(terminalThemeId), overflow: 'hidden' }}
        onMouseDown={focusTerminal}
        onContextMenu={(event) => {
          event.preventDefault()
          focusTerminal()
          const selectionText = getTerminalContextSelectionSnapshot(termRef.current)
          setMenuPosition({
            x: event.clientX,
            y: event.clientY,
            selectionText,
            linkTarget: hoveredLinkTargetRef.current ?? undefined,
          })
        }}
      />
      <RemoteTerminalPreparingNotice
        visible={preparing}
        message={t('terminal.wakeOnLanPreparing')}
      />
      <RemoteTerminalReconnectNotice
        visible={!preparing && tile.terminalConnection === 'remote-ssh' && (terminalExit !== null || reconnecting)}
        reconnecting={reconnecting}
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
    </div>
  )
}
