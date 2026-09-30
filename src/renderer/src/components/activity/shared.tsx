import React from 'react'
import { useTranslation } from 'react-i18next'

export const activityPanelClass = 'rounded-xl border border-border-subtle bg-bg-tertiary p-4'

export function ActivityEmptyState(): React.ReactElement {
  const { t } = useTranslation()
  return <p className="text-xs text-text-secondary">{t('activity.noPeriodData')}</p>
}
