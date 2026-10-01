import React from 'react'
import { CircleCheck, CircleDot, CircleHelp, Hourglass, LoaderCircle, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TerminalActivitySummary } from '@/utils/terminalActivity'
import { summarizeTerminalActivity } from '@/utils/terminalActivity'
import { useAgentSessionSnapshot } from '@/hooks/useAgentSessionSnapshot'
import { useTerminalProcessActivity } from '@/hooks/useTerminalProcessActivity'
import { useCanvasStore } from '@/store/canvasStore'

const ACTIVITY_STYLES = {
  'needs-input': { Icon: CircleHelp, className: 'text-warning' },
  working: { Icon: LoaderCircle, className: 'text-activity motion-safe:animate-spin' },
  unread: { Icon: CircleDot, className: 'text-text-display' },
  output: { Icon: LoaderCircle, className: 'text-activity motion-safe:animate-spin' },
  background: { Icon: Hourglass, className: 'text-activity' },
  done: { Icon: CircleCheck, className: 'text-success' },
  idle: { Icon: Terminal, className: 'text-text-disabled' },
} as const

export function TerminalActivityIcon({ activity, size = 11 }: {
  activity: TerminalActivitySummary
  size?: number
}): React.ReactElement {
  const { t } = useTranslation()
  const { Icon, className } = ACTIVITY_STYLES[activity.status]
  const label = t(`terminalActivity.${activity.status}`)
  const details = t('terminalActivity.summary', { ...activity })
  const title = `${label}. ${details}`
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      data-terminal-activity={activity.status}
      title={title}
      aria-label={title}
      role="img"
    >
      <Icon size={size} className={className} aria-hidden="true" />
    </span>
  )
}

export function TerminalTileActivityIcon({ tileId, attentionCount, size }: {
  tileId: string
  attentionCount?: number
  size?: number
}): React.ReactElement {
  const { sessions } = useAgentSessionSnapshot()
  const processActivity = useTerminalProcessActivity()
  const workspaceId = useCanvasStore((state) => state.activeWorkspaceId)
  const storedAttentionCount = useCanvasStore((state) => state.terminalAttention[tileId]?.count ?? 0)
  const activity = summarizeTerminalActivity(
    sessions,
    workspaceId,
    attentionCount ?? storedAttentionCount,
    tileId,
    0,
    processActivity.terminals,
  )
  return <TerminalActivityIcon activity={activity} size={size} />
}
