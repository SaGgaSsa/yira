import type { TerminalExitEvent } from '@shared/types'

interface TerminalEventListener {
  isDestroyed(): boolean
  send(channel: string, payload: TerminalExitEvent): void
}

export function broadcastTerminalExit<T extends TerminalEventListener>(
  listeners: Set<T>,
  tileId: string,
  event: TerminalExitEvent,
): void {
  for (const listener of [...listeners]) {
    if (listener.isDestroyed()) {
      listeners.delete(listener)
      continue
    }

    try {
      listener.send(`terminal:exit:${tileId}`, event)
    } catch {
      listeners.delete(listener)
    }
  }
}

export class TerminalExitState<T extends TerminalEventListener> {
  private listeners: Set<T> | null = null

  private exitEvent: TerminalExitEvent | undefined

  constructor(private readonly tileId: string) {}

  get event(): TerminalExitEvent | undefined {
    return this.exitEvent
  }

  attach(listeners: Set<T>): void {
    this.listeners = listeners
    if (this.exitEvent) broadcastTerminalExit(listeners, this.tileId, this.exitEvent)
  }

  record(event: TerminalExitEvent): void {
    this.exitEvent = event
    if (this.listeners) broadcastTerminalExit(this.listeners, this.tileId, event)
  }
}
