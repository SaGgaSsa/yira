export const TERMINAL_SHUTDOWN_TIMEOUT_MS = 3_000

export interface ManagedPty {
  kill(): void
  onExit?(callback: () => void): void
}

export interface ManagedTerminalSession {
  pty: ManagedPty
  onCleanup: () => void
  onProcessExit?: () => void
  onDispose?: () => void
}

export interface DeletedTerminalSession {
  session: ManagedTerminalSession
  killRequested: boolean
}

export interface TerminalSessionManagerOptions {
  timeoutMs?: number
}

export interface TerminalShutdownResult {
  requested: number
  exited: number
  timedOut: number
}

interface ManagedSessionRecord {
  session: ManagedTerminalSession
  exited: boolean
  processExitNotified: boolean
  killRequested: boolean
  exitPromise: Promise<void>
  resolveExit: () => void
  cleanedUp: boolean
}

export class TerminalSessionManager {
  private readonly sessions = new Map<string, ManagedSessionRecord>()

  private readonly timeoutMs: number

  private acceptingSessions = true

  private shutdownPromise: Promise<TerminalShutdownResult> | undefined

  constructor(options: TerminalSessionManagerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? TERMINAL_SHUTDOWN_TIMEOUT_MS
  }

  add(id: string, session: ManagedTerminalSession): void {
    if (!this.acceptingSessions) {
      throw new Error('Cannot add terminal session while shutting down')
    }

    const previous = this.sessions.get(id)
    if (previous) this.cleanup(previous)

    let resolveExit: () => void = () => undefined
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve
    })
    const record: ManagedSessionRecord = {
      session,
      exited: false,
      processExitNotified: false,
      killRequested: false,
      exitPromise,
      resolveExit,
      cleanedUp: false,
    }

    this.sessions.set(id, record)
    session.pty.onExit?.(() => {
      if (record.exited) return
      record.exited = true
      if (!record.processExitNotified) {
        record.processExitNotified = true
        try {
          record.session.onProcessExit?.()
        } catch {
          // A process-exit callback must not prevent shutdown bookkeeping.
        }
      }
      record.resolveExit()
    })
  }

  get(id: string): ManagedTerminalSession | undefined {
    return this.sessions.get(id)?.session
  }

  delete(id: string): DeletedTerminalSession | undefined {
    const record = this.sessions.get(id)
    if (!record) return undefined

    this.sessions.delete(id)
    this.cleanup(record)
    return {
      session: record.session,
      killRequested: record.killRequested,
    }
  }

  isAcceptingSessions(): boolean {
    return this.acceptingSessions
  }

  shutdownAll(): Promise<TerminalShutdownResult> {
    if (this.shutdownPromise) return this.shutdownPromise

    this.acceptingSessions = false
    const snapshot = [...this.sessions.values()]
    this.shutdownPromise = this.drain(snapshot)
    return this.shutdownPromise
  }

  private async drain(snapshot: ManagedSessionRecord[]): Promise<TerminalShutdownResult> {
    const requested = snapshot.length
    if (requested === 0) {
      this.sessions.clear()
      return { requested: 0, exited: 0, timedOut: 0 }
    }

    for (const record of snapshot) this.cleanup(record)

    for (const record of snapshot) {
      record.killRequested = true
      try {
        record.session.pty.kill()
      } catch {
        // A failed PTY must not prevent other sessions from being terminated.
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(resolve, this.timeoutMs)
    })

    try {
      await Promise.race([
        Promise.all(snapshot.map((record) => record.exitPromise)),
        timeout,
      ])
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }

    const exited = snapshot.filter((record) => record.exited).length
    this.sessions.clear()
    return { requested, exited, timedOut: requested - exited }
  }

  private cleanup(record: ManagedSessionRecord): void {
    if (record.cleanedUp) return
    record.cleanedUp = true
    try {
      const onDispose = record.session.onDispose ?? record.session.onCleanup
      onDispose?.()
    } catch {
      // Cleanup for one session must not prevent cleanup or shutdown of others.
    }
  }
}
