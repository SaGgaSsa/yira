import type { TerminalExitEvent } from '@shared/types'

export interface TerminalReplaySnapshot {
  buffer: string
  exitEvent?: TerminalExitEvent
}

export interface TerminalReplayControllerOptions {
  isCurrent: () => boolean
  write: (data: string, callback: () => void) => void
  onData: (data: string) => void
  onExit: (event: TerminalExitEvent) => void
  onReplayComplete?: () => void
}

export interface TerminalReplayController {
  onData: (data: string) => void
  onExit: (event: TerminalExitEvent) => void
  replay: (snapshot: TerminalReplaySnapshot) => void
  dispose: () => void
}

function sameExitEvent(first: TerminalExitEvent, second: TerminalExitEvent): boolean {
  return first.exitCode === second.exitCode && first.signal === second.signal
}

export function createTerminalReplayController(
  options: TerminalReplayControllerOptions,
): TerminalReplayController {
  let disposed = false
  let replaying = true
  let replayStarted = false
  let queuedData: string[] = []
  let queuedExits: TerminalExitEvent[] = []

  const onData = (data: string): void => {
    if (disposed) return
    if (replaying) {
      queuedData.push(data)
      return
    }
    if (options.isCurrent()) options.onData(data)
  }

  const onExit = (event: TerminalExitEvent): void => {
    if (disposed) return
    if (replaying) {
      queuedExits.push(event)
      return
    }
    if (options.isCurrent()) options.onExit(event)
  }

  const dispose = (): void => {
    disposed = true
    replaying = false
    queuedData = []
    queuedExits = []
  }

  const replay = (snapshot: TerminalReplaySnapshot): void => {
    if (disposed || replayStarted) return
    replayStarted = true
    if (!options.isCurrent()) {
      dispose()
      return
    }

    const finish = (): void => {
      if (disposed || !options.isCurrent()) {
        dispose()
        return
      }

      const data = queuedData
      queuedData = []
      for (const chunk of data) {
        if (!options.isCurrent()) {
          dispose()
          return
        }
        options.onData(chunk)
      }

      const exits = queuedExits
      queuedExits = []
      if (snapshot.exitEvent && !exits.some((event) => sameExitEvent(event, snapshot.exitEvent!))) {
        exits.push(snapshot.exitEvent)
      }
      for (const event of exits) {
        if (!options.isCurrent()) {
          dispose()
          return
        }
        options.onExit(event)
      }

      replaying = false
      if (options.isCurrent()) options.onReplayComplete?.()
    }

    try {
      options.write(snapshot.buffer, finish)
    } catch {
      dispose()
    }
  }

  return { onData, onExit, replay, dispose }
}
