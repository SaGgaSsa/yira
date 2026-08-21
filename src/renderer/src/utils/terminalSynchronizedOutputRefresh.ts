type RequestAnimationFrame = (callback: () => void) => number
type CancelAnimationFrame = (handle: number) => void

interface Disposable {
  dispose: () => void
}

interface TerminalParserLike {
  registerCsiHandler: (
    identifier: { prefix?: string; final: string },
    handler: (params: (number | number[])[]) => boolean,
  ) => Disposable
}

interface RegisterSynchronizedOutputRefreshOptions {
  parser: TerminalParserLike
  refresh: (start: number, end: number) => void
  getRows: () => number
  isVisible: () => boolean
  requestFrame?: RequestAnimationFrame
  cancelFrame?: CancelAnimationFrame
}

function containsSynchronizedOutputMode(params: (number | number[])[]): boolean {
  return params.some((param) => (
    Array.isArray(param) ? param.includes(2026) : param === 2026
  ))
}

export function registerSynchronizedOutputRefresh({
  parser,
  refresh,
  getRows,
  isVisible,
  requestFrame = (callback) => window.requestAnimationFrame(callback),
  cancelFrame = (handle) => window.cancelAnimationFrame(handle),
}: RegisterSynchronizedOutputRefreshOptions): () => void {
  let pendingFrame: number | null = null

  const handler = parser.registerCsiHandler({ prefix: '?', final: 'l' }, (params) => {
    if (!containsSynchronizedOutputMode(params) || pendingFrame !== null) return false

    pendingFrame = requestFrame(() => {
      pendingFrame = null
      const rows = getRows()
      if (!isVisible() || rows < 1) return
      refresh(0, rows - 1)
    })

    return false
  })

  return () => {
    if (pendingFrame !== null) cancelFrame(pendingFrame)
    pendingFrame = null
    handler.dispose()
  }
}
