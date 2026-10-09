import type {
  TerminalDaemonAlert,
  TerminalDaemonAgentState,
  TerminalDaemonEvent,
  TerminalDaemonMethods,
  TerminalDaemonSnapshot,
  TerminalDaemonSpawn,
} from '@shared/terminalDaemonProtocol'
import {
  sameTerminalSessionIdentity,
  terminalSessionDataChannel,
  terminalSessionExitChannel,
  terminalSessionLookupKey,
  type TerminalSessionIdentity,
  type TerminalSessionTarget,
} from '@shared/terminalSessionIdentity'
import type { TerminalCreateResult } from '@shared/types'
import { agentSessionRegistry, type AgentSessionRegistry } from './agents/registry'
import { AgentTerminalTitleTracker } from './agents/terminalTitle'
import { classifyAgentInput } from './agents/terminal'
import type { TerminalProcessRoot } from './terminalProcessActivity'

/** The small transport surface used by the integration and by its tests. */
export interface PersistentTerminalTransport {
  request<M extends keyof TerminalDaemonMethods>(
    method: M,
    params: TerminalDaemonMethods[M]['params'],
  ): Promise<TerminalDaemonMethods[M]['result']>
  onEvent(callback: (event: TerminalDaemonEvent) => void): () => void
  onDisconnect(callback: (error: Error) => void): () => void
  disconnect(): void
}

/** Renderer boundary. Node and the daemon token never cross this boundary. */
export interface PersistentTerminalSubscriber {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
  once?(event: 'destroyed', listener: () => void): void
  removeListener?(event: 'destroyed', listener: () => void): void
}

export interface PersistentTerminalSessionsOptions {
  connect: () => Promise<PersistentTerminalTransport>
  registry?: AgentSessionRegistry
  onAgentAlert?: (identity: TerminalSessionIdentity, alert: TerminalDaemonAlert | null) => void
  onAgentExit?: (identity: TerminalSessionIdentity) => void
  onAgentDestroyed?: (identity: TerminalSessionIdentity) => void
  /** Minimum time between agent title updates; tests shorten it. */
  agentTitleIntervalMs?: number
  onDisconnect?: (error: Error) => void
}

interface SessionRecord {
  identity: TerminalSessionIdentity
  snapshot?: TerminalDaemonSnapshot
  sequence: number
  alert?: TerminalDaemonAlert | null
  agentRegistered: boolean
  renderers: Set<PersistentTerminalSubscriber>
  rendererCleanup: Map<PersistentTerminalSubscriber, () => void>
  captures: Set<TerminalDaemonEvent[]>
  stateEvents: TerminalDaemonEvent[]
  exited: boolean
  exitNotified: boolean
}

interface EventCapture {
  events: TerminalDaemonEvent[]
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function keyFor(value: TerminalSessionTarget): string {
  return terminalSessionLookupKey(value)
}

function identityKey(identity: TerminalSessionIdentity): string {
  return `${keyFor(identity)}\u0000${identity.generation}`
}

function cloneIdentity(identity: TerminalSessionIdentity): TerminalSessionIdentity {
  return { ...identity }
}

function cloneSnapshot(snapshot: TerminalDaemonSnapshot): TerminalDaemonSnapshot {
  return {
    ...snapshot,
    identity: cloneIdentity(snapshot.identity),
    ...(snapshot.agent ? { agent: { ...snapshot.agent } } : {}),
    ...(snapshot.alert ? { alert: { ...snapshot.alert } } : {}),
    ...(snapshot.exitEvent ? { exitEvent: { ...snapshot.exitEvent } } : {}),
  }
}

export function terminalResultFromSnapshot(snapshot: TerminalDaemonSnapshot): TerminalCreateResult {
  return {
    identity: cloneIdentity(snapshot.identity),
    cols: snapshot.cols,
    rows: snapshot.rows,
    buffer: snapshot.buffer,
    ...(snapshot.exitEvent ? { exitEvent: { ...snapshot.exitEvent } } : {}),
  }
}

function alertState(alert: TerminalDaemonAlert): {
  provider: TerminalDaemonAlert['provider']
  event: TerminalDaemonAlert['event']
  tileId: string
  priority: 'normal' | 'intervention'
} {
  return {
    ...alert,
    priority: alert.event === 'completed' ? 'normal' : 'intervention',
  }
}

function eventIdentity(event: TerminalDaemonEvent): TerminalSessionIdentity {
  return event.identity
}

function isEventForIdentity(event: TerminalDaemonEvent, identity: TerminalSessionIdentity): boolean {
  return sameTerminalSessionIdentity(eventIdentity(event), identity)
}

/**
 * Owns the main-process side of durable terminal sessions.
 *
 * It keeps the daemon subscription alive independently of renderer views. A
 * renderer receives only an xterm snapshot and sequenced live events.
 */
export class PersistentTerminalSessions {
  private readonly connect: () => Promise<PersistentTerminalTransport>

  private readonly registry: AgentSessionRegistry

  private readonly onAgentAlert?: PersistentTerminalSessionsOptions['onAgentAlert']

  private readonly onAgentExit?: PersistentTerminalSessionsOptions['onAgentExit']

  private readonly onAgentDestroyed?: PersistentTerminalSessionsOptions['onAgentDestroyed']

  private readonly onDisconnect?: PersistentTerminalSessionsOptions['onDisconnect']

  /** Reads agent titles from the output stream, so it also works with daemons from older releases. */
  private readonly agentTitles: AgentTerminalTitleTracker

  private readonly sessions = new Map<string, SessionRecord>()

  private readonly targetTails = new Map<string, Promise<void>>()

  private readonly targetOperations = new Map<string, Set<Promise<unknown>>>()

  private readonly rendererTails = new Map<string, Promise<void>>()

  private readonly creating = new Map<string, Promise<TerminalDaemonSnapshot>>()

  private readonly deletingWorkspaces = new Set<string>()

  private readonly workspaceDestructions = new Map<string, Promise<void>>()

  /** Last destroyed generation for each target. It rejects late snapshots. */
  private readonly destroyedGenerations = new Map<string, number>()

  private readonly destroyedWorkspaces = new Set<string>()

  private client: PersistentTerminalTransport | undefined

  private clientEventCleanup: (() => void) | undefined

  private clientDisconnectCleanup: (() => void) | undefined

  private connectPromise: Promise<PersistentTerminalTransport> | undefined

  private hydrationPromise: Promise<void> | undefined

  private shutdownPromise: Promise<void> | undefined

  private connectionFailure: Error | undefined

  private shuttingDown = false

  constructor(options: PersistentTerminalSessionsOptions) {
    this.connect = options.connect
    this.registry = options.registry ?? agentSessionRegistry
    this.onAgentAlert = options.onAgentAlert
    this.onAgentExit = options.onAgentExit
    this.onAgentDestroyed = options.onAgentDestroyed
    this.onDisconnect = options.onDisconnect
    this.agentTitles = new AgentTerminalTitleTracker({
      publish: (workspaceId, tileId, title) => { this.registry.updateLiveTitle(workspaceId, tileId, title) },
      ...(options.agentTitleIntervalMs !== undefined ? { intervalMs: options.agentTitleIntervalMs } : {}),
    })
  }

  isAcceptingSessions(): boolean {
    return !this.shuttingDown
  }

  /** Sessions this process knows about whose PTY is still running. */
  runningSessionCount(): number {
    let count = 0
    for (const record of this.sessions.values()) {
      if (!record.exited) count += 1
    }
    return count
  }

  /** List running terminal roots with valid process ids. */
  listRunningTerminalProcesses(): TerminalProcessRoot[] {
    const roots: TerminalProcessRoot[] = []
    for (const record of this.sessions.values()) {
      const pid = record.snapshot?.pid
      if (record.exited || typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) continue
      roots.push({ workspaceId: record.identity.workspaceId, tileId: record.identity.tileId, pid })
    }
    return roots
  }

  /** Clear a transport-loss gate only when the caller explicitly recovered. */
  recoverConnection(): void {
    if (this.shuttingDown) return
    this.connectionFailure = undefined
  }

  restore(): Promise<void> {
    return this.hydrate()
  }

  /** Hydrate all daemon sessions, including sessions from unopened workspaces. */
  hydrate(): Promise<void> {
    if (this.hydrationPromise) return this.hydrationPromise
    const hydration = (async () => {
      const client = await this.ensureClient()
      const snapshots = await client.request('list', undefined)
      await Promise.allSettled(snapshots.map(async (listed) => {
        if (this.destroyedWorkspaces.has(listed.identity.workspaceId)) return
        const attached = await this.attach(listed.identity)
        if (!attached) return
      }))
    })()
    let tracked!: Promise<void>
    tracked = hydration.then(
      () => {
        if (this.hydrationPromise === tracked) this.hydrationPromise = undefined
      },
      (error) => {
        if (this.hydrationPromise === tracked) this.hydrationPromise = undefined
        throw error
      },
    )
    this.hydrationPromise = tracked
    return tracked
  }

  /**
   * Attach the main process to a target. The daemon is authoritative for the
   * generation and returns null when no durable session exists.
   */
  async attach(target: TerminalSessionTarget): Promise<TerminalDaemonSnapshot | null> {
    return this.runTarget(keyFor(target), async () => {
      const client = await this.ensureClient()
      const snapshot = await client.request('attach', target)
      if (!snapshot) return null
      if (this.destroyedWorkspaces.has(snapshot.identity.workspaceId)) return null
      if (!this.adoptSnapshot(snapshot)) return null
      return cloneSnapshot(snapshot)
    })
  }

  /**
   * Resolve an existing target before invoking the launch builder. The launch
   * builder therefore runs only for a genuinely new daemon session.
   */
  create(
    target: TerminalSessionTarget,
    build: () => Promise<TerminalDaemonSpawn> | TerminalDaemonSpawn,
  ): Promise<TerminalDaemonSnapshot> {
    const acceptedBeforeDeletion = !this.deletingWorkspaces.has(target.workspaceId)
    if (!acceptedBeforeDeletion || this.destroyedWorkspaces.has(target.workspaceId)) {
      return Promise.reject(new Error('Terminal workspace is being deleted'))
    }
    const key = keyFor(target)
    const current = this.creating.get(key)
    if (current) return current

    const creation = this.runTarget(key, async () => {
      const client = await this.ensureClient()
      const existing = await client.request('attach', target)
      if (existing) {
        if (this.adoptSnapshot(existing)) return cloneSnapshot(existing)
        const currentSnapshot = this.sessions.get(identityKey(existing.identity))?.snapshot
        if (currentSnapshot) return cloneSnapshot(currentSnapshot)
      }
      if (this.shuttingDown) throw new Error('Terminal sessions are shutting down')
      if ((this.deletingWorkspaces.has(target.workspaceId) && !acceptedBeforeDeletion)
        || this.destroyedWorkspaces.has(target.workspaceId)) {
        throw new Error('Terminal workspace is being deleted')
      }
      const spawn = await build()
      if (this.shuttingDown) throw new Error('Terminal sessions are shutting down')
      if (this.deletingWorkspaces.has(target.workspaceId) && !acceptedBeforeDeletion) {
        throw new Error('Terminal workspace is being deleted')
      }
      const created = await client.request('create', spawn)
      if (!this.adoptSnapshot(created, 'created')) {
        const currentSnapshot = this.sessions.get(identityKey(created.identity))?.snapshot
        if (!currentSnapshot) throw new Error('Terminal session identity is stale')
        return cloneSnapshot(currentSnapshot)
      }
      return cloneSnapshot(created)
    })
    this.creating.set(key, creation)
    void creation.then(() => undefined, () => undefined).then(() => {
      if (this.creating.get(key) === creation) this.creating.delete(key)
    })
    return creation
  }

  async snapshot(identity: TerminalSessionIdentity): Promise<TerminalDaemonSnapshot> {
    return this.runTarget(keyFor(identity), async () => {
      const client = await this.ensureClient()
      const snapshot = await client.request('snapshot', identity)
      if (!this.adoptSnapshot(snapshot)) throw new Error('Terminal session identity is stale')
      return cloneSnapshot(snapshot)
    })
  }

  /**
   * Serialize renderer attach/detach per identity. Events are captured before
   * rendererAttach and sent after its snapshot as live IPC events.
   */
  async rendererAttach(
    identity: TerminalSessionIdentity,
    sender: PersistentTerminalSubscriber,
  ): Promise<TerminalDaemonSnapshot> {
    return this.runRenderer(identity, async () => {
      const client = await this.ensureClient()
      const record = this.sessions.get(identityKey(identity))
      const capture: EventCapture = { events: [] }
      const activeRecord = record ?? this.ensureRecord(identity)
      activeRecord.captures.add(capture.events)
      let snapshot: TerminalDaemonSnapshot
      try {
        snapshot = await client.request('rendererAttach', identity)
      } finally {
        activeRecord.captures.delete(capture.events)
      }

      const adopted = this.adoptSnapshot(snapshot)
      const current = this.sessions.get(identityKey(snapshot.identity))
      if (!adopted || !current || !sameTerminalSessionIdentity(current.identity, identity)) {
        if (!current || current.renderers.size === 0) {
          try { await client.request('rendererDetach', identity) } catch { /* stale renderer cleanup */ }
        }
        throw new Error('Terminal session identity is stale')
      }
      if (!this.addRenderer(current, sender)) {
        if (current.renderers.size === 0) {
          try { await client.request('rendererDetach', identity) } catch { /* stale renderer cleanup */ }
        }
        throw new Error('Terminal renderer is destroyed')
      }

      // The snapshot's alert is the current semantic state. It is sent even
      // when it was emitted before the snapshot, so a newly mounted view gets
      // the state without relying on a previous event.
      this.sendAlert(sender, snapshot.identity, snapshot.alert ?? null)
      for (const event of capture.events) {
        if (event.sequence > snapshot.sequence && isEventForIdentity(event, snapshot.identity)) {
          this.sendEvent(sender, event)
        }
      }
      return cloneSnapshot(snapshot)
    })
  }

  async rendererDetach(identity: TerminalSessionIdentity, sender: PersistentTerminalSubscriber): Promise<void> {
    await this.runRenderer(identity, async () => {
      const record = this.sessions.get(identityKey(identity))
      if (!record) return
      this.removeRenderer(record, sender)
      if (record.renderers.size > 0) return
      const client = this.client
      if (!client) return
      try {
        await client.request('rendererDetach', identity)
      } catch {
        // The daemon removes readiness when the transport disconnects. A
        // stale identity during renderer teardown is already detached.
      }
    })
  }

  async write(identity: TerminalSessionIdentity, data: string): Promise<void> {
    const client = await this.ensureClient()
    await client.request('write', { identity, data })
    const inputKind = classifyAgentInput(data)
    if (inputKind) {
      this.registry.recordActivity(identity.workspaceId, identity.tileId, inputKind)
      this.broadcastAlert(identity, null)
    }
  }

  async resize(identity: TerminalSessionIdentity, cols: number, rows: number): Promise<void> {
    const client = await this.ensureClient()
    await client.request('resize', { identity, cols, rows })
  }

  async acknowledge(identity: TerminalSessionIdentity): Promise<void> {
    const client = await this.ensureClient()
    await client.request('acknowledge', identity)
    this.registry.alerts.clearOnFocus(identity.tileId)
    this.broadcastAlert(identity, null)
  }

  async destroy(identity: TerminalSessionIdentity): Promise<void> {
    this.recoverConnection()
    await this.runTarget(keyFor(identity), async () => {
      const client = await this.ensureClient()
      try {
        await client.request('destroy', identity)
      } catch (error) {
        if (!/stale|no longer active/i.test(errorMessage(error))) throw error
      }
      this.markDestroyed(identity)
      this.removeRecord(identity, true)
    })
  }

  /** Destroy the daemon's current generation, even when this process has no record. */
  async destroyCurrent(target: TerminalSessionTarget): Promise<void> {
    this.recoverConnection()
    await this.runTarget(keyFor(target), async () => {
      const client = await this.ensureClient()
      await client.request('destroyCurrent', target)
      const current = [...this.sessions.values()].find(record => keyFor(record.identity) === keyFor(target))
      if (current) {
        this.markDestroyed(current.identity)
        this.removeRecord(current.identity, true)
      }
    })
  }

  /** Block new creates for the workspace while the daemon removes all generations. */
  destroyWorkspace(workspaceId: string): Promise<void> {
    return this.removeWorkspaceSessions(workspaceId, true)
  }

  /** Close all workspace terminals while allowing the workspace to reopen. */
  closeWorkspace(workspaceId: string): Promise<void> {
    return this.removeWorkspaceSessions(workspaceId, false)
  }

  private removeWorkspaceSessions(workspaceId: string, permanent: boolean): Promise<void> {
    this.recoverConnection()
    const current = this.workspaceDestructions.get(workspaceId)
    if (current) return current
    this.deletingWorkspaces.add(workspaceId)
    const destruction = (async () => {
      await this.waitForWorkspaceOperations(workspaceId)
      const client = await this.ensureClient()
      await client.request('destroyWorkspace', { workspaceId })
      if (permanent) this.destroyedWorkspaces.add(workspaceId)
      for (const record of [...this.sessions.values()]) {
        if (record.identity.workspaceId === workspaceId) {
          this.markDestroyed(record.identity)
          this.removeRecord(record.identity, true)
        }
      }
    })()
    let tracked!: Promise<void>
    tracked = destruction.then(
      () => {
        this.deletingWorkspaces.delete(workspaceId)
        if (this.workspaceDestructions.get(workspaceId) === tracked) this.workspaceDestructions.delete(workspaceId)
      },
      (error) => {
        this.deletingWorkspaces.delete(workspaceId)
        if (this.workspaceDestructions.get(workspaceId) === tracked) this.workspaceDestructions.delete(workspaceId)
        throw error
      },
    )
    this.workspaceDestructions.set(workspaceId, tracked)
    return tracked
  }

  /** Disconnect only the main-process transport. Daemon PTYs remain alive. */
  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise
    this.shuttingDown = true
    this.shutdownPromise = (async () => {
      await Promise.allSettled([...this.creating.values()])
      const pendingConnect = this.connectPromise
      if (pendingConnect) await Promise.allSettled([pendingConnect])
      this.removeAllRenderers()
      this.agentTitles.dispose()
      const client = this.client
      this.client = undefined
      this.clientEventCleanup?.()
      this.clientEventCleanup = undefined
      this.clientDisconnectCleanup?.()
      this.clientDisconnectCleanup = undefined
      client?.disconnect()
    })()
    return this.shutdownPromise
  }

  private ensureRecord(identity: TerminalSessionIdentity): SessionRecord {
    const key = identityKey(identity)
    const existing = this.sessions.get(key)
    if (existing) return existing
    const record: SessionRecord = {
      identity: cloneIdentity(identity),
      sequence: 0,
      agentRegistered: false,
      renderers: new Set(),
      rendererCleanup: new Map(),
      captures: new Set(),
      stateEvents: [],
      exited: false,
      exitNotified: false,
    }
    this.sessions.set(key, record)
    return record
  }

  /**
   * An agent found already running (after an app restart) has no record of
   * its turn, so it starts idle; only a session created now starts working.
   */
  private adoptSnapshot(snapshot: TerminalDaemonSnapshot, origin: 'created' | 'existing' = 'existing'): boolean {
    const key = identityKey(snapshot.identity)
    const targetKey = keyFor(snapshot.identity)
    if (this.destroyedWorkspaces.has(snapshot.identity.workspaceId)) return false
    const destroyedGeneration = this.destroyedGenerations.get(targetKey)
    if (destroyedGeneration !== undefined && snapshot.identity.generation <= destroyedGeneration) return false
    if (destroyedGeneration !== undefined && snapshot.identity.generation > destroyedGeneration) {
      this.destroyedGenerations.delete(targetKey)
    }
    const newerRecord = [...this.sessions.values()].find((candidate) => (
      keyFor(candidate.identity) === targetKey && candidate.identity.generation > snapshot.identity.generation
    ))
    if (newerRecord) return false
    for (const [existingKey, existing] of this.sessions) {
      if (existingKey !== key && keyFor(existing.identity) === targetKey) {
        this.removeAllRecordRenderers(existing)
        this.sessions.delete(existingKey)
      }
    }
    const record = this.ensureRecord(snapshot.identity)
    const previousAlert = record.alert
    const pendingStateEvents = record.stateEvents.filter((event) => event.sequence > snapshot.sequence)
    record.stateEvents = pendingStateEvents
    record.identity = cloneIdentity(snapshot.identity)
    record.snapshot = cloneSnapshot(snapshot)
    record.sequence = Math.max(record.sequence, snapshot.sequence)
    record.alert = previousAlert

    if (snapshot.agent && !record.agentRegistered) {
      this.registry.register({
        sessionId: snapshot.agent.sessionId,
        tileId: snapshot.identity.tileId,
        workspaceId: snapshot.identity.workspaceId,
        provider: snapshot.agent.provider,
        startedAt: snapshot.agent.startedAt,
        initialStatus: origin === 'created' ? 'working' : 'done',
        ...(snapshot.agent.surface !== undefined ? { surface: snapshot.agent.surface } : {}),
        ...(snapshot.agent.title !== undefined ? { title: snapshot.agent.title } : {}),
        ...(snapshot.agent.worktreeRoot !== undefined ? { worktreeRoot: snapshot.agent.worktreeRoot } : {}),
        ...(snapshot.agent.worktreeBranch !== undefined ? { worktreeBranch: snapshot.agent.worktreeBranch } : {}),
        ...(snapshot.agent.worktrees !== undefined ? { worktrees: snapshot.agent.worktrees } : {}),
      })
      record.agentRegistered = true
      // The snapshot buffer ends with the terminal's current title.
      this.agentTitles.receive(snapshot.identity.workspaceId, snapshot.identity.tileId, snapshot.buffer)
    }
    if (snapshot.alert) {
      this.registry.reportAgentAlert(snapshot.alert, snapshot.identity.workspaceId)
      if (!sameAlert(previousAlert, snapshot.alert)) this.applyAlert(record, snapshot.alert)
    } else if (previousAlert) {
      this.applyAlert(record, null)
    }
    if (snapshot.exitEvent) {
      record.exited = true
      this.applyExit(record)
    }
    for (const event of pendingStateEvents) {
      if (!isEventForIdentity(event, snapshot.identity)) continue
      if (event.event === 'alert') this.applyAlert(record, event.alert)
      else if (event.event === 'agent-state') this.applyAgentState(record, event.provider, event.state)
      else if (event.event === 'exit') {
        record.exited = true
        if (record.snapshot) record.snapshot = { ...record.snapshot, exitEvent: { ...event.exitEvent } }
        this.applyExit(record)
      }
    }
    return true
  }

  private handleEvent(event: TerminalDaemonEvent): void {
    const identity = eventIdentity(event)
    if (this.destroyedWorkspaces.has(identity.workspaceId)) return
    const targetKey = keyFor(identity)
    const destroyedGeneration = this.destroyedGenerations.get(targetKey)
    if (destroyedGeneration !== undefined && identity.generation <= destroyedGeneration) return
    const newerRecord = [...this.sessions.values()].find((candidate) => (
      keyFor(candidate.identity) === targetKey && candidate.identity.generation > identity.generation
    ))
    if (newerRecord) return
    if (destroyedGeneration !== undefined && identity.generation > destroyedGeneration) {
      this.destroyedGenerations.delete(targetKey)
    }
    const record = this.ensureRecord(identity)
    if (event.sequence <= record.sequence) return
    record.sequence = event.sequence
    for (const capture of record.captures) capture.push(event)
    if (event.event === 'alert' || event.event === 'agent-state' || event.event === 'exit') {
      record.stateEvents.push(event)
      if (record.stateEvents.length > 256) record.stateEvents.splice(0, record.stateEvents.length - 256)
    }

    if (event.event === 'alert') {
      this.applyAlert(record, event.alert)
    } else if (event.event === 'agent-state') {
      this.applyAgentState(record, event.provider, event.state)
    } else if (event.event === 'exit') {
      record.exited = true
      record.snapshot = record.snapshot
        ? { ...record.snapshot, sequence: event.sequence, exitEvent: { ...event.exitEvent } }
        : undefined
      this.applyExit(record)
    } else {
      if (record.snapshot) record.snapshot = { ...record.snapshot, sequence: event.sequence }
      if (record.agentRegistered) this.agentTitles.receive(identity.workspaceId, identity.tileId, event.data)
    }

    if (event.event !== 'agent-state') {
      for (const renderer of [...record.renderers]) this.sendEvent(renderer, event)
    }
  }

  private applyAgentState(
    record: SessionRecord,
    provider: TerminalDaemonAgentState['provider'],
    state: TerminalDaemonAgentState['state'],
  ): void {
    if (state === 'working') {
      this.registry.reportAgentWorking(provider, record.identity.tileId, record.identity.workspaceId)
    }
  }

  private applyAlert(record: SessionRecord, alert: TerminalDaemonAlert | null): void {
    const previous = record.alert
    if (sameAlertOrNull(previous, alert)) {
      if (alert) this.registry.reportAgentAlert(alert, record.identity.workspaceId)
      return
    }
    record.alert = alert ? { ...alert } : null
    if (alert) this.registry.reportAgentAlert(alert, record.identity.workspaceId)
    else this.registry.alerts.clearOnFocus(record.identity.tileId)
    this.onAgentAlert?.(record.identity, alert)
  }

  private applyExit(record: SessionRecord): void {
    this.agentTitles.forget(record.identity.workspaceId, record.identity.tileId)
    if (record.agentRegistered || record.snapshot?.agent) {
      this.registry.markExited(record.identity.workspaceId, record.identity.tileId)
    }
    if (!record.exitNotified) {
      record.exitNotified = true
      this.onAgentExit?.(record.identity)
    }
  }

  private addRenderer(record: SessionRecord, sender: PersistentTerminalSubscriber): boolean {
    if (sender.isDestroyed()) return false
    if (record.renderers.has(sender)) return true
    record.renderers.add(sender)
    const onDestroyed = (): void => { void this.rendererDetach(record.identity, sender) }
    if (sender.once) {
      try {
        sender.once('destroyed', onDestroyed)
        record.rendererCleanup.set(sender, onDestroyed)
      } catch {
        record.renderers.delete(sender)
        return false
      }
    }
    return true
  }

  private removeRenderer(record: SessionRecord, sender: PersistentTerminalSubscriber): void {
    if (!record.renderers.delete(sender)) return
    const cleanup = record.rendererCleanup.get(sender)
    record.rendererCleanup.delete(sender)
    if (cleanup && sender.removeListener) {
      try { sender.removeListener('destroyed', cleanup) } catch { /* teardown is best effort */ }
    }
  }

  private removeAllRecordRenderers(record: SessionRecord): void {
    for (const sender of [...record.renderers]) this.removeRenderer(record, sender)
    record.captures.clear()
  }

  private removeAllRenderers(): void {
    for (const record of this.sessions.values()) this.removeAllRecordRenderers(record)
  }

  private removeRecord(identity: TerminalSessionIdentity, destroyed: boolean): void {
    const key = identityKey(identity)
    const record = this.sessions.get(key)
    if (!record) return
    this.removeAllRecordRenderers(record)
    this.sessions.delete(key)
    this.agentTitles.forget(identity.workspaceId, identity.tileId)
    if (destroyed && (record.agentRegistered || record.snapshot?.agent)) {
      this.registry.remove(identity.workspaceId, identity.tileId)
      this.onAgentDestroyed?.(identity)
    }
  }

  private markDestroyed(identity: TerminalSessionIdentity): void {
    const target = keyFor(identity)
    const current = this.destroyedGenerations.get(target) ?? 0
    this.destroyedGenerations.set(target, Math.max(current, identity.generation))
  }

  private sendEvent(sender: PersistentTerminalSubscriber, event: TerminalDaemonEvent): void {
    try {
      if (sender.isDestroyed()) return
      if (event.event === 'data') {
        sender.send(terminalSessionDataChannel(event.identity), event.data)
      } else if (event.event === 'exit') {
        sender.send(terminalSessionExitChannel(event.identity), event.exitEvent)
      } else if (event.event === 'alert') {
        this.sendAlert(sender, event.identity, event.alert)
      }
    } catch {
      // Renderer teardown is handled by its destroyed event.
    }
  }

  private sendAlert(
    sender: PersistentTerminalSubscriber,
    identity: TerminalSessionIdentity,
    alert: TerminalDaemonAlert | null,
  ): void {
    try {
      if (sender.isDestroyed()) return
      sender.send(`terminal:agentAlert:${identity.tileId}`, alert ? alertState(alert) : null)
    } catch {
      // Renderer teardown is handled by its destroyed event.
    }
  }

  private broadcastAlert(identity: TerminalSessionIdentity, alert: TerminalDaemonAlert | null): void {
    const record = this.sessions.get(identityKey(identity))
    if (!record) return
    record.alert = alert
    for (const renderer of [...record.renderers]) this.sendAlert(renderer, identity, alert)
  }

  private async runRenderer<T>(identity: TerminalSessionIdentity, action: () => Promise<T>): Promise<T> {
    const key = identityKey(identity)
    const previous = this.rendererTails.get(key) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(action)
    const tail = run.then(() => undefined, () => undefined)
    this.rendererTails.set(key, tail)
    void tail.then(() => {
      if (this.rendererTails.get(key) === tail) this.rendererTails.delete(key)
    })
    return run
  }

  private runTarget<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.targetTails.get(key) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(action)
    const tail = run.then(() => undefined, () => undefined)
    this.targetTails.set(key, tail)
    const operations = this.targetOperations.get(key) ?? new Set<Promise<unknown>>()
    operations.add(run)
    this.targetOperations.set(key, operations)
    const cleanup = (): void => {
      operations.delete(run)
      if (operations.size === 0) this.targetOperations.delete(key)
      if (this.targetTails.get(key) === tail) this.targetTails.delete(key)
    }
    void run.then(cleanup, cleanup)
    return run
  }

  private async waitForWorkspaceOperations(workspaceId: string): Promise<void> {
    for (;;) {
      const pending: Promise<unknown>[] = []
      for (const [key, operations] of this.targetOperations) {
        let targetWorkspaceId: unknown
        try { targetWorkspaceId = JSON.parse(key)[0] } catch { targetWorkspaceId = undefined }
        if (targetWorkspaceId === workspaceId) pending.push(...operations)
      }
      if (pending.length === 0) return
      await Promise.allSettled(pending)
    }
  }

  private async ensureClient(): Promise<PersistentTerminalTransport> {
    if (this.client) return this.client
    if (this.shuttingDown) throw new Error('Terminal sessions are shutting down')
    if (this.connectionFailure) throw this.connectionFailure
    if (this.connectPromise) return this.connectPromise
    const pending = this.connect().then((client) => {
      if (this.shuttingDown) {
        client.disconnect()
        throw new Error('Terminal sessions are shutting down')
      }
      this.installClient(client)
      return client
    })
    this.connectPromise = pending
    void pending.then(() => undefined, () => undefined).then(() => {
      if (this.connectPromise === pending) this.connectPromise = undefined
    })
    return pending
  }

  private installClient(client: PersistentTerminalTransport): void {
    this.client = client
    this.clientEventCleanup = client.onEvent((event) => this.handleEvent(event))
    this.clientDisconnectCleanup = client.onDisconnect((error) => {
      if (this.client !== client) return
      this.client = undefined
      this.clientEventCleanup?.()
      this.clientEventCleanup = undefined
      const disconnectCleanup = this.clientDisconnectCleanup
      this.clientDisconnectCleanup = undefined
      disconnectCleanup?.()
      this.hydrationPromise = undefined
      this.removeAllRenderers()
      if (!this.shuttingDown) this.connectionFailure = error
      this.onDisconnect?.(error)
    })
  }
}

function sameAlert(first: TerminalDaemonAlert | null | undefined, second: TerminalDaemonAlert): boolean {
  return !!first && first.provider === second.provider && first.event === second.event && first.tileId === second.tileId
}
function sameAlertOrNull(
  first: TerminalDaemonAlert | null | undefined,
  second: TerminalDaemonAlert | null,
): boolean {
  if (!first || !second) return !first && !second
  return sameAlert(first, second)
}
