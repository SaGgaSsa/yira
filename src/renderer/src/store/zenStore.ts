import { create } from 'zustand'
import type { AgentAlertEvent } from '@shared/types'

export type ZenTimerStatus = 'running' | 'paused'
export type ZenFinishReason = 'completed' | 'stopped'

export interface ZenTimerSnapshot {
  status: ZenTimerStatus
  endsAt: number | null
  remainingMs: number
  durationMs: number
}

export interface ZenSession extends ZenTimerSnapshot {
  workspaceId: string
  tileId: string
  startedAt: number
}

export interface ZenQueuedAlert {
  tileId: string
  workspaceId: string | null
  provider: AgentAlertEvent['provider']
  event: AgentAlertEvent['event']
  sessionTitle: string | null
  surface: AgentAlertEvent['surface']
  receivedAt: number
}

export interface ZenSummary {
  workspaceId: string
  reason: ZenFinishReason
  durationMs: number
  alerts: ZenQueuedAlert[]
}

interface ZenStore {
  session: ZenSession | null
  queuedAlerts: ZenQueuedAlert[]
  summary: ZenSummary | null
  // Timer tiles whose zen session was stopped from outside the tile. The tile
  // resets itself when it sees its id here, even if it was not mounted.
  stoppedTileIds: string[]
  start: (input: ZenTimerSnapshot & { workspaceId: string; tileId: string }, now?: number) => void
  sync: (tileId: string, snapshot: ZenTimerSnapshot) => void
  finish: (reason: ZenFinishReason) => void
  queueAlert: (alert: AgentAlertEvent, now?: number) => void
  acknowledgeStop: (tileId: string) => void
  dismissSummary: () => void
}

export function shouldQueueAlertForZen(session: ZenSession | null, alertWorkspaceId: string | null): boolean {
  return session !== null && alertWorkspaceId !== session.workspaceId
}

export function getZenRemainingMs(session: ZenTimerSnapshot, now: number): number {
  if (session.status === 'running' && session.endsAt !== null) return Math.max(0, session.endsAt - now)
  return Math.max(0, session.remainingMs)
}

export const useZenStore = create<ZenStore>((set, get) => ({
  session: null,
  queuedAlerts: [],
  summary: null,
  stoppedTileIds: [],

  start: (input, now = Date.now()) => {
    const current = get().session
    set({
      session: { ...input, startedAt: current?.tileId === input.tileId ? current.startedAt : now },
      summary: null,
      stoppedTileIds: get().stoppedTileIds.filter((id) => id !== input.tileId),
    })
  },

  sync: (tileId, snapshot) => {
    const session = get().session
    if (!session || session.tileId !== tileId) return
    set({ session: { ...session, ...snapshot } })
  },

  finish: (reason) => {
    const { session, queuedAlerts, stoppedTileIds } = get()
    if (!session) return
    // A stop with nothing waiting needs no summary; a completed session always shows one.
    const summary = reason === 'completed' || queuedAlerts.length > 0
      ? { workspaceId: session.workspaceId, reason, durationMs: session.durationMs, alerts: queuedAlerts }
      : null
    set({
      session: null,
      queuedAlerts: [],
      summary,
      stoppedTileIds: reason === 'stopped' && !stoppedTileIds.includes(session.tileId)
        ? [...stoppedTileIds, session.tileId]
        : stoppedTileIds,
    })
  },

  queueAlert: (alert, now = Date.now()) => {
    if (!get().session) return
    const queued: ZenQueuedAlert = {
      tileId: alert.tileId,
      workspaceId: alert.workspaceId,
      provider: alert.provider,
      event: alert.event,
      sessionTitle: alert.sessionTitle,
      surface: alert.surface,
      receivedAt: now,
    }
    // One entry per agent tile: the latest event replaces the previous one.
    set({ queuedAlerts: [...get().queuedAlerts.filter((entry) => entry.tileId !== alert.tileId), queued] })
  },

  acknowledgeStop: (tileId) => {
    set({ stoppedTileIds: get().stoppedTileIds.filter((id) => id !== tileId) })
  },

  dismissSummary: () => {
    set({ summary: null })
  },
}))
