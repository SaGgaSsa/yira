import React from 'react'
import { useTranslation } from 'react-i18next'
import type { WorkspaceGitDiffResult } from '@shared/types'
import { canReadWorkspaceGitDiff, useWorkspaceGitDiff } from '@/hooks/useWorkspaceGitDiff'

export interface WorkspaceGitDiffProps {
  workspaceId: string
  rootFolderPath?: string
  sourceControlRepositoryPaths?: readonly string[]
  active?: boolean
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

export interface WorkspaceGitDiffIndicatorProps {
  result: WorkspaceGitDiffResult | null
}

export function WorkspaceGitDiffIndicator({
  result,
}: WorkspaceGitDiffIndicatorProps): React.ReactElement | null {
  const { t } = useTranslation()
  if (result?.repositoryCount === 0) return null
  if (!isAvailableResult(result)) return null

  const additions = normalizeCount(result.additions)
  const deletions = normalizeCount(result.deletions)
  if (additions === 0 && deletions === 0) return null

  const tooltip = t('workspace.gitDiffTooltip', {
    additions: formatWorkspaceGitDiffExactCount(additions),
    deletions: formatWorkspaceGitDiffExactCount(deletions),
  })

  return (
    <span
      className="inline-flex max-w-[6rem] shrink-0 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] leading-none text-text-secondary"
      title={tooltip}
      aria-label={tooltip}
      data-workspace-git-diff="true"
      data-available="true"
    >
      {additions > 0 && (
        <span style={{ color: 'var(--success)' }}>+{formatWorkspaceGitDiffCount(additions)}</span>
      )}
      {deletions > 0 && (
        <span style={{ color: 'var(--danger)' }}>−{formatWorkspaceGitDiffCount(deletions)}</span>
      )}
    </span>
  )
}

export function WorkspaceGitDiff({
  workspaceId,
  rootFolderPath,
  sourceControlRepositoryPaths,
  active,
}: WorkspaceGitDiffProps): React.ReactElement | null {
  const configured = canReadWorkspaceGitDiff(rootFolderPath)
  const result = useWorkspaceGitDiff({
    workspaceId,
    rootFolderPath,
    sourceControlRepositoryPaths,
    active,
  })
  if (!configured) return null

  return <WorkspaceGitDiffIndicator result={result} />
}
