import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { ShortcutId, ShortcutIssue, ShortcutSettings } from '@shared/shortcuts'
import { DEFAULT_SHORTCUTS, isBlockingShortcutIssue, validateShortcut } from '@shared/shortcuts'
import { formatAccelerator } from '@/utils/shortcutCatalog'
import { normalizeAccelerator } from '@/utils/shortcutResolver'

interface ShortcutInputProps {
  shortcutId: ShortcutId
  inputId: string
  label: string
  /** Current draft values, used to detect conflicts with the other shortcuts. */
  shortcuts: ShortcutSettings
  onChange: (accelerator: string) => void
  /** Translated name of another shortcut, used in conflict messages. */
  getShortcutName: (id: ShortcutId) => string
}

function getIssueMessage(t: TFunction, issue: ShortcutIssue, getShortcutName: (id: ShortcutId) => string): string {
  switch (issue.kind) {
    case 'invalid':
      return t('settings.shortcutIssueInvalid')
    case 'conflict':
      return t('settings.shortcutIssueConflict', { name: getShortcutName(issue.with) })
    case 'reserved':
      if (issue.reason === 'clipboard') return t('settings.shortcutIssueReservedClipboard')
      if (issue.reason === 'editing') return t('settings.shortcutIssueReservedEditing')
      return t('settings.shortcutIssueReservedSystem')
    case 'warning':
      return t('settings.shortcutWarningTerminal')
  }
}

/** Capture a configurable shortcut and surface validation problems next to the control. */
export function ShortcutInput({
  shortcutId,
  inputId,
  label,
  shortcuts,
  onChange,
  getShortcutName,
}: ShortcutInputProps): React.ReactElement {
  const { t } = useTranslation()
  const [capturing, setCapturing] = useState(false)
  const [rejected, setRejected] = useState<ShortcutIssue | null>(null)

  const currentIssue = validateShortcut(shortcutId, shortcuts[shortcutId], shortcuts)
  const warning = currentIssue?.kind === 'warning' ? currentIssue : null
  const notice = rejected ?? warning
  const noticeText = notice ? getIssueMessage(t, notice, getShortcutName) : null
  const noticeRole = notice ? (rejected ? 'alert' : 'status') : undefined
  const noticeColor = notice ? (rejected ? 'text-danger' : 'text-warning') : 'text-text-secondary'
  const isDefault = normalizeAccelerator(shortcuts[shortcutId]) === normalizeAccelerator(DEFAULT_SHORTCUTS[shortcutId])

  const commitShortcut = (accelerator: string) => {
    const issue = validateShortcut(shortcutId, accelerator, shortcuts)
    if (isBlockingShortcutIssue(issue)) {
      setRejected(issue)
      return
    }
    onChange(accelerator)
    setRejected(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setCapturing(false)
      return
    }
    if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return
    if (!event.ctrlKey && !event.metaKey && !event.altKey) return

    const modifiers = [
      ...(event.ctrlKey ? ['Ctrl'] : []),
      ...(event.metaKey ? ['Cmd'] : []),
      ...(event.altKey ? ['Alt'] : []),
      ...(event.shiftKey ? ['Shift'] : []),
    ]
    const pressedKey = event.key === ' ' ? 'Space' : event.key
    const accelerator = normalizeAccelerator([...modifiers, pressedKey].join('+'))
    if (accelerator) {
      commitShortcut(accelerator)
    } else {
      setRejected({ kind: 'invalid' })
    }
    setCapturing(false)
  }

  const handleReset = () => {
    commitShortcut(DEFAULT_SHORTCUTS[shortcutId])
    setCapturing(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <label htmlFor={inputId} className="min-w-0 flex-1 text-sm leading-6 text-text-secondary">
        {label}
      </label>
      <div className="flex shrink-0 items-center gap-2">
        {!isDefault && (
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text-display"
            title={t('settings.resetToDefault')}
            aria-label={t('settings.resetToDefault')}
            onClick={handleReset}
          >
            <RotateCcw size={13} />
          </button>
        )}
        <input
          id={inputId}
          data-agent-shortcut-capture={shortcutId}
          className="w-40 cursor-pointer rounded-full border border-border-visible bg-bg-secondary px-3 py-1 text-center font-mono text-xs text-text-display outline-hidden transition-colors hover:border-text-secondary focus:cursor-default focus:border-accent"
          aria-label={label}
          aria-live="polite"
          readOnly
          value={capturing ? t('settings.pressShortcut') : formatAccelerator(shortcuts[shortcutId])}
          onFocus={() => setCapturing(true)}
          onBlur={() => setCapturing(false)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {noticeText && (
        <span role={noticeRole} className={`basis-full text-xs leading-5 ${noticeColor}`}>
          {noticeText}
        </span>
      )}
    </div>
  )
}
