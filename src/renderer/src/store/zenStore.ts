import { create } from 'zustand'
import type { AgentAlertEvent } from '@shared/types'

export type ZenTimerStatus = 'running' | 'paused'
export type ZenFinishReason = 'completed' | 'stopped'

export const ZEN_MIN_DURATION_MS = 60_000
export const ZEN_MAX_DURATION_MS = 180 * 60_000
export const ZEN_DEFAULT_DURATION_MS = 25 * 60_000
export const ZEN_EXTRA_TIME_MS = 5 * 60_000

export interface ZenSession {
  workspaceId: string
  status: ZenTimerStatus
  endsAt: number | null
  remainingMs: number
  durationMs: number
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
  // Duration picked in the timer menu, kept between sessions.
  durationMs: number
  menuOpen: boolean
  session: ZenSession | null
  // The window stays in full screen while this is true. Esc Esc clears it
  // without ending the session.
  fullScreen: boolean
  queuedAlerts: ZenQueuedAlert[]
  summary: ZenSummary | null
  setDuration: (durationMs: number) => void
  setMenuOpen: (open: boolean) => void
  start: (workspaceId: string, now?: number) => void
  pause: (now?: number) => void
  resume: (now?: number) => void
  addExtraTime: (now?: number) => void
  setFullScreen: (fullScreen: boolean) => void
  finish: (reason: ZenFinishReason) => void
  queueAlert: (alert: AgentAlertEvent, now?: number) => void
  dismissSummary: () => void
}

export function clampZenDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return ZEN_DEFAULT_DURATION_MS
  return Math.min(ZEN_MAX_DURATION_MS, Math.max(ZEN_MIN_DURATION_MS, Math.round(durationMs)))
}

export function shouldQueueAlertForZen(session: ZenSession | null, alertWorkspaceId: string | null): boolean {
  return session !== null && alertWorkspaceId !== session.workspaceId
}

export function getZenRemainingMs(session: ZenSession, now: number): number {
  if (session.status === 'running' && session.endsAt !== null) return Math.max(0, session.endsAt - now)
  return Math.max(0, session.remainingMs)
}

export function formatZenTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => value.toString().padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export const useZenStore = create<ZenStore>((set, get) => ({
  durationMs: ZEN_DEFAULT_DURATION_MS,
  menuOpen: false,
  session: null,
  fullScreen: false,
  queuedAlerts: [],
  summary: null,

  setDuration: (durationMs) => {
    set({ durationMs: clampZenDurationMs(durationMs) })
  },

  setMenuOpen: (open) => {
    set({ menuOpen: open })
  },

  start: (workspaceId, now = Date.now()) => {
    if (get().session) return
    const durationMs = get().durationMs
    set({
      session: { workspaceId, status: 'running', endsAt: now + durationMs, remainingMs: durationMs, durationMs, startedAt: now },
      fullScreen: true,
      menuOpen: false,
      queuedAlerts: [],
      summary: null,
    })
  },

  pause: (now = Date.now()) => {
    const session = get().session
    if (!session || session.status !== 'running') return
    set({ session: { ...session, status: 'paused', endsAt: null, remainingMs: getZenRemainingMs(session, now) } })
  },

  resume: (now = Date.now()) => {
    const session = get().session
    if (!session || session.status !== 'paused') return
    set({ session: { ...session, status: 'running', endsAt: now + session.remainingMs } })
  },

  addExtraTime: (now = Date.now()) => {
    const session = get().session
    if (!session) return
    const remainingMs = getZenRemainingMs(session, now) + ZEN_EXTRA_TIME_MS
    set({
      session: {
        ...session,
        remainingMs,
        durationMs: session.durationMs + ZEN_EXTRA_TIME_MS,
        endsAt: session.status === 'running' ? now + remainingMs : null,
      },
    })
  },

  setFullScreen: (fullScreen) => {
    if (!get().session && fullScreen) return
    set({ fullScreen })
  },

  finish: (reason) => {
    const { session, queuedAlerts } = get()
    if (!session) return
    // A stop with nothing waiting needs no summary; a completed session always shows one.
    const summary = reason === 'completed' || queuedAlerts.length > 0
      ? { workspaceId: session.workspaceId, reason, durationMs: session.durationMs, alerts: queuedAlerts }
      : null
    set({ session: null, fullScreen: false, queuedAlerts: [], summary })
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

  dismissSummary: () => {
    set({ summary: null })
  },
}))
