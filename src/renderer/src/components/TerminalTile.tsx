import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TileState } from '@shared/types'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import { buildTerminalStartupCommand } from '@/utils/terminalLaunch'
import { ContextMenu, type MenuItem } from './ContextMenu'

interface Props {
  tile: TileState
  isFocused: boolean
  edgeToEdge?: boolean
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

export function TerminalTileWrapper({ tile, isFocused, edgeToEdge = false, onFocus, onUpdate, onDelete }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const isFocusedRef = useRef(isFocused)
  const tileFontSizePx = useSettingsStore((s) => s.tileFontSizePx)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)

  const focusTerminal = useCallback(() => {
    isFocusedRef.current = true
    onFocus()
    termRef.current?.focus()
  }, [onFocus])

  const copySelection = useCallback(async () => {
    const term = termRef.current
    if (!term?.hasSelection()) return
    const selection = term.getSelection()
    if (!selection) return
    term.focus()
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
    if (!fitRef.current || !termRef.current || !containerRef.current) return
    try {
      fitRef.current.fit()
      const dims = fitRef.current.proposeDimensions()
      if (dims?.cols && dims?.rows) {
        window.electron.terminal.resize(tile.id, dims.cols, dims.rows)
      }
    } catch { /* ignore */ }
  }, [tile.id])

  useEffect(() => {
    isFocusedRef.current = isFocused
  }, [isFocused])

  // Create terminal + PTY on mount
  useEffect(() => {
    if (!containerRef.current) return

    // Create xterm instance
    const term = new Terminal({
      theme: {
        background: '#111111',
        foreground: '#e8e8e8',
        cursor: '#ffffff',
        cursorAccent: '#111111',
        selectionBackground: 'rgba(255,255,255,0.14)',
        black: '#000000',
        red: '#d71921',
        green: '#4a9e5c',
        yellow: '#d4a843',
        blue: '#5b9bf6',
        magenta: '#c88cff',
        cyan: '#7ed9d1',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#ef3f47',
        brightGreen: '#77c989',
        brightYellow: '#f0c461',
        brightBlue: '#9bc0ff',
        brightMagenta: '#e0aaff',
        brightCyan: '#a3eee8',
        brightWhite: '#ffffff',
      },
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

    applyTerminalPadding(containerRef.current, edgeToEdge)

    termRef.current = term
    fitRef.current = fitAddon

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
    const workspaceConfig = useCanvasStore.getState().activeWorkspaceConfig
    const initialCommand = buildTerminalStartupCommand(tile, workspaceConfig)

    window.electron.terminal
      .create(tile.id, {
        shellProfileId: tile.shellProfileId ?? 'bash',
        workspaceDir: workspaceConfig.rootFolderPath,
        wslStartInHome: tile.shellProfileId === 'wsl' && !workspaceConfig.rootFolderPath,
        initialCommand,
      })
      .then(({ buffer }) => {
        if (cancelled) return
        if (buffer) term.write(buffer)

        // Listen for PTY data
        ptyUnsub = window.electron.terminal.onData(tile.id, (data: string) => {
          if (!cancelled) term.write(data)
        })

        // Send user input to PTY
        inputDisposer = term.onData((data: string) => {
          window.electron.terminal.write(tile.id, data)
        })

        // Initial fit
        requestAnimationFrame(() => doFit())
      })
      .catch((err: Error) => {
        if (cancelled) return
        term.write(`\r\n\x1b[31mFailed to start terminal: ${err?.message ?? String(err)}\x1b[0m\r\n`)
      })

    // Cleanup on unmount / before re-run
    return () => {
      cancelled = true
      ro.disconnect()
      ptyUnsub?.()
      inputDisposer?.dispose()
      titleDisposer.dispose()
      window.electron?.terminal?.detach?.(tile.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [tile.id, tile.shellProfileId, doFit])

  useEffect(() => {
    applyTerminalPadding(containerRef.current, edgeToEdge)
    requestAnimationFrame(() => doFit())
  }, [edgeToEdge, doFit])

  // Re-fit on width/height changes
  useEffect(() => {
    doFit()
  }, [tile.width, tile.height, doFit])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = tileFontSizePx
    requestAnimationFrame(() => doFit())
  }, [tileFontSizePx, doFit])

  useEffect(() => {
    if (isFocused) {
      termRef.current?.focus()
    }
  }, [isFocused])

  const menuItems: MenuItem[] = [
    {
      label: 'Copy',
      disabled: !menuPosition?.hasSelection,
      action: () => {
        void copySelection()
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
  ]

  return (
    <>
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{ background: 'var(--surface)', overflow: 'hidden' }}
        onMouseDown={focusTerminal}
        onContextMenu={(event) => {
          event.preventDefault()
          focusTerminal()
          setMenuPosition({
            x: event.clientX,
            y: event.clientY,
            hasSelection: termRef.current?.hasSelection() ?? false,
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
