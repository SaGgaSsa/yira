import React from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceGitDiffResult } from '@shared/types'
import { canReadWorkspaceGitDiff, useWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'

export interface WorkspaceGitDiffProps {
  workspaceId: string
  rootFolderPath?: string
  sourceControlRepositoryPaths?: readonly string[]
}

function normalizeCount(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

export function formatWorkspaceGitDiffExactCount(value: number): string {
  return normalizeCount(value).toLocaleString()
}

export function formatWorkspaceGitDiffCount(value: number): string {
  const count = normalizeCount(value)
  if (count < 1_000) return String(count)

  const units = ['', 'k', 'M', 'B', 'T']
  let unitIndex = 0
  let scaled = count
  while (scaled >= 1_000 && unitIndex < units.length - 1) {
    scaled /= 1_000
    unitIndex += 1
  }

  if (scaled >= 1_000) return `999${units[units.length - 1]}+`

  const precision = scaled >= 100 ? 0 : 1
  let rounded = Number(scaled.toFixed(precision))
  if (rounded >= 1_000 && unitIndex < units.length - 1) {
    rounded = 1
    unitIndex += 1
  }

  return `${rounded}${units[unitIndex]}`
}

function isAvailableResult(result: WorkspaceGitDiffResult | null): result is WorkspaceGitDiffResult {
  return result?.available === true
}

export function WorkspaceGitDiff({
  workspaceId,
  rootFolderPath,
  sourceControlRepositoryPaths,
}: WorkspaceGitDiffProps): React.ReactElement | null {
  const { t } = useTranslation()
  const configured = canReadWorkspaceGitDiff(rootFolderPath)
  const result = useWorkspaceGitDiff({
    workspaceId,
    rootFolderPath,
    sourceControlRepositoryPaths,
  })
  if (!configured || result?.repositoryCount === 0) return null

  const available = isAvailableResult(result)
  const tooltip = available
    ? t('workspace.gitDiffTooltip', {
        additions: formatWorkspaceGitDiffExactCount(result.additions),
        deletions: formatWorkspaceGitDiffExactCount(result.deletions),
      })
    : t('workspace.gitDiffUnavailable')

  return (
    <span
      className={`inline-flex max-w-[6rem] shrink-0 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-none ${available ? 'text-text-secondary' : 'text-text-muted'}`}
      title={tooltip}
      aria-label={tooltip}
      data-workspace-git-diff="true"
      data-available={available}
    >
      {available ? (
        <>
          <span style={{ color: 'var(--success)' }}>+{formatWorkspaceGitDiffCount(result.additions)}</span>
          <span style={{ color: 'var(--danger)' }}>−{formatWorkspaceGitDiffCount(result.deletions)}</span>
        </>
      ) : '—'}
    </span>
  )
}
