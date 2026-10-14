import { i18n } from '@/i18n'

export function formatRelativeDate(date: string | undefined, language: string): string {
  const timestamp = typeof date === 'string' ? Date.parse(date) : Number.NaN
  if (!Number.isFinite(timestamp)) return i18n.t('sourceControl.unknownDate')

  const elapsedSeconds = (timestamp - Date.now()) / 1000
  const elapsed = Math.abs(elapsedSeconds)
  const units = [
    { seconds: 31_536_000, unit: 'year' as const },
    { seconds: 2_592_000, unit: 'month' as const },
    { seconds: 604_800, unit: 'week' as const },
    { seconds: 86_400, unit: 'day' as const },
    { seconds: 3_600, unit: 'hour' as const },
    { seconds: 60, unit: 'minute' as const },
  ]
  const unit = units.find(({ seconds }) => elapsed >= seconds) ?? { seconds: 1, unit: 'second' as const }
  const value = Math.max(1, Math.floor(elapsed / unit.seconds))
  return new Intl.RelativeTimeFormat(language, { numeric: 'auto' }).format(
    Math.sign(elapsedSeconds) * value,
    unit.unit,
  )
}
