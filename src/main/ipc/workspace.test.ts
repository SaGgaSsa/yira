import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentProvider, Workspace } from '@shared/types'
import { normalizeWorkspaceConfig } from '@shared/workspaceConfig'
import { createWorkspaceFromInput, normalizeWorkspace, updateWorkspace } from './workspace'

function workspace(id: string, agentProvider?: AgentProvider): Workspace {
  return {
    id,
    name: id,
    path: `/tmp/yira/workspaces/${id}`,
    config: normalizeWorkspaceConfig({ agentProvider }),
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
