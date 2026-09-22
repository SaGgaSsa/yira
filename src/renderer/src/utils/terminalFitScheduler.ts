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
  ) => void
  cancelPending: () => void
}

interface TerminalFitSchedulerOptions {
  requestFrame?: (callback: () => void) => number
  cancelFrame?: (handle: number) => void
}

export function createTerminalFitScheduler(options: TerminalFitSchedulerOptions = {}): TerminalFitScheduler {
  const requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle))
  let pendingFrame: number | null = null
  let lastDimensions: TerminalFitDimensions | null = null

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

      if (normalizedDimensions.cols <= 0 || normalizedDimensions.rows <= 0) return null
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
    requestFit(
      fitAddon: TerminalFitAddonLike,
      resizeTerminal: (cols: number, rows: number) => void,
      onComplete?: (result: TerminalFitResult) => void,
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

        if (lastDimensions && sameDimensions(lastDimensions, stable)) {
          complete('unchanged')
          return
        }

        try {
          resizeTerminal(stable.cols, stable.rows)
        } catch {
          // Keep fit and resize failures contained inside the scheduler.
          complete('unmeasurable')
          return
        }
        lastDimensions = stable
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
