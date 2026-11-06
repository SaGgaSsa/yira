import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EllipsisVertical } from 'lucide-react'
import type { AgentActiveSession, WorkspaceMetadata } from '@shared/types'
import { useBots } from '@/hooks/useBots'
import { useNow } from '@/hooks/useNow'
import { formatActivityElapsed } from '@/utils/activityPalette'
import { getAgentSessionTitle } from '@/utils/terminalDisplayTitle'
import { keepAgentSessionOrder } from '@/utils/workspaceSidebarSections'
import { BotAvatar } from './botVisuals'

const ELAPSED_REFRESH_MS = 30_000
const AGENT_TILE_DRAG_TYPE = 'application/x-yira-tile-id'

export interface WorkspaceAgentTreeProps {
  workspace: WorkspaceMetadata
  /** Entries must already be filtered and ordered by getWorkspaceAgentEntries. */
  sessions: readonly AgentActiveSession[]
  /** Tile of the agent shown on screen; its row is marked as current. */
  focusedTileId?: string | null
  onOpenAgent: (workspace: WorkspaceMetadata, session: AgentActiveSession) => void
  canDragAgent?: (session: AgentActiveSession) => boolean
  onAgentDragStart?: (session: AgentActiveSession) => void
  agentDragActive?: boolean
  canOpenAgentMenu?: (session: AgentActiveSession) => boolean
  onOpenAgentMenu?: (session: AgentActiveSession, trigger: HTMLElement) => void
  /** Tile whose row menu is open; keeps its button visible and the list order frozen. */
  agentMenuTileId?: string | null
}

function getStatusLabel(status: AgentActiveSession['status'], translate: (key: string) => string): string {
  if (status === 'needs-input') return translate('workspaceAgents.statusWaiting')
  if (status === 'done') return translate('workspaceAgents.statusReady')
  return translate('workspaceAgents.statusWorking')
}

function getStatusDotClass(status: AgentActiveSession['status']): string {
  if (status === 'needs-input') return 'bg-warning'
  if (status === 'done') return 'border-[1.5px] border-text-secondary'
  return 'bg-activity animate-pulse motion-reduce:animate-none'
}

function StatusDot({ status }: { status: AgentActiveSession['status'] }): React.ReactElement {
  return <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${getStatusDotClass(status)}`} aria-hidden="true" />
}

export function WorkspaceAgentTree({
  workspace,
  sessions,
  focusedTileId = null,
  onOpenAgent,
  canDragAgent,
  onAgentDragStart,
  agentDragActive = false,
  canOpenAgentMenu,
  onOpenAgentMenu,
  agentMenuTileId = null,
}: WorkspaceAgentTreeProps): React.ReactElement | null {
  const { t } = useTranslation()
  const now = useNow(ELAPSED_REFRESH_MS)
  const { bots } = useBots()
  const botsById = useMemo(() => new Map(bots.map((bot) => [bot.id, bot])), [bots])
  // While the pointer or focus is on the list, rows keep their place so a click lands where the user aimed. A native drag leaves the list too, and an open row menu keeps the order frozen.
  const [hovered, setHovered] = useState(false)
  const [focusedWithin, setFocusedWithin] = useState(false)
  const shownIdsRef = useRef<string[]>([])
  const shownSessions = hovered || focusedWithin || agentDragActive || sessions.some(({ tileId }) => tileId === agentMenuTileId) ? keepAgentSessionOrder(sessions, shownIdsRef.current) : sessions
  useEffect(() => {
    shownIdsRef.current = shownSessions.map(({ sessionId }) => sessionId)
  })
  if (sessions.length === 0) return null

  return (
    <div
      className="mt-px flex flex-col gap-px"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocusedWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedWithin(false)
      }}
    >
      {shownSessions.map((session) => {
        const providerName = t(session.provider === 'claude' ? 'agentsView.claude' : 'agentsView.codex')
        const sessionName = getAgentSessionTitle(session) || providerName
        const statusLabel = getStatusLabel(session.status, t)
        const bot = session.botId ? botsById.get(session.botId) : undefined
        const rowName = bot ? `${bot.name} · ${sessionName}` : sessionName
        const focused = focusedTileId !== null && session.tileId === focusedTileId
        const waiting = session.status === 'needs-input'
        const waitingDetail = waiting ? session.statusDetail?.trim() : ''
        const statusText = waitingDetail ? `${statusLabel} · ${waitingDetail}` : statusLabel
        const done = session.status === 'done'
        const nameClass = focused
          ? 'font-medium text-text-display'
          : waiting || done ? 'text-text-primary' : 'text-text-secondary'
        const draggable = canDragAgent?.(session) ?? false
        const menuAvailable = canOpenAgentMenu?.(session) ?? false
        const menuOpen = agentMenuTileId === session.tileId
        // The menu button takes the place of the time and the waiting label.
        const reserve = !menuAvailable ? '' : menuOpen ? 'pr-8' : 'group-hover:pr-8 group-has-focus-visible:pr-8'
        const hideTrailing = !menuAvailable ? '' : menuOpen ? 'hidden' : 'group-hover:hidden group-has-focus-visible:hidden'

        return (
          <div
            key={session.sessionId}
            className={`group relative flex min-w-0 transition-colors ${focused ? 'bg-active-bg before:absolute before:inset-y-[5px] before:left-0 before:w-0.5 before:rounded-full before:bg-text-display' : 'hover:bg-hover-bg'}`}
          >
            <button
              type="button"
              data-workspace-agent-session={session.sessionId}
              aria-label={`${rowName}, ${statusText}`}
              aria-current={focused ? 'true' : undefined}
              title={`${rowName} · ${statusText}`}
              draggable={draggable}
              onDragStart={draggable ? (event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData(AGENT_TILE_DRAG_TYPE, session.tileId)
                onAgentDragStart?.(session)
              } : undefined}
              onClick={() => onOpenAgent(workspace, session)}
              className={`flex h-[26px] w-full min-w-0 items-center gap-2 pl-6 pr-3 text-left focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive) ${reserve}`}
            >
              <StatusDot status={session.status} />
              {bot && <BotAvatar icon={bot.icon} color={bot.color} size={14} />}
              <span className={`min-w-0 flex-1 truncate text-sm ${nameClass}`}>{sessionName}</span>
              {waiting && (
                <span className={`shrink-0 font-mono text-[10px] text-warning ${hideTrailing}`}>
                  {t('workspaceAgents.statusWaiting')}
                </span>
              )}
              {done && (
                <span className={`shrink-0 font-mono text-[10px] tabular-nums text-text-muted ${hideTrailing}`}>
                  {formatActivityElapsed(session.lastActivityAt, now)}
                </span>
              )}
            </button>
            {menuAvailable && (
              <button
                type="button"
                className={`absolute right-3 top-[3px] flex h-5 w-5 items-center justify-center rounded-sm text-text-secondary transition-[opacity,color,background-color] hover:bg-hover-bg hover:text-text-display ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100'} focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)`}
                onClick={(event) => onOpenAgentMenu?.(session, event.currentTarget)}
                aria-label={t('workspaceAgents.actions')}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title={t('workspaceAgents.actions')}
              >
                <EllipsisVertical size={13} aria-hidden="true" />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export interface WorkspaceAgentSummaryProps {
  needsInputCount: number
  doneCount: number
  workingCount: number
}

export function WorkspaceAgentSummary({
  needsInputCount,
  doneCount,
  workingCount,
}: WorkspaceAgentSummaryProps): React.ReactElement | null {
  const { t } = useTranslation()
  if (needsInputCount <= 0 && doneCount <= 0 && workingCount <= 0) return null

  const counts: Array<{ status: AgentActiveSession['status']; count: number; label: string }> = [
    { status: 'needs-input', count: needsInputCount, label: t('workspaceAgents.waitingCount', { count: needsInputCount }) },
    { status: 'done', count: doneCount, label: t('workspaceAgents.readyCount', { count: doneCount }) },
    { status: 'working', count: workingCount, label: t('workspaceAgents.workingCount', { count: workingCount }) },
  ]

  return (
    <span className="flex shrink-0 items-center gap-2">
      {counts.filter(({ count }) => count > 0).map(({ status, count, label }) => (
        <span
          key={status}
          className="inline-flex items-center gap-1 font-mono text-[10px] tabular-nums text-text-secondary"
          aria-label={label}
          title={label}
        >
          <StatusDot status={status} />
          {count}
        </span>
      ))}
    </span>
  )
}
