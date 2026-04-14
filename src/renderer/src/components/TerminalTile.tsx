import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TileState } from '@shared/types'

interface Props {
  tile: TileState
  isFocused: boolean
  onFocus: () => void
  onUpdate: (patch: Partial<TileState>) => void
  onDelete: () => void
}

export function TerminalTileWrapper({ tile, isFocused, onFocus, onUpdate, onDelete }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyReadyRef = useRef(false)
  const [ptyReady, setPtyReady] = useState(false)

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
      fontSize: 13,
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

    // Padding
    const xtermEl = containerRef.current.querySelector('.xterm') as HTMLElement | null
    if (xtermEl) {
      xtermEl.style.paddingLeft = '8px'
      xtermEl.style.paddingTop = '4px'
    }

    termRef.current = term
    fitRef.current = fitAddon

    // ResizeObserver for container size changes
    const ro = new ResizeObserver(() => doFit())
    if (containerRef.current.parentElement) {
      ro.observe(containerRef.current.parentElement)
    }

    // Shift+Enter for multi-line input (uses ref to avoid stale closure)
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && ev.shiftKey && ev.type === 'keydown') {
        if (ptyReadyRef.current) {
          window.electron.terminal.write(tile.id, '\\\r')
          return false
        }
      }
      return true
    })

    // Create PTY session
    let cancelled = false
    let ptyUnsub: (() => void) | null = null
    let inputDisposer: { dispose: () => void } | null = null

    window.electron.terminal
      .create(tile.id, '', tile.shellProfileId ?? 'bash')
      .then(({ buffer }) => {
        if (cancelled) return
        ptyReadyRef.current = true
        setPtyReady(true)
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
      window.electron?.terminal?.detach?.(tile.id)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [tile.id, tile.shellProfileId, doFit])

  // Re-fit on width/height changes
  useEffect(() => {
    doFit()
  }, [tile.width, tile.height, doFit])

    return (
      <div
        ref={containerRef}
        className="w-full h-full"
      style={{ background: 'var(--surface)', overflow: 'hidden' }}
        onMouseDown={onFocus}
      />
    )
}
