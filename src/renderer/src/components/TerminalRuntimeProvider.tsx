import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import type { TerminalCreateOptions } from '@shared/types'
import type { TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { useCanvasStore } from '@/store/canvasStore'
import { useSettingsStore } from '@/store/settingsStore'
import {
  incrementWorkspaceAttentionCount,
  updateActiveWorkspaceAttentionCount,
  clearActivatedWorkspaceAttentionCount,
  pruneWorkspaceAttentionCounts,
  type WorkspaceAttentionCounts,
} from '@/utils/workspaceAttention'
import { createTerminalMarkdownLinkProvider } from '@/utils/terminalMarkdownLinks'
import { getTerminalContextSelectionSnapshot, isTerminalCopyShortcut, decodeOsc52ClipboardPayload } from '@/utils/terminalClipboard'
import { shouldOpenTerminalLink } from '@/utils/terminalLinkActivation'
import { getXtermTheme } from '@/utils/terminalTheme'
import {
  createTerminalRuntime,
  type TerminalRuntime,
  type TerminalRuntimeViewOptions,
} from '@/utils/terminalRuntime'
import { TerminalRuntimeRegistry, terminalRuntimeKey } from '@/utils/terminalRuntimeRegistry'
import type { TerminalLinkTarget } from '@/utils/terminalContextMenu'

export interface TerminalRuntimeCreateRequest {
  target: TerminalSessionTarget
  createOptions: TerminalCreateOptions
  viewOptions: TerminalRuntimeViewOptions
  markdownBaseDirectory?: string
}

export interface TerminalRuntimeProviderProps {
  children: React.ReactNode
  registry?: TerminalRuntimeRegistry<TerminalRuntime>
}

interface TerminalRuntimeContextValue {
  registry: TerminalRuntimeRegistry<TerminalRuntime>
  createRuntime: (request: TerminalRuntimeCreateRequest) => Promise<TerminalRuntime>
  workspaceAttentionCounts: WorkspaceAttentionCounts
  updateWorkspaceAttentionCount: (workspaceId: string | null | undefined, count: number) => void
  incrementWorkspaceAttentionCount: (workspaceId: string | null | undefined) => void
  clearWorkspaceAttentionCount: (workspaceId: string | null | undefined) => void
  pruneWorkspaceAttentionCounts: (workspaceIds: Iterable<string>) => void
  clearAllWorkspaceAttentionCounts: () => void
  getHoveredLinkTarget: (target: TerminalSessionTarget) => TerminalLinkTarget | undefined
}

const TerminalRuntimeContext = createContext<TerminalRuntimeContextValue | null>(null)

function createParkingRootStyle(): React.CSSProperties {
  return {
    position: 'fixed',
    left: '-100000px',
    top: '-100000px',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    pointerEvents: 'none',
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function TerminalRuntimeProvider({ children, registry: injectedRegistry }: TerminalRuntimeProviderProps): React.ReactElement {
  const registryRef = useRef<TerminalRuntimeRegistry<TerminalRuntime> | null>(null)
  if (!registryRef.current) {
    registryRef.current = injectedRegistry ?? new TerminalRuntimeRegistry<TerminalRuntime>()
  }
  const registry = registryRef.current
  const parkingRootRef = useRef<HTMLDivElement | null>(null)
  const hoveredLinkTargetsRef = useRef(new Map<string, TerminalLinkTarget>())
  const [workspaceAttentionCounts, setWorkspaceAttentionCounts] = useState<WorkspaceAttentionCounts>({})

  useLayoutEffect(() => {
    registry.setParkingRoot(parkingRootRef.current)
    return () => {
      registry.setParkingRoot(null)
      void registry.dispose()
    }
  }, [registry])

  const updateWorkspaceAttention = useCallback((workspaceId: string | null | undefined, count: number): void => {
    setWorkspaceAttentionCounts((current) => updateActiveWorkspaceAttentionCount(current, workspaceId, count))
  }, [])

  const incrementWorkspaceAttention = useCallback((workspaceId: string | null | undefined): void => {
    setWorkspaceAttentionCounts((current) => incrementWorkspaceAttentionCount(current, workspaceId))
  }, [])

  const clearWorkspaceAttention = useCallback((workspaceId: string | null | undefined): void => {
    setWorkspaceAttentionCounts((current) => clearActivatedWorkspaceAttentionCount(current, workspaceId))
  }, [])

  const pruneWorkspaceAttention = useCallback((workspaceIds: Iterable<string>): void => {
    setWorkspaceAttentionCounts((current) => pruneWorkspaceAttentionCounts(current, workspaceIds))
  }, [])

  const clearAllWorkspaceAttention = useCallback((): void => {
    setWorkspaceAttentionCounts({})
  }, [])

  const getHoveredLinkTarget = useCallback((target: TerminalSessionTarget): TerminalLinkTarget | undefined => (
    hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))
  ), [])

  const createRuntime = useCallback(async ({
    target,
    createOptions,
    viewOptions,
    markdownBaseDirectory = '',
  }: TerminalRuntimeCreateRequest): Promise<TerminalRuntime> => {
    // Register the grace period before bridge.create. Replay can begin before
    // createTerminalRuntime resolves, so registering afterwards is too late.
    const state = useCanvasStore.getState()
    if (state.activeWorkspaceId === target.workspaceId) {
      state.registerTerminalCreated(target.tileId)
    }

    return createTerminalRuntime({
      target,
      createOptions,
      viewOptions,
      dependencies: {
        bridge: window.electron.terminal,
        createElement: () => {
          const root = document.createElement('div')
          root.style.width = '100%'
          root.style.height = '100%'
          root.style.overflow = 'hidden'
          return root
        },
        createTerminal: ({ cols, rows }) => {
          const terminal = new Terminal({
            cols,
            rows,
            theme: getXtermTheme(viewOptions.themeId),
            fontFamily: '"IBM Plex Mono", "JetBrains Mono", "Consolas", monospace',
            fontSize: viewOptions.fontSize,
            lineHeight: 1.15,
            cursorBlink: true,
            allowProposedApi: true,
            scrollback: 5000,
          })

          const setHoveredLinkTarget = (next: TerminalLinkTarget | undefined): void => {
            const key = terminalRuntimeKey(target)
            if (next) hoveredLinkTargetsRef.current.set(key, next)
            else hoveredLinkTargetsRef.current.delete(key)
          }

          const webLinksAddon = new WebLinksAddon((event, url) => {
            if (!shouldOpenTerminalLink(event.button)) return
            void window.electron.shell.openExternal(url).catch((error: unknown) => {
              console.error('[TerminalRuntime] open external failed:', getErrorMessage(error))
            })
          }, {
            hover: (_event, url) => setHoveredLinkTarget({ kind: 'web', value: url }),
            leave: () => {
              const current = hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))
              if (current?.kind === 'web') setHoveredLinkTarget(undefined)
            },
          })
          terminal.loadAddon(webLinksAddon)

          if (
            createOptions.connection !== 'remote-ssh' &&
            Boolean(viewOptions.workspaceRootPath.trim()) &&
            Boolean(viewOptions.onOpenFileTile)
          ) {
            terminal.registerLinkProvider(createTerminalMarkdownLinkProvider(terminal, {
              baseDirectory: markdownBaseDirectory,
              onActivate: (relativePath) => {
                const runtime = registry.get(target)
                return runtime?.openFileTile(relativePath, { markdownView: 'preview' })
              },
              onHover: (relativePath) => setHoveredLinkTarget({ kind: 'markdown', value: relativePath }),
              onLeave: (relativePath) => {
                const current = hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))
                if (current?.kind === 'markdown' && current.value === relativePath) setHoveredLinkTarget(undefined)
              },
            }))
          }

          terminal.attachCustomKeyEventHandler((event) => {
            if (!isTerminalCopyShortcut(event)) return true
            const selection = getTerminalContextSelectionSnapshot(terminal)
            if (!selection) return true
            void window.electron.clipboard.writeText(selection).catch((error: unknown) => {
              console.error('[TerminalRuntime] copy selection failed:', getErrorMessage(error))
            })
            return false
          })

          terminal.parser.registerOscHandler(52, async (data) => {
            const text = decodeOsc52ClipboardPayload(data)
            if (text === null) return true
            try {
              await window.electron.clipboard.writeText(text)
            } catch (error) {
              console.error('[TerminalRuntime] OSC 52 clipboard failed:', getErrorMessage(error))
            }
            return true
          })

          return terminal
        },
        createFitAddon: () => new FitAddon(),
        createResizeObserver: (callback) => {
          if (typeof ResizeObserver === 'undefined') {
            return {
              observe: () => {},
              disconnect: () => {},
            }
          }
          return new ResizeObserver(callback)
        },
        getParkingRoot: () => parkingRootRef.current,
        whenFontsReady: async () => {
          if (document.fonts?.ready) await document.fonts.ready
        },
        onActivity: (activityTarget) => {
          if (!useSettingsStore.getState().terminal.attentionEnabled) return
          const state = useCanvasStore.getState()
          if (state.activeWorkspaceId === activityTarget.workspaceId) {
            state.markTerminalOutput(activityTarget.tileId)
            return
          }
          incrementWorkspaceAttention(activityTarget.workspaceId)
        },
        onClearActivity: (activityTarget) => {
          const state = useCanvasStore.getState()
          if (state.activeWorkspaceId === activityTarget.workspaceId) {
            state.clearTerminalAttention(activityTarget.tileId)
          }
        },
        onTitle: (titleTarget, title) => {
          const state = useCanvasStore.getState()
          if (state.activeWorkspaceId !== titleTarget.workspaceId) return
          state.setTerminalTitle(titleTarget.tileId, title)
        },
        reportError: (errorTarget, operation, error) => {
          console.error(
            '[TerminalRuntime]',
            `${errorTarget.workspaceId}/${errorTarget.tileId}`,
            operation,
            getErrorMessage(error),
          )
        },
      },
    })
  }, [incrementWorkspaceAttention, registry])

  const contextValue = useMemo<TerminalRuntimeContextValue>(() => ({
    registry,
    createRuntime,
    workspaceAttentionCounts,
    updateWorkspaceAttentionCount: updateWorkspaceAttention,
    incrementWorkspaceAttentionCount: incrementWorkspaceAttention,
    clearWorkspaceAttentionCount: clearWorkspaceAttention,
    pruneWorkspaceAttentionCounts: pruneWorkspaceAttention,
    clearAllWorkspaceAttentionCounts: clearAllWorkspaceAttention,
    getHoveredLinkTarget,
  }), [
    clearAllWorkspaceAttention,
    clearWorkspaceAttention,
    createRuntime,
    getHoveredLinkTarget,
    incrementWorkspaceAttention,
    pruneWorkspaceAttention,
    registry,
    updateWorkspaceAttention,
    workspaceAttentionCounts,
  ])

  return (
    <TerminalRuntimeContext.Provider value={contextValue}>
      {children}
      <div
        ref={parkingRootRef}
        data-terminal-runtime-parking-root="true"
        aria-hidden="true"
        style={createParkingRootStyle()}
      />
    </TerminalRuntimeContext.Provider>
  )
}

export function useTerminalRuntimeContext(): TerminalRuntimeContextValue {
  const context = useContext(TerminalRuntimeContext)
  if (!context) throw new Error('useTerminalRuntimeContext must be used inside TerminalRuntimeProvider')
  return context
}

export function useTerminalRuntimeRegistry(): TerminalRuntimeRegistry<TerminalRuntime> {
  return useTerminalRuntimeContext().registry
}
