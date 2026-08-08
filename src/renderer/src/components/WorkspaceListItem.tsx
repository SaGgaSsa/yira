import React from 'react'
import { Grid3X3, LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceMetadata } from '@shared/types'
import { ListRow } from './TileListItem'

export interface WorkspaceListItemProps {
  workspace: WorkspaceMetadata
  active?: boolean
  attentionCount?: number
  onClick: () => void
  onConfigure: () => void
  onFocus: () => void
  className?: string
}

export function WorkspaceListItem({
  workspace,
  active = false,
  attentionCount = 0,
  onClick,
  onConfigure,
  onFocus,
  className = '',
}: WorkspaceListItemProps): React.ReactElement {
  const { t } = useTranslation()
  const Icon = workspace.config.type === 'grid' ? Grid3X3 : LayoutGrid

  return (
    <ListRow
      icon={Icon}
      label={workspace.name}
      active={active}
      attentionCount={attentionCount}
      attentionTitle={t(attentionCount === 1 ? 'workspace.attention_one' : 'workspace.attention_other', { count: attentionCount })}
      onClick={onClick}
      onConfigure={(event) => {
        event.preventDefault()
        onConfigure()
      }}
      onFocus={onFocus}
      configureTitle={t('workspace.configure')}
      focusTitle={t('workspace.focus')}
      className={className}
    />
  )
}
