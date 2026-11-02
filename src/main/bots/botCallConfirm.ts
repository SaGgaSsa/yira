import { randomUUID } from 'node:crypto'

import type { BotCallConfirmRequest } from '@shared/bots'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_PROMPT_LENGTH = 500

export interface BotCallConfirmBrokerOptions {
  /** Delivers the request to the user's window; false when there is none. */
  send: (request: BotCallConfirmRequest) => boolean
  timeoutMs?: number
}

interface PendingRequest {
  resolve: (allowed: boolean) => void
  timer: ReturnType<typeof setTimeout>
}

/** Asks the user to allow a bot session to start another bot and waits for the answer. */
export class BotCallConfirmBroker {
  private readonly send: (request: BotCallConfirmRequest) => boolean

  private readonly timeoutMs: number

  private readonly pending = new Map<string, PendingRequest>()

  constructor(options: BotCallConfirmBrokerOptions) {
    this.send = options.send
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  /** Resolves true only when the user allows the call; no window, timeout and denial resolve false. */
  request(input: Omit<BotCallConfirmRequest, 'requestId'>): Promise<boolean> {
    const request: BotCallConfirmRequest = {
      ...input,
      requestId: randomUUID(),
      prompt: input.prompt.trim().slice(0, MAX_PROMPT_LENGTH),
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(request.requestId, false), this.timeoutMs)
      this.pending.set(request.requestId, { resolve, timer })

      let delivered = false
      try {
        delivered = this.send(request)
      } catch {
        delivered = false
      }
      if (!delivered) this.settle(request.requestId, false)
    })
  }

  /** The first valid answer wins. Returns false for unknown or already answered requests. */
  respond(requestId: unknown, allowed: unknown): boolean {
    if (typeof requestId !== 'string' || typeof allowed !== 'boolean') return false
    return this.settle(requestId, allowed)
  }

  private settle(requestId: string, allowed: boolean): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return false
    this.pending.delete(requestId)
    clearTimeout(entry.timer)
    entry.resolve(allowed)
    return true
  }
}
