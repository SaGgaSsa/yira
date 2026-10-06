import type {
  AgentActiveSession,
  AgentActiveSessionSnapshot,
  AgentProvider,
  AgentSessionSurface,
  AgentSessionStatus,
} from '@shared/types'
import { normalizeAgentTerminalTitle } from '@shared/agentTerminalTitle'
import { normalizeAgentAlert, SemanticAgentAlertState, type AgentAlert } from '../agentAlerts'
import { normalizeAgentOpaqueId, isAgentProvider } from './query'
import { normalizeResumeId } from './providers'

export interface AgentSessionRegistration {
  sessionId: string
  tileId: string
  workspaceId: string
  provider: AgentProvider
  startedAt?: string
  surface?: AgentSessionSurface
  title?: string
  worktreeRoot?: string
  worktreeBranch?: string
  worktrees?: Array<{ path: string; baseSha: string }>
}

export interface AgentSessionRegistryOptions {
  now?: () => number
  alerts?: SemanticAgentAlertState
}

export type AgentSessionSnapshotSubscriber = (snapshot: AgentActiveSessionSnapshot) => void

function cloneSession(session: AgentActiveSession): AgentActiveSession {
  return {
    ...session,
    ...(session.worktrees !== undefined ? { worktrees: session.worktrees.map((worktree) => ({ ...worktree })) } : {}),
  }
}

function cloneSnapshot(snapshot: AgentActiveSessionSnapshot): AgentActiveSessionSnapshot {
  return { sessions: snapshot.sessions.map(cloneSession) }
}

function sessionKey(workspaceId: string, tileId: string): string {
  return `${workspaceId}\u0000${tileId}`
}

function timestamp(now: () => number): string {
  const value = now()
  const date = new Date(Number.isFinite(value) ? value : Date.now())
  return date.toISOString()
}

function requireSessionValue(value: unknown, label: string): string {
  const normalized = label === 'session id'
    ? normalizeResumeId(value)
    : normalizeAgentOpaqueId(value)
  if (!normalized) throw new Error(`Invalid ${label}`)
  return normalized
}

function normalizeMetadataString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u001f\u007f-\u009f]/.test(value)) {
    throw new Error(`Invalid agent ${label}`)
  }
  return value
}

function normalizeRegistration(input: AgentSessionRegistration): AgentSessionRegistration {
  const sessionId = requireSessionValue(input?.sessionId, 'session id')
  const tileId = requireSessionValue(input?.tileId, 'tile id')
  const workspaceId = requireSessionValue(input?.workspaceId, 'workspace id')
  if (!isAgentProvider(input?.provider)) throw new Error('Invalid agent provider')
  const startedAt = typeof input.startedAt === 'string' && !Number.isNaN(new Date(input.startedAt).valueOf())
    ? new Date(input.startedAt).toISOString()
    : undefined
  const surface = input.surface
  if (surface !== undefined && surface !== 'tile' && surface !== 'agents-view') {
    throw new Error('Invalid agent surface')
  }
  const title = normalizeMetadataString(input.title, 'title', 200)
  const worktreeRoot = normalizeMetadataString(input.worktreeRoot, 'worktree root', 4_096)
  const worktreeBranch = normalizeMetadataString(input.worktreeBranch, 'worktree branch', 256)
  let worktrees: Array<{ path: string; baseSha: string }> | undefined
  if (input.worktrees !== undefined) {
    if (!Array.isArray(input.worktrees) || input.worktrees.length > 32) {
      throw new Error('Invalid agent worktrees')
    }
    worktrees = input.worktrees.map((worktree) => {
      if (!worktree || typeof worktree !== 'object' || Array.isArray(worktree)) {
        throw new Error('Invalid agent worktree')
      }
      const path = normalizeMetadataString(worktree.path, 'worktree path', 4_096)
      const baseSha = normalizeMetadataString(worktree.baseSha, 'worktree base sha', 256)
      if (!path || !baseSha) throw new Error('Invalid agent worktree metadata')
      return { path, baseSha }
    })
  }
  return {
    sessionId,
    tileId,
    workspaceId,
    provider: input.provider,
    ...(startedAt ? { startedAt } : {}),
    ...(surface !== undefined ? { surface } : {}),
    ...(title !== undefined ? { title } : {}),
    ...(worktreeRoot !== undefined ? { worktreeRoot } : {}),
    ...(worktreeBranch !== undefined ? { worktreeBranch } : {}),
    ...(worktrees !== undefined ? { worktrees } : {}),
  }
}

/**
 * Session-only runtime state. No transcript or terminal output is retained;
 * the registry contains launch identity and lifecycle metadata only.
 */
export class AgentSessionRegistry {
  private readonly sessions = new Map<string, AgentActiveSession>()

  private readonly subscribers = new Set<AgentSessionSnapshotSubscriber>()

  readonly alerts: SemanticAgentAlertState

  private readonly now: () => number

  constructor(options: AgentSessionRegistryOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.alerts = options.alerts ?? new SemanticAgentAlertState()
  }

  register(input: AgentSessionRegistration): AgentActiveSession {
    const normalized = normalizeRegistration(input)
    const currentTime = timestamp(this.now)
    const key = sessionKey(normalized.workspaceId, normalized.tileId)
    const session: AgentActiveSession = {
      sessionId: normalized.sessionId,
      tileId: normalized.tileId,
      workspaceId: normalized.workspaceId,
      provider: normalized.provider,
      status: 'working',
      startedAt: normalized.startedAt ?? currentTime,
      lastActivityAt: currentTime,
      ...(normalized.surface !== undefined ? { surface: normalized.surface } : {}),
      ...(normalized.title !== undefined ? { title: normalized.title } : {}),
      ...(normalized.worktreeRoot !== undefined ? { worktreeRoot: normalized.worktreeRoot } : {}),
      ...(normalized.worktreeBranch !== undefined ? { worktreeBranch: normalized.worktreeBranch } : {}),
      ...(normalized.worktrees !== undefined ? { worktrees: normalized.worktrees } : {}),
    }
    this.sessions.set(key, session)
    this.emit()
    return cloneSession(session)
  }

  start(input: AgentSessionRegistration): AgentActiveSession {
    return this.register(input)
  }

  get(workspaceId: string, tileId: string): AgentActiveSession | null {
    const normalizedWorkspaceId = normalizeAgentOpaqueId(workspaceId)
    const normalizedTileId = normalizeAgentOpaqueId(tileId)
    if (!normalizedWorkspaceId || !normalizedTileId) return null
    const session = this.sessions.get(sessionKey(normalizedWorkspaceId, normalizedTileId))
    return session ? cloneSession(session) : null
  }

  snapshot(workspaceId?: string): AgentActiveSessionSnapshot {
    const normalizedWorkspaceId = workspaceId === undefined ? undefined : normalizeAgentOpaqueId(workspaceId)
    if (workspaceId !== undefined && !normalizedWorkspaceId) return { sessions: [] }
    const sessions = [...this.sessions.values()]
      .filter((session) => !normalizedWorkspaceId || session.workspaceId === normalizedWorkspaceId)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.tileId.localeCompare(right.tileId))
      .map(cloneSession)
    return { sessions }
  }

  getSnapshot(workspaceId?: string): AgentActiveSessionSnapshot {
    return this.snapshot(workspaceId)
  }

  subscribe(subscriber: AgentSessionSnapshotSubscriber, workspaceId?: string): () => void {
    const normalizedWorkspaceId = workspaceId === undefined ? undefined : normalizeAgentOpaqueId(workspaceId)
    if (workspaceId !== undefined && !normalizedWorkspaceId) {
      subscriber({ sessions: [] })
      return () => undefined
    }
    const callback = normalizedWorkspaceId
      ? (snapshot: AgentActiveSessionSnapshot) => subscriber({
          sessions: snapshot.sessions.filter((session) => session.workspaceId === normalizedWorkspaceId),
        })
      : subscriber
    this.subscribers.add(callback)
    this.notifySubscriber(callback, this.snapshot())
    return () => this.subscribers.delete(callback)
  }

  updateStatus(workspaceId: string, tileId: string, status: AgentSessionStatus): boolean {
    if (!['working', 'needs-input', 'done', 'exited'].includes(status)) return false
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    if (!session || session.status === 'exited' || session.status === status) return false
    session.status = status
    session.lastActivityAt = timestamp(this.now)
    this.emit()
    return true
  }

  /** Record the title the agent set on its terminal; an empty title is ignored. */
  updateLiveTitle(workspaceId: string, tileId: string, title: string): boolean {
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    const liveTitle = normalizeAgentTerminalTitle(title)
    if (!session || session.status === 'exited' || !liveTitle || session.liveTitle === liveTitle) return false
    session.liveTitle = liveTitle
    this.emit()
    return true
  }

  markWorking(workspaceId: string, tileId: string): boolean {
    const session = this.get(workspaceId, tileId)
    if (!session || session.status === 'exited') return false
    const changed = this.updateStatus(workspaceId, tileId, 'working')
    this.alerts.clearOnInput(tileId)
    return changed
  }

  /** Record terminal input/output activity and clear an intervention episode. */
  recordActivity(workspaceId: string, tileId: string): boolean {
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    if (!session || session.status === 'exited') return false
    session.status = 'working'
    session.lastActivityAt = timestamp(this.now)
    this.alerts.clearOnInput(tile)
    this.emit()
    return true
  }

  markNeedsInput(workspaceId: string, tileId: string): boolean {
    return this.updateStatus(workspaceId, tileId, 'needs-input')
  }

  markDone(workspaceId: string, tileId: string): boolean {
    return this.updateStatus(workspaceId, tileId, 'done')
  }

  markExited(workspaceId: string, tileId: string): boolean {
    const session = this.get(workspaceId, tileId)
    if (!session || session.status === 'exited') return false
    const changed = this.updateStatus(workspaceId, tileId, 'exited')
    this.alerts.clearOnDestroy(tileId)
    return changed
  }

  /** Translate a minimal semantic hook alert into runtime status. */
  reportAgentAlert(input: unknown, workspaceId?: string): boolean {
    const alert = normalizeAgentAlert(input)
    if (!alert) return false
    const matching = [...this.sessions.values()].filter((session) => {
      return session.tileId === alert.tileId && session.provider === alert.provider &&
        (workspaceId === undefined || session.workspaceId === workspaceId)
    })
    if (matching.length !== 1) return false
    if (matching[0].status === 'exited') return false
    if (!this.alerts.report(alert)) return false
    const session = matching[0]
    const status: AgentSessionStatus = alert.event === 'completed' ? 'done' : 'needs-input'
    // The alert is still retained by SemanticAgentAlertState even if the
    // runtime status was already equal; reporting itself remains meaningful.
    if (session.status === status) return true
    session.status = status
    session.lastActivityAt = timestamp(this.now)
    this.emit()
    return true
  }

  remove(workspaceId: string, tileId: string): boolean {
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const removed = this.sessions.delete(sessionKey(workspace, tile))
    if (!removed) return false
    this.alerts.clearOnDestroy(tile)
    this.emit()
    return true
  }

  clear(): void {
    if (this.sessions.size === 0) return
    for (const session of this.sessions.values()) this.alerts.clearOnDestroy(session.tileId)
    this.sessions.clear()
    this.emit()
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const subscriber of this.subscribers) this.notifySubscriber(subscriber, snapshot)
  }

  private notifySubscriber(subscriber: AgentSessionSnapshotSubscriber, snapshot: AgentActiveSessionSnapshot): void {
    try {
      subscriber(cloneSnapshot(snapshot))
    } catch {
      // Renderer teardown and transport failures must not break main-process
      // session lifecycle updates. Drop the failed subscriber to avoid leaks.
      this.subscribers.delete(subscriber)
    }
  }
}

/** Shared main-process registry used by IPC and later terminal integration. */
export const agentSessionRegistry = new AgentSessionRegistry()

export type { AgentAlert }
