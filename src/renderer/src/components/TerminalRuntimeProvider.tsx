import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import type { ILinkProvider } from '@xterm/xterm'
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
import { createTerminalSourceLinkProvider, resolveTerminalSourcePath } from '@/utils/terminalSourceLinks'
import {
  getTerminalContextSelectionSnapshot,
  isTerminalCopyShortcut,
  isTerminalPasteShortcut,
  decodeOsc52ClipboardPayload,
  readTerminalPasteData,
} from '@/utils/terminalClipboard'
import { shouldInterceptTerminalLinkClick, shouldOpenTerminalLink } from '@/utils/terminalLinkActivation'
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
  /** Optional test seam: recency window for recent terminal output. */
  recentOutputWindowMs?: number
  /** Optional test seam: prune interval for recent terminal output. */
  recentOutputPruneIntervalMs?: number
}

const RECENT_OUTPUT_WINDOW_MS = 5_000
const RECENT_OUTPUT_PRUNE_INTERVAL_MS = 1_000

interface TerminalRuntimeContextValue {
  registry: TerminalRuntimeRegistry<TerminalRuntime>
  createRuntime: (request: TerminalRuntimeCreateRequest) => Promise<TerminalRuntime>
  workspaceAttentionCounts: WorkspaceAttentionCounts
  /** Terminals with PTY output inside the recency window, keyed by workspace. */
  recentOutputCounts: Record<string, number>
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

function countRecentOutputByWorkspace(entries: Iterable<{ workspaceId: string }>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of entries) {
    if (!entry.workspaceId) continue
    counts[entry.workspaceId] = (counts[entry.workspaceId] ?? 0) + 1
  }
  return counts
}

export function TerminalRuntimeProvider({
  children,
  registry: injectedRegistry,
  recentOutputWindowMs = RECENT_OUTPUT_WINDOW_MS,
  recentOutputPruneIntervalMs = RECENT_OUTPUT_PRUNE_INTERVAL_MS,
}: TerminalRuntimeProviderProps): React.ReactElement {
  const registryRef = useRef<TerminalRuntimeRegistry<TerminalRuntime> | null>(null)
  if (!registryRef.current) {
    registryRef.current = injectedRegistry ?? new TerminalRuntimeRegistry<TerminalRuntime>()
  }
  const registry = registryRef.current
  const parkingRootRef = useRef<HTMLDivElement | null>(null)
  const hoveredLinkTargetsRef = useRef(new Map<string, TerminalLinkTarget>())
  const [workspaceAttentionCounts, setWorkspaceAttentionCounts] = useState<WorkspaceAttentionCounts>({})
  const recentOutputRef = useRef(new Map<string, { workspaceId: string; at: number }>())
  const [recentOutputCounts, setRecentOutputCounts] = useState<Record<string, number>>({})

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

  // Recent output is independent of focus, mute and attention settings.
  // The first chunk of a target updates React counts; later chunks only
  // renew the timestamp in the ref so fragments never re-render the tree.
  const handleTerminalOutput = useCallback((outputTarget: TerminalSessionTarget): void => {
    const key = terminalRuntimeKey(outputTarget)
    const recent = recentOutputRef.current
    const existing = recent.get(key)
    if (existing) {
      existing.at = Date.now()
      return
    }
    recent.set(key, { workspaceId: outputTarget.workspaceId, at: Date.now() })
    setRecentOutputCounts(countRecentOutputByWorkspace(recent.values()))
  }, [])

  const pruneRecentOutput = useCallback((): void => {
    const recent = recentOutputRef.current
    if (recent.size === 0) return

    const now = Date.now()
    const liveKeys = new Set(registry.listTargets().map(terminalRuntimeKey))
    let changed = false
    for (const [key, entry] of recent) {
      if (now - entry.at >= recentOutputWindowMs || !liveKeys.has(key)) {
        recent.delete(key)
        changed = true
      }
    }
    if (changed) setRecentOutputCounts(countRecentOutputByWorkspace(recent.values()))
  }, [recentOutputWindowMs, registry])

  useEffect(() => {
    const intervalId = setInterval(() => {
      pruneRecentOutput()
    }, recentOutputPruneIntervalMs)
    return () => {
      clearInterval(intervalId)
      recentOutputRef.current.clear()
    }
  }, [pruneRecentOutput, recentOutputPruneIntervalMs])

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

    let runtimeRootElement: HTMLDivElement | null = null
    return createTerminalRuntime({
      target,
      createOptions,
      viewOptions,
      dependencies: {
        bridge: window.electron.terminal,
        createElement: () => {
          const root = document.createElement('div')
          runtimeRootElement = root
          root.style.width = '100%'
          root.style.height = '100%'
          root.style.overflow = 'hidden'
          return root
        },
        createTerminal: ({ cols, rows }) => {
          const terminal = new Terminal({
            cols,
            rows,
            theme: getXtermTheme(viewOptions.themeId, viewOptions.translucent === true),
            fontFamily: '"IBM Plex Mono", "JetBrains Mono", "Consolas", monospace',
            fontSize: viewOptions.fontSize,
            lineHeight: 1.15,
            cursorBlink: true,
            allowProposedApi: true,
            allowTransparency: true,
            scrollback: 5000,
          })

          const setHoveredLinkTarget = (next: TerminalLinkTarget | undefined): void => {
            const key = terminalRuntimeKey(target)
            if (next) hoveredLinkTargetsRef.current.set(key, next)
            else hoveredLinkTargetsRef.current.delete(key)
          }

          let interceptedClick: (() => void) | null = null
          const interceptDown = (event: MouseEvent): void => {
            if (!shouldInterceptTerminalLinkClick({
              button: event.button,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              mouseTrackingMode: terminal.modes.mouseTrackingMode,
              hasHoveredLink: Boolean(hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))),
              platform: navigator.platform,
            })) return
            const link = hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))
            if (!link) return
            interceptedClick = link.activate ?? (() => {
              if (link.kind === 'web') {
                void window.electron.shell.openExternal(link.value).catch((error: unknown) => {
                  console.error('[TerminalRuntime] open external failed:', getErrorMessage(error))
                })
              }
            })
            event.preventDefault()
            event.stopPropagation()
          }
          const interceptUp = (event: MouseEvent): void => {
            if (!interceptedClick) return
            const activate = interceptedClick
            interceptedClick = null
            event.preventDefault()
            event.stopPropagation()
            activate()
          }
          runtimeRootElement?.addEventListener('mousedown', interceptDown, true)
          runtimeRootElement?.addEventListener('mouseup', interceptUp, true)

          const webLinksAddon = new WebLinksAddon((event, url) => {
            if (!shouldOpenTerminalLink(event.button)) return
            void window.electron.shell.openExternal(url).catch((error: unknown) => {
              console.error('[TerminalRuntime] open external failed:', getErrorMessage(error))
            })
          }, {
            hover: (_event, url) => setHoveredLinkTarget({ kind: 'web', value: url, activate: () => { void window.electron.shell.openExternal(url) } }),
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
            const markdownProvider = createTerminalMarkdownLinkProvider(terminal, {
              baseDirectory: markdownBaseDirectory,
              onActivate: (relativePath) => {
                const runtime = registry.get(target)
                return runtime?.openFileTile(relativePath, { markdownView: 'preview' })
              },
              onHover: (relativePath, activate) => setHoveredLinkTarget({ kind: 'markdown', value: relativePath, activate }),
              onLeave: (relativePath) => {
                const current = hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))
                if (current?.kind === 'markdown' && current.value === relativePath) setHoveredLinkTarget(undefined)
              },
            })
            const sourceProvider = createTerminalSourceLinkProvider(terminal, {
              workspaceRootPath: viewOptions.workspaceRootPath,
              baseDirectory: markdownBaseDirectory,
              search: async (query) => (await window.electron.files.search(viewOptions.workspaceRootPath, query)).entries,
              onActivate: async (relativePath, reveal, rawPath) => {
                let resolvedPath = relativePath
                const isAbsolutePath = Boolean(rawPath && (/^[a-z]:[\\/]|^\//i.test(rawPath)))
                if (rawPath && /[\\/]/.test(rawPath) && !isAbsolutePath && markdownBaseDirectory) {
                  const rootRelative = resolveTerminalSourcePath(rawPath)
                  if (rootRelative && rootRelative !== relativePath) {
                    try {
                      const baseRead = await window.electron.files.read(viewOptions.workspaceRootPath, relativePath)
                      if (baseRead.status === 'missing') {
                        const rootRead = await window.electron.files.read(viewOptions.workspaceRootPath, rootRelative)
                        if (rootRead.status === 'ready') resolvedPath = rootRelative
                      }
                    } catch {
                      // Preserve the cwd candidate; openFileTile reports its normal missing-file state.
                    }
                  }
                }
                return registry.get(target)?.openFileTile(resolvedPath, { reveal })
              },
              onHover: (value, activate) => setHoveredLinkTarget({ kind: 'source', value, activate }),
              onLeave: (value) => {
                const current = hoveredLinkTargetsRef.current.get(terminalRuntimeKey(target))
                if (current?.kind === 'source' && current.value === value) setHoveredLinkTarget(undefined)
              },
            })
            const combinedProvider: ILinkProvider = {
              provideLinks: (row, callback) => {
                markdownProvider.provideLinks(row, (markdownLinks) => {
                  sourceProvider.provideLinks(row, (sourceLinks) => callback([...(markdownLinks ?? []), ...(sourceLinks ?? [])]))
                })
              },
            }
            terminal.registerLinkProvider(combinedProvider)
          }

          terminal.attachCustomKeyEventHandler((event) => {
            if (isTerminalPasteShortcut(event)) {
              if (event.type !== 'keydown') return false
              // Replace the browser paste so image-only clipboards reach terminal agents.
              event.preventDefault()
              void readTerminalPasteData(window.electron.clipboard, {
                allowImage: createOptions.connection !== 'remote-ssh',
              })
                .then((data) => {
                  if (data) terminal.paste(data)
                })
                .catch((error: unknown) => {
                  console.error('[TerminalRuntime] paste failed:', getErrorMessage(error))
                })
              return false
            }
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
        onOutput: handleTerminalOutput,
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
  }, [handleTerminalOutput, incrementWorkspaceAttention, registry])

  const contextValue = useMemo<TerminalRuntimeContextValue>(() => ({
    registry,
    createRuntime,
    workspaceAttentionCounts,
    recentOutputCounts,
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
    recentOutputCounts,
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
