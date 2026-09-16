import type { AgentActiveSessionSnapshot } from '@shared/types'

export interface AgentSessionBridge {
  sessionsSnapshot: () => Promise<AgentActiveSessionSnapshot>
  subscribeSessions: () => Promise<string | false>
  unsubscribeSessions: (token: string) => Promise<boolean>
  onSessionsChanged: (callback: (snapshot: AgentActiveSessionSnapshot) => void) => () => void
}

export const EMPTY_AGENT_SESSIONS: AgentActiveSessionSnapshot = { sessions: [] }

/** Share the main process's single subscription per renderer across consumers. */
export function createAgentSessionSource(getBridge: () => AgentSessionBridge) {
  let snapshot = EMPTY_AGENT_SESSIONS
  const listeners = new Set<() => void>()
  let stop: (() => void) | undefined

  const publish = (next: AgentActiveSessionSnapshot) => {
    snapshot = next
    for (const listener of listeners) listener()
  }

  const start = () => {
    const bridge = getBridge()
    let disposed = false
    let receivedEvent = false
    let token: string | null = null
    const release = (value: string) => {
      void bridge.unsubscribeSessions(value).catch(() => undefined)
    }
    const removeListener = bridge.onSessionsChanged((next) => {
      if (disposed) return
      receivedEvent = true
      publish(next)
    })

    void bridge.subscribeSessions().then((value) => {
      if (!value) return
      if (disposed) release(value)
      else token = value
    }).catch(() => undefined)

    void bridge.sessionsSnapshot().then((next) => {
      // A delayed initial read must not replace a newer streamed snapshot.
      if (!disposed && !receivedEvent) publish(next)
    }).catch(() => undefined)

    return () => {
      disposed = true
      removeListener()
      if (token) release(token)
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      if (listeners.size === 1) stop = start()
      return () => {
        listeners.delete(listener)
        if (listeners.size > 0) return
        stop?.()
        stop = undefined
        snapshot = EMPTY_AGENT_SESSIONS
      }
    },
  }
}
