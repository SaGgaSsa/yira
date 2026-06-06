import { normalizeUserSettings } from './userSettings'

const defaults = normalizeUserSettings({})
if (defaults.browser.homeUrl !== 'about:blank') throw new Error('default browser home URL must be about:blank')
if (defaults.terminal.attentionEnabled !== true) throw new Error('terminal attention must default on')
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

const immediateAttention = normalizeUserSettings({ notifications: { attentionDelayEnabled: false } })
if (immediateAttention.notifications.attentionDelayEnabled !== false) throw new Error('disabled native attention delay must be preserved')
