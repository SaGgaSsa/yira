import { APP_THEMES } from '@shared/appThemes'
import { getXtermTheme, resolveTerminalThemeId } from '@/utils/terminalTheme'
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { X, Monitor, Moon, Sun, Type, Grid3X3, Globe, Code2, Info, RefreshCw, Download, LayoutGrid, Keyboard, Terminal, ExternalLink, FileText } from 'lucide-react'
import { createUserSettingsDraft, useSettingsStore } from '@/store/settingsStore'
import { useUpdateStore } from '@/store/updateStore'
import { SHORTCUT_CATALOG } from '@/utils/shortcutCatalog'
import type { UpdateState, UserSettings } from '@shared/types'
import { DEFAULT_USER_SETTINGS } from '@shared/types'
import type { TerminalThemeId } from '@shared/terminalThemes'
import { TERMINAL_THEMES } from '@shared/terminalThemes'
import { MAX_FONT_SIZE_PX, MIN_FONT_SIZE_PX } from '@shared/userSettings'
import { LegalDocuments, type LegalDocumentId } from './LegalDocuments'

export type SettingsSectionId =
  | 'appearance'
  | 'density'
  | 'canvas'
  | 'tiles'
  | 'terminal'
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

const SUPPORT_REPOSITORY_URL = 'https://github.com/SaGgaSsa/yira'

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId
  icon: typeof Monitor
}> = [
  { id: 'appearance', icon: Monitor },
  { id: 'density', icon: Type },
  { id: 'canvas', icon: Grid3X3 },
  { id: 'tiles', icon: LayoutGrid },
  { id: 'terminal', icon: Terminal },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'browser', icon: Globe },
  { id: 'advanced', icon: Code2 },
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

function getShortcutGroupLabel(t: TFunction, label: string): string {
  if (label === 'Navigation') return t('settings.shortcutNavigation')
  if (label === 'Window') return t('settings.shortcutWindow')
  return t('settings.shortcutContextual')
}

function getShortcutItemLabel(t: TFunction, label: string): string {
  switch (label) {
    case 'Focus left split panel': return t('settings.shortcutFocusLeftSplitPanel')
    case 'Focus right split panel': return t('settings.shortcutFocusRightSplitPanel')
    case 'Previous tab': return t('settings.shortcutPreviousTab')
    case 'Next tab': return t('settings.shortcutNextTab')
    case 'Toggle fullscreen': return t('settings.shortcutToggleFullscreen')
    case 'Close panels or clear selection': return t('settings.shortcutClosePanelsOrClearSelection')
    default: return t('settings.shortcutConfirmDialogAction')
  }
}

export function SettingsPanel({ open, onClose, onOpenJsonEditor, initialSection = 'appearance' }: SettingsPanelProps): React.ReactElement {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance')
  const [agentHookMessage, setAgentHookMessage] = useState('')
  const [draft, setDraft] = useState<UserSettings>(() => createUserSettingsDraft(useSettingsStore.getState()))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [supportLinkFailed, setSupportLinkFailed] = useState(false)
  const [backgroundMaterialSupported, setBackgroundMaterialSupported] = useState(false)
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null)
  const privacyDocumentButtonRef = useRef<HTMLButtonElement | null>(null)
  const termsDocumentButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreLegalDocumentFocusRef = useRef<LegalDocumentId | null>(null)
  const applySettings = useSettingsStore((s) => s.applySettings)
  const language = draft.language
  const appearance = draft.appearance
  const interfaceFontSizePx = draft.interfaceFontSizePx
  const tileFontSizePx = draft.tileFontSizePx
  const showGrid = draft.showGrid
  const snapToGrid = draft.snapToGrid
  const gridSize = draft.gridSize
  const updateDiagnosticsEnabled = draft.updateDiagnosticsEnabled
  const browserHomeUrl = draft.browser.homeUrl
  const terminalAttentionEnabled = draft.terminal.attentionEnabled
  const agentAlertsEnabled = draft.terminal.agentAlertsEnabled
  const terminalThemeId = draft.terminal.themeId
  const attentionDelayEnabled = draft.notifications.attentionDelayEnabled
  const tileCreationAvailability = draft.tiles.creationAvailability
  const groupsEnabled = draft.groups.enabled
  const setAppearance = (appearance: UserSettings['appearance']) => setDraft((current) => ({ ...current, appearance }))
  const setLanguage = (language: UserSettings['language']) => setDraft((current) => ({ ...current, language }))
  const setInterfaceFontSizePx = (interfaceFontSizePx: number) => setDraft((current) => ({ ...current, interfaceFontSizePx }))
  const setTileFontSizePx = (tileFontSizePx: number) => setDraft((current) => ({ ...current, tileFontSizePx }))
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
  const setTerminalThemeId = (themeId: TerminalThemeId) => setDraft((current) => ({
    ...current,
    terminal: { ...current.terminal, themeId },
  }))
  const setNotificationAttentionDelayEnabled = (attentionDelayEnabled: boolean) => setDraft((current) => ({
    ...current,
    notifications: { attentionDelayEnabled },
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
  const setGroupsEnabled = (enabled: boolean) => setDraft((current) => ({ ...current, groups: { enabled } }))
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
    void window.electron.window.getBackgroundMaterialSupport()
      .then(setBackgroundMaterialSupported)
      .catch(() => setBackgroundMaterialSupported(false))
  }, [initialSection, open])

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
      return <LegalDocuments documentId={legalDocument} onBack={handleLegalDocumentBack} />
    }

    if (activeSection === 'appearance') {
      return (
        <section>
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.appearance')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.theme')}</h3>
            </div>
          </div>

          <p className="mb-4 text-sm text-text-secondary">{t('settings.appThemeDescription')}</p>
          <div className="mb-5 grid gap-3 lg:grid-cols-2">
            {APP_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={draft.themeId === theme.id}
                onClick={() => setDraft((current) => ({ ...current, themeId: theme.id }))}
                className={`rounded-[20px] border p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)] ${draft.themeId === theme.id ? 'border-text-primary' : 'border-border-visible'}`}
                style={{ background: theme.tokens['--surface'], color: theme.tokens['--text-primary'] }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="nd-label">{theme.label}</span>
                  {draft.themeId === theme.id && <span className="nd-caption">[ {t('settings.active')} ]</span>}
                </span>
                <span className="mt-4 flex gap-2" aria-hidden="true">
                  {(['--black', '--surface-raised', '--accent', '--success', '--interactive'] as const).map((token) => (
                    <span key={token} className="h-5 w-5 rounded-full border" style={{ background: theme.tokens[token], borderColor: theme.tokens['--border-visible'] }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <p className="mb-3 text-sm text-text-secondary">{t('settings.defaultAppearanceDescription')}</p>
          <div className="grid gap-3 lg:grid-cols-3">
            {([
              { value: 'dark' as const, icon: Moon, label: t('settings.dark') },
              { value: 'light' as const, icon: Sun, label: t('settings.light') },
              { value: 'system' as const, icon: Monitor, label: t('settings.system') },
            ]).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                className={`rounded-[20px] border px-4 py-4 text-left transition-colors disabled:opacity-40 ${
                  appearance === value ? 'border-text-display bg-bg-tertiary' : 'border-border bg-bg-secondary'
                }`}
                disabled={draft.themeId !== 'default'}
                aria-pressed={appearance === value}
                onClick={() => setAppearance(value)}
              >
                <div className="flex items-center justify-between">
                  <Icon size={16} className={appearance === value ? 'text-text-display' : 'text-text-secondary'} />
                  {appearance === value && <span className="nd-caption text-text-secondary">[ {t('settings.active')} ]</span>}
                </div>
                <div className="nd-label mt-6 text-text-secondary">{label}</div>
              </button>
            ))}
          </div>
          <label className="mt-5 block rounded-[20px] border border-border-visible bg-bg-secondary px-4 py-4">
            <span className="nd-label text-text-display">{t('settings.windowBackgroundEffect')}</span>
            <select
              className="mt-3 w-full rounded-xl border border-border-visible bg-bg-tertiary px-3 py-2 text-text-display disabled:cursor-not-allowed disabled:opacity-50"
              value={draft.windowBackgroundMaterial}
              disabled={!backgroundMaterialSupported}
              onChange={(event) => setDraft((current) => ({
                ...current,
                windowBackgroundMaterial: event.target.value as UserSettings['windowBackgroundMaterial'],
              }))}
            >
              <option value="none">{t('settings.windowBackgroundNone')}</option>
              <option value="mica">{t('settings.windowBackgroundMica')}</option>
              <option value="acrylic">{t('settings.windowBackgroundAcrylic')}</option>
            </select>
            {!backgroundMaterialSupported && <p className="mt-2 text-sm text-text-secondary">{t('settings.requiresWindows11')}</p>}
          </label>
          <div className="mt-5 rounded-[20px] border border-border-visible bg-bg-secondary px-4 py-4">
            <div className="nd-label text-text-display">{t('settings.language')}</div>
            <p className="mt-1 text-sm text-text-secondary">{t('settings.languageDescription')}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(['en', 'es'] as const).map((value) => (
                <button
                  key={value}
                  className={`rounded-full border px-4 py-3 text-sm transition-colors ${
                    language === value ? 'border-text-display bg-bg-tertiary text-text-display' : 'border-border text-text-secondary'
                  }`}
                  onClick={() => setLanguage(value)}
                >
                  {value === 'en' ? t('settings.english') : t('settings.spanish')}
                </button>
              ))}
            </div>
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
            className="mt-5 w-full accent-[var(--text-display)]"
            type="range"
            min={MIN_FONT_SIZE_PX}
            max={MAX_FONT_SIZE_PX}
            step={1}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </label>
      )

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
                className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
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

            <div className="rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span className="nd-label block text-text-display">{t('settings.agentHookSetup')}</span>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{t('settings.agentHookSetupDescription')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['codex', 'claude'] as const).map((provider) => (
                  <React.Fragment key={provider}>
                    <button className="rounded-full border border-border-visible px-3 py-2 text-xs text-text-display" onClick={() => void window.electron.settings.configureAgentHooks(provider).then((result) => setAgentHookMessage(result.message)).catch((error: unknown) => setAgentHookMessage(String(error)))}>{t('settings.configure')} {provider === 'codex' ? 'Codex' : 'Claude'}</button>
                    <button className="rounded-full border border-border-visible px-3 py-2 text-xs text-text-secondary" onClick={() => void window.electron.settings.uninstallAgentHooks(provider).then((result) => setAgentHookMessage(result.message)).catch((error: unknown) => setAgentHookMessage(String(error)))}>{t('settings.uninstall')} {provider === 'codex' ? 'Codex' : 'Claude'}</button>
                  </React.Fragment>
                ))}
              </div>
              {agentHookMessage && <p className="mt-3 text-sm text-text-secondary">{agentHookMessage}</p>}
            </div>

            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.agentAlerts')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">{t('settings.agentAlertsDescription')}</span>
              </span>
              <input
                type="checkbox"
                checked={agentAlertsEnabled}
                onChange={(event) => setAgentAlertsEnabled(event.target.checked)}
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.groupsCapability')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">{t('settings.groupsCapabilityDescription')}</span>
              </span>
              <input type="checkbox" checked={groupsEnabled} onChange={(event) => setGroupsEnabled(event.target.checked)} />
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
              className="w-full rounded-full border border-border-visible bg-bg-primary px-4 py-3 font-mono text-sm text-text-display outline-none"
              value={browserHomeUrl}
              onChange={(event) => setBrowserHomeUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
        </section>
      )
    }

    if (activeSection === 'terminal') {
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.terminal')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.themeAndActivity')}</h3>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              {TERMINAL_THEMES.map((theme) => {
                const colors = getXtermTheme(resolveTerminalThemeId(theme.id, draft.themeId))
                const isActive = terminalThemeId === theme.id

                return (
                  <button
                    key={theme.id}
                    aria-pressed={isActive}
                    className={`rounded-[20px] border px-4 py-4 text-left transition-colors ${
                      isActive ? 'border-text-display bg-bg-primary' : 'border-border-visible bg-bg-primary hover:border-text-secondary'
                    }`}
                    onClick={() => setTerminalThemeId(theme.id as TerminalThemeId)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="nd-label text-text-display">{theme.id === 'yira-default' ? t('settings.followAppTheme') : theme.label}</span>
                      {isActive && <span className="nd-caption text-text-secondary">[ {t('settings.active')} ]</span>}
                    </span>
                    <span
                      className="mt-4 flex h-12 items-center gap-2 rounded-[14px] border px-3 font-mono text-sm"
                      style={{
                        background: colors.background,
                        borderColor: colors.brightBlack,
                        color: colors.foreground,
                      }}
                    >
                      <span style={{ color: colors.green }}>$</span>
                      <span>yira --theme</span>
                      <span className="ml-auto h-4 w-2" style={{ background: colors.cursor }} />
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
              <span>
                <span className="nd-label block text-text-display">{t('settings.terminalActivity')}</span>
                <span className="mt-2 block text-sm leading-6 text-text-secondary">{t('settings.terminalActivityDescription')}</span>
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
      return (
        <section className="rounded-[24px] border border-border bg-bg-tertiary px-4 py-4">
          <div className="mb-5 flex items-center gap-3">
            <ActiveSectionIcon size={16} className="text-text-secondary" />
            <div>
              <div className="nd-label text-text-secondary">{t('settings.shortcuts')}</div>
              <h3 className="mt-1 text-xl text-text-display">{t('settings.keyboardShortcutCatalog')}</h3>
            </div>
          </div>

          <div className="space-y-4">
            {SHORTCUT_CATALOG.map((group) => (
              <div key={group.label} className="rounded-[20px] border border-border-visible bg-bg-primary px-4 py-4">
                <div className="nd-label text-text-display">{getShortcutGroupLabel(t, group.label)}</div>
                <div className="mt-3 divide-y divide-border">
                  {group.items.map((item) => (
                    <div key={`${group.label}-${item.keys}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <span className="text-sm leading-6 text-text-secondary">{getShortcutItemLabel(t, item.label)}</span>
                      <kbd className="shrink-0 rounded-full border border-border-visible bg-bg-secondary px-3 py-1 font-mono text-xs text-text-display">
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
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
              className="flex items-center gap-3 rounded-[16px] border border-border-visible px-4 py-3 text-left text-sm text-text-display transition-colors hover:border-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
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
              className="flex items-center gap-3 rounded-[16px] border border-border-visible px-4 py-3 text-left text-sm text-text-display transition-colors hover:border-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interactive)]"
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
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80" onClick={handleBackdropClick}>
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
                    <span className="nd-label">{id === 'appearance' ? t('settings.appearance') : id === 'density' ? t('settings.fontSize') : id === 'canvas' ? t('settings.canvas') : id === 'tiles' ? t('settings.tiles') : id === 'terminal' ? t('settings.terminal') : id === 'shortcuts' ? t('settings.shortcuts') : id === 'browser' ? t('settings.browser') : id === 'advanced' ? t('settings.advanced') : t('settings.aboutAndUpdates')}</span>
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
