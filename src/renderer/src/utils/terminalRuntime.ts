import type {
  FileTileOpenOptions,
  TerminalCreateOptions,
  TerminalCreateResult,
  TerminalExitEvent,
} from '@shared/types'
import { sameTerminalSessionIdentity, type TerminalSessionIdentity, type TerminalSessionTarget } from '@shared/terminalSessionIdentity'
import { DEFAULT_TERMINAL_THEME_ID, type TerminalThemeId } from '@shared/terminalThemes'
import { createTerminalFitScheduler, type TerminalFitAddonLike, type TerminalFitResult } from './terminalFitScheduler'
import { createTerminalReplayController, type TerminalReplayController } from './terminalReplay'
import { sanitizeTerminalReplayBuffer } from './terminalReplaySanitizer'
import { getXtermTheme } from './terminalTheme'
import type { TerminalRuntimeHandle } from './terminalRuntimeRegistry'

export interface TerminalLike {
  readonly rows: number
  readonly textarea?: Element | null
  readonly options: {
    fontSize?: number
    theme?: unknown
  }
  loadAddon: (addon: any) => void
  open: (container: HTMLElement) => void
  write: (data: string, callback?: () => void) => void
  refresh: (start: number, end: number) => void
  dispose: () => void
  focus: () => void
  hasSelection: () => boolean
  getSelection: () => string
  selectAll: () => void
  paste: (data: string) => void
  onData?: (callback: (data: string) => void) => DisposableLike
  onTitleChange?: (callback: (title: string) => void) => DisposableLike
}

export type FitAddonLike = TerminalFitAddonLike

export interface ResizeObserverLike {
  observe: (target: HTMLElement) => void
  disconnect: () => void
}

export interface TerminalRuntimeSnapshot {
  preparing: boolean
  reconnecting: boolean
  exitEvent: TerminalExitEvent | null
  error: string | null
  title: string | null
}

export interface TerminalRuntimeViewOptions {
  visible: boolean
  edgeToEdge: boolean
  autoFocus: boolean
  fontSize: number
  themeId: TerminalThemeId
  notificationsMuted: boolean
  workspaceRootPath: string
  onFocus: () => void
  onOpenBrowserTile?: (url: string) => void
  onOpenFileTile?: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
}

export interface TerminalRuntimeDependencies {
  bridge: Window['electron']['terminal']
  createElement: () => HTMLDivElement
  createTerminal: (options: { cols: number; rows: number }) => TerminalLike
  createFitAddon: () => FitAddonLike
  createResizeObserver: (callback: () => void) => ResizeObserverLike
  getParkingRoot: () => HTMLElement | null
  whenFontsReady: () => Promise<void>
  onActivity: (target: TerminalSessionTarget) => void
  onClearActivity: (target: TerminalSessionTarget) => void
  onTitle: (target: TerminalSessionTarget, title: string | null) => void
  reportError: (target: TerminalSessionTarget, operation: string, error: unknown) => void
  /** Optional test seam. The runtime uses the application scheduler by default. */
  createFitScheduler?: () => TerminalFitSchedulerLike
  /** Optional direct scheduler injection for hosts that own the scheduler. */
  fitScheduler?: TerminalFitSchedulerLike
}

export interface TerminalFitSchedulerLike {
  requestFit: (
    fitAddon: FitAddonLike,
    resizeTerminal: (cols: number, rows: number) => void,
    onComplete?: (result: TerminalFitResult) => void,
  ) => void
  cancelPending: () => void
}

export interface TerminalRuntimeCreateOptions {
  target: TerminalSessionTarget
  createOptions: TerminalCreateOptions
  dependencies: TerminalRuntimeDependencies
  viewOptions?: TerminalRuntimeViewOptions
}

export interface TerminalRuntimeFlatCreateOptions
  extends Partial<TerminalRuntimeDependencies> {
  target: TerminalSessionTarget
  createOptions: TerminalCreateOptions
  dependencies?: TerminalRuntimeDependencies
  deps?: TerminalRuntimeDependencies
  viewOptions?: TerminalRuntimeViewOptions
  view?: TerminalRuntimeViewOptions
  options?: TerminalRuntimeViewOptions
}

/** Alias retained for callers that use the shorter factory-options name. */
export type TerminalRuntimeOptions = TerminalRuntimeCreateOptions

export interface TerminalRuntime extends TerminalRuntimeHandle {
  readonly terminal: TerminalLike
  readonly runtimeRoot: HTMLDivElement
  startReplay: (result: Pick<TerminalCreateResult, 'buffer' | 'exitEvent'>) => void
  attachHost: (host: HTMLElement | null, options?: TerminalRuntimeViewOptions) => void
  updateView: (options: TerminalRuntimeViewOptions) => void
  focus: () => void
  hasSelection: () => boolean
  getSelection: () => string
  selectAll: () => void
  paste: (data: string) => void
  setReconnecting: (reconnecting: boolean) => void
  acknowledgeAgentAlert: () => Promise<void>
  openBrowserTile: (url: string) => void
  openFileTile: (relativePath: string, options?: FileTileOpenOptions) => void | Promise<void>
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => TerminalRuntimeSnapshot
}

type DisposableLike = { dispose: () => void } | (() => void) | void

const DEFAULT_VIEW_OPTIONS: TerminalRuntimeViewOptions = {
  visible: false,
  edgeToEdge: false,
  autoFocus: false,
  fontSize: 14,
  themeId: DEFAULT_TERMINAL_THEME_ID,
  notificationsMuted: false,
  workspaceRootPath: '',
  onFocus: () => {},
}

function disposeListener(disposable: DisposableLike): void {
  if (!disposable) return

  try {
    if (typeof disposable === 'function') disposable()
    else disposable.dispose()
  } catch {
    // Listener disposal must not prevent the remaining renderer cleanup.
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function setRuntimeRootPadding(runtimeRoot: HTMLElement, edgeToEdge: boolean): void {
  const xtermElement = runtimeRoot.querySelector?.('.xterm') as HTMLElement | null | undefined
  if (!xtermElement) return

  const horizontalPadding = edgeToEdge ? '0px' : '14px'
  const verticalPadding = edgeToEdge ? '0px' : '12px'
  xtermElement.style.paddingLeft = horizontalPadding
  xtermElement.style.paddingRight = horizontalPadding
  xtermElement.style.paddingTop = verticalPadding
  xtermElement.style.paddingBottom = verticalPadding
}

function applyTerminalOptions(
  runtimeRoot: HTMLElement,
  terminal: TerminalLike,
  options: TerminalRuntimeViewOptions,
): void {
  terminal.options.fontSize = options.fontSize
  terminal.options.theme = getXtermTheme(options.themeId)
  setRuntimeRootPadding(runtimeRoot, options.edgeToEdge)
}

function isElementFocused(element: Element | null | undefined): boolean {
  if (!element || typeof document === 'undefined') return false

  try {
    return document.hasFocus() && document.activeElement === element
  } catch {
    return false
  }
}

function report(
  dependencies: TerminalRuntimeDependencies,
  target: TerminalSessionTarget,
  operation: string,
  error: unknown,
): void {
  try {
    dependencies.reportError(target, operation, error)
  } catch {
    // Error reporting is an integration boundary and must not break cleanup.
  }
}

function mergeViewOptions(
  current: TerminalRuntimeViewOptions,
  next: TerminalRuntimeViewOptions | undefined,
): TerminalRuntimeViewOptions {
  return next ? { ...current, ...next } : current
}

function normalizeFactoryInput(
  input: TerminalRuntimeCreateOptions | TerminalRuntimeFlatCreateOptions,
): TerminalRuntimeCreateOptions {
  const candidate = input as TerminalRuntimeFlatCreateOptions
  const dependencies = candidate.dependencies
    ?? candidate.deps
    ?? ({
      bridge: candidate.bridge,
      createElement: candidate.createElement,
      createTerminal: candidate.createTerminal,
      createFitAddon: candidate.createFitAddon,
      createResizeObserver: candidate.createResizeObserver,
      getParkingRoot: candidate.getParkingRoot,
      whenFontsReady: candidate.whenFontsReady,
      onActivity: candidate.onActivity,
      onClearActivity: candidate.onClearActivity,
      onTitle: candidate.onTitle,
      reportError: candidate.reportError,
      createFitScheduler: candidate.createFitScheduler,
      fitScheduler: candidate.fitScheduler,
    } as TerminalRuntimeDependencies)

  return {
    target: candidate.target,
    createOptions: candidate.createOptions,
    dependencies,
    viewOptions: candidate.viewOptions ?? candidate.view ?? candidate.options,
  }
}

function createRuntime(
  target: TerminalSessionTarget,
  dependencies: TerminalRuntimeDependencies,
  initialViewOptions: TerminalRuntimeViewOptions,
  created: TerminalCreateResult,
  terminal: TerminalLike,
  fitAddon: FitAddonLike,
  runtimeRoot: HTMLDivElement,
): TerminalRuntime {
  let currentIdentity: TerminalSessionIdentity | null = created.identity
  let currentViewOptions = initialViewOptions
  let currentHost: HTMLElement | null = null
  let resizeObserver: ResizeObserverLike | null = null
  let replayController: TerminalReplayController | null = null
  let replayComplete = false
  let replayStarted = false
  let fitDirty = true
  let forceRefresh = false
  let observedHost: HTMLElement | null = null
  let processExited = false
  let disposed = false
  let disposePromise: Promise<void> | null = null
  let fontWaitGeneration = 0
  const listeners = new Set<() => void>()
  const fitScheduler = dependencies.createFitScheduler?.()
    ?? dependencies.fitScheduler
    ?? createTerminalFitScheduler()

  let snapshot: TerminalRuntimeSnapshot = {
    preparing: true,
    reconnecting: false,
    exitEvent: null,
    error: null,
    title: null,
  }

  const dataDisposers: DisposableLike[] = []

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // One subscriber must not prevent the remaining subscribers from updating.
      }
    }
  }

  const updateSnapshot = (patch: Partial<TerminalRuntimeSnapshot>): void => {
    if (disposed) return
    snapshot = { ...snapshot, ...patch }
    notify()
  }

  const isCurrentIdentity = (identity: TerminalSessionIdentity): boolean => (
    !disposed
    && currentIdentity !== null
    && sameTerminalSessionIdentity(currentIdentity, identity)
  )

  const handleError = (operation: string, error: unknown): void => {
    updateSnapshot({ error: errorMessage(error) })
    report(dependencies, target, operation, error)
  }

  const writeInput = (identity: TerminalSessionIdentity, data: string): void => {
    if (!isCurrentIdentity(identity) || processExited) return

    try {
      void Promise.resolve(dependencies.bridge.write(identity, data)).catch((error: unknown) => {
        if (!isCurrentIdentity(identity)) return
        handleError('write', error)
      })
    } catch (error) {
      handleError('write', error)
    }
  }

  const processOutput = (identity: TerminalSessionIdentity, data: string): void => {
    if (!isCurrentIdentity(identity)) return

    try {
      terminal.write(data)
    } catch (error) {
      handleError('write', error)
      return
    }

    if (currentViewOptions.notificationsMuted) return
    try {
      if (isElementFocused(terminal.textarea)) dependencies.onClearActivity(target)
      else dependencies.onActivity(target)
    } catch (error) {
      handleError('activity', error)
    }
  }

  const acknowledgeAgentAlert = async (): Promise<void> => {
    const identity = currentIdentity
    if (!identity || disposed) return

    try {
      await Promise.resolve(dependencies.bridge.acknowledgeAgentAlert(identity))
    } catch (error) {
      if (isCurrentIdentity(identity)) handleError('acknowledgeAgentAlert', error)
    }
  }

  const handleTerminalFocus = (identity: TerminalSessionIdentity): void => {
    if (!isCurrentIdentity(identity)) return
    try {
      dependencies.onClearActivity(target)
    } catch (error) {
      handleError('clearActivity', error)
    }
    void acknowledgeAgentAlert()
  }

  const applyChangedViewOptions = (previous: TerminalRuntimeViewOptions, next: TerminalRuntimeViewOptions): void => {
    if (previous.fontSize !== next.fontSize) terminal.options.fontSize = next.fontSize
    if (previous.themeId !== next.themeId) terminal.options.theme = getXtermTheme(next.themeId)
    if (previous.edgeToEdge !== next.edgeToEdge) setRuntimeRootPadding(runtimeRoot, next.edgeToEdge)
  }

  const focusIfAutoFocus = (): void => {
    if (currentHost && currentViewOptions.visible && currentViewOptions.autoFocus) focus()
  }

  const refreshTerminal = (): void => {
    if (!currentViewOptions.visible || !currentHost || disposed) return
    const lastRow = terminal.rows - 1
    if (lastRow < 0) return

    try {
      terminal.refresh(0, lastRow)
    } catch (error) {
      handleError('refresh', error)
    }
  }

  const requestFit = (): void => {
    if (disposed || !replayComplete || !fitDirty || !currentViewOptions.visible || !currentHost) return
    if (currentHost.isConnected === false) return

    const identity = currentIdentity
    const host = currentHost
    if (!identity) return

    try {
      fitScheduler.requestFit(
        fitAddon,
        (cols, rows) => {
          if (!isCurrentIdentity(identity)) return
          if (!currentViewOptions.visible || currentHost !== host || !replayComplete) return
          if (processExited) return

          try {
            void Promise.resolve(dependencies.bridge.resize(identity, cols, rows)).catch((error: unknown) => {
              if (isCurrentIdentity(identity) && !processExited) handleError('resize', error)
            })
          } catch (error) {
            if (!processExited) handleError('resize', error)
          }
        },
        (result) => {
          if (!isCurrentIdentity(identity)) return
          if (!currentViewOptions.visible || currentHost !== host || !replayComplete) return

          if (result === 'unmeasurable') {
            fitDirty = true
            return
          }

          if (result === 'fitted') {
            fitDirty = false
            forceRefresh = false
            refreshTerminal()
            return
          }

          fitDirty = false
          if (!forceRefresh) return
          forceRefresh = false
          refreshTerminal()
        },
      )
    } catch (error) {
      handleError('fit', error)
    }
  }

  const retryAfterFonts = (): void => {
    const generation = fontWaitGeneration + 1
    fontWaitGeneration = generation
    void Promise.resolve()
      .then(() => dependencies.whenFontsReady())
      .then(
        () => {
          if (disposed || generation !== fontWaitGeneration) return
          requestFit()
        },
        (error: unknown) => {
          if (disposed || generation !== fontWaitGeneration) return
          handleError('fonts', error)
        },
      )
  }

  const disconnectObserver = (): void => {
    try {
      resizeObserver?.disconnect()
    } catch {
      // Observer disconnect must not break view updates.
    }
    resizeObserver = null
    observedHost = null
  }

  const connectObserver = (host: HTMLElement): void => {
    if (resizeObserver && observedHost === host) return
    disconnectObserver()
    if (!currentViewOptions.visible || disposed) return

    try {
      const observer = dependencies.createResizeObserver(() => {
        if (disposed || !currentViewOptions.visible || currentHost !== host) return
        fitDirty = true
        requestFit()
      })
      observer.observe(host)
      resizeObserver = observer
      observedHost = host
    } catch (error) {
      handleError('observe', error)
      resizeObserver = null
      observedHost = null
    }
  }

  const removeRuntimeRoot = (): void => {
    try {
      if (runtimeRoot.parentElement) runtimeRoot.parentElement.removeChild(runtimeRoot)
      else runtimeRoot.remove?.()
    } catch (error) {
      report(dependencies, target, 'removeRoot', error)
    }
  }

  const focus = (): void => {
    if (disposed) return
    try {
      currentViewOptions.onFocus()
    } catch (error) {
      handleError('focus', error)
    }
    try {
      terminal.focus()
    } catch (error) {
      handleError('focus', error)
    }
  }

  const setReconnecting = (reconnecting: boolean): void => {
    if (disposed) return
    updateSnapshot({ reconnecting })
  }

  const hasSelection = (): boolean => {
    if (disposed) return false
    try {
      return terminal.hasSelection()
    } catch (error) {
      handleError('hasSelection', error)
      return false
    }
  }

  const getSelection = (): string => {
    if (disposed) return ''
    try {
      return terminal.getSelection()
    } catch (error) {
      handleError('getSelection', error)
      return ''
    }
  }

  const selectAll = (): void => {
    if (disposed) return
    try {
      terminal.selectAll()
    } catch (error) {
      handleError('selectAll', error)
    }
  }

  const paste = (data: string): void => {
    if (disposed) return
    try {
      terminal.paste(data)
    } catch (error) {
      handleError('paste', error)
    }
  }

  const openBrowserTile = (url: string): void => {
    if (disposed || !currentViewOptions.onOpenBrowserTile) return
    try {
      currentViewOptions.onOpenBrowserTile(url)
    } catch (error) {
      handleError('openBrowserTile', error)
    }
  }

  const openFileTile = (
    relativePath: string,
    options?: FileTileOpenOptions,
  ): void | Promise<void> => {
    if (disposed || !currentViewOptions.onOpenFileTile) return
    try {
      const result = currentViewOptions.onOpenFileTile(relativePath, options)
      if (!result || typeof (result as Promise<void>).then !== 'function') return
      return Promise.resolve(result).catch((error: unknown) => {
        if (!disposed) handleError('openFileTile', error)
      })
    } catch (error) {
      handleError('openFileTile', error)
    }
  }

  const park = (parkingRoot?: HTMLElement | null): void => {
    if (disposed) return

    currentViewOptions = { ...currentViewOptions, visible: false, autoFocus: false }
    currentHost = null
    fitDirty = true
    forceRefresh = false
    fontWaitGeneration += 1
    disconnectObserver()
    fitScheduler.cancelPending()

    const root = parkingRoot === undefined ? dependencies.getParkingRoot() : parkingRoot
    if (!root) {
      removeRuntimeRoot()
      return
    }

    if (root.isConnected === false) {
      report(dependencies, target, 'park', new Error('Terminal parking root is not connected'))
      removeRuntimeRoot()
      return
    }

    try {
      root.appendChild(runtimeRoot)
    } catch (error) {
      report(dependencies, target, 'park', error)
      removeRuntimeRoot()
    }
  }

  const attachNewHost = (host: HTMLElement, next: TerminalRuntimeViewOptions, previous: TerminalRuntimeViewOptions): void => {
    fitScheduler.cancelPending()
    disconnectObserver()
    currentHost = host
    currentViewOptions = next
    fitDirty = true
    forceRefresh = false
    fontWaitGeneration += 1

    try {
      host.replaceChildren(runtimeRoot)
    } catch (error) {
      currentHost = null
      report(dependencies, target, 'attachHost', error)
      park()
      return
    }

    // Apply mutable options after the root is in the host. Auto-focus must
    // run against the visible DOM node, not the parking root or a prior host.
    applyChangedViewOptions(previous, next)
    connectObserver(host)
    if (!currentViewOptions.visible) return

    focusIfAutoFocus()
    forceRefresh = true
    retryAfterFonts()
    requestFit()
  }

  const applySameHostViewUpdate = (next: TerminalRuntimeViewOptions): void => {
    const previous = currentViewOptions
    const host = currentHost
    if (!host) return

    if (previous.visible && !next.visible) {
      currentViewOptions = next
      applyChangedViewOptions(previous, next)
      fitScheduler.cancelPending()
      disconnectObserver()
      fitDirty = true
      forceRefresh = false
      fontWaitGeneration += 1
      return
    }

    if (!previous.visible && next.visible) {
      currentViewOptions = next
      applyChangedViewOptions(previous, next)
      connectObserver(host)
      focusIfAutoFocus()
      fitDirty = true
      forceRefresh = true
      retryAfterFonts()
      requestFit()
      return
    }

    const fontChanged = previous.fontSize !== next.fontSize
    const edgeChanged = previous.edgeToEdge !== next.edgeToEdge
    const themeChanged = previous.themeId !== next.themeId
    const autoFocusGained = next.autoFocus && !previous.autoFocus
    currentViewOptions = next
    applyChangedViewOptions(previous, next)

    if (fontChanged || edgeChanged) {
      connectObserver(host)
      if (next.visible && next.autoFocus) focus()
      if (!next.visible) {
        fitDirty = true
        forceRefresh = false
        fitScheduler.cancelPending()
        return
      }
      fitDirty = true
      forceRefresh = true
      retryAfterFonts()
      requestFit()
      return
    }

    if (themeChanged) {
      if (next.visible) refreshTerminal()
      if (autoFocusGained) focusIfAutoFocus()
      return
    }

    if (autoFocusGained) focusIfAutoFocus()
  }

  const attachHost = (host: HTMLElement | null, nextOptions?: TerminalRuntimeViewOptions): void => {
    if (disposed) return

    const next = mergeViewOptions(currentViewOptions, nextOptions)
    if (!host) {
      const previous = currentViewOptions
      currentViewOptions = next
      applyChangedViewOptions(previous, next)
      park()
      return
    }

    if (host === currentHost && runtimeRoot.parentElement === host) {
      applySameHostViewUpdate(next)
      return
    }

    attachNewHost(host, next, currentViewOptions)
  }

  const updateView = (nextOptions: TerminalRuntimeViewOptions): void => {
    if (disposed) return
    const next = mergeViewOptions(currentViewOptions, nextOptions)
    if (currentHost && runtimeRoot.parentElement === currentHost) {
      applySameHostViewUpdate(next)
      return
    }
    if (currentHost) {
      attachNewHost(currentHost, next, currentViewOptions)
      return
    }

    const previousNoHost = currentViewOptions
    currentViewOptions = next
    applyChangedViewOptions(previousNoHost, next)
    if (!currentViewOptions.visible) fitScheduler.cancelPending()
    else requestFit()
  }

  const dispose = (destroyPty: boolean): Promise<void> => {
    if (disposePromise) return disposePromise

    const identity = currentIdentity
    disposed = true
    currentIdentity = null
    currentHost = null
    currentViewOptions = { ...currentViewOptions, visible: false, autoFocus: false }
    fontWaitGeneration += 1
    fitScheduler.cancelPending()
    disconnectObserver()
    forceRefresh = false
    fitDirty = false
    replayController?.dispose()
    replayController = null

    for (const disposable of dataDisposers.splice(0)) disposeListener(disposable)
    listeners.clear()

    try {
      terminal.dispose()
    } catch (error) {
      report(dependencies, target, 'disposeTerminal', error)
    }
    removeRuntimeRoot()

    disposePromise = (async () => {
      if (!identity) return
      try {
        if (destroyPty) await dependencies.bridge.destroy(identity)
        else await dependencies.bridge.detach(identity)
      } catch (error) {
        report(dependencies, target, destroyPty ? 'destroy' : 'detach', error)
      }
    })()

    return disposePromise
  }

  const runtime: TerminalRuntime = {
    target,
    terminal,
    runtimeRoot,
    startReplay: (result) => {
      if (disposed || replayStarted || !replayController) return
      replayStarted = true
      replayController.replay({
        buffer: sanitizeTerminalReplayBuffer(result.buffer),
        exitEvent: result.exitEvent,
      })
    },
    attachHost,
    updateView,
    focus,
    hasSelection,
    getSelection,
    selectAll,
    paste,
    setReconnecting,
    acknowledgeAgentAlert,
    openBrowserTile,
    openFileTile,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    park,
    dispose,
  }

  const identity = created.identity
  replayController = createTerminalReplayController({
    isCurrent: () => isCurrentIdentity(identity),
    write: (data, callback) => {
      if (!isCurrentIdentity(identity)) return
      try {
        terminal.write(data, callback)
      } catch (error) {
        handleError('replay', error)
      }
    },
    onData: (data) => processOutput(identity, data),
    onExit: (event) => {
      if (!isCurrentIdentity(identity)) return
      processExited = true
      updateSnapshot({ exitEvent: event, reconnecting: false })
    },
    onReplayComplete: () => {
      if (!isCurrentIdentity(identity)) return
      replayComplete = true
      fitDirty = true
      updateSnapshot({ preparing: false })
      requestFit()
    },
  })

  if (terminal.onData) {
    dataDisposers.push(terminal.onData((data) => writeInput(identity, data)))
  }

  try {
    dataDisposers.push(dependencies.bridge.onData(identity, replayController.onData))
  } catch (error) {
    handleError('onData', error)
  }

  try {
    dataDisposers.push(dependencies.bridge.onExit(identity, replayController.onExit))
  } catch (error) {
    handleError('onExit', error)
  }

  if (terminal.onTitleChange) {
    dataDisposers.push(terminal.onTitleChange((title) => {
      if (!isCurrentIdentity(identity)) return
      updateSnapshot({ title })
      try {
        dependencies.onTitle(target, title)
      } catch (error) {
        handleError('title', error)
      }
    }))
  }

  const textarea = terminal.textarea
  if (textarea) {
    const focusListener = () => handleTerminalFocus(identity)
    try {
      textarea.addEventListener('focus', focusListener)
      dataDisposers.push(() => textarea.removeEventListener('focus', focusListener))
    } catch (error) {
      report(dependencies, target, 'focusListener', error)
    }
  }

  if (dependencies.bridge.onAgentAlert) {
    try {
      dataDisposers.push(dependencies.bridge.onAgentAlert(target.tileId, () => {
        // Agent alerts are handled by the main process. This listener only
        // remains identity-scoped so an obsolete runtime cannot acknowledge it.
        if (!isCurrentIdentity(identity)) return
      }))
    } catch (error) {
      report(dependencies, target, 'onAgentAlert', error)
    }
  }

  return runtime
}

export async function createTerminalRuntime(
  options: TerminalRuntimeCreateOptions,
): Promise<TerminalRuntime>
export async function createTerminalRuntime(
  options: TerminalRuntimeFlatCreateOptions,
): Promise<TerminalRuntime>
export async function createTerminalRuntime(
  target: TerminalSessionTarget,
  createOptions: TerminalCreateOptions,
  dependencies: TerminalRuntimeDependencies,
  viewOptions?: TerminalRuntimeViewOptions,
): Promise<TerminalRuntime>
export async function createTerminalRuntime(
  inputOrTarget: TerminalRuntimeCreateOptions | TerminalRuntimeFlatCreateOptions | TerminalSessionTarget,
  positionalCreateOptions?: TerminalCreateOptions,
  positionalDependencies?: TerminalRuntimeDependencies,
  positionalViewOptions?: TerminalRuntimeViewOptions,
): Promise<TerminalRuntime> {
  const factoryInput = typeof positionalCreateOptions === 'undefined'
    ? normalizeFactoryInput(inputOrTarget as TerminalRuntimeCreateOptions | TerminalRuntimeFlatCreateOptions)
    : {
        target: inputOrTarget as TerminalSessionTarget,
        createOptions: positionalCreateOptions,
        dependencies: positionalDependencies!,
        viewOptions: positionalViewOptions,
      }
  const {
    target,
    createOptions,
    dependencies,
  } = factoryInput
  const initialViewOptions = { ...DEFAULT_VIEW_OPTIONS, ...factoryInput.viewOptions }

  let created: TerminalCreateResult
  try {
    created = await dependencies.bridge.create(target, createOptions)
  } catch (error) {
    report(dependencies, target, 'create', error)
    throw error
  }

  const expectedIdentity: TerminalSessionIdentity = {
    ...target,
    generation: created.identity.generation,
  }
  if (!sameTerminalSessionIdentity(created.identity, expectedIdentity)) {
    const error = new Error('Terminal create returned an inconsistent session identity')
    try {
      // The returned identity is not verified for this target. Detach the
      // renderer boundary without risking an unrelated durable session.
      await dependencies.bridge.detach(created.identity)
    } catch (cleanupError) {
      report(dependencies, target, 'detach', cleanupError)
    }
    report(dependencies, target, 'create', error)
    throw error
  }

  let runtimeRoot: HTMLDivElement | null = null
  let terminal: TerminalLike | null = null
  let runtime: TerminalRuntime | null = null
  let failedOperation = 'runtime'

  try {
    runtimeRoot = dependencies.createElement()
    terminal = dependencies.createTerminal({
      cols: created.cols,
      rows: created.rows,
    })
    const fitAddon = dependencies.createFitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(runtimeRoot)
    applyTerminalOptions(runtimeRoot, terminal, initialViewOptions)

    runtime = createRuntime(
      target,
      dependencies,
      initialViewOptions,
      created,
      terminal,
      fitAddon,
      runtimeRoot,
    )

    failedOperation = 'attach'
    let attached: TerminalCreateResult
    attached = await dependencies.bridge.attach(created.identity)

    if (!sameTerminalSessionIdentity(attached.identity, created.identity)) {
      const error = new Error('Terminal attach returned an inconsistent session identity')
      await runtime.dispose(false)
      throw error
    }

    // The runtime starts replay only after renderer delivery is attached.
    // `createRuntime` registered all listeners before this bridge call.
    failedOperation = 'replay'
    runtime.startReplay(attached)
    return runtime
  } catch (error) {
    if (runtime) {
      await runtime.dispose(false)
    } else {
      if (terminal) {
        try {
          terminal.dispose()
        } catch {
          // Preserve the original startup error.
        }
      }
      try {
        await dependencies.bridge.detach(created.identity)
      } catch (cleanupError) {
        report(dependencies, target, 'detach', cleanupError)
      }
    }
    try {
      if (runtimeRoot) {
        if (runtimeRoot.parentElement) runtimeRoot.parentElement.removeChild(runtimeRoot)
        else runtimeRoot.remove?.()
      }
    } catch {
      // Preserve the original startup error.
    }
    report(dependencies, target, failedOperation, error)
    throw error
  }
}
