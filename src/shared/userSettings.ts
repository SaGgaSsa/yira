import { normalizeAppThemeId } from './appThemes'
import type { ConfigurableTileCreationType, UserSettings } from './types'
import { DEFAULT_USER_SETTINGS } from './types'
import { normalizeTerminalThemeId } from './terminalThemes'

export const MIN_FONT_SIZE_PX = 10
export const MAX_FONT_SIZE_PX = 36

export type LegacyFontSize = 'small' | 'medium' | 'large'

type RawUserSettings = Omit<Partial<UserSettings>, 'terminal' | 'agents' | 'notifications' | 'updateDiagnosticsEnabled' | 'updateDiagnosticsMigrationComplete'> & {
  groups?: unknown
  fontSize?: unknown
  terminal?: Partial<UserSettings['terminal']>
  notifications?: Partial<UserSettings['notifications']>
  agents?: Partial<Record<'claude' | 'codex', { enabled?: unknown }>>
  updateDiagnosticsEnabled?: unknown
  updateDiagnosticsMigrationComplete?: unknown
}

const LEGACY_FONT_SIZE_PX: Record<LegacyFontSize, number> = {
  small: 14,
  medium: 16,
  large: 18,
}

function isLegacyFontSize(value: unknown): value is LegacyFontSize {
  return value === 'small' || value === 'medium' || value === 'large'
}

function normalizeLanguage(value: unknown): UserSettings['language'] {
  return value === 'es' ? 'es' : 'en'
}

export function clampFontSizePx(value: unknown, fallback = DEFAULT_USER_SETTINGS.interfaceFontSizePx): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(MIN_FONT_SIZE_PX, Math.min(MAX_FONT_SIZE_PX, Math.round(numeric)))
}

export function normalizeUserSettings(raw: RawUserSettings = {}): UserSettings {
  const legacyFontSize = isLegacyFontSize(raw.fontSize) ? LEGACY_FONT_SIZE_PX[raw.fontSize] : undefined
  const fontFallback = legacyFontSize ?? DEFAULT_USER_SETTINGS.interfaceFontSizePx
  const {
    fontSize: _legacyFontSize,
    groups: _legacyGroups,
    updateDiagnosticsEnabled,
    updateDiagnosticsMigrationComplete,
    ...settings
  } = raw
  const diagnosticsMigrationComplete = updateDiagnosticsMigrationComplete === true
  const rawCreationAvailability = raw.tiles?.creationAvailability as Record<string, unknown> | undefined
  const getCreationAvailability = (type: ConfigurableTileCreationType) => {
    const value = rawCreationAvailability?.[type]
    return typeof value === 'boolean' ? value : DEFAULT_USER_SETTINGS.tiles.creationAvailability[type]
  }

  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    agents: {
      claude: { enabled: raw.agents?.claude?.enabled !== false },
      codex: { enabled: raw.agents?.codex?.enabled !== false },
    },
    language: normalizeLanguage(raw.language),
    themeId: normalizeAppThemeId(raw.themeId),
    windowBackgroundMaterial: raw.windowBackgroundMaterial === 'mica' || raw.windowBackgroundMaterial === 'acrylic' || raw.windowBackgroundMaterial === 'translucent'
      ? raw.windowBackgroundMaterial
      : 'none',
    interfaceFontSizePx: clampFontSizePx(raw.interfaceFontSizePx, fontFallback),
    tileFontSizePx: clampFontSizePx(raw.tileFontSizePx, fontFallback),
    updateDiagnosticsEnabled: diagnosticsMigrationComplete ? updateDiagnosticsEnabled === true : true,
    updateDiagnosticsMigrationComplete: true,
    browser: {
      ...DEFAULT_USER_SETTINGS.browser,
      ...(raw.browser ?? {}),
    },
    terminal: {
      ...DEFAULT_USER_SETTINGS.terminal,
      ...(raw.terminal ?? {}),
      themeId: normalizeTerminalThemeId(raw.terminal?.themeId),
    },
    notifications: {
      ...DEFAULT_USER_SETTINGS.notifications,
      ...(raw.notifications ?? {}),
      desktopAlertsEnabled: typeof raw.notifications?.desktopAlertsEnabled === 'boolean'
        ? raw.notifications.desktopAlertsEnabled
        : DEFAULT_USER_SETTINGS.notifications.desktopAlertsEnabled,
    },
    tiles: {
      ...DEFAULT_USER_SETTINGS.tiles,
      ...(raw.tiles ?? {}),
      creationAvailability: {
        agent: getCreationAvailability('agent'),
        note: getCreationAvailability('note'),
        browser: getCreationAvailability('browser'),
        timer: getCreationAvailability('timer'),
      },
    },
  }
}
