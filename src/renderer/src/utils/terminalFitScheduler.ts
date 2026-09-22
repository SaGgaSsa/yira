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

  return {
    requestFit(
      fitAddon: TerminalFitAddonLike,
      resizeTerminal: (cols: number, rows: number) => void,
      onComplete?: (result: TerminalFitResult) => void,
    ): void {
      if (pendingFrame !== null) return

      const fit = (): void => {
        let result: TerminalFitResult = 'unmeasurable'
        try {
          fitAddon.fit()
          const dimensions = fitAddon.proposeDimensions()

          if (!dimensions
            || !Number.isFinite(dimensions.cols)
            || !Number.isFinite(dimensions.rows)
            || dimensions.cols <= 0
            || dimensions.rows <= 0) {
            // Preserve an unmeasurable result for the completion callback.
          } else {
            const normalizedDimensions = {
              cols: Math.floor(dimensions.cols),
              rows: Math.floor(dimensions.rows),
            }

            if (normalizedDimensions.cols > 0 && normalizedDimensions.rows > 0) {
              if (
                lastDimensions
                && lastDimensions.cols === normalizedDimensions.cols
                && lastDimensions.rows === normalizedDimensions.rows
              ) {
                result = 'unchanged'
              } else {
                resizeTerminal(normalizedDimensions.cols, normalizedDimensions.rows)
                lastDimensions = normalizedDimensions
                result = 'fitted'
              }
            }
          }
        } catch {
          // Keep fit and resize failures contained inside the scheduler.
        }

        try {
          onComplete?.(result)
        } catch {
          // Completion callbacks must not escape the animation frame.
        }
      }

      pendingFrame = requestFrame(() => {
        pendingFrame = requestFrame(() => {
          pendingFrame = null
          fit()
        })
      })
    },

    cancelPending(): void {
      if (pendingFrame === null) return
      cancelFrame(pendingFrame)
      pendingFrame = null
    },
  }
}
