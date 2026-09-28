import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { AgentProvider, AgentUsageDetailsSnapshot, AgentUsageSnapshot, AgentUsageWindow } from '@shared/types'
import { agentProviderDetails, formatUsageResetAt, getUsageThreshold } from './AgentUsageIndicator'
import { formatCompactTokens, getHourlyPoints, getUsagePace } from '@/utils/agentUsagePanel'

const STORAGE_KEY = 'yira.activity.agentPanel'
type FoldState = Partial<Record<AgentProvider, boolean>>

function readFoldState(): FoldState {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (!value) return {}
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as FoldState : {}
  } catch { return {} }
}

export interface AgentUsagePanelProps {
  providers: readonly AgentProvider[]
  usage: AgentUsageSnapshot | null
  details: AgentUsageDetailsSnapshot | null
  workspaceNames?: Readonly<Record<string, string>>
}

function formatCredits(credits: AgentUsageSnapshot['codex']['credits'], t: TFunction): string {
  if (!credits) return t('activity.noData')
  if (credits.unlimited) return t('activity.unlimitedCredits')
  if (!credits.hasCredits) return t('activity.noCredits')
  return credits.balance ?? t('activity.noData')
}

export function AgentUsagePanel({ providers, usage, details, workspaceNames }: AgentUsagePanelProps): React.ReactElement | null {
  const { t } = useTranslation()
  const [folded, setFolded] = useState<FoldState>(readFoldState)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(folded)) } catch { /* storage can be disabled */ }
  }, [folded])
  if (providers.length === 0) return null

  return (
    <aside className="min-w-0 space-y-3" aria-label={t('activity.agents')}>
      <h2 className="text-sm font-semibold text-text-primary">{t('activity.agents')}</h2>
      {providers.map((provider) => {
        const identity = agentProviderDetails[provider]
        const snapshot = usage?.[provider]
        const providerDetails = details?.providers[provider]
        const isOpen = folded[provider] === false
        const windows = snapshot?.status === 'available' ? snapshot.windows : []
        return (
          <section key={provider} className="rounded-xl border border-border-subtle bg-bg-tertiary p-3" data-agent-panel-provider={provider}>
            <button type="button" className="flex w-full items-center gap-2 text-left" aria-label={`${identity.label}: ${t(isOpen ? 'activity.hideDetails' : 'activity.showDetails')}`} aria-expanded={isOpen} aria-controls={`agent-details-${provider}`} onClick={() => setFolded((state) => ({ ...state, [provider]: isOpen }))}>
              {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <img className="size-4 object-contain" src={identity.logoPath} alt="" aria-hidden="true" />
              <span className="text-sm font-medium text-text-primary">{identity.label}</span>
              {snapshot?.planType && provider === 'codex' && <span className="text-xs text-text-secondary">{snapshot.planType}</span>}
              <span className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-1">
                {windows.length ? windows.map((window) => {
                  const threshold = getUsageThreshold(Math.round(window.usedPercent))
                  const color = threshold === 'critical' ? 'text-red-300' : threshold === 'warning' ? 'text-amber-300' : 'text-text-primary'
                  const reset = formatUsageResetAt(window.resetsAt, window.kind)
                  return <span key={window.kind} className={`inline-flex items-center gap-1 text-[11px] ${color}`}><span>{Math.round(window.usedPercent)}%</span><span className="text-text-secondary">{t(window.kind === 'fiveHour' ? 'activity.windowFiveHour' : 'activity.windowWeekly')}</span><span className="hidden text-text-muted sm:inline">{reset ?? '—'}</span><span className="h-1 w-10 overflow-hidden rounded bg-bg-secondary"><span className="block h-full bg-current" style={{ width: `${Math.max(0, Math.min(100, window.usedPercent))}%` }} /></span></span>
                }) : <span className="text-xs text-text-muted">—</span>}
              </span>
            </button>
            {snapshot?.status !== 'available' && <p className="mt-2 pl-6 text-xs text-text-muted">{t('activity.noUsageData')}</p>}
            <div id={`agent-details-${provider}`} hidden={!isOpen} className="mt-3 space-y-3 border-t border-border-subtle pt-3 text-xs text-text-secondary">
              {!providerDetails ? <p>{t('activity.noTodayData')}</p> : <>
                <div className="space-y-2">
                  {windows.map((window) => {
                    const pace = getUsagePace(window, Date.now())
                    const projected = pace.projection === null ? t('activity.noData') : pace.projection >= 100 ? `${t('activity.projection')}: ${Math.round(pace.projection)}% ${t('activity.beforeReset')}` : `~${Math.round(pace.projection)}% ${t('activity.atReset')}`
                    return <div key={window.kind}>
                      <div className="mb-1 flex justify-between"><span>{t(window.kind === 'fiveHour' ? 'activity.windowFiveHour' : 'activity.windowWeekly')}</span><span>{projected}</span></div>
                      <div className="relative h-1.5 rounded bg-bg-secondary"><span className="block h-full rounded bg-activity" style={{ width: `${Math.max(0, Math.min(100, window.usedPercent))}%` }} /><span className="absolute -top-0.5 h-2.5 w-px bg-text-primary" style={{ left: `${pace.elapsed * 100}%` }} /></div>
                    </div>
                  })}
                </div>
                <div>
                  <div className="mb-1 flex justify-between"><span>{t('activity.tokensToday')}</span><span>{formatCompactTokens(Object.values(providerDetails.tokens).reduce((sum, value) => sum + value, 0))}</span></div>
                  <div className="flex h-2 overflow-hidden rounded bg-bg-secondary" aria-label={t('activity.tokensToday')}>
                    {(provider === 'claude' ? [['cacheRead', providerDetails.tokens.cacheRead], ['cacheWrite', providerDetails.tokens.cacheWrite], ['input', providerDetails.tokens.input], ['output', providerDetails.tokens.output]] : [['cacheRead', providerDetails.tokens.cacheRead], ['input', providerDetails.tokens.input], ['output', providerDetails.tokens.output], ['reasoning', providerDetails.tokens.reasoning]]).map(([name, value], index) => <span key={String(name)} className={['bg-activity', 'bg-amber-300', 'bg-sky-400', 'bg-violet-400'][index]} style={{ width: `${Number(value) / Math.max(1, Object.values(providerDetails.tokens).reduce((sum, token) => sum + token, 0)) * 100}%` }} />)}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2">{(provider === 'claude' ? [['cacheRead', providerDetails.tokens.cacheRead], ['cacheWrite', providerDetails.tokens.cacheWrite], ['input', providerDetails.tokens.input], ['output', providerDetails.tokens.output]] : [['cached', providerDetails.tokens.cacheRead], ['input', providerDetails.tokens.input], ['output', providerDetails.tokens.output], ['reasoning', providerDetails.tokens.reasoning]]).map(([name, value]) => <span key={String(name)}>{t(`activity.token.${name}`)} {formatCompactTokens(Number(value))}</span>)}</div>
                </div>
                <HourlyChart values={providerDetails.hourly} label={t('activity.hourlyTokens')} />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt>{t('activity.sessionsToday')}</dt><dd>{providerDetails.sessionCount}</dd>
                  <dt>{t('activity.topModel')}</dt><dd>{providerDetails.topModel ? `${providerDetails.topModel.name} (${Math.round(providerDetails.topModel.share * 100)}%)` : t('activity.noData')}</dd>
                  {provider === 'codex' && <><dt>{t('activity.credits')}</dt><dd>{formatCredits(snapshot?.credits, t)}</dd><dt>{t('activity.limitReached')}</dt><dd className={snapshot?.limitReached ? 'text-red-300' : undefined}>{snapshot?.limitReached === undefined ? t('activity.noData') : snapshot.limitReached ?? t('activity.no')}</dd></>}
                  {provider === 'claude' && providerDetails.linesAdded !== undefined && <><dt>{t('activity.linesAdded')}</dt><dd>+{providerDetails.linesAdded}</dd><dt>{t('activity.linesRemoved')}</dt><dd>−{providerDetails.linesRemoved ?? 0}</dd></>}
                </dl>
              </>}
            </div>
          </section>
        )
      })}
      <section className="rounded-xl border border-border-subtle bg-bg-tertiary p-3">
        <button type="button" className="flex w-full items-center justify-between text-left text-sm text-text-primary" aria-label={`${t('activity.recentSessions')}: ${t(sessionsOpen ? 'activity.hideDetails' : 'activity.showDetails')}`} aria-expanded={sessionsOpen} aria-controls="agent-recent-sessions" onClick={() => setSessionsOpen((value) => !value)}>
          <span>{t('activity.recentSessions')}</span><span className="text-xs text-text-secondary">{details?.recentSessions.length ?? 0}</span>
        </button>
        <ul id="agent-recent-sessions" hidden={!sessionsOpen} className="mt-2 space-y-2 text-xs text-text-secondary">
          {(details?.recentSessions ?? []).map((session) => {
            const contextPercent = session.contextTokens !== undefined && session.contextWindow
              ? Math.max(0, Math.min(100, session.contextTokens / session.contextWindow * 100))
              : null
            const workspaceName = session.workspaceId ? workspaceNames?.[session.workspaceId] : undefined
            return (
              <li key={`${session.provider}:${session.sessionId}`} className="space-y-1" data-agent-recent-session={session.provider}>
                <div className="flex items-center gap-2">
                  <img className="size-3.5 shrink-0 object-contain" src={agentProviderDetails[session.provider].logoPath} alt="" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {workspaceName ?? agentProviderDetails[session.provider].label}
                    {session.model && <span className="text-text-muted"> · {session.model}</span>}
                  </span>
                  <span className="shrink-0">{new Date(session.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {contextPercent !== null && (
                  <div className="flex items-center gap-2 pl-5 text-[10px] text-text-muted">
                    <span>{t('activity.context')}</span>
                    <span className="h-1 flex-1 overflow-hidden rounded bg-bg-secondary">
                      <span className={`block h-full ${contextPercent >= 85 ? 'bg-amber-300' : 'bg-activity'}`} style={{ width: `${contextPercent}%` }} />
                    </span>
                    <span>{session.contextWindowApprox ? '~' : ''}{formatCompactTokens(session.contextTokens ?? 0)} / {formatCompactTokens(session.contextWindow ?? 0)}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}

function HourlyChart({ values, label }: {
  values: number[]
  label: string
}): React.ReactElement {
  const points = getHourlyPoints(values)
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = points.length ? `0,56 ${line} ${points[points.length - 1].x},56` : ''
  const max = Math.max(0, ...values.slice(0, points.length))
  const currentHour = Math.max(0, Math.min(23, new Date().getHours()))
  return <div><div className="mb-1">{label}</div><svg className="h-14 w-full overflow-visible text-activity" viewBox="0 0 240 56" role="img" aria-label={label}><line x1="0" y1="52" x2="240" y2="52" stroke="var(--border-subtle)" /><line x1="0" y1="28" x2="240" y2="28" stroke="var(--border-subtle)" opacity="0.55" /><polygon points={area} fill="currentColor" opacity="0.14" /><polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />{points.length > 0 && <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill="currentColor" />}<text x="0" y="10" className="fill-text-muted text-[8px]">{formatCompactTokens(max)}</text><text x="0" y="55" className="fill-text-muted text-[8px]">0 h</text><text x="222" y="55" className="fill-text-muted text-[8px]">{currentHour} h</text></svg></div>
}
