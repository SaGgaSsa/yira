import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentProvider, Workspace } from '@shared/types'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'
import { createWorkspaceFromInput, normalizeWorkspace, updateWorkspace } from './workspace'

type SourceControlConfig = Workspace['config'] & {
  sourceControlRepositoryPaths: string[]
}

function sourceControlPaths(workspace: Workspace): string[] {
  return (workspace.config as SourceControlConfig).sourceControlRepositoryPaths
}

function workspace(id: string, agentProvider?: AgentProvider, rootFolderPath?: string): Workspace {
  return {
    id,
    name: id,
    path: `/tmp/yira/workspaces/${id}`,
    config: normalizeWorkspaceConfig({ agentProvider, rootFolderPath }),
  }
}

test('persists workspace agent provider through load, create, and update normalization', () => {
  const loaded = normalizeWorkspace({
    id: 'loaded',
    name: ' Loaded ',
    path: '/repo',
    config: normalizeWorkspaceConfig({ agentProvider: 'claude' }),
  })
  assert.equal(loaded.config.agentProvider, 'claude')

  const created = createWorkspaceFromInput({ name: 'Created', agentProvider: 'codex' })
  assert.equal(created.config.agentProvider, 'codex')

  const preserved = updateWorkspace(workspace('preserved', 'claude'), { config: { workspacePanelOpen: false } })
  assert.equal(preserved.config.agentProvider, 'claude')

  const cleared = updateWorkspace(workspace('cleared', 'claude'), { config: { agentProvider: undefined } })
  assert.equal(cleared.config.agentProvider, undefined)
})

test('normalizes selected repositories through workspace creation and update', () => {
  const created = createWorkspaceFromInput({
    name: 'Created',
    rootFolderPath: '/repo',
    sourceControlRepositoryPaths: ['.', './packages//web/', 'packages/./web', '/absolute'],
  } as Parameters<typeof createWorkspaceFromInput>[0])
  assert.deepEqual(sourceControlPaths(created), ['.', 'packages/web'])

  const preserved = workspace('preserved-selection', undefined, '/repo')
  ;(preserved.config as SourceControlConfig).sourceControlRepositoryPaths = ['apps/web']
  const unchanged = updateWorkspace(preserved, {
    config: { rootFolderPath: ' /repo ', sourceControlRepositoryPaths: ['src/./app', 'src//app'] },
  } as Parameters<typeof updateWorkspace>[1])
  assert.deepEqual(sourceControlPaths(unchanged), ['src/app'])

  const changed = updateWorkspace(unchanged, {
    config: { rootFolderPath: '/other-repo', sourceControlRepositoryPaths: ['still/unsafe?'] },
  } as Parameters<typeof updateWorkspace>[1])
  assert.deepEqual(sourceControlPaths(changed), ['still/unsafe?'])

  const cleared = updateWorkspace(changed, {
    config: { rootFolderPath: undefined },
  } as Parameters<typeof updateWorkspace>[1])
  assert.equal(cleared.config.rootFolderPath, undefined)
  assert.deepEqual(sourceControlPaths(cleared), [])
})
