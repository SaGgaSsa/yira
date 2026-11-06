import type {
  AgentActiveSession,
  AgentActiveSessionSnapshot,
  AgentProvider,
  AgentSessionSurface,
  AgentSessionStatus,
} from '@shared/types'
import { normalizeAgentTerminalTitle } from '@shared/agentTerminalTitle'
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
  cwd?: string
  worktreeRoot?: string
  worktreeBranch?: string
  worktrees?: Array<{ path: string; baseSha: string }>
  botId?: string
  /** Status before the agent reports its first state. */
  initialStatus?: 'working' | 'done'
}

export interface AgentSessionRegistryOptions {
  now?: () => number
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
  const cwd = normalizeMetadataString(input.cwd, 'cwd', 4_096)
  const worktreeRoot = normalizeMetadataString(input.worktreeRoot, 'worktree root', 4_096)
  const worktreeBranch = normalizeMetadataString(input.worktreeBranch, 'worktree branch', 256)
  const botId = normalizeMetadataString(input.botId, 'bot id', 128)
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
    ...(cwd !== undefined ? { cwd } : {}),
    ...(worktreeRoot !== undefined ? { worktreeRoot } : {}),
    ...(worktreeBranch !== undefined ? { worktreeBranch } : {}),
    ...(worktrees !== undefined ? { worktrees } : {}),
    ...(botId !== undefined ? { botId } : {}),
    ...(input.initialStatus === 'working' || input.initialStatus === 'done'
      ? { initialStatus: input.initialStatus }
      : {}),
  }
}

/**
 * Session-only runtime state. No transcript or terminal output is retained;
 * the registry contains launch identity and lifecycle metadata only.
 */
export class AgentSessionRegistry {
  private readonly sessions = new Map<string, AgentActiveSession>()

  private readonly subscribers = new Set<AgentSessionSnapshotSubscriber>()

  private readonly now: () => number

  constructor(options: AgentSessionRegistryOptions = {}) {
    this.now = options.now ?? (() => Date.now())
  }

  register(input: AgentSessionRegistration): AgentActiveSession {
    const normalized = normalizeRegistration(input)
    const currentTime = timestamp(this.now)
    const key = sessionKey(normalized.workspaceId, normalized.tileId)
    const previous = this.sessions.get(key)
    // Re-registering the same live session keeps the turn status it reached.
    const keptStatus = previous?.sessionId === normalized.sessionId && previous.status !== 'exited'
      ? previous.status
      : undefined
    const keptStatusDetail = keptStatus !== undefined ? previous?.statusDetail : undefined
    const session: AgentActiveSession = {
      sessionId: normalized.sessionId,
      tileId: normalized.tileId,
      workspaceId: normalized.workspaceId,
      provider: normalized.provider,
      status: keptStatus ?? normalized.initialStatus ?? 'done',
      ...(keptStatusDetail !== undefined ? { statusDetail: keptStatusDetail } : {}),
      startedAt: normalized.startedAt ?? currentTime,
      lastActivityAt: currentTime,
      ...(normalized.surface !== undefined ? { surface: normalized.surface } : {}),
      ...(normalized.title !== undefined ? { title: normalized.title } : {}),
      ...(normalized.cwd !== undefined ? { cwd: normalized.cwd } : {}),
      ...(normalized.worktreeRoot !== undefined ? { worktreeRoot: normalized.worktreeRoot } : {}),
      ...(normalized.worktreeBranch !== undefined ? { worktreeBranch: normalized.worktreeBranch } : {}),
      ...(normalized.worktrees !== undefined ? { worktrees: normalized.worktrees } : {}),
      ...(normalized.botId !== undefined ? { botId: normalized.botId } : {}),
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

  findByTileId(tileId: string): AgentActiveSession | null {
    const normalizedTileId = normalizeAgentOpaqueId(tileId)
    if (!normalizedTileId) return null
    const matching = [...this.sessions.values()].filter((session) => session.tileId === normalizedTileId)
    return matching.length === 1 ? cloneSession(matching[0]) : null
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

  private updateStatus(workspaceId: string, tileId: string, status: AgentSessionStatus): boolean {
    if (!['working', 'needs-input', 'done', 'exited'].includes(status)) return false
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    if (!session || session.status === 'exited' || session.status === status) return false
    session.status = status
    if (status === 'exited') delete session.statusDetail
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

  /** Move a running session between the Agents View and a canvas tile. */
  updateSurface(workspaceId: string, tileId: string, surface: AgentSessionSurface): boolean {
    if (surface !== 'tile' && surface !== 'agents-view') return false
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    if (!session || session.status === 'exited' || session.surface === surface) return false
    session.surface = surface
    this.emit()
    return true
  }

  /** Apply the state the agent reported; it is the only source of the session status. */
  applyAgentState(
    workspaceId: string,
    tileId: string,
    provider: AgentProvider,
    status: 'working' | 'needs-input' | 'done',
    detail?: string,
  ): boolean {
    if (!isAgentProvider(provider)) return false
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    if (!session || session.status === 'exited' || session.provider !== provider) return false
    if (session.status === status && session.statusDetail === detail) return false
    session.status = status
    if (detail !== undefined) session.statusDetail = detail
    else delete session.statusDetail
    session.lastActivityAt = timestamp(this.now)
    this.emit()
    return true
  }

  /** Record that the user typed, without changing the status the agent reported. */
  recordActivity(workspaceId: string, tileId: string): boolean {
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const session = this.sessions.get(sessionKey(workspace, tile))
    if (!session || session.status === 'exited') return false
    session.lastActivityAt = timestamp(this.now)
    this.emit()
    return true
  }

  markExited(workspaceId: string, tileId: string): boolean {
    const session = this.get(workspaceId, tileId)
    if (!session || session.status === 'exited') return false
    return this.updateStatus(workspaceId, tileId, 'exited')
  }

  remove(workspaceId: string, tileId: string): boolean {
    const workspace = normalizeAgentOpaqueId(workspaceId)
    const tile = normalizeAgentOpaqueId(tileId)
    if (!workspace || !tile) return false
    const removed = this.sessions.delete(sessionKey(workspace, tile))
    if (!removed) return false
    this.emit()
    return true
  }

  clear(): void {
    if (this.sessions.size === 0) return
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
