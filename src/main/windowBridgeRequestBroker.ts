import type {
  WindowClosePreparationPhase,
  WindowClosePreparationRequest,
  WindowClosePreparationResponse,
} from '@shared/types'

export type WindowPreparationPhase = WindowClosePreparationPhase
export type WindowPreparationRequest = WindowClosePreparationRequest
export type WindowPreparationResponse = WindowClosePreparationResponse

export interface RendererRequestTarget {
  id: number
  isDestroyed: () => boolean
  send: (channel: string, payload: WindowPreparationRequest) => void
}

interface PendingRequest {
  expectedTargetIds: Set<number>
  resolve: () => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

const REQUEST_CHANNEL = 'window:closePreparationRequest'

export class WindowBridgeRequestBroker {
  private readonly pending = new Map<string, PendingRequest>()
  private nextRequestSequence = 0

  request(
    targets: RendererRequestTarget[],
    phase: WindowPreparationPhase,
    timeoutMs: number,
  ): Promise<void> {
    const liveTargets = targets.filter((target) => !target.isDestroyed())
    if (liveTargets.length === 0) return Promise.resolve()

    const requestId = `window-prepare-${Date.now()}-${this.nextRequestSequence += 1}`
    const payload: WindowPreparationRequest = { requestId, phase }

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pending.delete(requestId)) return
        reject(new Error(`Timed out waiting for renderer ${phase}`))
      }, timeoutMs)

      this.pending.set(requestId, {
        expectedTargetIds: new Set(liveTargets.map((target) => target.id)),
        resolve,
        reject,
        timeoutId,
      })

      try {
        for (const target of liveTargets) target.send(REQUEST_CHANNEL, payload)
      } catch (error) {
        this.finishWithError(requestId, error)
      }
    })
  }

  respond(senderId: number, response: WindowPreparationResponse): boolean {
    const pending = this.pending.get(response.requestId)
    if (!pending || !pending.expectedTargetIds.has(senderId)) return false

    if (!response.ok) {
      this.finishWithError(response.requestId, new Error(response.error || 'Renderer preparation failed'))
      return true
    }

    pending.expectedTargetIds.delete(senderId)
    if (pending.expectedTargetIds.size > 0) return true

    clearTimeout(pending.timeoutId)
    this.pending.delete(response.requestId)
    pending.resolve()
    return true
  }

  private finishWithError(requestId: string, error: unknown): void {
    const pending = this.pending.get(requestId)
    if (!pending) return

    clearTimeout(pending.timeoutId)
    this.pending.delete(requestId)
    pending.reject(error instanceof Error ? error : new Error(String(error)))
  }
}
