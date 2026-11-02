import { isBotAvailableInWorkspace, type BotDefinition } from '@shared/bots'
import {
  ROUTINE_ERROR_MAX_LENGTH,
  ROUTINE_FAILURE_PAUSE_LIMIT,
  isRoutineDue,
  type Routine,
  type RoutineRunResult,
} from '@shared/routines'
import type { AgentActiveSession, AgentProvider } from '@shared/types'
import type { RoutineStore } from '../ipc/routines'

/** The reply a routine run gives when it has nothing new to report. */
export const ROUTINE_NO_UPDATE = 'NO_UPDATE'

const DEFAULT_TICK_MS = 30_000
const DEFAULT_START_DELAY_MS = 20_000

export interface RoutineSchedulerDependencies {
  store: Pick<RoutineStore, 'list' | 'get' | 'recordRun'>
  getBot: (id: string) => Promise<BotDefinition | null>
  getLauncher: () => ((input: unknown) => Promise<{ workspaceId: string; tileId: string; provider: AgentProvider }>) | null
  getSession: (workspaceId: string, tileId: string) => AgentActiveSession | null
  readLastReply: (session: AgentActiveSession) => Promise<string | null>
  closeSession: (workspaceId: string, tileId: string) => Promise<void>
  notify: (title: string, body: string) => void
  now?: () => Date
  tickMs?: number
  /** Gives Yira time to re-register sessions that survived a restart before the first tick. */
  startDelayMs?: number
}

export function buildRoutinePrompt(routine: Pick<Routine, 'name' | 'instruction'>): string {
  return [
    routine.instruction,
    '',
    '---',
    `Scheduled run of the Yira routine "${routine.name}". Do the task once. If there is nothing new to report, reply with exactly ${ROUTINE_NO_UPDATE} and nothing else.`,
  ].join('\n')
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, ROUTINE_ERROR_MAX_LENGTH)
}

function isSessionOpen(session: AgentActiveSession | null): boolean {
  return session !== null && (session.status === 'working' || session.status === 'needs-input')
}

export class RoutineScheduler {
  private readonly now: () => Date
  private readonly tickMs: number
  private readonly startDelayMs: number
  // Routines with a run or a settle in progress: one operation per routine at a time.
  private readonly busyRoutines = new Set<string>()
  private ticking = false
  private startTimer: ReturnType<typeof setTimeout> | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly deps: RoutineSchedulerDependencies) {
    this.now = deps.now ?? (() => new Date())
    this.tickMs = deps.tickMs ?? DEFAULT_TICK_MS
    this.startDelayMs = deps.startDelayMs ?? DEFAULT_START_DELAY_MS
  }

  start(): void {
    this.stop()
    this.startTimer = setTimeout(() => {
      this.startTimer = null
      void this.tick()
      this.tickTimer = setInterval(() => void this.tick(), this.tickMs)
      this.tickTimer.unref()
    }, this.startDelayMs)
    this.startTimer.unref()
  }

  stop(): void {
    if (this.startTimer) clearTimeout(this.startTimer)
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.startTimer = null
    this.tickTimer = null
  }

  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      for (const routine of await this.deps.store.list()) {
        await this.tickRoutine(routine)
      }
    } catch (error) {
      console.warn('[routines] tick failed:', errorMessage(error))
    } finally {
      this.ticking = false
    }
  }

  async runRoutine(id: string, trigger: 'schedule' | 'manual'): Promise<RoutineRunResult> {
    if (this.busyRoutines.has(id)) return 'skipped-busy'
    this.busyRoutines.add(id)
    try {
      return await this.runExclusively(id, trigger)
    } finally {
      this.busyRoutines.delete(id)
    }
  }

  private async tickRoutine(routine: Routine): Promise<void> {
    try {
      await this.settleExclusively(routine)
      if (isRoutineDue(routine, this.now())) await this.runRoutine(routine.id, 'schedule')
    } catch (error) {
      console.warn(`[routines] ${routine.id} failed:`, errorMessage(error))
    }
  }

  private async settleExclusively(routine: Routine): Promise<void> {
    if (this.busyRoutines.has(routine.id)) return
    this.busyRoutines.add(routine.id)
    try {
      await this.settleFinishedRun(routine)
    } finally {
      this.busyRoutines.delete(routine.id)
    }
  }

  /** Resolves the outcome of the last started run once its session is no longer working. */
  private async settleFinishedRun(routine: Routine): Promise<void> {
    if (routine.lastResult !== 'started' || !routine.lastTileId) return
    const session = this.deps.getSession(routine.workspaceId, routine.lastTileId)

    if (session === null || session.status === 'exited') {
      await this.deps.store.recordRun(routine.id, { lastResult: 'reported' })
      return
    }
    if (session.status !== 'done') return

    const hasNothingNew = await this.isLastReplyNoUpdate(session)
    if (hasNothingNew && await this.tryCloseSession(session)) {
      await this.deps.store.recordRun(routine.id, { lastResult: 'no-update' })
      return
    }
    await this.deps.store.recordRun(routine.id, { lastResult: 'reported' })
  }

  private async isLastReplyNoUpdate(session: AgentActiveSession): Promise<boolean> {
    try {
      return (await this.deps.readLastReply(session))?.trim() === ROUTINE_NO_UPDATE
    } catch {
      return false
    }
  }

  private async tryCloseSession(session: AgentActiveSession): Promise<boolean> {
    try {
      await this.deps.closeSession(session.workspaceId, session.tileId)
      return true
    } catch {
      // Never hide a session by mistake: if it cannot be closed, the user sees it.
      return false
    }
  }

  private async runExclusively(id: string, trigger: 'schedule' | 'manual'): Promise<RoutineRunResult> {
    let routine = await this.deps.store.get(id)
    if (!routine) throw new Error('Routine not found')
    const now = this.now()
    // Manual runs ignore enabled, pausedAt and the schedule.
    if (trigger === 'schedule' && !isRoutineDue(routine, now)) return 'skipped-busy'

    await this.settleFinishedRun(routine)
    routine = await this.deps.store.get(id)
    if (!routine) throw new Error('Routine not found')

    if (this.hasOpenRun(routine)) {
      await this.deps.store.recordRun(id, { lastRunAt: now.toISOString(), lastResult: 'skipped-busy' })
      return 'skipped-busy'
    }

    let tileId: string
    try {
      tileId = await this.launch(routine)
    } catch (error) {
      await this.recordFailure(routine, now, errorMessage(error))
      return 'failed'
    }
    await this.deps.store.recordRun(id, {
      lastRunAt: now.toISOString(),
      lastResult: 'started',
      lastTileId: tileId,
      lastError: undefined,
      consecutiveFailures: 0,
    })
    return 'started'
  }

  private hasOpenRun(routine: Routine): boolean {
    if (routine.lastResult !== 'started' || !routine.lastTileId) return false
    return isSessionOpen(this.deps.getSession(routine.workspaceId, routine.lastTileId))
  }

  private async launch(routine: Routine): Promise<string> {
    const bot = await this.deps.getBot(routine.botId)
    if (!bot) throw new Error('The bot of this routine no longer exists.')
    if (!isBotAvailableInWorkspace(bot, routine.workspaceId)) {
      throw new Error('The bot is not enabled for this workspace.')
    }
    const launcher = this.deps.getLauncher()
    if (!launcher) throw new Error('Yira is still starting.')

    const { tileId } = await launcher({
      workspaceId: routine.workspaceId,
      botId: routine.botId,
      prompt: buildRoutinePrompt(routine),
    })
    return tileId
  }

  private async recordFailure(routine: Routine, now: Date, message: string): Promise<void> {
    const failures = routine.consecutiveFailures + 1
    await this.deps.store.recordRun(routine.id, {
      lastRunAt: now.toISOString(),
      lastResult: 'failed',
      lastError: message,
      consecutiveFailures: failures,
    })
    this.deps.notify(`Routine failed: ${routine.name}`, message)

    if (failures < ROUTINE_FAILURE_PAUSE_LIMIT) return
    await this.deps.store.recordRun(routine.id, { pausedAt: now.toISOString() })
    this.deps.notify(
      `Routine paused: ${routine.name}`,
      `It failed ${failures} times in a row. Fix it and turn it on again in Settings › Bots.`,
    )
  }
}
