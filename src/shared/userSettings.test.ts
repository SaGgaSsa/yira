import { normalizeUserSettings } from './userSettings'
import { DEFAULT_TERMINAL_THEME_ID, TERMINAL_THEME_IDS, getTerminalTheme } from './terminalThemes'

const defaults = normalizeUserSettings({})
if (defaults.browser.homeUrl !== 'about:blank') throw new Error('default browser home URL must be about:blank')
if (defaults.language !== 'en') throw new Error('language must default to English')
if (defaults.terminal.attentionEnabled !== true) throw new Error('terminal attention must default on')
if (defaults.terminal.themeId !== DEFAULT_TERMINAL_THEME_ID) throw new Error('terminal theme must default to Yira default')
if (defaults.notifications.attentionDelayEnabled !== true) throw new Error('native attention delay must default on')

const small = normalizeUserSettings({ fontSize: 'small' })
if (small.interfaceFontSizePx !== 14) throw new Error('small legacy font must migrate to 14px interface font')
if (small.tileFontSizePx !== 14) throw new Error('small legacy font must migrate to 14px tile font')
if ('fontSize' in small) throw new Error('legacy font field must not be persisted after normalization')

const medium = normalizeUserSettings({ fontSize: 'medium' })
if (medium.interfaceFontSizePx !== 16) throw new Error('medium legacy font must migrate to 16px interface font')
if (medium.tileFontSizePx !== 16) throw new Error('medium legacy font must migrate to 16px tile font')

const large = normalizeUserSettings({ fontSize: 'large' })
if (large.interfaceFontSizePx !== 18) throw new Error('large legacy font must migrate to 18px interface font')
if (large.tileFontSizePx !== 18) throw new Error('large legacy font must migrate to 18px tile font')

const explicit = normalizeUserSettings({ interfaceFontSizePx: 10, tileFontSizePx: 36, fontSize: 'large' })
if (explicit.interfaceFontSizePx !== 10) throw new Error('explicit interface font must win over legacy font')
if (explicit.tileFontSizePx !== 36) throw new Error('explicit tile font must win over legacy font')

const clamped = normalizeUserSettings({ interfaceFontSizePx: 3, tileFontSizePx: 99 })
if (clamped.interfaceFontSizePx !== 10) throw new Error('interface font must clamp to minimum')
if (clamped.tileFontSizePx !== 36) throw new Error('tile font must clamp to maximum')

const legacy = normalizeUserSettings({ groups: { enabled: true } })
if (legacy.terminal.attentionEnabled !== true) throw new Error('legacy settings must migrate terminal attention on')
if (legacy.notifications.attentionDelayEnabled !== true) throw new Error('legacy settings must migrate native attention delay on')

const disabled = normalizeUserSettings({ terminal: { attentionEnabled: false } })
if (disabled.terminal.attentionEnabled !== false) throw new Error('disabled terminal attention setting must be preserved')

const validTerminalTheme = normalizeUserSettings({ terminal: { attentionEnabled: true, themeId: 'high-contrast' } })
if (validTerminalTheme.terminal.themeId !== 'high-contrast') throw new Error('valid terminal theme setting must be preserved')

const invalidTerminalTheme = normalizeUserSettings({ terminal: { attentionEnabled: true, themeId: 'unknown' as never } })
if (invalidTerminalTheme.terminal.themeId !== DEFAULT_TERMINAL_THEME_ID) throw new Error('invalid terminal theme must normalize to default')

for (const themeId of ['yira-default', 'classic-dark', 'light', 'high-contrast'] as const) {
  if (!TERMINAL_THEME_IDS.includes(themeId)) throw new Error(`terminal theme registry must include ${themeId}`)
  const theme = getTerminalTheme(themeId)
  if (!theme.colors.background || !theme.colors.foreground) throw new Error(`${themeId} must define terminal base colors`)
}

const immediateAttention = normalizeUserSettings({ notifications: { attentionDelayEnabled: false } })
if (immediateAttention.notifications.attentionDelayEnabled !== false) throw new Error('disabled native attention delay must be preserved')

const spanishLanguage = normalizeUserSettings({ language: 'es' })
if (spanishLanguage.language !== 'es') throw new Error('Spanish language setting must be preserved')

const invalidLanguage = normalizeUserSettings({ language: 'fr' as never })
if (invalidLanguage.language !== 'en') throw new Error('invalid language setting must normalize to English')
