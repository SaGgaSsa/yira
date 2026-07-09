import {
  clearActivatedWorkspaceAttentionCount,
  getWorkspaceAttentionLabel,
  sumTerminalAttentionCounts,
  updateActiveWorkspaceAttentionCount,
} from './workspaceAttention'

const baseCounts: Record<string, number> = {
  inactive: 3,
}

const updated = updateActiveWorkspaceAttentionCount(baseCounts, 'active', 4)

if (updated.active !== 4) throw new Error('active workspace attention count must be updated')
if (updated.inactive !== 3) throw new Error('inactive workspace attention counts must be preserved')
if (baseCounts.active !== undefined) throw new Error('updating workspace attention must not mutate existing counts')

const removed = updateActiveWorkspaceAttentionCount(updated, 'active', 0)
if (removed.active !== undefined) throw new Error('zero active workspace attention must remove the summary')
if (removed.inactive !== 3) throw new Error('removing the active summary must preserve inactive counts')

const switched = clearActivatedWorkspaceAttentionCount({ active: 4, target: 2, other: 1 }, 'target')
if (switched.target !== undefined) throw new Error('activating a workspace must clear only that workspace summary')
if (switched.active !== 4 || switched.other !== 1) throw new Error('activating a workspace must preserve other summaries')

if (getWorkspaceAttentionLabel({ target: 9 }, 'target') !== '9') throw new Error('workspace count 9 must render as 9')
if (getWorkspaceAttentionLabel({ target: 10 }, 'target') !== '9+') throw new Error('workspace count over 9 must render as 9+')
if (getWorkspaceAttentionLabel({ target: 0 }, 'target') !== null) throw new Error('zero workspace count must not render a badge')
if (getWorkspaceAttentionLabel({}, 'missing') !== null) throw new Error('missing workspace count must not render a badge')

const total = sumTerminalAttentionCounts({
  terminalA: { count: 2, lastOutputAt: 100 },
  terminalB: { count: 8, lastOutputAt: 200 },
})
if (total !== 10) throw new Error(`terminal attention summaries must be summed, got ${total}`)
