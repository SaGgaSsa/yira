import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { isTerminalInputAttended } from '@/utils/terminalAttention'
import { createNativeAttentionDelayScheduler } from '@/utils/nativeAttentionDelay'
import { buildTerminalStartupCommand } from '@/utils/terminalLaunch'
import { createTerminalFitScheduler } from '@/utils/terminalFitScheduler'
import { getTerminalContainerBackground, getXtermTheme } from '@/utils/terminalTheme'
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
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onDelete: () => void
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

export function TerminalTileWrapper({ tile, isFocused, edgeToEdge = false, isVisible = true, onFocus, onUpdate, onDelete }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const fitSchedulerRef = useRef(createTerminalFitScheduler())
  const isVisibleRef = useRef(isVisible)
  const attentionEnabled = useSettingsStore((s) => s.terminal.attentionEnabled)
  const attentionDelayEnabled = useSettingsStore((s) => s.notifications.attentionDelayEnabled)
  const attentionEnabledRef = useRef(attentionEnabled)
  const attentionDelayEnabledRef = useRef(attentionDelayEnabled)
  const notificationsMutedRef = useRef(tile.notificationsMuted === true)
  const nativeAttentionSchedulerRef = useRef(createNativeAttentionDelayScheduler())
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)
  const terminalThemeId = useSettingsStore((s) => s.terminal.themeId)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; selectionText: string } | null>(null)
  isVisibleRef.current = isVisible

  const focusTerminal = useCallback(() => {
    onFocus()
    termRef.current?.focus()
  }, [onFocus])

  const clearAttentionIfAttended = useCallback(() => {
    if (!isTerminalInputAttended(document.hasFocus(), termRef.current?.textarea, document.activeElement)) return

    nativeAttentionSchedulerRef.current.cancel(tile.id)
    if (!attentionEnabledRef.current) return

    useCanvasStore.getState().clearTerminalAttention(tile.id)
  }, [tile.id])

  const cancelNativeAttention = useCallback(() => {
    nativeAttentionSchedulerRef.current.cancel(tile.id)
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
    if (!attentionEnabled) nativeAttentionSchedulerRef.current.cancel(tile.id)
    if (!attentionEnabled) return
    clearAttentionIfAttended()
  }, [attentionEnabled, clearAttentionIfAttended, tile.id])

  useEffect(() => {
    attentionDelayEnabledRef.current = attentionDelayEnabled
    if (!attentionDelayEnabled) nativeAttentionSchedulerRef.current.cancel(tile.id)
  }, [attentionDelayEnabled, tile.id])

  useEffect(() => {
    notificationsMutedRef.current = tile.notificationsMuted === true
    if (tile.notificationsMuted !== true) return
    nativeAttentionSchedulerRef.current.cancel(tile.id)
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
    terminalInput?.addEventListener('focus', clearAttentionIfAttended)
    window.addEventListener('focus', cancelNativeAttention)
    window.addEventListener('focus', clearAttentionIfAttended)

    // ResizeObserver for container size changes
    const ro = new ResizeObserver(() => doFit())
    if (containerRef.current.parentElement) {
      ro.observe(containerRef.current.parentElement)
    }

    // Create PTY session
    let cancelled = false
    let ptyUnsub: (() => void) | null = null
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
    const initialCommand = buildTerminalStartupCommand(tile, workspaceConfig)

    window.electron.terminal
      .create(tile.id, {
        shellProfileId: tile.shellProfileId ?? 'bash',
        workspaceId: activeWorkspaceId || undefined,
        workspaceDir: workspaceConfig.rootFolderPath,
        wslStartInHome: tile.shellProfileId === 'wsl' && !workspaceConfig.rootFolderPath,
        initialCommand,
        terminalHistoryEnabled: workspaceConfig.terminalHistoryEnabled !== false,
      })
      .then(({ buffer }) => {
        if (cancelled) return
        useCanvasStore.getState().registerTerminalCreated(tile.id)
        if (buffer) term.write(buffer)

        // Listen for PTY data
        ptyUnsub = window.electron.terminal.onData(tile.id, (data: string) => {
          if (cancelled) return

          term.write(data)

          if (!attentionEnabledRef.current || notificationsMutedRef.current) return

          const isWindowFocused = document.hasFocus()
          if (isTerminalInputAttended(isWindowFocused, term.textarea, document.activeElement)) {
            nativeAttentionSchedulerRef.current.cancel(tile.id)
            useCanvasStore.getState().clearTerminalAttention(tile.id)
            return
          }

          const shouldRequestAttention = useCanvasStore.getState().markTerminalOutput(tile.id)
          if (shouldRequestAttention && !isWindowFocused) {
            nativeAttentionSchedulerRef.current.schedule({
              tileId: tile.id,
              delayEnabled: attentionDelayEnabledRef.current,
              muted: notificationsMutedRef.current,
              shouldRequestAttention: () => (
                attentionEnabledRef.current &&
                !notificationsMutedRef.current &&
                !document.hasFocus() &&
                !isTerminalInputAttended(document.hasFocus(), term.textarea, document.activeElement)
              ),
              requestAttention: () => {
                void window.electron.notifications.requestAttention({ onlyWhenInactive: true }).catch((error: unknown) => {
                  console.error('[TerminalTile] Failed to request attention:', error)
                })
              },
            })
          }
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
      nativeAttentionSchedulerRef.current.cancel(tile.id)
      fitSchedulerRef.current.cancelPending()
      ro.disconnect()
      terminalInput?.removeEventListener('focus', clearAttentionIfAttended)
      window.removeEventListener('focus', cancelNativeAttention)
      window.removeEventListener('focus', clearAttentionIfAttended)
      ptyUnsub?.()
      inputDisposer?.dispose()
      osc52Disposer.dispose()
      titleDisposer.dispose()
      window.electron?.terminal?.detach?.(tile.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [tile.id, tile.shellProfileId, clearAttentionIfAttended, cancelNativeAttention, doFit])

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

  const menuItems: MenuItem[] = [
    {
      label: 'Copy',
      disabled: !menuPosition?.selectionText,
      action: () => {
        void copySelection(menuPosition?.selectionText)
      },
    },
    {
      label: 'Paste',
      action: () => {
        void pasteClipboard()
      },
    },
    {
      label: 'Select All',
      action: () => {
        termRef.current?.focus()
        termRef.current?.selectAll()
      },
    },
    {
      label: tile.notificationsMuted ? 'Unmute Notifications' : 'Mute Notifications',
      action: () => {
        onUpdate({ notificationsMuted: tile.notificationsMuted ? undefined : true })
      },
    },
  ]

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
