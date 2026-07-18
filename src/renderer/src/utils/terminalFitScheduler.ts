export interface TerminalFitDimensions {
  cols: number
  rows: number
}

export interface TerminalFitAddonLike {
  fit: () => void
  proposeDimensions: () => TerminalFitDimensions | undefined
}

interface TerminalFitSchedulerOptions {
  requestFrame?: (callback: () => void) => number
  cancelFrame?: (handle: number) => void
}

export function createTerminalFitScheduler(options: TerminalFitSchedulerOptions = {}) {
  const requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle))
  let pendingFrame: number | null = null
  let lastDimensions: TerminalFitDimensions | null = null

  return {
    requestFit(
      fitAddon: TerminalFitAddonLike,
      resizeTerminal: (cols: number, rows: number) => void,
    ): void {
      if (pendingFrame !== null) return

      const fit = (): void => {
        let dimensions: TerminalFitDimensions | undefined
        try {
          fitAddon.fit()
          dimensions = fitAddon.proposeDimensions()
        } catch {
          return
        }

        if (!dimensions?.cols || !dimensions?.rows) return

        if (
          lastDimensions &&
          lastDimensions.cols === dimensions.cols &&
          lastDimensions.rows === dimensions.rows
        ) {
          return
        }

        lastDimensions = { cols: dimensions.cols, rows: dimensions.rows }
        resizeTerminal(dimensions.cols, dimensions.rows)
      }

      pendingFrame = requestFrame(() => {
        pendingFrame = requestFrame(() => {
          pendingFrame = null
          fit()
        })

        fit()
      })
    },

    cancelPending(): void {
      if (pendingFrame === null) return
      cancelFrame(pendingFrame)
      pendingFrame = null
    },
  }
}
