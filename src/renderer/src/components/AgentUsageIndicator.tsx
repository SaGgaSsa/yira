import React from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import type { AgentProvider, AgentUsageProviderSnapshot, AgentUsageWindow, AgentUsageWindowKind } from '@shared/types'

export interface AgentUsageIndicatorProps {
  provider: AgentProvider
  snapshot?: AgentUsageProviderSnapshot | null
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

export const agentProviderDetails: Record<AgentProvider, {
  label: string
  logoPath: string
}> = {
  codex: { label: 'Codex', logoPath: './agent-provider-logos/openai.svg' },
  claude: { label: 'Claude', logoPath: './agent-provider-logos/anthropic.svg' },
}

export function clampUsagePercent(value: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.round(Math.max(0, Math.min(100, value)))
}

export function getUsageThreshold(percent: number | null): UsageThreshold {
  if (percent === null) return 'unavailable'
  if (percent >= 90) return 'critical'
  if (percent >= 70) return 'warning'
  return 'neutral'
}

export interface UsageResetFormatOptions {
  locale?: string
  timeZone?: string
}

export function formatUsageResetAt(
  value: AgentUsageWindow['resetsAt'],
  kind: AgentUsageWindowKind,
  options: UsageResetFormatOptions = {},
): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  try {
    const parts = new Intl.DateTimeFormat(options.locale, {
      ...(kind === 'weekly' ? { day: '2-digit', month: 'short' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: options.timeZone,
    }).formatToParts(date)
    const valueFor = (type: Intl.DateTimeFormatPartTypes): string => (
      parts.find((part) => part.type === type)?.value ?? ''
    )
    const time = `${valueFor('hour')}:${valueFor('minute')}`

    return kind === 'weekly'
      ? `${valueFor('day')} ${valueFor('month')} ${time}`
      : time
  } catch {
    return null
  }
}

function resetDataValue(value: AgentUsageWindow['resetsAt']): string | undefined {
  return Number.isNaN(new Date(value).getTime()) ? undefined : value
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
  const { t } = useTranslation()
  const percent = clampUsagePercent(window.usedPercent)
  const threshold = getUsageThreshold(percent)
  const style = thresholdStyles[threshold]
  const label = t(window.kind === 'fiveHour' ? 'ui.fiveHourShort' : 'ui.weeklyShort')
  const resetText = formatUsageResetAt(window.resetsAt, window.kind, { locale: i18n.language })
  const resetValue = resetDataValue(window.resetsAt)
  const progressOffset = percent === null
    ? ringCircumference
    : ringCircumference * (1 - percent / 100)
  const accessibleValue = percent === null ? t('ui.unavailable') : `${percent}%`
  const accessibleReset = resetText ? t('ui.usageResets', { date: resetText }) : t('ui.resetUnavailable')
  const ringLabel = `${providerLabel} ${label} ${t('ui.usage')}: ${accessibleValue}, ${accessibleReset}`

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
      <span className="text-[10px] leading-none text-text-primary" data-usage-window-label="true">
        {label}
      </span>
      <span
        className="hidden min-[800px]:inline truncate text-[10px] leading-none text-text-primary"
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
}: AgentUsageIndicatorProps): React.ReactElement {
  const { t } = useTranslation()
  const details = agentProviderDetails[provider]
  const resolvedStatus = snapshot?.status ?? 'unavailable'
  const available = resolvedStatus === 'available'
  const windows = available && snapshot
    ? snapshot.windows.filter(isUsageWindow).slice(0, 2)
    : []

  return (
    <div
      className="flex min-w-0 max-w-full shrink-0 items-center gap-1.5 rounded-md px-1 text-xs"
      data-agent-usage-indicator="true"
      data-provider={provider}
      data-status={resolvedStatus}
      aria-label={`${details.label} ${t('ui.usage')}${available ? '' : ` ${t('ui.unavailable')}`}`}
    >
      <span className="inline-flex min-w-0 shrink-0 items-center text-text-primary" data-provider-identity="true">
        <img
          className="size-3.5 shrink-0 object-contain"
          src={details.logoPath}
          alt=""
          aria-hidden="true"
          data-provider-logo="true"
        />
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
