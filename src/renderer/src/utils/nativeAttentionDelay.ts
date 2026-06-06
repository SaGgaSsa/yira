import { NOTIFICATION_ATTENTION_DELAY_MS } from '@shared/types'

type TimeoutHandle = unknown

export { NOTIFICATION_ATTENTION_DELAY_MS }

export interface NativeAttentionDelayTimers {
  setTimeout: (callback: () => void, ms: number) => TimeoutHandle
  clearTimeout: (handle: TimeoutHandle) => void
}

export interface NativeAttentionDelayRequest {
  tileId: string
  delayEnabled: boolean
  muted: boolean
  shouldRequestAttention: () => boolean
  requestAttention: () => void
}

export interface NativeAttentionDelayScheduler {
  schedule: (request: NativeAttentionDelayRequest) => void
  cancel: (tileId: string) => void
  cancelAll: () => void
}

export function createNativeAttentionDelayScheduler(
  timers: NativeAttentionDelayTimers = {
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  },
): NativeAttentionDelayScheduler {
  const pending = new Map<string, TimeoutHandle>()

  const cancel = (tileId: string): void => {
    const handle = pending.get(tileId)
    if (handle === undefined) return
    timers.clearTimeout(handle)
    pending.delete(tileId)
  }

  return {
    schedule: (request) => {
      if (request.muted) {
        cancel(request.tileId)
        return
      }

      if (!request.delayEnabled) {
        cancel(request.tileId)
        request.requestAttention()
        return
      }

      if (!request.shouldRequestAttention()) {
        cancel(request.tileId)
        return
      }

      if (pending.has(request.tileId)) return

      const handle = timers.setTimeout(() => {
        pending.delete(request.tileId)
        if (request.muted || !request.shouldRequestAttention()) return
        request.requestAttention()
      }, NOTIFICATION_ATTENTION_DELAY_MS)

      pending.set(request.tileId, handle)
    },
    cancel,
    cancelAll: () => {
      for (const handle of pending.values()) {
        timers.clearTimeout(handle)
      }
      pending.clear()
    },
  }
}
