import assert from 'node:assert/strict'
import test from 'node:test'
import type { GitBranch, TileState } from '@shared/types'
import { agentsInRepository, canCreateBranch, groupBranches } from './sourceControlBranches'

function branch(name: string, overrides: Partial<GitBranch> = {}): GitBranch {
  return { name, remote: false, current: false, ...overrides }
}

test('groupBranches without query separates recent, local and remote', () => {
  const branches: GitBranch[] = [
    branch('main', { current: true, committerDate: '2024-01-02' }),
    branch('feature-a', { committerDate: '2024-01-01' }),
    branch('feature-b', { committerDate: '2023-12-01' }),
    branch('origin/main', { remote: true }),
  ]
  const result = groupBranches(branches, '', 1)
  assert.deepEqual(result.recent.map((item) => item.name), ['feature-a'])
  assert.deepEqual(result.local.map((item) => item.name), ['main', 'feature-b'])
  assert.deepEqual(result.remote.map((item) => item.name), ['origin/main'])
})

test('groupBranches with query filters and empties recent', () => {
  const branches: GitBranch[] = [
    branch('main', { current: true }),
    branch('feature-a'),
    branch('origin/feature-b', { remote: true }),
  ]
  const result = groupBranches(branches, 'feat')
  assert.deepEqual(result.recent, [])
  assert.deepEqual(result.local.map((item) => item.name), ['feature-a'])
  assert.deepEqual(result.remote.map((item) => item.name), ['origin/feature-b'])
})

test('canCreateBranch validates name and duplicates', () => {
  const branches: GitBranch[] = [branch('main')]
  assert.equal(canCreateBranch(branches, 'new-branch'), true)
  assert.equal(canCreateBranch(branches, ' '), false)
  assert.equal(canCreateBranch(branches, 'new branch'), false)
  assert.equal(canCreateBranch(branches, 'main'), false)
})

test('agentsInRepository counts root and subrepo agents', () => {
  const tiles: TileState[] = [
    { id: '1', type: 'terminal', x: 0, y: 0, width: 1, height: 1, zIndex: 1, agent: { provider: 'claude' } },
    { id: '2', type: 'terminal', x: 0, y: 0, width: 1, height: 1, zIndex: 1, agent: { provider: 'claude', cwd: 'packages/app' } },
    { id: '3', type: 'terminal', x: 0, y: 0, width: 1, height: 1, zIndex: 1 },
    { id: '4', type: 'note', x: 0, y: 0, width: 1, height: 1, zIndex: 1, agent: { provider: 'claude' } },
  ] as TileState[]
  assert.equal(agentsInRepository(tiles, '.'), 2)
  assert.equal(agentsInRepository(tiles, 'packages/app'), 2)
  assert.equal(agentsInRepository(tiles, 'other/repo'), 1)
})
