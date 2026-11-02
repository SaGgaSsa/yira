import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { isBotAvailableInWorkspace } from '@shared/bots'
import type { BotDefinition } from '@shared/bots'
import {
  ROUTINE_INSTRUCTION_MAX_LENGTH,
  ROUTINE_MIN_INTERVAL_MINUTES,
  ROUTINE_NAME_MAX_LENGTH,
} from '@shared/routines'
import type { Routine, RoutineInput, RoutineRunResult, RoutineSchedule } from '@shared/routines'
import type { WorkspaceMetadata } from '@shared/types'
import { useRoutines } from '@/hooks/useRoutines'
import {
  ROUTINE_WEEKDAYS,
  ROUTINE_WEEK_ORDER,
  formatLastRun,
  formatNextRun,
  formatSchedule,
  isIntervalValid,
  weekdayKey,
} from '@/utils/routineSchedule'

const BLOCK_CLASS = 'rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4'
const FOCUS_CLASS = 'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)'
const FIELD_CLASS = `w-full rounded-[12px] border border-border-visible bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary ${FOCUS_CLASS}`
const SECONDARY_BUTTON_CLASS = `rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`
const SMALL_BUTTON_CLASS = `rounded-full border border-border-visible px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`
const DANGER_BUTTON_CLASS = `rounded-full border border-danger/40 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`
const PILL_CLASS = 'inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-visible px-3 py-1.5 text-sm text-text-primary has-checked:border-accent has-checked:bg-accent-subtle has-focus-visible:outline-solid has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--interactive)'

const NOW_REFRESH_MS = 30_000
const RUN_FEEDBACK_MS = 5_000
const DEFAULT_TIME = '09:00'
const TIME_PATTERN = /^\d{2}:\d{2}$/

type ScheduleKind = RoutineSchedule['kind']
type IntervalUnit = 'minutes' | 'hours'

interface RoutineForm {
  name: string
  /** `null` follows the first workspace the bot is enabled for. */
  workspaceId: string | null
  instruction: string
  kind: ScheduleKind
  time: string
  days: number[]
  every: string
  unit: IntervalUnit
  enabled: boolean
}

/** Removes the Electron IPC wrapper so only the validation message is shown. */
function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback
  return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function emptyForm(): RoutineForm {
  return {
    name: '',
    workspaceId: null,
    instruction: '',
    kind: 'manual',
    time: DEFAULT_TIME,
    days: [],
    every: '1',
    unit: 'hours',
    enabled: true,
  }
}

function formFromRoutine(routine: Routine): RoutineForm {
  const { schedule } = routine
  return {
    ...emptyForm(),
    name: routine.name,
    workspaceId: routine.workspaceId,
    instruction: routine.instruction,
    kind: schedule.kind,
    ...(schedule.kind === 'daily' ? { time: schedule.time, days: schedule.days } : {}),
    ...(schedule.kind === 'interval' ? { every: String(schedule.every), unit: schedule.unit } : {}),
    enabled: routine.enabled,
  }
}

function scheduleFromForm(form: RoutineForm): RoutineSchedule {
  if (form.kind === 'daily') return { kind: 'daily', time: form.time, days: form.days }
  if (form.kind === 'interval') return { kind: 'interval', every: Number(form.every), unit: form.unit }
  return { kind: 'manual' }
}

function inputFromRoutine(routine: Routine, enabled: boolean): RoutineInput {
  return {
    id: routine.id,
    botId: routine.botId,
    workspaceId: routine.workspaceId,
    name: routine.name,
    instruction: routine.instruction,
    schedule: routine.schedule,
    enabled,
  }
}

function sameDays(days: number[], expected: readonly number[]): boolean {
  return days.length === expected.length && expected.every((day) => days.includes(day))
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), NOW_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function useWorkspaces(): WorkspaceMetadata[] {
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([])
  useEffect(() => {
    let active = true
    window.electron.workspace.list()
      .then((list) => {
        if (active) setWorkspaces(list)
      })
      .catch(() => {
        if (active) setWorkspaces([])
      })
    return () => {
      active = false
    }
  }, [])
  return workspaces
}

type Editing = { kind: 'new' } | { kind: 'routine'; id: string }

export function BotRoutines({ bot }: { bot: BotDefinition }): React.ReactElement {
  const { t } = useTranslation()
  const ids = useId()
  const { routines } = useRoutines()
  const workspaces = useWorkspaces()
  const now = useNow()
  const [editing, setEditing] = useState<Editing | null>(null)

  const botRoutines = useMemo(() => routines.filter((routine) => routine.botId === bot.id), [routines, bot.id])
  const availableWorkspaces = useMemo(
    () => workspaces.filter((workspace) => isBotAvailableInWorkspace(bot, workspace.id)),
    [workspaces, bot],
  )
  const editedRoutine = editing?.kind === 'routine'
    ? botRoutines.find((routine) => routine.id === editing.id) ?? null
    : null

  const workspaceName = (workspaceId: string): string => {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (!workspace) return t('bots.routines.workspaceMissing')
    return workspace.name.trim() || t('bots.workspaceUnnamed')
  }

  // The bot editor is a form: Enter inside a routine field must not save the bot.
  const preventFormSubmit = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault()
  }

  return (
    <section className={BLOCK_CLASS} aria-labelledby={`${ids}-title`} onKeyDown={preventFormSubmit}>
      <div className="flex items-center justify-between gap-3">
        <h4 id={`${ids}-title`} className="nd-label text-text-display">{t('bots.routines.title')}</h4>
        {!editing && (
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 ${SMALL_BUTTON_CLASS}`}
            onClick={() => setEditing({ kind: 'new' })}
          >
            <Plus size={12} aria-hidden="true" />
            {t('bots.routines.newRoutine')}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-text-secondary">{t('bots.routines.note')}</p>

      {botRoutines.length === 0 && !editing && (
        <p className="mt-3 text-sm text-text-secondary">{t('bots.routines.empty')}</p>
      )}

      {botRoutines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {botRoutines.map((routine) => (
            <li key={routine.id}>
              {editing?.kind === 'routine' && editing.id === routine.id ? null : (
                <RoutineRow
                  routine={routine}
                  workspaceName={workspaceName(routine.workspaceId)}
                  now={now}
                  onEdit={() => setEditing({ kind: 'routine', id: routine.id })}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (editing.kind === 'new' || editedRoutine) && (
        <RoutineEditor
          key={editedRoutine?.id ?? 'new'}
          bot={bot}
          routine={editedRoutine}
          workspaces={availableWorkspaces}
          onDone={() => setEditing(null)}
        />
      )}
    </section>
  )
}

interface RoutineRowProps {
  routine: Routine
  workspaceName: string
  now: Date
  onEdit: () => void
}

function RoutineRow({ routine, workspaceName, now, onEdit }: RoutineRowProps): React.ReactElement {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const feedbackTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(feedbackTimer.current), [])

  const showFeedback = (text: string): void => {
    setFeedback(text)
    window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setFeedback(''), RUN_FEEDBACK_MS)
  }

  const describeRun = (result: RoutineRunResult): string => {
    if (result === 'skipped-busy') return t('bots.routines.runSkipped')
    if (result === 'failed') return t('bots.routines.runFailed')
    if (result === 'no-update') return t('bots.routines.runNoUpdate')
    if (result === 'reported') return t('bots.routines.runReported')
    return t('bots.routines.runStarted')
  }

  const runNow = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      showFeedback(describeRun(await window.electron.routines.runNow(routine.id)))
    } catch (runError) {
      setFeedback('')
      setError(getErrorMessage(runError, t('bots.routines.runFailed')))
    } finally {
      setBusy(false)
    }
  }

  const toggleEnabled = async (enabled: boolean): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.electron.routines.save(inputFromRoutine(routine, enabled))
    } catch (saveError) {
      setError(getErrorMessage(saveError, t('bots.routines.saveFailed')))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const deleted = await window.electron.routines.delete(routine.id)
      if (!deleted) throw new Error(t('bots.routines.deleteFailed'))
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, t('bots.routines.deleteFailed')))
      setConfirmingDelete(false)
    } finally {
      setBusy(false)
    }
  }

  const nextRun = formatNextRun(routine, now, t)

  return (
    <div className="rounded-[14px] border border-border bg-bg-secondary px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate text-sm text-text-display">{routine.name}</span>
            {routine.pausedAt && (
              <span className="rounded-full border border-warning/40 px-2 py-0.5 text-xs text-warning">
                {t('bots.routines.paused')}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-text-secondary">
            {formatSchedule(routine.schedule, t)} · {workspaceName}
          </p>
          <p className="mt-1 text-xs text-text-secondary">{formatLastRun(routine, now, t)}</p>
          {nextRun && <p className="mt-0.5 text-xs text-text-secondary">{nextRun}</p>}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            role="switch"
            className="accent-(--accent)"
            checked={routine.enabled}
            disabled={busy}
            onChange={(event) => void toggleEnabled(event.target.checked)}
          />
          {t('bots.routines.enabled')}
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => void runNow()}>
          {t('bots.routines.runNow')}
        </button>
        <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={onEdit}>
          {t('bots.routines.edit')}
        </button>
        {confirmingDelete ? (
          <>
            <button type="button" className={SMALL_BUTTON_CLASS} disabled={busy} onClick={() => setConfirmingDelete(false)}>
              {t('bots.routines.cancel')}
            </button>
            <button
              type="button"
              className={`${DANGER_BUTTON_CLASS} border-danger bg-danger/10`}
              disabled={busy}
              onClick={() => void remove()}
            >
              {t('bots.routines.confirmDelete')}
            </button>
          </>
        ) : (
          <button type="button" className={DANGER_BUTTON_CLASS} disabled={busy} onClick={() => setConfirmingDelete(true)}>
            {t('bots.routines.delete')}
          </button>
        )}
        {feedback && <span role="status" className="text-xs text-text-secondary">{feedback}</span>}
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </div>
  )
}

interface RoutineEditorProps {
  bot: BotDefinition
  routine: Routine | null
  workspaces: WorkspaceMetadata[]
  onDone: () => void
}

function RoutineEditor({ bot, routine, workspaces, onDone }: RoutineEditorProps): React.ReactElement {
  const { t } = useTranslation()
  const ids = useId()
  const [form, setForm] = useState<RoutineForm>(() => (routine ? formFromRoutine(routine) : emptyForm()))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (patch: Partial<RoutineForm>): void => setForm((current) => ({ ...current, ...patch }))

  const workspaceId = form.workspaceId ?? workspaces[0]?.id ?? ''
  const workspaceValid = workspaces.some((workspace) => workspace.id === workspaceId)
  const intervalValid = form.kind !== 'interval' || isIntervalValid(Number(form.every), form.unit)
  const timeValid = form.kind !== 'daily' || TIME_PATTERN.test(form.time)
  const canSave = form.name.trim().length > 0
    && form.instruction.trim().length > 0
    && workspaceValid
    && intervalValid
    && timeValid
    && !saving

  const save = async (): Promise<void> => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      await window.electron.routines.save({
        ...(routine ? { id: routine.id } : {}),
        botId: bot.id,
        workspaceId,
        name: form.name.trim(),
        instruction: form.instruction,
        schedule: scheduleFromForm(form),
        enabled: form.enabled,
      })
      onDone()
    } catch (saveError) {
      setError(getErrorMessage(saveError, t('bots.routines.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 space-y-4 rounded-[14px] border border-border-visible bg-bg-secondary px-3 py-4">
      <div>
        <label htmlFor={`${ids}-name`} className="nd-label text-text-secondary">{t('bots.routines.name')}</label>
        <input
          id={`${ids}-name`}
          type="text"
          className={`${FIELD_CLASS} mt-2`}
          value={form.name}
          maxLength={ROUTINE_NAME_MAX_LENGTH}
          placeholder={t('bots.routines.namePlaceholder')}
          onChange={(event) => update({ name: event.target.value })}
        />
      </div>

      <div>
        <label htmlFor={`${ids}-workspace`} className="nd-label text-text-secondary">{t('bots.routines.workspace')}</label>
        <select
          id={`${ids}-workspace`}
          className={`${FIELD_CLASS} mt-2`}
          value={workspaceValid ? workspaceId : ''}
          disabled={workspaces.length === 0}
          aria-describedby={workspaces.length === 0 ? `${ids}-workspace-hint` : undefined}
          onChange={(event) => update({ workspaceId: event.target.value })}
        >
          {!workspaceValid && <option value="" disabled>{t('bots.routines.workspaceChoose')}</option>}
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.name.trim() || t('bots.workspaceUnnamed')}
            </option>
          ))}
        </select>
        {workspaces.length === 0 && (
          <p id={`${ids}-workspace-hint`} className="mt-2 text-xs text-text-secondary">{t('bots.routines.noWorkspaces')}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${ids}-instruction`} className="nd-label text-text-secondary">{t('bots.routines.instruction')}</label>
        <textarea
          id={`${ids}-instruction`}
          className={`${FIELD_CLASS} mt-2 min-h-24 resize-y`}
          value={form.instruction}
          maxLength={ROUTINE_INSTRUCTION_MAX_LENGTH}
          placeholder={t('bots.routines.instructionPlaceholder')}
          aria-describedby={`${ids}-instruction-help`}
          onChange={(event) => update({ instruction: event.target.value })}
        />
        <p id={`${ids}-instruction-help`} className="mt-2 text-xs text-text-secondary">{t('bots.routines.instructionHelp')}</p>
      </div>

      <ScheduleFields idPrefix={ids} form={form} intervalValid={intervalValid} onChange={update} />

      <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          className="accent-(--accent)"
          checked={form.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
        />
        {t('bots.routines.enabled')}
      </label>

      {error && (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={`rounded-full bg-accent px-4 py-2 text-sm text-(--accent-text) transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`}
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving ? t('bots.routines.saving') : t('bots.routines.save')}
        </button>
        <button type="button" className={SECONDARY_BUTTON_CLASS} disabled={saving} onClick={onDone}>
          {t('bots.routines.cancel')}
        </button>
      </div>
    </div>
  )
}

interface ScheduleFieldsProps {
  idPrefix: string
  form: RoutineForm
  intervalValid: boolean
  onChange: (patch: Partial<RoutineForm>) => void
}

const SCHEDULE_KINDS: { kind: ScheduleKind; labelKey: string }[] = [
  { kind: 'manual', labelKey: 'bots.routines.whenManual' },
  { kind: 'daily', labelKey: 'bots.routines.whenDaily' },
  { kind: 'interval', labelKey: 'bots.routines.whenInterval' },
]

function ScheduleFields({ idPrefix, form, intervalValid, onChange }: ScheduleFieldsProps): React.ReactElement {
  const { t } = useTranslation()

  return (
    <div>
      <div id={`${idPrefix}-when`} className="nd-label text-text-secondary">{t('bots.routines.when')}</div>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-when`} className="mt-2 flex flex-wrap gap-2">
        {SCHEDULE_KINDS.map(({ kind, labelKey }) => (
          <label key={kind} className={PILL_CLASS}>
            <input
              type="radio"
              name={`${idPrefix}-when-radio`}
              className="accent-(--accent)"
              checked={form.kind === kind}
              onChange={() => onChange({ kind })}
            />
            {t(labelKey)}
          </label>
        ))}
      </div>

      {form.kind === 'daily' && (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor={`${idPrefix}-time`} className="nd-label text-text-secondary">{t('bots.routines.time')}</label>
            <input
              id={`${idPrefix}-time`}
              type="time"
              className={`${FIELD_CLASS} mt-2 w-auto`}
              value={form.time}
              required
              onChange={(event) => onChange({ time: event.target.value })}
            />
          </div>
          <DayChips idPrefix={idPrefix} days={form.days} onChange={(days) => onChange({ days })} />
        </div>
      )}

      {form.kind === 'interval' && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${idPrefix}-every`} className="nd-label text-text-secondary">{t('bots.routines.every')}</label>
            <input
              id={`${idPrefix}-every`}
              type="number"
              min={1}
              step={1}
              className={`${FIELD_CLASS} w-24`}
              value={form.every}
              aria-invalid={!intervalValid}
              aria-describedby={`${idPrefix}-every-help`}
              onChange={(event) => onChange({ every: event.target.value })}
            />
            <select
              aria-label={t('bots.routines.unit')}
              className={`${FIELD_CLASS} w-auto`}
              value={form.unit}
              onChange={(event) => onChange({ unit: event.target.value === 'hours' ? 'hours' : 'minutes' })}
            >
              <option value="minutes">{t('bots.routines.unitMinutes')}</option>
              <option value="hours">{t('bots.routines.unitHours')}</option>
            </select>
          </div>
          <p
            id={`${idPrefix}-every-help`}
            role={intervalValid ? undefined : 'alert'}
            className={`mt-2 text-xs ${intervalValid ? 'text-text-secondary' : 'text-danger'}`}
          >
            {intervalValid
              ? t('bots.routines.intervalHelp', { minutes: ROUTINE_MIN_INTERVAL_MINUTES })
              : t('bots.routines.intervalInvalid', { minutes: ROUTINE_MIN_INTERVAL_MINUTES })}
          </p>
        </div>
      )}
    </div>
  )
}

interface DayChipsProps {
  idPrefix: string
  days: number[]
  onChange: (days: number[]) => void
}

function DayChips({ idPrefix, days, onChange }: DayChipsProps): React.ReactElement {
  const { t } = useTranslation()
  const everyDay = days.length === 0
  const weekdays = sameDays(days, ROUTINE_WEEKDAYS)

  const toggle = (day: number, checked: boolean): void => {
    const next = checked ? [...days, day] : days.filter((value) => value !== day)
    onChange(ROUTINE_WEEK_ORDER.filter((value) => next.includes(value)))
  }

  const presetClass = (selected: boolean): string => `${SMALL_BUTTON_CLASS} ${
    selected ? 'border-accent bg-accent-subtle text-text-primary' : ''
  }`

  return (
    <div>
      <div id={`${idPrefix}-days`} className="nd-label text-text-secondary">{t('bots.routines.days')}</div>
      <div role="group" aria-labelledby={`${idPrefix}-days`} className="mt-2 flex flex-wrap items-center gap-2">
        {ROUTINE_WEEK_ORDER.map((day) => {
          const key = weekdayKey(day)
          return (
            <label
              key={day}
              title={t(`bots.routines.weekdayNames.${key}`)}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border-visible text-xs text-text-primary has-checked:border-accent has-checked:bg-accent-subtle has-focus-visible:outline-solid has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--interactive)"
            >
              <input
                type="checkbox"
                className="sr-only"
                aria-label={t(`bots.routines.weekdayNames.${key}`)}
                checked={days.includes(day)}
                onChange={(event) => toggle(day, event.target.checked)}
              />
              <span aria-hidden="true">{t(`bots.routines.dayLetters.${key}`)}</span>
            </label>
          )
        })}
        <button type="button" className={presetClass(everyDay)} aria-pressed={everyDay} onClick={() => onChange([])}>
          {t('bots.routines.presetEveryDay')}
        </button>
        <button
          type="button"
          className={presetClass(weekdays)}
          aria-pressed={weekdays}
          onClick={() => onChange([...ROUTINE_WEEKDAYS])}
        >
          {t('bots.routines.presetWeekdays')}
        </button>
      </div>
      <p className="mt-2 text-xs text-text-secondary">{t('bots.routines.daysHelp')}</p>
    </div>
  )
}
