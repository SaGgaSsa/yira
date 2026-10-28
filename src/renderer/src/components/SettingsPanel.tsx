import { APP_THEMES, isLightColorPreset } from '@shared/appThemes'
import { CONFIGURABLE_SHORTCUT_IDS, DEFAULT_SHORTCUTS } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'
import { getXtermTheme, resolveTerminalThemeId } from '@/utils/terminalTheme'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  X, Monitor, Moon, Sun, Type, Grid3x3, Globe, CodeXml, Info, RefreshCw, Download,
  LayoutGrid, Keyboard, Terminal, ExternalLink, FileText, Bot, Check, RotateCcw,
} from 'lucide-react'
import { createUserSettingsDraft, useSettingsStore } from '@/store/settingsStore'
import { useUpdateStore } from '@/store/updateStore'
import { getShortcutCatalog, SHORTCUT_LABEL_KEYS } from '@/utils/shortcutCatalog'
import { normalizeAccelerator } from '@/utils/shortcutResolver'
import { MOD_PANEL_PROMPT } from '@/utils/modPanelPrompt'
import type { AgentDetectionSnapshot, AgentProvider, UpdateState, UserSettings, WindowBackgroundMaterial } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'
import type { TerminalThemeId } from '@shared/terminalThemes'
import { TERMINAL_THEMES } from '@shared/terminalThemes'
import {
  buildFontStack,
  DEFAULT_INTERFACE_FONT_STACK,
  DEFAULT_MONO_FONT_STACK,
  MAX_FONT_FAMILY_LENGTH,
  MAX_FONT_SIZE_PX,
  MIN_FONT_SIZE_PX,
} from '@shared/userSettings'
import { loadInstalledFontFamilies } from '@/utils/localFonts'
import type { InstalledFontFamilies } from '@/utils/localFonts'
import type { LegalDocumentId } from './LegalDocuments'
import { ShortcutInput } from './ShortcutInput'
import { agentProviderDetails } from './AgentUsageIndicator'

const LegalDocuments = React.lazy(() => import('./LegalDocuments').then((module) => ({ default: module.LegalDocuments })))

export type SettingsSectionId =
  | 'appearance'
  | 'density'
  | 'canvas'
  | 'tiles'
  | 'terminal'
  | 'agents'
  | 'shortcuts'
  | 'browser'
  | 'advanced'
  | 'about'

interface SettingsPanelProps {
  open: boolean
  onClose: () => void
  onOpenJsonEditor: () => void
  initialSection?: SettingsSectionId
}

type ThemePreview = {
  themeId: UserSettings['themeId']
  appearance: UserSettings['appearance']
  terminalThemeId: TerminalThemeId
}

interface CompactSettingRowProps {
  title: string
  description?: string
  children: React.ReactNode
}

function CompactSettingRow({ title, description, children }: CompactSettingRowProps): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-border-visible bg-bg-secondary px-4 py-3">
      <div className="min-w-0">
        <div className="nd-label text-text-display">{title}</div>
        {description && <div className="mt-1 text-xs text-text-secondary">{description}</div>}
      </div>
      {children}
    </div>
  )
}

interface SegmentedControlOption<Value extends string> {
  value: Value
  label: string
  icon?: typeof Monitor
}

interface SegmentedControlProps<Value extends string> {
  value: Value
  options: ReadonlyArray<SegmentedControlOption<Value>>
  disabled?: boolean
  onChange: (value: Value) => void
}

function SegmentedControl<Value extends string>({ value, options, disabled = false, onChange }: SegmentedControlProps<Value>): React.ReactElement {
  return (
    <div className="inline-flex rounded-full border border-border p-0.5">
      {options.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
              value === option.value ? 'bg-bg-tertiary text-text-display' : 'text-text-secondary'
            }`}
            onClick={() => onChange(option.value)}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

const SUPPORT_REPOSITORY_URL = 'https://github.com/SaGgaSsa/yira'

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId
  icon: typeof Monitor
}> = [
  { id: 'appearance', icon: Monitor },
  { id: 'density', icon: Type },
  { id: 'canvas', icon: Grid3x3 },
  { id: 'tiles', icon: LayoutGrid },
  { id: 'terminal', icon: Terminal },
  { id: 'agents', icon: Bot },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'browser', icon: Globe },
  { id: 'advanced', icon: CodeXml },
  { id: 'about', icon: Info },
]

function getUpdateSummary(t: TFunction, state: UpdateState): string {
  switch (state.status) {
    case 'unsupported':
      return t('settings.updateUnsupported')
    case 'checking':
      return t('settings.updateChecking')
    case 'available':
      return t('settings.updateAvailable', { version: state.availableVersion ?? '' })
    case 'downloading':
      return state.progressPercent !== null
        ? t('settings.updateDownloadingProgress', { percent: state.progressPercent })
        : t('settings.updateDownloading')
    case 'downloaded':
      return t('settings.updateDownloaded', { version: state.availableVersion ?? '' })
    case 'up-to-date':
      return t('settings.updateUpToDate')
    case 'error':
      return state.message ?? t('settings.updateUnable')
    default:
      return t('settings.updateWaiting')
  }
}

function getUpdateStatusLabel(t: TFunction, status: UpdateState['status']): string {
  switch (status) {
    case 'unsupported': return t('settings.updateStatusUnsupported')
    case 'checking': return t('settings.updateStatusChecking')
    case 'available': return t('settings.updateStatusAvailable')
    case 'downloading': return t('settings.updateStatusDownloading')
    case 'downloaded': return t('settings.updateStatusDownloaded')
    case 'up-to-date': return t('settings.updateStatusUpToDate')
    case 'error': return t('settings.updateStatusError')
    case 'idle': return t('settings.updateStatusIdle')
  }
}

function getShortcutName(t: TFunction, id: ShortcutId): string {
  return t(SHORTCUT_LABEL_KEYS[id])
}

function getSectionLabel(t: TFunction, id: SettingsSectionId): string {
  switch (id) {
    case 'appearance': return t('settings.appearance')
    case 'density': return t('settings.fontSize')
    case 'canvas': return t('settings.canvas')
    case 'tiles': return t('settings.tiles')
    case 'terminal': return t('settings.terminal')
    case 'agents': return t('settings.agents')
    case 'shortcuts': return t('settings.shortcuts')
    case 'browser': return t('settings.browser')
    case 'advanced': return t('settings.advanced')
    case 'about': return t('settings.aboutAndUpdates')
  }
}

export function SettingsPanel({ open, onClose, onOpenJsonEditor, initialSection = 'appearance' }: SettingsPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance')
  const [agentHookMessages, setAgentHookMessages] = useState<Partial<Record<AgentProvider, string>>>({})
  const [modPanelPromptCopied, setModPanelPromptCopied] = useState(false)
  const [agentDetection, setAgentDetection] = useState<AgentDetectionSnapshot | null>(null)
  const [draft, setDraft] = useState<UserSettings>(() => createUserSettingsDraft(useSettingsStore.getState()))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [supportLinkFailed, setSupportLinkFailed] = useState(false)
  const [backgroundMaterialSupported, setBackgroundMaterialSupported] = useState<WindowBackgroundMaterial[]>(['none'])
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null)
  const [installedFontFamilies, setInstalledFontFamilies] = useState<InstalledFontFamilies>({ all: [], monospace: [] })
  const privacyDocumentButtonRef = useRef<HTMLButtonElement | null>(null)
  const termsDocumentButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreLegalDocumentFocusRef = useRef<LegalDocumentId | null>(null)
  const themePreviewBaselineRef = useRef<ThemePreview | null>(null)
  const applySettings = useSettingsStore((s) => s.applySettings)
  const windowBackgroundMaterialRequiresRestart = useSettingsStore((s) => s.windowBackgroundMaterialRequiresRestart)

  const previewTheme = useCallback((patch: Partial<ThemePreview>) => {
    if (!themePreviewBaselineRef.current) {
      const state = useSettingsStore.getState()
      themePreviewBaselineRef.current = {
        themeId: state.themeId,
        appearance: state.appearance,
        terminalThemeId: state.terminal.themeId,
      }
    }
    useSettingsStore.setState((state) => ({
      themeId: patch.themeId ?? state.themeId,
      appearance: patch.appearance ?? state.appearance,
      terminal: patch.terminalThemeId !== undefined
        ? { ...state.terminal, themeId: patch.terminalThemeId }
        : state.terminal,
    }))
  }, [])

  const restoreThemePreview = useCallback(() => {
    const baseline = themePreviewBaselineRef.current
    if (!baseline) return
    themePreviewBaselineRef.current = null
    useSettingsStore.setState((state) => ({
      themeId: baseline.themeId,
      appearance: baseline.appearance,
      terminal: { ...state.terminal, themeId: baseline.terminalThemeId },
    }))
  }, [])

  const language = draft.language
  const appearance = draft.appearance
  const interfaceFontSizePx = draft.interfaceFontSizePx
  const tileFontSizePx = draft.tileFontSizePx
  const interfaceFontFamily = draft.interfaceFontFamily
  const monoFontFamily = draft.monoFontFamily
  const showGrid = draft.showGrid
  const snapToGrid = draft.snapToGrid
  const gridSize = draft.gridSize
  const updateDiagnosticsEnabled = draft.updateDiagnosticsEnabled
  const browserHomeUrl = draft.browser.homeUrl
  const terminalAttentionEnabled = draft.terminal.attentionEnabled
  const agentAlertsEnabled = draft.terminal.agentAlertsEnabled
  const terminalThemeId = draft.terminal.themeId
  const attentionDelayEnabled = draft.notifications.attentionDelayEnabled
  const desktopAlertsEnabled = draft.notifications.desktopAlertsEnabled
  const tileCreationAvailability = draft.tiles.creationAvailability
  const setAgentEnabled = (provider: AgentProvider, enabled: boolean) => setDraft((current) => ({
    ...current,
    agents: { ...current.agents, [provider]: { enabled } },
  }))
  const setAppearance = (appearance: UserSettings['appearance']) => {
    setDraft((current) => ({ ...current, appearance }))
    previewTheme({ appearance })
  }
  const setThemeId = (themeId: UserSettings['themeId']) => {
    setDraft((current) => ({ ...current, themeId }))
    previewTheme({ themeId })
  }
  const setLanguage = (language: UserSettings['language']) => setDraft((current) => ({ ...current, language }))
  const setInterfaceFontSizePx = (interfaceFontSizePx: number) => setDraft((current) => ({ ...current, interfaceFontSizePx }))
  const setTileFontSizePx = (tileFontSizePx: number) => setDraft((current) => ({ ...current, tileFontSizePx }))
  const setInterfaceFontFamily = (interfaceFontFamily: string) => setDraft((current) => ({ ...current, interfaceFontFamily }))
  const setMonoFontFamily = (monoFontFamily: string) => setDraft((current) => ({ ...current, monoFontFamily }))
  const setShowGrid = (showGrid: boolean) => setDraft((current) => ({ ...current, showGrid }))
  const setSnapToGrid = (snapToGrid: boolean) => setDraft((current) => ({ ...current, snapToGrid }))
  const setGridSize = (gridSize: number) => setDraft((current) => ({
    ...current,
    gridSize: Math.max(8, Math.min(80, Math.round(gridSize))),
  }))
  const setUpdateDiagnosticsEnabled = (updateDiagnosticsEnabled: boolean) => setDraft((current) => ({ ...current, updateDiagnosticsEnabled }))
  const setBrowserHomeUrl = (homeUrl: string) => setDraft((current) => ({ ...current, browser: { homeUrl } }))
  const setTerminalAttentionEnabled = (attentionEnabled: boolean) => setDraft((current) => ({
    ...current,
    terminal: { ...current.terminal, attentionEnabled },
  }))
  const setAgentAlertsEnabled = (agentAlertsEnabled: boolean) => setDraft((current) => ({
    ...current,
    terminal: { ...current.terminal, agentAlertsEnabled },
  }))
  const setTerminalThemeId = (themeId: TerminalThemeId) => {
    setDraft((current) => ({
      ...current,
      terminal: { ...current.terminal, themeId },
    }))
    previewTheme({ terminalThemeId: themeId })
  }
  const setNotificationAttentionDelayEnabled = (attentionDelayEnabled: boolean) => setDraft((current) => ({
    ...current,
    notifications: { ...current.notifications, attentionDelayEnabled },
  }))
  const setDesktopAlertsEnabled = (desktopAlertsEnabled: boolean) => setDraft((current) => ({
    ...current,
    notifications: { ...current.notifications, desktopAlertsEnabled },
  }))
  const setTileCreationAvailable = (type: keyof UserSettings['tiles']['creationAvailability'], available: boolean) => setDraft((current) => ({
    ...current,
    tiles: {
      creationAvailability: {
        ...DEFAULT_USER_SETTINGS.tiles.creationAvailability,
        ...current.tiles.creationAvailability,
        [type]: available,
      },
    },
  }))
  const updateDraftShortcut = (id: ShortcutId, accelerator: string) => setDraft((current) => ({
    ...current,
    shortcuts: { ...current.shortcuts, [id]: accelerator },
  }))
  const requestInstalledFontFamilies = () => {
    if (installedFontFamilies.all.length > 0) return
    void loadInstalledFontFamilies().then(setInstalledFontFamilies)
  }
  const currentVersion = useUpdateStore((s) => s.currentVersion)
  const availableVersion = useUpdateStore((s) => s.availableVersion)
  const updateStatus = useUpdateStore((s) => s.status)
  const progressPercent = useUpdateStore((s) => s.progressPercent)
  const updateMessage = useUpdateStore((s) => s.message)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const installUpdate = useUpdateStore((s) => s.installUpdate)

  const updateState: UpdateState = {
    status: updateStatus,
    currentVersion,
    availableVersion,
    progressPercent,
    message: updateMessage,
  }

  const isChecking = updateStatus === 'checking'
  const isDownloading = updateStatus === 'downloading'
  const isRestartReady = updateStatus === 'downloaded'
  const canCheckForUpdates = !isChecking && !isDownloading

  useEffect(() => {
    if (!open) return
    setActiveSection(initialSection)
    setDraft(createUserSettingsDraft(useSettingsStore.getState()))
    setSaveError('')
    setSupportLinkFailed(false)
    setLegalDocument(null)
    restoreLegalDocumentFocusRef.current = null
    void window.electron.window.getBackgroundMaterialState()
      .then((state) => setBackgroundMaterialSupported(state.supported))
      .catch(() => setBackgroundMaterialSupported(['none']))
  }, [initialSection, open])

  useEffect(() => {
    if (!open) return
    return () => restoreThemePreview()
  }, [open, restoreThemePreview])

  useEffect(() => {
    if (!open) return
    void window.electron.agents.detect().then(setAgentDetection).catch(() => setAgentDetection(null))
  }, [open])

  useEffect(() => {
    const documentToRestore = restoreLegalDocumentFocusRef.current
    if (legalDocument !== null || !documentToRestore) return
    restoreLegalDocumentFocusRef.current = null
    requestAnimationFrame(() => {
      const buttonRef = documentToRestore === 'privacy' ? privacyDocumentButtonRef : termsDocumentButtonRef
      buttonRef.current?.focus()
    })
  }, [legalDocument])

  const handleSupportLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setSupportLinkFailed(false)
    void window.electron.shell.openExternal(event.currentTarget.href).catch(() => {
      setSupportLinkFailed(true)
    })
  }

  const handleCancel = useCallback(() => {
    if (saving) return
    onClose()
  }, [onClose, saving])

  const handleLegalDocumentBack = useCallback(() => {
    restoreLegalDocumentFocusRef.current = legalDocument
    setLegalDocument(null)
  }, [legalDocument])

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setSaveError('')
    try {
      await applySettings(draft)
      themePreviewBaselineRef.current = null
      onClose()
    } catch (error) {
      console.error('[SettingsPanel] Failed to save settings:', error)
      setSaveError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }, [applySettings, draft, onClose, saving, t])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) handleCancel()
    },
    [handleCancel],
  )

  if (!open) return null as unknown as React.ReactElement

  const activeMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]
  const ActiveSectionIcon = activeMeta.icon

  const renderActiveSection = (): React.ReactElement => {
    if (legalDocument) {
      return (
        <React.Suspense fallback={null}>
          <LegalDocuments documentId={legalDocument} onBack={handleLegalDocumentBack} />
        </React.Suspense>
      )
    }

    if (activeSection === 'appearance') {
      const themeGroups = [
        { label: t('settings.dark'), themes: APP_THEMES.filter((theme) => !isLightColorPreset(theme.id)) },
        { label: t('settings.light'), themes: APP_THEMES.filter((theme) => isLightColorPreset(theme.id)) },
      ]
      const windowBackgroundMaterial = backgroundMaterialSupported.includes(draft.windowBackgroundMaterial)
        ? draft.windowBackgroundMaterial
        : 'none'
      const windowBackgroundOptions = ([
        { value: 'none' as const, label: t('settings.windowBackgroundNone') },
        { value: 'mica' as const, label: t('settings.windowBackgroundMica') },
        { value: 'acrylic' as const, label: t('settings.windowBackgroundAcrylic') },
        { value: 'translucent' as const, label: t('settings.windowBackgroundTranslucent') },
      ]).filter(({ value }) => backgroundMaterialSupported.includes(value))

      return (
        <section>
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.appearance')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.theme')}</h3>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-sm text-text-secondary">{t('settings.appThemeDescription')}</p>
            <p className="mt-1 text-sm text-text-secondary">{t('settings.themePreviewHint')}</p>
          </div>

          <div className="space-y-4">
            {themeGroups.map((group) => (
              <div key={group.label}>
                <div className="nd-label mb-2 text-text-secondary">{group.label}</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {group.themes.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      aria-pressed={draft.themeId === theme.id}
                      onClick={() => setThemeId(theme.id)}
                      className={`rounded-[14px] border p-2 text-left focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive) ${
                        draft.themeId === theme.id
                          ? 'border-text-display ring-1 ring-text-display'
                          : 'border-border-visible hover:border-text-secondary'
                      }`}
                      style={{ background: theme.tokens['--surface'], color: theme.tokens['--text-primary'] }}
                    >
                      <span className="flex h-5 overflow-hidden rounded-[8px]" aria-hidden="true">
                        {(['--black', '--surface-raised', '--accent', '--success', '--interactive'] as const).map((token) => (
                          <span key={token} className="flex-1" style={{ background: theme.tokens[token] }} />
                        ))}
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-1">
                        <span className="truncate text-xs">{theme.label}</span>
                        {draft.themeId === theme.id && <Check size={12} className="shrink-0" aria-hidden="true" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <CompactSettingRow title={t('settings.mode')} description={t('settings.defaultAppearanceDescription')}>
              <SegmentedControl
                value={appearance}
                disabled={draft.themeId !== 'default'}
                onChange={setAppearance}
                options={[
                  { value: 'dark', icon: Moon, label: t('settings.dark') },
                  { value: 'light', icon: Sun, label: t('settings.light') },
                  { value: 'system', icon: Monitor, label: t('settings.system') },
                ]}
              />
            </CompactSettingRow>
            <div>
              <CompactSettingRow
                title={t('settings.windowBackgroundEffect')}
                description={backgroundMaterialSupported.length === 1 ? t('settings.requiresWindows11') : undefined}
              >
                <SegmentedControl
                  value={windowBackgroundMaterial}
                  disabled={backgroundMaterialSupported.length === 1}
                  onChange={(value) => setDraft((current) => ({ ...current, windowBackgroundMaterial: value }))}
                  options={windowBackgroundOptions}
                />
              </CompactSettingRow>
              {backgroundMaterialSupported.includes('translucent') && (
                <div className="mt-2 space-y-1 px-1 text-xs text-text-secondary">
                  <p>{t('settings.windowBackgroundRequiresRestart')}</p>
                  {windowBackgroundMaterialRequiresRestart && (
                    <p>{t('settings.windowBackgroundAppliedAfterRestart')}</p>
                  )}
                  <p>{t('settings.windowBackgroundBlurHelp')}</p>
                </div>
              )}
            </div>
            <CompactSettingRow title={t('settings.language')} description={t('settings.languageDescription')}>
              <SegmentedControl
                value={language}
                onChange={setLanguage}
                options={[
                  { value: 'en', label: t('settings.english') },
                  { value: 'es', label: t('settings.spanish') },
                ]}
              />
            </CompactSettingRow>
          </div>
        </section>
      )
    }

    if (activeSection === 'density') {
      const renderFontSlider = (
        label: string,
        value: number,
        onChange: (size: number) => void,
      ) => (
        <label className="block rounded-[20px] border border-border-visible bg-bg-secondary px-4 py-4">
          <span className="flex items-center justify-between gap-4">
            <span className="nd-label text-text-display">{label}</span>
            <span className="font-mono text-sm text-text-secondary">{value}px</span>
          </span>
          <input
            className="mt-5 w-full accent-(--text-display)"
            type="range"
            min={MIN_FONT_SIZE_PX}
            max={MAX_FONT_SIZE_PX}
            step={1}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </label>
      )

      const renderFontFamilyRow = (
        inputId: string,
        label: string,
        value: string,
        placeholder: string,
        fallbackStack: string,
        suggestions: string[],
        onChange: (family: string) => void,
      ) => {
        const fontFamily = buildFontStack(value, fallbackStack)
        const resetLabel = t('settings.resetFontFamily')
        return (
          <div className="rounded-[20px] border border-border-visible bg-bg-secondary px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <label className="nd-label text-text-display" htmlFor={inputId}>{label}</label>
              {value !== '' && (
                <button
                  type="button"
                  className="inline-flex size-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-display"
                  aria-label={resetLabel}
                  title={resetLabel}
                  onClick={() => onChange('')}
                >
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            <input
              id={inputId}
              className="mt-3 w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 text-sm text-text-display outline-hidden"
              type="text"
              list={`${inputId}-suggestions`}
              value={value}
              placeholder={placeholder}
              maxLength={MAX_FONT_FAMILY_LENGTH}
              spellCheck={false}
              onChange={(event) => onChange(event.target.value)}
              onPointerDown={requestInstalledFontFamilies}
              onFocus={requestInstalledFontFamilies}
            />
            <datalist id={`${inputId}-suggestions`}>
              {suggestions.map((family) => (
                <option key={family} value={family} />
              ))}
            </datalist>
            <p className="mt-3 text-sm text-text-secondary" style={{ fontFamily }}>
              {'Aa Bb 0123456789 {}[]() => !='}
            </p>
          </div>
        )
      }

      return (
        <section>
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.fonts')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.textScale')}</h3>
            </div>
          </div>

          <div className="space-y-3">
            {renderFontSlider(t('settings.interfaceFontSize'), interfaceFontSizePx, setInterfaceFontSizePx)}
            {renderFontSlider(t('settings.tileContentFontSize'), tileFontSizePx, setTileFontSizePx)}
          </div>

          <div className="mt-6">
            <div className="nd-label text-text-display">{t('settings.fontFamily')}</div>
            <p className="mt-1 text-sm text-text-secondary">{t('settings.fontFamilyDescription')}</p>
            <div className="mt-3 space-y-3">
              {renderFontFamilyRow(
                'settings-interface-font-family',
                t('settings.interfaceFontFamily'),
                interfaceFontFamily,
                t('settings.bundledFont', { name: 'Saira' }),
                DEFAULT_INTERFACE_FONT_STACK,
                installedFontFamilies.all,
                setInterfaceFontFamily,
              )}
              {renderFontFamilyRow(
                'settings-mono-font-family',
                t('settings.monoFontFamily'),
                monoFontFamily,
                t('settings.bundledFont', { name: 'IBM Plex Mono' }),
                DEFAULT_MONO_FONT_STACK,
                installedFontFamilies.monospace,
                setMonoFontFamily,
              )}
            </div>
          </div>
        </section>
      )
    }

    if (activeSection === 'canvas') {
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.canvas')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.gridAndSnapping')}</h3>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4">
              <span className="nd-label text-text-secondary">{t('settings.gridVisible')}</span>
              <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-4">
              <span className="nd-label text-text-secondary">{t('settings.snapEnabled')}</span>
              <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            </label>
            <label className="block">
              <span className="nd-label mb-2 block text-text-secondary">{t('settings.gridSize')}</span>
              <input
                className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-hidden"
                type="number"
                min={8}
                max={80}
                step={2}
                value={gridSize}
                onChange={(event) => setGridSize(Number(event.target.value))}
              />
            </label>
          </div>
        </section>
      )
    }

    if (activeSection === 'agents') {
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <Bot size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.agents')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.agentIntegrations')}</h3>
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.agentAlerts')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">
                  {t('settings.agentAlertsDescription')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={agentAlertsEnabled}
                onChange={(event) => setAgentAlertsEnabled(event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.desktopAlerts')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">
                  {t('settings.desktopAlertsDescription')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={desktopAlertsEnabled}
                onChange={(event) => setDesktopAlertsEnabled(event.target.checked)}
              />
            </label>
            {(['claude', 'codex'] as const).map((provider) => {
              const detection = agentDetection?.[provider]
              const enabled = draft.agents[provider].enabled
              const busy = !detection?.installed && !enabled
              const mutateHooks = async (operation: 'install' | 'uninstall') => {
                try {
                  const result = operation === 'install'
                    ? await window.electron.settings.configureAgentHooks(provider)
                    : await window.electron.settings.uninstallAgentHooks(provider)
                  setAgentHookMessages((messages) => ({ ...messages, [provider]: result.message }))
                  setAgentDetection(await window.electron.agents.detect())
                } catch (error) {
                  setAgentHookMessages((messages) => ({ ...messages, [provider]: String(error) }))
                }
              }
              return (
                <article
                  key={provider}
                  className="rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4"
                >
                  <div className="flex items-center gap-3">
                    <img
                      className="size-7 object-contain"
                      src={agentProviderDetails[provider].logoPath}
                      alt=""
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="nd-label text-text-display">
                        {agentProviderDetails[provider].label}
                      </h4>
                      <p className="mt-1 text-xs text-text-secondary">
                        {detection
                          ? detection.installed
                            ? t('settings.agentInstalled', {
                              path: provider === 'claude' ? '~/.claude' : '~/.codex',
                            })
                            : t('settings.agentNotInstalled')
                          : t('settings.agentDetecting')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      aria-label={`${agentProviderDetails[provider].label} ${t('settings.enableAgent')}`}
                      checked={enabled}
                      disabled={busy}
                      onChange={(event) => setAgentEnabled(provider, event.target.checked)}
                    />
                  </div>
                  {enabled ? (
                    <div className="mt-4 border-t border-border pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mr-auto text-sm text-text-secondary">
                          {t('settings.yiraHooks')}: {detection?.hooksInstalled
                            ? t('settings.hooksInstalled')
                            : t('settings.hooksMissing')}
                        </span>
                        <button
                          type="button"
                          className="rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display"
                          onClick={() => void mutateHooks('install')}
                        >
                          {detection?.hooksInstalled ? t('settings.repair') : t('settings.install')}
                        </button>
                        {detection?.hooksInstalled && (
                          <button
                            type="button"
                            className="rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-secondary"
                            onClick={() => void mutateHooks('uninstall')}
                          >
                            {t('settings.uninstall')}
                          </button>
                        )}
                      </div>
                      {provider === 'codex' && (
                        <p className="mt-2 text-xs text-text-secondary">
                          {t('settings.codexHooksHelp')}
                        </p>
                      )}
                      {agentHookMessages[provider] && (
                        <p className="mt-2 text-xs text-text-secondary" role="status">
                          {agentHookMessages[provider]}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-text-secondary">{t('settings.agentDisabled')}</p>
                  )}
                </article>
              )
            })}
            <article className="rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="nd-label text-text-display">{t('settings.modPanels')}</h4>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{t('settings.modPanelsDescription')}</p>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">{t('settings.modPanelsSteps')}</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-border-visible px-3 py-1.5 text-xs text-text-display"
                  onClick={() => {
                    void window.electron.clipboard.writeText(MOD_PANEL_PROMPT).then(() => setModPanelPromptCopied(true))
                  }}
                >
                  {modPanelPromptCopied ? t('settings.modPanelPromptCopied') : t('settings.copyModPanelPrompt')}
                </button>
              </div>
              <details className="mt-3 border-t border-border pt-3">
                <summary className="cursor-pointer text-xs text-text-secondary hover:text-text-display">
                  {t('settings.showModPanelPrompt')}
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-bg-tertiary p-3 font-mono text-xs text-text-secondary">
                  {MOD_PANEL_PROMPT}
                </pre>
              </details>
            </article>
          </div>
        </section>
      )
    }

    if (activeSection === 'advanced') {
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.advanced')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.workspaceInternals')}</h3>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.updateDiagnostics')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">{t('settings.updateDiagnosticsDescription')}</span>
              </span>
              <input
                type="checkbox"
                checked={updateDiagnosticsEnabled}
                onChange={(event) => setUpdateDiagnosticsEnabled(event.target.checked)}
              />
            </label>

            <button
              className="flex w-full items-center justify-between rounded-full border border-border-visible px-4 py-3 text-left transition-colors hover:border-text-secondary"
              onClick={onOpenJsonEditor}
            >
              <span className="nd-label text-text-display">{t('settings.openRawCanvasJson')}</span>
              <span className="nd-caption text-text-secondary">[ {t('common.edit')} ]</span>
            </button>
          </div>
        </section>
      )
    }

    if (activeSection === 'tiles') {
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.tiles')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.notificationsAndCreation')}</h3>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.delayTimerNativeAttention')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">{t('settings.delayTimerNativeAttentionDescription')}</span>
              </span>
              <input
                type="checkbox"
                checked={attentionDelayEnabled}
                onChange={(event) => setNotificationAttentionDelayEnabled(event.target.checked)}
              />
            </label>

            {([
              { type: 'agent' as const, label: t('tile.agent') },
              { type: 'note' as const, label: t('tile.note') },
              { type: 'browser' as const, label: t('tile.browser') },
              { type: 'timer' as const, label: t('tile.timer') },
            ]).map(({ type, label }) => (
              <label
                key={type}
                className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4"
              >
                <span className="nd-label text-text-display">{label}</span>
                <input
                  type="checkbox"
                  checked={tileCreationAvailability[type]}
                  onChange={(event) => setTileCreationAvailable(type, event.target.checked)}
                />
              </label>
            ))}
          </div>
        </section>
      )
    }

    if (activeSection === 'browser') {
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.browser')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.defaultStartPage')}</h3>
            </div>
          </div>

          <label className="block">
            <span className="nd-label mb-2 block text-text-secondary">{t('settings.homeUrl')}</span>
            <input
              className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-hidden"
              value={browserHomeUrl}
              onChange={(event) => setBrowserHomeUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
        </section>
      )
    }

    if (activeSection === 'terminal') {
      const followLight = draft.themeId === 'default'
        && (draft.appearance === 'light' || (draft.appearance === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches))

      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.terminal')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.themeAndActivity')}</h3>
            </div>
          </div>

          <p className="mb-4 text-sm text-text-secondary">{t('settings.themePreviewHint')}</p>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {TERMINAL_THEMES.map((theme) => {
                const colors = getXtermTheme(resolveTerminalThemeId(theme.id, draft.themeId, followLight))
                const isActive = terminalThemeId === theme.id

                return (
                  <button
                    key={theme.id}
                    type="button"
                    aria-pressed={isActive}
                    className={`rounded-[14px] border bg-bg-primary p-1.5 text-left transition-colors ${
                      isActive ? 'border-text-display ring-1 ring-text-display' : 'border-border-visible hover:border-text-secondary'
                    }`}
                    onClick={() => setTerminalThemeId(theme.id)}
                  >
                    <span
                      className="flex h-9 items-center gap-1.5 rounded-[10px] px-2 font-mono text-[11px]"
                      style={{
                        background: colors.background,
                        color: colors.foreground,
                      }}
                    >
                      <span style={{ color: colors.green }}>$</span>
                      <span>ls</span>
                      <span className="h-2 w-2 rounded-full" style={{ background: colors.blue }} />
                      <span className="h-2 w-2 rounded-full" style={{ background: colors.magenta }} />
                      <span className="ml-auto h-3 w-1.5" style={{ background: colors.cursor }} />
                    </span>
                    <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
                      <span className="truncate text-xs text-text-display">
                        {theme.id === 'yira-default' ? t('settings.followAppTheme') : theme.label}
                      </span>
                      {isActive && <Check size={12} className="shrink-0 text-text-display" aria-hidden="true" />}
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="flex items-center justify-between gap-4 rounded-[16px] border border-border-visible bg-bg-secondary px-4 py-3">
              <span>
                <span className="nd-label block text-text-display">{t('settings.terminalActivity')}</span>
                <span className="mt-1 block text-xs leading-5 text-text-secondary">{t('settings.terminalActivityDescription')}</span>
              </span>
              <input
                type="checkbox"
                checked={terminalAttentionEnabled}
                onChange={(event) => setTerminalAttentionEnabled(event.target.checked)}
              />
            </label>
          </div>
        </section>
      )
    }

    if (activeSection === 'shortcuts') {
      const shortcutsAreDefault = CONFIGURABLE_SHORTCUT_IDS.every(
        (id) => normalizeAccelerator(draft.shortcuts[id]) === normalizeAccelerator(DEFAULT_SHORTCUTS[id]),
      )

      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.shortcuts')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.keyboardShortcutCatalog')}</h3>
            </div>
            <button
              type="button"
              className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-border-visible px-2.5 py-1 text-xs text-text-secondary transition-colors hover:text-text-display disabled:opacity-40"
              disabled={shortcutsAreDefault}
              onClick={() => setDraft((current) => ({ ...current, shortcuts: { ...DEFAULT_SHORTCUTS } }))}
            >
              {t('settings.resetAllShortcuts')}
            </button>
          </div>

          <p className="mb-4 text-sm text-text-secondary">{t('settings.shortcutsHelp')}</p>

          <div className="space-y-4">
            {getShortcutCatalog(draft.shortcuts).map((group) => (
              <div key={group.labelKey} className="rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
                <div className="nd-label text-text-display">{t(group.labelKey)}</div>
                <div className="mt-3 divide-y divide-border">
                  {group.items.map((item) => {
                    const shortcutId = item.id
                    if (shortcutId) {
                      return (
                        <ShortcutInput
                          key={`${group.labelKey}-${shortcutId}`}
                          shortcutId={shortcutId}
                          inputId={`shortcut-${shortcutId}`}
                          label={t(item.labelKey)}
                          shortcuts={draft.shortcuts}
                          onChange={(accelerator) => updateDraftShortcut(shortcutId, accelerator)}
                          getShortcutName={(id) => getShortcutName(t, id)}
                        />
                      )
                    }
                    return (
                      <div key={`${group.labelKey}-${item.keys}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                        <span className="text-sm leading-6 text-text-secondary">{t(item.labelKey)}</span>
                        <kbd className="shrink-0 px-3 py-1 font-mono text-xs text-text-secondary">
                          {item.keys}
                        </kbd>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )
    }

    return (
      <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
        <div className="mb-5 flex items-center gap-3">
          <ActiveSectionIcon size={16} className="text-text-secondary" />
          <div>
            <div className="nd-label text-text-secondary">{t('settings.aboutAndUpdates')}</div>
            <h3 className="mt-1 text-xl text-text-display">{t('settings.versionAndReleases')}</h3>
          </div>
        </div>

        <div className="rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="nd-label text-text-secondary">{t('settings.currentVersion')}</div>
              <div className="mt-2 font-mono text-sm text-text-display">v{currentVersion}</div>
              {availableVersion && availableVersion !== currentVersion && (
                <div className="mt-2 font-mono text-xs text-text-secondary">{t('settings.latestFound', { version: availableVersion })}</div>
              )}
            </div>
            <div className="nd-caption text-text-secondary">[ {getUpdateStatusLabel(t, updateStatus)} ]</div>
          </div>

          <p className="mt-4 text-sm leading-6 text-text-secondary">{getUpdateSummary(t, updateState)}</p>

          {isDownloading && progressPercent !== null && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-bg-secondary">
                <div
                  className="h-full rounded-full bg-text-display transition-[width]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-full border border-border-visible px-4 py-2 text-sm text-text-display transition-colors hover:border-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                void checkForUpdates()
              }}
              disabled={!canCheckForUpdates}
            >
              <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
              <span>{isChecking ? t('settings.checking') : t('settings.checkForUpdates')}</span>
            </button>

            {isRestartReady && (
              <button
                className="inline-flex items-center gap-2 rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-secondary"
                onClick={() => {
                  void installUpdate()
                }}
              >
                <Download size={14} />
                <span>{t('settings.restartToInstall')}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
          <h4 className="nd-label text-text-display">{t('settings.supportAndReports')}</h4>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{t('settings.supportDescription')}</p>
          <a
            href={SUPPORT_REPOSITORY_URL}
            onClick={handleSupportLinkClick}
            className="mt-3 inline-flex max-w-full items-center gap-2 text-sm text-text-display underline underline-offset-4 hover:text-text-secondary"
          >
            <span className="break-all">{SUPPORT_REPOSITORY_URL}</span>
            <ExternalLink size={14} className="shrink-0" aria-hidden="true" />
          </a>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{t('settings.publicReportsHint')}</p>
          <a
            href={`${SUPPORT_REPOSITORY_URL}/issues/new/choose`}
            onClick={handleSupportLinkClick}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-border-visible px-4 py-2 text-sm text-text-display transition-colors hover:border-text-secondary"
          >
            <ExternalLink size={14} aria-hidden="true" />
            <span>{t('settings.reportBug')}</span>
          </a>
          {supportLinkFailed && (
            <p role="alert" className="mt-3 text-sm text-text-secondary">{t('settings.supportLinkError')}</p>
          )}
        </div>

        <div className="mt-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
          <h4 className="nd-label text-text-display">{t('settings.legalDocuments')}</h4>
          <p className="mt-3 text-sm leading-6 text-text-secondary">{t('settings.legalDocumentsDescription')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              ref={privacyDocumentButtonRef}
              type="button"
              className="flex items-center gap-3 rounded-[16px] border border-border-visible px-4 py-3 text-left text-sm text-text-display transition-colors hover:border-text-secondary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)"
              onClick={() => {
                setLegalDocument('privacy')
              }}
            >
              <FileText size={15} className="shrink-0 text-text-secondary" aria-hidden="true" />
              <span>{t('settings.privacyPolicy')}</span>
            </button>
            <button
              ref={termsDocumentButtonRef}
              type="button"
              className="flex items-center gap-3 rounded-[16px] border border-border-visible px-4 py-3 text-left text-sm text-text-display transition-colors hover:border-text-secondary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--interactive)"
              onClick={() => {
                setLegalDocument('terms')
              }}
            >
              <FileText size={15} className="shrink-0 text-text-secondary" aria-hidden="true" />
              <span>{t('settings.termsOfUse')}</span>
            </button>
          </div>
        </div>
      </section>
    )
  }

  return createPortal(
    <div className="fixed inset-0 z-10000 flex items-center justify-center bg-black/80" onClick={handleBackdropClick}>
      <div
        className="flex h-[86vh] w-[1040px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[24px] border border-border-visible bg-bg-secondary"
        role="dialog"
        aria-modal="true"
        aria-labelledby="general-settings-title"
        tabIndex={-1}
        autoFocus
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          handleCancel()
        }}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div>
            <div className="nd-label text-text-secondary">{t('settings.settingsMatrix')}</div>
            <h2 id="general-settings-title" className="mt-2 text-xl text-text-display">{t('settings.systemControls')}</h2>
          </div>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
            onClick={handleCancel}
            disabled={saving}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-[236px] shrink-0 flex-col border-r border-border bg-bg-tertiary/60 px-4 py-5">
            <div className="px-2">
              <div className="nd-label text-text-secondary">{t('settings.sections')}</div>
              <div className="mt-2 text-sm leading-6 text-text-secondary">
                {t('settings.selectCategory')}
              </div>
            </div>

            <div className="mt-5 space-y-2 overflow-y-auto pr-1">
              {SETTINGS_SECTIONS.map(({ id, icon: Icon }) => {
                const isActive = activeSection === id

                return (
                  <button
                    key={id}
                    className={`flex w-full items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-text-display bg-bg-primary text-text-display'
                        : 'border-transparent text-text-secondary hover:border-border-visible hover:bg-bg-secondary'
                    }`}
                    onClick={() => {
                      setLegalDocument(null)
                      setActiveSection(id)
                    }}
                  >
                    <Icon size={15} className={isActive ? 'text-text-display' : 'text-text-secondary'} />
                    <span className="nd-label">{getSectionLabel(t, id)}</span>
                  </button>
                )
              })}
            </div>
          </aside>

          <div className="min-h-0 flex-1 px-6 py-6">
            <div className="h-full overflow-y-auto pr-2">
              {renderActiveSection()}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          {saveError && <span className="mr-auto text-sm text-red-400">{saveError}</span>}
          <button
            className="rounded-full border border-border-visible px-4 py-2 text-sm text-text-secondary transition-colors hover:border-text-secondary hover:text-text-display disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCancel}
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            className="rounded-full border border-text-display px-4 py-2 text-sm text-text-display transition-colors hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
