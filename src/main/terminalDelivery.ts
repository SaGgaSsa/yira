import type { TerminalExitEvent } from '@shared/types'
import {
  sameTerminalSessionIdentity,
  terminalSessionDataChannel,
  terminalSessionExitChannel,
  type TerminalSessionIdentity,
} from '@shared/terminalSessionIdentity'

export interface TerminalDeliveryListener {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

export class TerminalDelivery<T extends TerminalDeliveryListener> {
  private readonly listeners = new Set<T>()

  private buffer = ''

  private exitEvent: TerminalExitEvent | undefined

  private disposed = false

  constructor(
    readonly identity: TerminalSessionIdentity,
    private readonly maxBufferLength: number,
  ) {}

  append(data: string): void {
    if (this.disposed) return
    this.buffer = this.maxBufferLength > 0
      ? (this.buffer + data).slice(-this.maxBufferLength)
      : ''
    this.broadcast(terminalSessionDataChannel(this.identity), data)
  }

  recordExit(event: TerminalExitEvent): void {
    if (this.disposed) return
    this.exitEvent = event
    this.broadcast(terminalSessionExitChannel(this.identity), event)
  }

  attach(identity: TerminalSessionIdentity, listener: T): boolean {
    if (this.disposed || !sameTerminalSessionIdentity(this.identity, identity)) return false
    this.listeners.add(listener)
    if (this.exitEvent) this.sendToListener(listener, terminalSessionExitChannel(this.identity), this.exitEvent)
    return true
  }

  detach(identity: TerminalSessionIdentity, listener: T): boolean {
    if (!sameTerminalSessionIdentity(this.identity, identity)) return false
    return this.listeners.delete(listener)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
  }

  snapshot(): {
    identity: TerminalSessionIdentity
    buffer: string
    exitEvent?: TerminalExitEvent
  } {
    return {
      identity: { ...this.identity },
      buffer: this.buffer,
      ...(this.exitEvent ? { exitEvent: { ...this.exitEvent } } : {}),
    }
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const listener of [...this.listeners]) {
      this.sendToListener(listener, channel, payload)
    }
  }

  private sendToListener(listener: T, channel: string, payload: unknown): void {
    if (this.disposed) return
    try {
      if (listener.isDestroyed()) {
        this.listeners.delete(listener)
        return
      }
      listener.send(channel, payload)
    } catch {
      this.listeners.delete(listener)
    }
  }
}
