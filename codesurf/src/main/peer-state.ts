/**
 * Peer collaboration state — in-memory store for linked tile agent coordination.
 *
 * Each agent can declare: what it's working on, its status, its todos.
 * Linked peers can read each other's state, send messages, and get notified of changes.
 * Terminal agents get PTY-injected notifications. Chat agents get state on each message.
 */

import { bus } from './event-bus'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PeerTodo {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export interface PeerMessage {
  id: string
  from: string
  fromType: string
  text: string
  timestamp: number
  read: boolean
}

export interface PeerAgentState {
  tileId: string
  tileType: string
  status: 'idle' | 'working' | 'blocked' | 'waiting' | 'done'
  task: string
  todos: PeerTodo[]
  files: string[]
  updatedAt: number
}

// ── Storage ──────────────────────────────────────────────────────────────────

const agentStates = new Map<string, PeerAgentState>()
const peerMessages = new Map<string, PeerMessage[]>()  // keyed by recipient tileId
const linkedPeers = new Map<string, Set<string>>()      // tileId → Set<peerId>

// Callback registry for PTY injection (set by terminal.ts)
type NotifyCallback = (tileId: string, line: string) => void
let notifyTerminalFn: NotifyCallback | null = null

export function setTerminalNotifier(fn: NotifyCallback): void {
  notifyTerminalFn = fn
}

// ── Link management (called by renderer via IPC) ────────────────────────────

export function updateLinks(tileId: string, peerIds: string[]): void {
  const prev = linkedPeers.get(tileId) ?? new Set()
  const next = new Set(peerIds)
  linkedPeers.set(tileId, next)

  for (const peerId of next) {
    if (!prev.has(peerId)) notifyTile(tileId, `[contex] linked block: ${peerId}`)
  }
  for (const peerId of prev) {
    if (!next.has(peerId)) notifyTile(tileId, `[contex] unlinked block: ${peerId}`)
  }
}

// ── State operations (called via MCP tools) ──────────────────────────────────

export function setState(tileId: string, update: Partial<Omit<PeerAgentState, 'tileId' | 'updatedAt'>>): PeerAgentState {
  const existing = agentStates.get(tileId) ?? {
    tileId,
    tileType: 'unknown',
    status: 'idle' as const,
    task: '',
    todos: [],
    files: [],
    updatedAt: Date.now(),
  }

  const updated: PeerAgentState = {
    ...existing,
    ...update,
    tileId,
    updatedAt: Date.now(),
  }
  agentStates.set(tileId, updated)

  // Notify all linked peers about the state change
  const peers = linkedPeers.get(tileId) ?? new Set()
  for (const peerId of peers) {
    const summary = formatStateChange(tileId, updated)
    notifyTile(peerId, summary)
  }

  // Publish to bus
  bus.publish({
    channel: `tile:${tileId}`,
    type: 'data',
    source: `peer:${tileId}`,
    payload: { action: 'state_updated', state: updated },
  })

  return updated
}

export function getState(tileId: string): PeerAgentState | null {
  return agentStates.get(tileId) ?? null
}

export function getLinkedPeerStates(tileId: string): PeerAgentState[] {
  const peers = linkedPeers.get(tileId) ?? new Set()
  const states: PeerAgentState[] = []
  for (const peerId of peers) {
    const s = agentStates.get(peerId)
    if (s) states.push(s)
  }
  return states
}

// ── Todo operations ──────────────────────────────────────────────────────────

export function addTodo(tileId: string, text: string): PeerTodo {
  const state = agentStates.get(tileId)
  if (!state) throw new Error(`No agent state for block ${tileId} — call peer_set_state first`)

  const todo: PeerTodo = {
    id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text,
    done: false,
    createdAt: Date.now(),
  }
  state.todos.push(todo)
  state.updatedAt = Date.now()

  // Notify linked peers
  const peers = linkedPeers.get(tileId) ?? new Set()
  for (const peerId of peers) {
    notifyTile(peerId, `[contex] ${tileId} added todo: "${text}"`)
  }

  return todo
}

export function completeTodo(tileId: string, todoId: string): boolean {
  const state = agentStates.get(tileId)
  if (!state) return false
  const todo = state.todos.find(t => t.id === todoId)
  if (!todo || todo.done) return false
  todo.done = true
  state.updatedAt = Date.now()

  const peers = linkedPeers.get(tileId) ?? new Set()
  for (const peerId of peers) {
    notifyTile(peerId, `[contex] ${tileId} completed: "${todo.text}"`)
  }
  return true
}

// ── Messaging ────────────────────────────────────────────────────────────────

export function sendMessage(fromTileId: string, toTileId: string, text: string): PeerMessage {
  const fromState = agentStates.get(fromTileId)
  const msg: PeerMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from: fromTileId,
    fromType: fromState?.tileType ?? 'unknown',
    text,
    timestamp: Date.now(),
    read: false,
  }

  const inbox = peerMessages.get(toTileId) ?? []
  inbox.push(msg)
  // Keep last 50 messages per block
  if (inbox.length > 50) inbox.splice(0, inbox.length - 50)
  peerMessages.set(toTileId, inbox)

  // Push notification to recipient
  notifyTile(toTileId, `[contex] Message from block ${fromTileId} (${msg.fromType}): ${text}`)

  bus.publish({
    channel: `tile:${toTileId}`,
    type: 'data',
    source: `peer:${fromTileId}`,
    payload: { action: 'peer_message', message: msg },
  })

  return msg
}

export function readMessages(tileId: string): PeerMessage[] {
  const msgs = peerMessages.get(tileId) ?? []
  // Mark all as read
  for (const m of msgs) m.read = true
  return msgs
}

export function getUnreadMessages(tileId: string): PeerMessage[] {
  return (peerMessages.get(tileId) ?? []).filter(m => !m.read)
}

// ── Notification dispatch ────────────────────────────────────��───────────────

function notifyTile(tileId: string, line: string): void {
  // Try PTY injection for terminal tiles
  if (notifyTerminalFn) {
    notifyTerminalFn(tileId, line)
  }

  // Always publish to bus so chat tiles and renderer can pick it up
  bus.publish({
    channel: `tile:${tileId}`,
    type: 'notification',
    source: 'peer-state',
    payload: { message: line },
  })
}

function formatStateChange(tileId: string, state: PeerAgentState): string {
  const parts = [`[contex] Peer block ${tileId} (${state.tileType})`]
  if (state.status !== 'idle') parts.push(`status: ${state.status}`)
  if (state.task) parts.push(`task: "${state.task}"`)
  const pending = state.todos.filter(t => !t.done).length
  if (pending > 0) parts.push(`${pending} todos pending`)
  if (state.files.length > 0) parts.push(`files: ${state.files.slice(0, 3).join(', ')}`)
  return parts.join(' — ')
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

export function removeTile(tileId: string): void {
  agentStates.delete(tileId)
  peerMessages.delete(tileId)
  linkedPeers.delete(tileId)
  // Remove from all peer sets
  for (const [, peers] of linkedPeers) {
    peers.delete(tileId)
  }
}
