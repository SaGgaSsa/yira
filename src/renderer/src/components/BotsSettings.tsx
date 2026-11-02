import React, { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import {
  BOT_COLOR_HEX,
  BOT_COLOR_IDS,
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_ICON_IDS,
  BOT_MODEL_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_ROLE_MAX_LENGTH,
  BOT_TOOL_IDS,
  isValidBotModel,
} from '@shared/bots'
import type {
  BotColorId,
  BotDefinition,
  BotDefinitionInput,
  BotIconId,
  BotToolId,
  BotWorkspaceScope,
} from '@shared/bots'
import type { AgentProvider, WorkspaceMetadata } from '@shared/types'
import { useBots } from '@/hooks/useBots'
import { agentProviderDetails } from './AgentUsageIndicator'
import { BOT_ICON_COMPONENTS, BotAvatar } from './botVisuals'
import { BotRoutines } from './BotRoutines'

interface BotsSettingsProps {
  enabledProviders: AgentProvider[]
}

interface BotForm {
  name: string
  icon: BotIconId
  color: BotColorId
  provider: AgentProvider
  model: string
  description: string
  role: string
  workspaces: BotWorkspaceScope
  /** Kept in `BOT_TOOL_IDS` order so the dirty check does not depend on click order. */
  tools: BotToolId[]
  callable: boolean
}

type Selection = { kind: 'bot'; id: string } | { kind: 'new'; key: number }

const BLOCK_CLASS = 'rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4'
const FOCUS_CLASS = 'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)'
const FIELD_CLASS = `w-full rounded-[12px] border border-border-visible bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary ${FOCUS_CLASS}`
const SECONDARY_BUTTON_CLASS = `rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`
const PEER_FOCUS_CLASS = 'peer-focus-visible:outline-solid peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--interactive)'

function emptyForm(provider: AgentProvider): BotForm {
  return {
    name: '',
    icon: 'sparkles',
    color: 'sky',
    provider,
    model: '',
    description: '',
    role: '',
    workspaces: { mode: 'all' },
    tools: [],
    callable: false,
  }
}

function formFromBot(bot: BotDefinition): BotForm {
  return {
    name: bot.name,
    icon: bot.icon,
    color: bot.color,
    provider: bot.provider,
    model: bot.model,
    description: bot.description,
    role: bot.role,
    workspaces: bot.workspaces,
    tools: BOT_TOOL_IDS.filter((tool) => bot.tools.includes(tool)),
    callable: bot.callable,
  }
}

function formsEqual(a: BotForm, b: BotForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function toInput(form: BotForm, id: string | undefined): BotDefinitionInput {
  return { ...(id ? { id } : {}), ...form, name: form.name.trim(), model: form.model.trim() }
}

/** Removes the Electron IPC wrapper so only the validation message is shown. */
function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback
  return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Shows a just-saved bot until the change event with the stored list arrives. */
function mergeSavedBot(bots: BotDefinition[], saved: BotDefinition | null): BotDefinition[] {
  if (!saved) return bots
  const existing = bots.find((bot) => bot.id === saved.id)
  if (existing && existing.updatedAt >= saved.updatedAt) return bots
  return existing ? bots.map((bot) => (bot.id === saved.id ? saved : bot)) : [...bots, saved]
}

export function BotsSettings({ enabledProviders }: BotsSettingsProps): React.ReactElement {
  const { t } = useTranslation()
  const { bots, loaded } = useBots()
  const [workspaces, setWorkspaces] = useState<WorkspaceMetadata[]>([])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [lastSaved, setLastSaved] = useState<BotDefinition | null>(null)
  const [draftCounter, setDraftCounter] = useState(0)

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

  // A change event carries the stored list, so the optimistic copy is no longer needed.
  useEffect(() => {
    setLastSaved(null)
  }, [bots])

  const visibleBots = useMemo(() => mergeSavedBot(bots, lastSaved), [bots, lastSaved])

  const selectedBot = selection?.kind === 'bot'
    ? visibleBots.find((bot) => bot.id === selection.id) ?? null
    : null
  const effectiveSelection: Selection | null = selection?.kind === 'new'
    ? selection
    : selectedBot
      ? selection
      : visibleBots[0]
        ? { kind: 'bot', id: visibleBots[0].id }
        : null
  const editorBot = effectiveSelection?.kind === 'bot'
    ? visibleBots.find((bot) => bot.id === effectiveSelection.id) ?? null
    : null

  const startNewBot = (): void => {
    if (selection?.kind === 'new') return
    setDraftCounter((counter) => counter + 1)
    setSelection({ kind: 'new', key: draftCounter + 1 })
  }

  const handleSaved = (bot: BotDefinition): void => {
    setLastSaved(bot)
    setSelection({ kind: 'bot', id: bot.id })
  }

  const handleDeleted = (): void => {
    setLastSaved(null)
    setSelection(null)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <BotList
        bots={visibleBots}
        loaded={loaded}
        selection={effectiveSelection}
        onSelect={(id) => setSelection({ kind: 'bot', id })}
        onNew={startNewBot}
      />
      {effectiveSelection && (
        <BotEditor
          key={effectiveSelection.kind === 'bot' ? effectiveSelection.id : `new-${effectiveSelection.key}`}
          bot={editorBot}
          enabledProviders={enabledProviders}
          workspaces={workspaces}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

interface BotListProps {
  bots: BotDefinition[]
  loaded: boolean
  selection: Selection | null
  onSelect: (id: string) => void
  onNew: () => void
}

function BotList({ bots, loaded, selection, onSelect, onNew }: BotListProps): React.ReactElement {
  const { t } = useTranslation()
  const rowClass = (selected: boolean): string => `flex w-full items-center gap-2.5 rounded-[14px] border px-3 py-2 text-left transition-colors ${FOCUS_CLASS} ${
    selected ? 'border-accent bg-accent-subtle' : 'border-transparent hover:bg-hover-bg'
  }`

  return (
    <div className="min-w-0 space-y-3 self-start xl:sticky xl:top-0">
      <button
        type="button"
        className={`flex w-full items-center justify-center gap-2 rounded-full border border-border-visible px-4 py-2 text-sm text-text-display transition-colors hover:bg-hover-bg ${FOCUS_CLASS}`}
        onClick={onNew}
      >
        <Plus size={14} aria-hidden="true" />
        {t('bots.newBot')}
      </button>
      <ul aria-label={t('bots.listLabel')} className="space-y-1">
        {selection?.kind === 'new' && (
          <li>
            <div className={rowClass(true)} aria-current="true">
              <BotAvatar icon="sparkles" color="sky" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-text-display">{t('bots.newBotDraft')}</span>
                <span className="block truncate text-xs text-text-secondary">{t('bots.unsavedBadge')}</span>
              </span>
            </div>
          </li>
        )}
        {bots.map((bot) => {
          const selected = selection?.kind === 'bot' && selection.id === bot.id
          return (
            <li key={bot.id}>
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                className={rowClass(selected)}
                onClick={() => onSelect(bot.id)}
              >
                <BotAvatar icon={bot.icon} color={bot.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text-display">{bot.name}</span>
                  <span className="block truncate text-xs text-text-secondary">{agentProviderDetails[bot.provider].label}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {loaded && bots.length === 0 && selection === null && (
        <div className="px-1">
          <p className="text-sm text-text-display">{t('bots.emptyTitle')}</p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{t('bots.emptyDescription')}</p>
        </div>
      )}
    </div>
  )
}

interface BotEditorProps {
  bot: BotDefinition | null
  enabledProviders: AgentProvider[]
  workspaces: WorkspaceMetadata[]
  onSaved: (bot: BotDefinition) => void
  onDeleted: () => void
}

function BotEditor({ bot, enabledProviders, workspaces, onSaved, onDeleted }: BotEditorProps): React.ReactElement {
  const { t } = useTranslation()
  const ids = useId()
  const baseline = useMemo(
    () => (bot ? formFromBot(bot) : emptyForm(enabledProviders[0] ?? 'claude')),
    [bot, enabledProviders],
  )
  const [form, setForm] = useState<BotForm>(baseline)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')

  const dirty = !formsEqual(form, baseline)
  const modelValid = isValidBotModel(form.model.trim())
  const canSave = form.name.trim().length > 0 && modelValid && !saving
  const update = (patch: Partial<BotForm>): void => setForm((current) => ({ ...current, ...patch }))

  const save = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      const saved = await window.electron.bots.save(toInput(form, bot?.id))
      onSaved(saved)
    } catch (saveError) {
      setError(getErrorMessage(saveError, t('bots.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!bot) return
    setSaving(true)
    setError('')
    try {
      const deleted = await window.electron.bots.delete(bot.id)
      if (!deleted) throw new Error(t('bots.deleteFailed'))
      onDeleted()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, t('bots.deleteFailed')))
      setConfirmingDelete(false)
    } finally {
      setSaving(false)
    }
  }

  const providerOptions = enabledProviders.includes(form.provider)
    ? enabledProviders
    : [...enabledProviders, form.provider]
  const providerDisabled = !enabledProviders.includes(form.provider)

  return (
    <form
      className="min-w-0 space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) void save()
      }}
    >
      {/*
        Narrow editors stack every block in `order-*` sequence. From 56rem of editor width the two
        wrappers become real columns (`contents` stops flattening them) and `order-*` only sorts
        blocks inside each column.
      */}
      <div className="@container">
        <div className="flex flex-col gap-3 @4xl:grid @4xl:grid-cols-2 @4xl:items-start">
          <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-3">
            <section className={`${BLOCK_CLASS} order-1`} aria-labelledby={`${ids}-identity`}>
              <h4 id={`${ids}-identity`} className="nd-label text-text-display">{t('bots.identity')}</h4>
              <div className="mt-3 space-y-4">
                <div>
                  <label htmlFor={`${ids}-name`} className="nd-label text-text-secondary">{t('bots.name')}</label>
                  <input
                    id={`${ids}-name`}
                    type="text"
                    className={`${FIELD_CLASS} mt-2`}
                    value={form.name}
                    maxLength={BOT_NAME_MAX_LENGTH}
                    placeholder={t('bots.namePlaceholder')}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </div>
                <IconPicker
                  labelId={`${ids}-icon`}
                  name={`${ids}-icon-radio`}
                  value={form.icon}
                  color={form.color}
                  onChange={(icon) => update({ icon })}
                />
                <ColorPicker
                  labelId={`${ids}-color`}
                  name={`${ids}-color-radio`}
                  value={form.color}
                  onChange={(color) => update({ color })}
                />
                <div className="flex items-center gap-3 border-t border-border pt-3">
                  <span className="nd-label text-text-secondary">{t('bots.preview')}</span>
                  <BotAvatar icon={form.icon} color={form.color} size={28} />
                  <span className="min-w-0 truncate text-sm text-text-display">
                    {form.name.trim() || t('bots.newBotDraft')}
                  </span>
                </div>
              </div>
            </section>

            <section className={`${BLOCK_CLASS} order-2`} aria-labelledby={`${ids}-agent`}>
              <h4 id={`${ids}-agent`} className="nd-label text-text-display">{t('bots.agent')}</h4>
              <div className="mt-3 space-y-4">
                <div>
                  <div id={`${ids}-provider`} className="nd-label text-text-secondary">{t('bots.provider')}</div>
                  <div role="radiogroup" aria-labelledby={`${ids}-provider`} className="mt-2 flex flex-wrap gap-2">
                    {providerOptions.map((provider) => (
                      <label
                        key={provider}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-visible px-3 py-1.5 text-sm text-text-primary has-checked:border-accent has-checked:bg-accent-subtle has-focus-visible:outline-solid has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--interactive)"
                      >
                        <input
                          type="radio"
                          name={`${ids}-provider-radio`}
                          className="accent-(--accent)"
                          checked={form.provider === provider}
                          onChange={() => update({ provider })}
                        />
                        {agentProviderDetails[provider].label}
                      </label>
                    ))}
                  </div>
                  {providerDisabled && (
                    <p className="mt-2 text-xs text-text-secondary" role="status">{t('bots.providerDisabled')}</p>
                  )}
                </div>
                <div>
                  <label htmlFor={`${ids}-model`} className="nd-label text-text-secondary">{t('bots.model')}</label>
                  <input
                    id={`${ids}-model`}
                    type="text"
                    className={`${FIELD_CLASS} mt-2`}
                    value={form.model}
                    maxLength={BOT_MODEL_MAX_LENGTH}
                    placeholder={t('bots.modelPlaceholder')}
                    aria-invalid={!modelValid}
                    aria-describedby={`${ids}-model-help`}
                    spellCheck={false}
                    onChange={(event) => update({ model: event.target.value })}
                  />
                  <p id={`${ids}-model-help`} className={`mt-2 text-xs ${modelValid ? 'text-text-secondary' : 'text-danger'}`}>
                    {modelValid ? t('bots.modelHelp') : t('bots.modelInvalid')}
                  </p>
                </div>
              </div>
            </section>

            <section className={`${BLOCK_CLASS} order-3`}>
              <label htmlFor={`${ids}-description`} className="nd-label text-text-display">{t('bots.purpose')}</label>
              <textarea
                id={`${ids}-description`}
                className={`${FIELD_CLASS} mt-3 min-h-20 resize-y`}
                value={form.description}
                maxLength={BOT_DESCRIPTION_MAX_LENGTH}
                placeholder={t('bots.purposePlaceholder')}
                aria-describedby={`${ids}-description-help`}
                onChange={(event) => update({ description: event.target.value })}
              />
              <FieldFooter
                id={`${ids}-description-help`}
                help={t('bots.purposeHelp')}
                length={form.description.length}
                max={BOT_DESCRIPTION_MAX_LENGTH}
              />
            </section>

            <section className={`${BLOCK_CLASS} order-6`} aria-labelledby={`${ids}-workspaces`}>
              <h4 id={`${ids}-workspaces`} className="nd-label text-text-display">{t('bots.workspaces')}</h4>
              <WorkspaceScopePicker
                name={`${ids}-workspaces-radio`}
                labelId={`${ids}-workspaces`}
                helpId={`${ids}-workspaces-help`}
                value={form.workspaces}
                workspaces={workspaces}
                onChange={(scope) => update({ workspaces: scope })}
              />
            </section>
          </div>

          <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-col @4xl:gap-3">
            <section className={`${BLOCK_CLASS} order-4`}>
              <label htmlFor={`${ids}-role`} className="nd-label text-text-display">{t('bots.role')}</label>
              <textarea
                id={`${ids}-role`}
                className={`${FIELD_CLASS} mt-3 min-h-64 resize-y font-mono @4xl:min-h-72`}
                value={form.role}
                maxLength={BOT_ROLE_MAX_LENGTH}
                placeholder={t('bots.rolePlaceholder')}
                aria-describedby={`${ids}-role-help`}
                spellCheck={false}
                onChange={(event) => update({ role: event.target.value })}
              />
              <FieldFooter
                id={`${ids}-role-help`}
                help={t('bots.roleHelp')}
                length={form.role.length}
                max={BOT_ROLE_MAX_LENGTH}
              />
            </section>

            <section className={`${BLOCK_CLASS} order-5`} aria-labelledby={`${ids}-tools`}>
              <h4 id={`${ids}-tools`} className="nd-label text-text-display">{t('bots.yiraTools')}</h4>
              <p className="mt-2 text-xs text-text-secondary">{t('bots.yiraToolsNote')}</p>
              <ul className="mt-3 space-y-1">
                {BOT_TOOL_IDS.map((tool) => (
                  <li key={tool}>
                    <ToggleRow
                      label={t(`bots.toolLabels.${tool}`)}
                      help={t(`bots.toolHelps.${tool}`)}
                      checked={form.tools.includes(tool)}
                      onChange={(checked) => update({
                        tools: BOT_TOOL_IDS.filter((id) => (id === tool ? checked : form.tools.includes(id))),
                      })}
                    />
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-border pt-3">
                <ToggleRow
                  label={t('bots.callable')}
                  help={t('bots.callableHelp')}
                  checked={form.callable}
                  onChange={(callable) => update({ callable })}
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      {bot && <BotRoutines bot={bot} />}

      <div className="sticky bottom-0 z-10 space-y-3 border-t border-border bg-bg-tertiary py-3">
        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={`rounded-full bg-accent px-4 py-2 text-sm text-(--accent-text) transition-colors hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`}
            disabled={!canSave}
          >
            {saving ? t('bots.saving') : t('bots.save')}
          </button>
          {dirty && (
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              disabled={saving}
              onClick={() => {
                setForm(baseline)
                setError('')
              }}
            >
              {t('bots.discard')}
            </button>
          )}
          {bot && (
            <div className="ml-auto flex items-center gap-2">
              {confirmingDelete ? (
                <>
                  <button
                    type="button"
                    className={SECONDARY_BUTTON_CLASS}
                    disabled={saving}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    {t('bots.cancel')}
                  </button>
                  <button
                    type="button"
                    className={`rounded-full border border-danger bg-danger/10 px-4 py-2 text-sm text-danger transition-colors hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`}
                    disabled={saving}
                    onClick={() => void remove()}
                  >
                    {t('bots.confirmDelete')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`rounded-full border border-danger/40 px-4 py-2 text-sm text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_CLASS}`}
                  disabled={saving}
                  onClick={() => setConfirmingDelete(true)}
                >
                  {t('bots.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}

interface ToggleRowProps {
  label: string
  help: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function ToggleRow({ label, help, checked, onChange }: ToggleRowProps): React.ReactElement {
  const helpId = useId()
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-[10px] px-2 py-1.5 hover:bg-hover-bg">
      <input
        type="checkbox"
        className="mt-0.5 accent-(--accent)"
        checked={checked}
        aria-describedby={helpId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm text-text-primary">{label}</span>
        <span id={helpId} className="block text-xs text-text-secondary">{help}</span>
      </span>
    </label>
  )
}

interface FieldFooterProps {
  id: string
  help: string
  length: number
  max: number
}

function FieldFooter({ id, help, length, max }: FieldFooterProps): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className="mt-2 flex items-start justify-between gap-3 text-xs text-text-secondary">
      <p id={id}>{help}</p>
      <span className="shrink-0 tabular-nums">{t('bots.counter', { current: length, max })}</span>
    </div>
  )
}

interface IconPickerProps {
  labelId: string
  name: string
  value: BotIconId
  color: BotColorId
  onChange: (icon: BotIconId) => void
}

function IconPicker({ labelId, name, value, color, onChange }: IconPickerProps): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div>
      <div id={labelId} className="nd-label text-text-secondary">{t('bots.icon')}</div>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
        {BOT_ICON_IDS.map((icon) => {
          const Icon = BOT_ICON_COMPONENTS[icon]
          const selected = value === icon
          return (
            <label key={icon} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                className="peer sr-only"
                aria-label={t(`bots.icons.${icon}`)}
                checked={selected}
                onChange={() => onChange(icon)}
              />
              <span
                className={`flex size-9 items-center justify-center rounded-[10px] border transition-colors hover:bg-hover-bg ${PEER_FOCUS_CLASS} ${
                  selected ? 'border-accent bg-accent-subtle' : 'border-border-visible'
                }`}
                style={{ color: BOT_COLOR_HEX[color] }}
              >
                <Icon size={16} aria-hidden="true" />
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

interface ColorPickerProps {
  labelId: string
  name: string
  value: BotColorId
  onChange: (color: BotColorId) => void
}

function ColorPicker({ labelId, name, value, onChange }: ColorPickerProps): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div>
      <div id={labelId} className="nd-label text-text-secondary">{t('bots.color')}</div>
      <div role="radiogroup" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
        {BOT_COLOR_IDS.map((color) => {
          const selected = value === color
          return (
            <label key={color} className="cursor-pointer">
              <input
                type="radio"
                name={name}
                className="peer sr-only"
                aria-label={t(`bots.colors.${color}`)}
                checked={selected}
                onChange={() => onChange(color)}
              />
              <span
                className={`flex size-8 items-center justify-center rounded-full border-2 transition-colors ${PEER_FOCUS_CLASS} ${
                  selected ? 'border-text-display' : 'border-transparent'
                }`}
              >
                <span className="size-5 rounded-full" style={{ backgroundColor: BOT_COLOR_HEX[color] }} />
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

interface WorkspaceScopePickerProps {
  name: string
  labelId: string
  helpId: string
  value: BotWorkspaceScope
  workspaces: WorkspaceMetadata[]
  onChange: (scope: BotWorkspaceScope) => void
}

function WorkspaceScopePicker({
  name,
  labelId,
  helpId,
  value,
  workspaces,
  onChange,
}: WorkspaceScopePickerProps): React.ReactElement {
  const { t } = useTranslation()
  const selectedIds = value.mode === 'selected' ? value.workspaceIds : []
  const radioLabelClass = 'inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary'

  const toggleWorkspace = (workspaceId: string, checked: boolean): void => {
    const next = checked
      ? [...selectedIds, workspaceId]
      : selectedIds.filter((id) => id !== workspaceId)
    onChange({ mode: 'selected', workspaceIds: next })
  }

  return (
    <div className="mt-3 space-y-3">
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={helpId} className="flex flex-wrap gap-x-5 gap-y-2">
        <label className={radioLabelClass}>
          <input
            type="radio"
            name={name}
            className="accent-(--accent)"
            checked={value.mode === 'all'}
            onChange={() => onChange({ mode: 'all' })}
          />
          {t('bots.workspacesAll')}
        </label>
        <label className={radioLabelClass}>
          <input
            type="radio"
            name={name}
            className="accent-(--accent)"
            checked={value.mode === 'selected'}
            onChange={() => onChange({ mode: 'selected', workspaceIds: selectedIds })}
          />
          {t('bots.workspacesSelected')}
        </label>
      </div>
      {value.mode === 'selected' && (
        workspaces.length === 0 ? (
          <p className="text-sm text-text-secondary">{t('bots.workspacesNone')}</p>
        ) : (
          <ul className="space-y-1">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-1.5 text-sm text-text-primary hover:bg-hover-bg">
                  <input
                    type="checkbox"
                    className="accent-(--accent)"
                    checked={selectedIds.includes(workspace.id)}
                    onChange={(event) => toggleWorkspace(workspace.id, event.target.checked)}
                  />
                  <span className="min-w-0 truncate">{workspace.name.trim() || t('bots.workspaceUnnamed')}</span>
                </label>
              </li>
            ))}
          </ul>
        )
      )}
      <p id={helpId} className="text-xs text-text-secondary">{t('bots.workspacesHelp')}</p>
    </div>
  )
}
