export interface TerminalFitDimensions {
  cols: number
  rows: number
}

export interface TerminalFitAddonLike {
  fit: () => void
  proposeDimensions: () => TerminalFitDimensions | undefined
}

export type TerminalFitResult = 'fitted' | 'unchanged' | 'unmeasurable'

export interface TerminalFitScheduler {
  requestFit: (
    fitAddon: TerminalFitAddonLike,
    resizeTerminal: (cols: number, rows: number) => void,
    onComplete?: (result: TerminalFitResult) => void,
    getTerminalSize?: () => TerminalFitDimensions | null | undefined,
  ) => void
  cancelPending: () => void
  setKnownDimensions?: (dimensions: TerminalFitDimensions) => void
  notifyResizeFailure?: (dimensions: TerminalFitDimensions) => void
}

interface TerminalFitSchedulerOptions {
  requestFrame?: (callback: () => void) => number
  cancelFrame?: (handle: number) => void
  initialDimensions?: TerminalFitDimensions | null
}

// FitAddon clamps a zero-width host to 2 columns. A transient layout (window
// restore, panel switch) can report that clamp while the host is not hidden.
// ConPTY keeps only what fits in its buffer, so resizing to such a size drops
// the start of the screen for good. Samples below these bounds count as
// unmeasurable and never reach xterm or the PTY.
const MIN_FIT_COLS = 10
const MIN_FIT_ROWS = 2

function normalizeFitDimensions(dimensions: TerminalFitDimensions | null | undefined): TerminalFitDimensions | null {
  if (!dimensions || !Number.isFinite(dimensions.cols) || !Number.isFinite(dimensions.rows)) return null
  const normalized = { cols: Math.floor(dimensions.cols), rows: Math.floor(dimensions.rows) }
  if (normalized.cols <= 0 || normalized.rows <= 0) return null
  return normalized
}

export function createTerminalFitScheduler(options: TerminalFitSchedulerOptions = {}): TerminalFitScheduler {
  const requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle))
  let pendingFrame: number | null = null
  let lastDimensions: TerminalFitDimensions | null = normalizeFitDimensions(options.initialDimensions ?? null)

  // Bounds the read-only sampling chain during a continuous drag. Eight
  // consecutive frames cover parking/layout settling without spamming the
  // PTY, while a longer oscillation still converges to the latest size.
  const MAX_SAMPLES = 8

  const proposeReadOnly = (fitAddon: TerminalFitAddonLike): TerminalFitDimensions | null => {
    try {
      const dimensions = fitAddon.proposeDimensions()

      if (!dimensions
        || !Number.isFinite(dimensions.cols)
        || !Number.isFinite(dimensions.rows)) {
        return null
      }

      const normalizedDimensions = {
        cols: Math.floor(dimensions.cols),
        rows: Math.floor(dimensions.rows),
      }

      if (normalizedDimensions.cols < MIN_FIT_COLS || normalizedDimensions.rows < MIN_FIT_ROWS) return null
      return normalizedDimensions
    } catch {
      return null
    }
  }

  const sameDimensions = (first: TerminalFitDimensions, second: TerminalFitDimensions): boolean => (
    first.cols === second.cols && first.rows === second.rows
  )

  const sameSample = (
    first: TerminalFitDimensions | null,
    second: TerminalFitDimensions | null,
  ): boolean => {
    if (first === null && second === null) return true
    if (!first || !second) return false
    return sameDimensions(first, second)
  }

  return {
    setKnownDimensions(dimensions: TerminalFitDimensions): void {
      const normalized = normalizeFitDimensions(dimensions)
      if (normalized) lastDimensions = normalized
    },
    notifyResizeFailure(dimensions: TerminalFitDimensions): void {
      const normalized = normalizeFitDimensions(dimensions)
      if (!normalized) return
      if (lastDimensions && sameDimensions(lastDimensions, normalized)) lastDimensions = null
    },
    requestFit(
      fitAddon: TerminalFitAddonLike,
      resizeTerminal: (cols: number, rows: number) => void,
      onComplete?: (result: TerminalFitResult) => void,
      getTerminalSize?: () => TerminalFitDimensions | null | undefined,
    ): void {
      if (pendingFrame !== null) return

      let previousSample: TerminalFitDimensions | null | undefined
      let validSamples = 0

      const complete = (result: TerminalFitResult): void => {
        try {
          onComplete?.(result)
        } catch {
          // Completion callbacks must not escape the animation frame.
        }
      }

      const finishStable = (stable: TerminalFitDimensions | null): void => {
        pendingFrame = null
        if (stable === null) {
          complete('unmeasurable')
          return
        }

        // Single mutating fit, only after confirming a stable size, so xterm
        // never diverges from the PTY when a transient sample is suppressed.
        try {
          fitAddon.fit()
        } catch {
          // Keep fit and resize failures contained inside the scheduler.
          complete('unmeasurable')
          return
        }

        // Use real xterm dims after fit, not the stale stable sample. Real
        // FitAddon.fit re-proposes internally and only mutates xterm when
        // cols/rows differ, so geometry that shifted between the stable
        // sample and fit must reach the PTY to avoid xterm/PTY desync.
        let effective: TerminalFitDimensions | null = null
        try {
          const terminalSize = getTerminalSize?.()
          effective = normalizeFitDimensions(terminalSize ?? null)
        } catch {
          effective = null
        }
        if (!effective) effective = proposeReadOnly(fitAddon)
        if (!effective || effective.cols < MIN_FIT_COLS || effective.rows < MIN_FIT_ROWS) {
          complete('unmeasurable')
          return
        }

        if (lastDimensions && sameDimensions(lastDimensions, effective)) {
          complete('unchanged')
          return
        }

        try {
          resizeTerminal(effective.cols, effective.rows)
        } catch {
          // Keep fit and resize failures contained inside the scheduler.
          complete('unmeasurable')
          return
        }
        lastDimensions = effective
        complete('fitted')
      }

      const sampleStep = (): void => {
        let current: TerminalFitDimensions | null
        try {
          current = proposeReadOnly(fitAddon)
        } catch {
          current = null
        }

        if (previousSample !== undefined && sameSample(previousSample, current)) {
          finishStable(current)
          return
        }

        // Mismatch: no fit and no PTY resize. Retry on the next frame with
        // the same request so a coalesced observer event cannot lose it.
        // Null samples never force a fit; only measurable samples count
        // toward the bound so a hidden host cannot trigger a resize.
        if (current !== null) {
          validSamples += 1
          if (validSamples >= MAX_SAMPLES) {
            finishStable(current)
            return
          }
        }
        previousSample = current
        pendingFrame = requestFrame(sampleStep)
      }

      pendingFrame = requestFrame(sampleStep)
    },

    cancelPending(): void {
      if (pendingFrame === null) return
      cancelFrame(pendingFrame)
      pendingFrame = null
    },
  }
}
