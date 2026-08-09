import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isTerminalInputAttended } from '@/utils/terminalAttention'
import { buildTerminalStartupCommand } from '@/utils/terminalLaunch'
import { createTerminalFitScheduler } from '@/utils/terminalFitScheduler'
import { sanitizeTerminalReplayBuffer } from '@/utils/terminalReplaySanitizer'
import { getTerminalContainerBackground, getXtermTheme } from '@/utils/terminalTheme'
import { buildTerminalContextMenuItems } from '@/utils/terminalContextMenu'
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

export function TerminalTileWrapper({ tile, isFocused, edgeToEdge = false, isVisible = true, autoFocus = false, onFocus, onUpdate, onDelete, onOpenBrowserTile }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const fitSchedulerRef = useRef(createTerminalFitScheduler())
  const isVisibleRef = useRef(isVisible)
  const attentionEnabled = useSettingsStore((s) => s.terminal.attentionEnabled)
  const attentionEnabledRef = useRef(attentionEnabled)
  const notificationsMutedRef = useRef(tile.notificationsMuted === true)
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)
  const terminalThemeId = useSettingsStore((s) => s.terminal.themeId)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; selectionText: string; linkUrl?: string } | null>(null)
  const hoveredLinkUrlRef = useRef<string | null>(null)
  isVisibleRef.current = isVisible

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
    await window.electron.clipboard.writeText(selection)
  }, [])

  const pasteClipboard = useCallback(async () => {
    const term = termRef.current
    if (!term) return
    const text = await window.electron.clipboard.readText()
    if (!text) return
    term.focus()
    term.paste(text)
  }, [])

  // Fit terminal to container
  const doFit = useCallback(() => {
    if (!isVisibleRef.current) {
      fitSchedulerRef.current.cancelPending()
      return
    }
    if (!fitRef.current || !termRef.current || !containerRef.current) return
    try {
      fitSchedulerRef.current.requestFit(fitRef.current, (cols, rows) => {
        window.electron.terminal.resize(tile.id, cols, rows)
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
        hoveredLinkUrlRef.current = url
      },
      leave: () => {
        hoveredLinkUrlRef.current = null
      },
    })
    term.loadAddon(webLinksAddon)

    // Clear container to prevent leftover DOM from StrictMode double-mount
    containerRef.current.innerHTML = ''
    term.open(containerRef.current)

    if (isVisible) applyTerminalPadding(containerRef.current, edgeToEdge)

    termRef.current = term
    fitRef.current = fitAddon

    term.attachCustomKeyEventHandler((event) => {
      if (!isTerminalCopyShortcut(event)) return true

      const selection = getTerminalContextSelectionSnapshot(term)
      if (!selection) return true

      void window.electron.clipboard.writeText(selection)
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
        void window.electron.terminal.acknowledgeAgentAlert(tile.id)
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
    let agentAlertUnsub: (() => void) | null = null
    let inputDisposer: { dispose: () => void } | null = null
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
    const { activeWorkspaceId, activeWorkspaceConfig: workspaceConfig } = useCanvasStore.getState()
    const isRemoteSsh = tile.terminalConnection === 'remote-ssh'
    const initialCommand = isRemoteSsh ? undefined : buildTerminalStartupCommand(tile, workspaceConfig)

    window.electron.terminal
      .create(tile.id, {
        shellProfileId: tile.shellProfileId ?? 'bash',
        connection: isRemoteSsh ? 'remote-ssh' : undefined,
        remoteTerminal: isRemoteSsh ? workspaceConfig.remoteTerminal : undefined,
        remoteStartupCommand: isRemoteSsh ? tile.startupCommand : undefined,
        workspaceId: activeWorkspaceId || undefined,
        workspaceDir: isRemoteSsh ? undefined : workspaceConfig.rootFolderPath,
        wslStartInHome: !isRemoteSsh && tile.shellProfileId === 'wsl' && !workspaceConfig.rootFolderPath,
        initialCommand,
        terminalHistoryEnabled: workspaceConfig.terminalHistoryEnabled !== false,
      })
      .then(({ buffer }) => {
        if (cancelled) return
        useCanvasStore.getState().registerTerminalCreated(tile.id)
        if (buffer) term.write(sanitizeTerminalReplayBuffer(buffer))

        // Listen for PTY data
        ptyUnsub = window.electron.terminal.onData(tile.id, (data: string) => {
          if (cancelled) return

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
        })

        agentAlertUnsub = window.electron.terminal.onAgentAlert(tile.id, (state: unknown) => {
          if (!state || typeof state !== 'object') return
          const alert = state as { provider?: unknown; event?: unknown }
          if (typeof alert.provider !== 'string' || typeof alert.event !== 'string') return
          const reason = alert.event === 'completed' ? 'completed' : alert.event === 'permission' ? 'needs permission' : 'needs input'
          term.write(`\r\n\x1b[33m[Yira] ${alert.provider}: ${reason}\x1b[0m\r\n`)
        })

        // Send user input to PTY
        inputDisposer = term.onData((data: string) => {
          window.electron.terminal.write(tile.id, data)
        })

        // Initial fit
        doFit()
      })
      .catch((err: Error) => {
        if (cancelled) return
        term.write(`\r\n\x1b[31mFailed to start terminal: ${err?.message ?? String(err)}\x1b[0m\r\n`)
      })

    // Cleanup on unmount / before re-run
    return () => {
      cancelled = true
      fitSchedulerRef.current.cancelPending()
      ro.disconnect()
      removeTerminalInputFocusListener()
      window.removeEventListener('focus', clearAttentionIfAttended)
      ptyUnsub?.()
      agentAlertUnsub?.()
      inputDisposer?.dispose()
      osc52Disposer.dispose()
      titleDisposer.dispose()
      window.electron?.terminal?.detach?.(tile.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [tile.id, tile.shellProfileId, clearAttentionIfAttended, doFit])

  useEffect(() => {
    if (!isVisible) {
      fitSchedulerRef.current.cancelPending()
      return
    }
    applyTerminalPadding(containerRef.current, edgeToEdge)
    doFit()
  }, [edgeToEdge, doFit, isVisible])

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
    linkUrl: menuPosition?.linkUrl,
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
    <>
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
            linkUrl: hoveredLinkUrlRef.current ?? undefined,
          })
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
    </>
  )
}
