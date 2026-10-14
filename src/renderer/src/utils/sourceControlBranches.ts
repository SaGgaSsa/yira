import type { GitBranch, TileState } from '@shared/types'

export interface BranchGroups {
  recent: GitBranch[]
  local: GitBranch[]
  remote: GitBranch[]
}

export function groupBranches(
  branches: GitBranch[],
  query: string,
  recentLimit = 5,
): BranchGroups {
  const trimmedQuery = query.trim().toLowerCase()
  const localBranches = branches.filter((branch) => !branch.remote)
  const remoteBranches = branches.filter((branch) => branch.remote)

  if (trimmedQuery) {
    return {
      recent: [],
      local: localBranches.filter((branch) => branch.name.toLowerCase().includes(trimmedQuery)),
      remote: remoteBranches.filter((branch) => branch.name.toLowerCase().includes(trimmedQuery)),
    }
  }

  const nonCurrentLocals = localBranches.filter((branch) => !branch.current)
  const recent = nonCurrentLocals.slice(0, recentLimit)
  const recentSet = new Set(recent)
  const restLocals = localBranches.filter((branch) => !recentSet.has(branch))
  const current = restLocals.filter((branch) => branch.current)
  const others = restLocals.filter((branch) => !branch.current)

  return {
    recent,
    local: [...current, ...others],
    remote: remoteBranches,
  }
}

export function canCreateBranch(branches: GitBranch[], query: string): boolean {
  const name = query.trim()
  if (!name || /\s/.test(name)) return false
  return !branches.some((branch) => !branch.remote && branch.name === name)
}

export function agentsInRepository(tiles: TileState[], repositoryPath: string): number {
  return tiles.filter((tile) => {
    if (tile.type !== 'terminal' || !tile.agent) return false
    if (repositoryPath === '.') return true
    const cwd = tile.agent.cwd
    if (cwd === undefined || cwd === '' || cwd === '.') return true
    return cwd === repositoryPath || cwd.startsWith(`${repositoryPath}/`)
  }).length
}
