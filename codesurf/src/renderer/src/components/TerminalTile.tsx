import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useAppFonts } from '../FontContext'
import { useTheme } from '../ThemeContext'
import { getDroppedPaths, shellEscapePath } from '../utils/dnd'

interface Props {
  tileId: string
  workspaceDir: string
  width: number
  height: number
  fontSize?: number
  fontFamily?: string
  launchBin?: string
  launchArgs?: string[]
}

export function TerminalTile({ tileId, workspaceDir, width, height, fontSize = 13, fontFamily, launchBin, launchArgs }: Props): JSX.Element {
  const appFonts = useAppFonts()
  const theme = useTheme()
  const resolvedFont = fontFamily ?? appFonts.mono
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const mountedRef = useRef(false)
  const [isDropTarget, setIsDropTarget] = useState(false)

  const doFit = () => {
    if (!fitRef.current || !termRef.current) return
    try {
      fitRef.current.fit()
      const dims = fitRef.current.proposeDimensions()
      if (dims?.cols && dims?.rows) {
        window.electron?.terminal?.resize(tileId, dims.cols, dims.rows)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!containerRef.current || mountedRef.current) return
    mountedRef.current = true

    const term = new Terminal({
      theme: {
        background: theme.terminal.background,
        foreground: theme.terminal.foreground,
        cursor: theme.terminal.cursor,
        cursorAccent: theme.terminal.cursorAccent,
        selectionBackground: theme.terminal.selection,
        black: theme.terminal.black, red: theme.terminal.red, green: theme.terminal.green,
        yellow: theme.terminal.yellow, blue: theme.terminal.blue, magenta: theme.terminal.magenta,
        cyan: theme.terminal.cyan, white: theme.terminal.white,
        brightBlack: theme.terminal.brightBlack, brightRed: theme.terminal.brightRed, brightGreen: theme.terminal.brightGreen,
        brightYellow: theme.terminal.brightYellow, brightBlue: theme.terminal.brightBlue, brightMagenta: theme.terminal.brightMagenta,
        brightCyan: theme.terminal.brightCyan, brightWhite: theme.terminal.brightWhite,
        overviewRulerBorder: theme.terminal.background,
      },
      overviewRuler: {
        width: 10
      },
      fontFamily: resolvedFont,
      fontSize,
      lineHeight: 1,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    // Apply padding inside xterm element so viewport bg covers behind it
    const xtermEl = containerRef.current.querySelector('.xterm') as HTMLElement | null
    if (xtermEl) {
      xtermEl.style.paddingLeft = '8px'
      xtermEl.style.paddingTop = '8px'
    }

    termRef.current = term
    fitRef.current = fitAddon

    // ResizeObserver so fit runs whenever the container actually changes size
    const ro = new ResizeObserver(() => doFit())
    ro.observe(containerRef.current)

    // Initial fit after paint
    requestAnimationFrame(() => requestAnimationFrame(() => doFit()))

    // Track PTY readiness so key handler can write safely
    let ptyReady = false

    // Shift+Enter → send escaped newline so shells continue on next line
    // and TUI apps (Claude CLI) treat it as multi-line input.
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (ev.key === 'Enter' && ev.shiftKey && ev.type === 'keydown') {
        if (ptyReady) {
          // Send backslash + carriage return — universal shell line continuation
          window.electron.terminal.write(tileId, '\\\r')
          return false
        }
      }
      return true
    })

    window.electron.terminal.create(tileId, workspaceDir, launchBin, launchArgs).then(({ buffer }) => {
      ptyReady = true
      if (buffer) term.write(buffer)
      const cleanup = window.electron.terminal.onData(tileId, (data: string) => {
        term.write(data)
      })
      cleanupRef.current = cleanup

      term.onData((data: string) => {
        window.electron.terminal.write(tileId, data)
      })

      // Fit once more after pty is ready
      doFit()
    }).catch(err => {
      term.write(`\r\n\x1b[31mFailed to start terminal: ${err?.message ?? err}\x1b[0m\r\n`)
    })

    return () => {
      mountedRef.current = false
      ro.disconnect()
      cleanupRef.current?.()
      // Detach (not destroy) so tmux sessions survive unmount/reload
      window.electron?.terminal?.detach?.(tileId)
      term.dispose()
    }
  }, [tileId, workspaceDir, launchBin, launchArgs])

  // Also refit when tile width/height props change (drag resize)
  useEffect(() => {
    doFit()
  }, [width, height])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.theme = {
      background: theme.terminal.background,
      foreground: theme.terminal.foreground,
      cursor: theme.terminal.cursor,
      cursorAccent: theme.terminal.cursorAccent,
      selectionBackground: theme.terminal.selection,
      black: theme.terminal.black,
      red: theme.terminal.red,
      green: theme.terminal.green,
      yellow: theme.terminal.yellow,
      blue: theme.terminal.blue,
      magenta: theme.terminal.magenta,
      cyan: theme.terminal.cyan,
      white: theme.terminal.white,
      brightBlack: theme.terminal.brightBlack,
      brightRed: theme.terminal.brightRed,
      brightGreen: theme.terminal.brightGreen,
      brightYellow: theme.terminal.brightYellow,
      brightBlue: theme.terminal.brightBlue,
      brightMagenta: theme.terminal.brightMagenta,
      brightCyan: theme.terminal.brightCyan,
      brightWhite: theme.terminal.brightWhite,
      overviewRulerBorder: theme.terminal.background,
    }
  }, [theme])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // During dragover, getData() is restricted — check types instead
    const dt = e.dataTransfer
    const hasFiles = dt.types.includes('Files')
    const hasUri = dt.types.includes('text/uri-list')
    const hasPlain = dt.types.includes('text/plain')
    const hasFileRef = dt.types.includes('application/file-reference-path')
    if (!hasFiles && !hasUri && !hasPlain && !hasFileRef) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setIsDropTarget(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDropTarget(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDropTarget(false)
    const droppedPaths = getDroppedPaths(e.dataTransfer)
    if (droppedPaths.length === 0) return
    const payload = droppedPaths.map(shellEscapePath).join(' ')
    if (!payload) return
    termRef.current?.focus()
    window.electron?.terminal?.write(tileId, `${payload} `)
  }, [tileId])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: '100%', height: '100%', background: isDropTarget ? theme.surface.accentSoft : theme.terminal.background, overflow: 'hidden', position: 'relative',
        boxShadow: isDropTarget ? `inset 0 0 0 2px ${theme.accent.base}, 0 0 22px ${theme.accent.soft}` : 'none',
        transition: 'background 120ms ease, box-shadow 120ms ease'
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', background: theme.terminal.background, overflow: 'hidden' }}
      />
      {isDropTarget && (
        <div style={{
          position: 'absolute', inset: 12, zIndex: 2,
          border: `1px dashed ${theme.accent.base}`, borderRadius: 10,
          background: theme.accent.soft,
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}
