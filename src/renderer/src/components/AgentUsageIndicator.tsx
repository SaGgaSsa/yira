import React from 'react'
import { Code2, Sparkles } from 'lucide-react'

export type AgentUsageProvider = 'codex' | 'claude'
export type AgentUsageWindowKind = 'fiveHour' | 'weekly'
export type AgentUsageSnapshotStatus = 'available' | 'unavailable' | 'loading' | 'error'

export interface AgentUsageWindow {
  kind: AgentUsageWindowKind
  usedPercent?: number | null
  resetsAt?: string | number | Date | null
}

/**
 * A renderer-local mirror of the shared provider snapshot contract.
 *
 * The optional fields keep the indicator safe while a provider is loading or
 * unavailable, and let it consume snapshots received over the preload bridge
 * without trusting their shape at render time.
 */
export interface AgentUsageProviderSnapshot {
  status?: AgentUsageSnapshotStatus
  windows?: readonly AgentUsageWindow[]
}

export interface AgentUsageIndicatorProps {
  provider: AgentUsageProvider
  snapshot?: AgentUsageProviderSnapshot | null
  status?: AgentUsageSnapshotStatus
}

type UsageThreshold = 'neutral' | 'warning' | 'critical' | 'unavailable'

interface ThresholdStyle {
  text: string
  ring: string
}

const thresholdStyles: Record<UsageThreshold, ThresholdStyle> = {
  neutral: {
    text: 'text-text-secondary',
    ring: 'text-text-secondary',
  },
  warning: {
    text: 'text-amber-300',
    ring: 'text-amber-300',
  },
  critical: {
    text: 'text-red-300',
    ring: 'text-red-300',
  },
  unavailable: {
    text: 'text-text-muted',
    ring: 'text-text-muted',
  },
}

const ringRadius = 8
const ringCircumference = 2 * Math.PI * ringRadius

const providerDetails: Record<AgentUsageProvider, {
  label: string
  Icon: typeof Code2
}> = {
  codex: { label: 'Codex', Icon: Code2 },
  claude: { label: 'Claude', Icon: Sparkles },
}

function clampPercent(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(Math.max(0, Math.min(100, value)))
}

function thresholdFor(percent: number | null): UsageThreshold {
  if (percent === null) return 'unavailable'
  if (percent >= 90) return 'critical'
  if (percent >= 70) return 'warning'
  return 'neutral'
}

function formatResetAt(value: AgentUsageWindow['resetsAt']): string | null {
  if (value === null || value === undefined) return null

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function resetDataValue(value: AgentUsageWindow['resetsAt']): string | undefined {
  if (value === null || value === undefined) return undefined
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  }
  return String(value)
}

function windowLabel(kind: AgentUsageWindowKind): string {
  return kind === 'fiveHour' ? '5 h' : 'sem.'
}

function isUsageWindow(value: unknown): value is AgentUsageWindow {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<AgentUsageWindow>
  return candidate.kind === 'fiveHour' || candidate.kind === 'weekly'
}

function UsageWindow({
  providerLabel,
  window,
}: {
  providerLabel: string
  window: AgentUsageWindow
}): React.ReactElement {
  const percent = clampPercent(window.usedPercent)
  const threshold = thresholdFor(percent)
  const style = thresholdStyles[threshold]
  const label = windowLabel(window.kind)
  const resetText = formatResetAt(window.resetsAt)
  const resetValue = resetDataValue(window.resetsAt)
  const progressOffset = percent === null
    ? ringCircumference
    : ringCircumference * (1 - percent / 100)
  const accessibleValue = percent === null ? 'unavailable' : `${percent}%`
  const accessibleReset = resetText ? `, resets ${resetText}` : ', reset unavailable'
  const ringLabel = `${providerLabel} ${label} usage: ${accessibleValue}${accessibleReset}`

  return (
    <span
      className={`inline-flex min-w-0 shrink-0 items-center gap-1 ${style.text}`}
      data-usage-window="true"
      data-window-kind={window.kind}
      data-used-percent={percent ?? undefined}
      data-usage-threshold={threshold}
    >
      <svg
        className={`shrink-0 ${style.ring}`}
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        role="img"
        aria-label={ringLabel}
        data-progress-ring="true"
        data-progress-percent={percent ?? undefined}
      >
        <title>{ringLabel}</title>
        <circle
          cx="10"
          cy="10"
          r={ringRadius}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
        <circle
          cx="10"
          cy="10"
          r={ringRadius}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={ringCircumference}
          strokeDashoffset={progressOffset}
          transform="rotate(-90 10 10)"
        />
      </svg>
      <span className="font-mono text-[11px] leading-none" data-usage-percent="true">
        {percent === null ? '—' : `${percent}%`}
      </span>
      <span className="text-[10px] leading-none text-text-muted" data-usage-window-label="true">
        {label}
      </span>
      <span
        className="hidden min-[800px]:inline truncate text-[10px] leading-none text-text-muted"
        data-reset-at={resetValue}
        data-usage-reset="true"
      >
        {resetText ? `↻ ${resetText}` : '↻ —'}
      </span>
    </span>
  )
}

export function AgentUsageIndicator({
  provider,
  snapshot,
  status,
}: AgentUsageIndicatorProps): React.ReactElement {
  const details = providerDetails[provider]
  const Icon = details.Icon
  const resolvedStatus = status ?? snapshot?.status ?? (snapshot?.windows?.length ? 'available' : 'unavailable')
  const available = resolvedStatus === 'available'
  const windows = available
    ? (snapshot?.windows ?? []).filter(isUsageWindow).slice(0, 2)
    : []

  return (
    <div
      className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-md px-1 text-xs"
      data-agent-usage-indicator="true"
      data-provider={provider}
      data-status={resolvedStatus}
      aria-label={`${details.label} usage${available ? '' : ' unavailable'}`}
    >
      <span className="inline-flex min-w-0 shrink-0 items-center gap-1 text-text-primary" data-provider-identity="true">
        <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
        <span className="truncate">{details.label}</span>
      </span>

      {windows.length > 0 ? (
        <span className="flex min-w-0 items-center gap-1.5" data-usage-windows="true">
          {windows.map((window, index) => (
            <UsageWindow
              key={`${window.kind}-${index}`}
              providerLabel={details.label}
              window={window}
            />
          ))}
        </span>
      ) : (
        <span className="font-mono text-text-muted" data-usage-unavailable="true">—</span>
      )}
    </div>
  )
}
