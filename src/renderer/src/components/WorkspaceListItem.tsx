import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAgentSessionSnapshot } from '@/hooks/useAgentSessionSnapshot'
import { summarizeTerminalActivity } from '@/utils/terminalActivity'
import { TerminalActivityIcon } from './TerminalActivityIcon'
import type { WorkspaceMetadata } from '@shared/types'
import { canReadWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'
import { WorkspaceGitDiff } from './WorkspaceGitDiff'
import { ListRow } from './TileListItem'

export interface WorkspaceListItemProps {
  workspace: WorkspaceMetadata
  active?: boolean
  sessionActive?: boolean
  attentionCount?: number
  onClick: () => void
  onConfigure: () => void
  onFocus: () => void
  onTogglePinned: () => void
  pinPending?: boolean
  className?: string
}

export function WorkspaceListItem({
  workspace,
  active = false,
  sessionActive = false,
  attentionCount = 0,
  onClick,
  onConfigure,
  onFocus,
  onTogglePinned,
  pinPending = false,
  className = '',
}: WorkspaceListItemProps): React.ReactElement {
  const { t } = useTranslation()
  const { sessions } = useAgentSessionSnapshot()
  const activity = summarizeTerminalActivity(sessions, workspace.id, attentionCount)
  const hasWorkspaceGitDiff = canReadWorkspaceGitDiff(
    workspace.config.rootFolderPath,
  )

  return (
    <ListRow
      leadingIcon={<TerminalActivityIcon activity={activity} />}
      label={workspace.name}
      variant="workspace"
      workspaceDiff={hasWorkspaceGitDiff ? (
        <WorkspaceGitDiff
          workspaceId={workspace.id}
          rootFolderPath={workspace.config.rootFolderPath}
          sourceControlRepositoryPaths={workspace.config.sourceControlRepositoryPaths}
        />
      ) : undefined}
      active={active}
      sessionActive={sessionActive}
      attentionCount={attentionCount}
      attentionTitle={t(attentionCount === 1 ? 'workspace.attention_one' : 'workspace.attention_other', { count: attentionCount })}
      onClick={onClick}
      onConfigure={(event) => {
        event.preventDefault()
        onConfigure()
      }}
      onFocus={onFocus}
      onPin={onTogglePinned}
      pinned={workspace.pinned === true}
      pinDisabled={pinPending}
      configureTitle={t('workspace.configure')}
      focusTitle={t('workspace.focus')}
      pinTitle={t('workspace.pin')}
      unpinTitle={t('workspace.unpin')}
      className={className}
    />
  )
}
