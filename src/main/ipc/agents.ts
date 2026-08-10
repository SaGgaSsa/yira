import { randomUUID } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import type {
  AgentProviderAvailabilitySnapshot,
  AgentSessionHistoryResult,
  AgentActiveSessionSnapshot,
} from '@shared/types'
import { agentSessionRegistry, type AgentSessionRegistry } from '../agents/registry'
import { readAgentSessionHistory } from '../agents/history'
import { getAgentProviderAvailability } from '../agents/providers'
import {
  isSafeAgentHistoryQueryInput,
  normalizeAgentHistoryQuery,
  normalizeAgentOpaqueId,
} from '../agents/query'
import { getWorkspaceRootFolderById } from './workspace'

export const AGENT_SESSIONS_CHANGED_CHANNEL = 'agents:sessions:changed'

interface AgentSubscription {
  sender: WebContents
  token: string
  unsubscribe: () => void
  onDestroyed: () => void
}
export interface AgentIPCOptions {
  registry?: AgentSessionRegistry
  availability?: () => Promise<AgentProviderAvailabilitySnapshot>
  history?: (options: {
    provider?: 'claude' | 'codex'
    workspaceRoot?: string
    search?: string
    limit?: number
  }) => Promise<AgentSessionHistoryResult>
}

const subscriptions = new Map<number, AgentSubscription>()

function removeSubscription(senderId: number, token?: string): boolean {
  const subscription = subscriptions.get(senderId)
  if (!subscription || (token !== undefined && subscription.token !== token)) return false
  subscriptions.delete(senderId)
  try {
    subscription.sender.removeListener('destroyed', subscription.onDestroyed)
  } catch {
    // WebContents can finish tearing down while explicit unsubscribe runs.
  }
  try {
    subscription.unsubscribe()
  } catch {
    // A renderer teardown must not make an IPC lifecycle operation throw.
  }
  return true
}

function sendSnapshot(sender: WebContents, snapshot: AgentActiveSessionSnapshot): void {
  try {
    if (sender.isDestroyed()) return
    sender.send(AGENT_SESSIONS_CHANGED_CHANNEL, snapshot)
  } catch {
    // A renderer may disappear between isDestroyed and send.
  }
}

function normalizedWorkspaceId(value: unknown): string | undefined {
  return value === undefined ? undefined : normalizeAgentOpaqueId(value)
}

async function historyForQuery(input: unknown, readHistory: AgentIPCOptions['history']): Promise<AgentSessionHistoryResult> {
  if (!isSafeAgentHistoryQueryInput(input)) return { items: [], hasMore: false }
  const query = normalizeAgentHistoryQuery(input)
  if (!query) return { items: [], hasMore: false }
  let workspaceRoot: string | undefined
  if (query.workspaceId) {
    workspaceRoot = await getWorkspaceRootFolderById(query.workspaceId) ?? ''
  }
  const reader = readHistory ?? readAgentSessionHistory
  return reader({
    provider: query.provider,
    workspaceRoot,
    search: query.search,
    limit: query.limit,
  })
}

/** Register all renderer-facing agent operations with validated, data-only inputs. */
export function registerAgentsIPC(options: AgentIPCOptions = {}): void {
  const registry = options.registry ?? agentSessionRegistry
  const availability = options.availability ?? (() => getAgentProviderAvailability())

  ipcMain.handle('agents:availability', async (): Promise<AgentProviderAvailabilitySnapshot> => availability())

  ipcMain.handle('agents:sessions:snapshot', (_event, workspaceId: unknown): AgentActiveSessionSnapshot => {
    const normalized = normalizedWorkspaceId(workspaceId)
    if (workspaceId !== undefined && !normalized) return { sessions: [] }
    return registry.snapshot(normalized)
  })

  ipcMain.handle('agents:sessions:subscribe', (event, workspaceId: unknown): string | false => {
    const normalized = normalizedWorkspaceId(workspaceId)
    if (workspaceId !== undefined && !normalized) return false
    removeSubscription(event.sender.id)
    const token = randomUUID()
    const unsubscribe = registry.subscribe(
      (snapshot) => sendSnapshot(event.sender, normalized ? {
        sessions: snapshot.sessions.filter((session) => session.workspaceId === normalized),
      } : snapshot),
    )
    const onDestroyed = () => removeSubscription(event.sender.id, token)
    subscriptions.set(event.sender.id, { sender: event.sender, token, unsubscribe, onDestroyed })
    event.sender.once('destroyed', onDestroyed)
    return token
  })

  ipcMain.handle('agents:sessions:unsubscribe', (event, token: unknown): boolean => {
    if (typeof token !== 'string' || !token) return false
    return removeSubscription(event.sender.id, token)
  })

  ipcMain.handle('agents:history', async (_event, input: unknown): Promise<AgentSessionHistoryResult> => {
    try {
      return await historyForQuery(input, options.history)
    } catch {
      // A provider can rotate or partially write local files while the query
      // runs. Renderer receives an empty normalized result, never an error or
      // an untrusted filesystem detail.
      return { items: [], hasMore: false }
    }
  })
}
