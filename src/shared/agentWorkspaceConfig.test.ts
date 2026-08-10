import { applyWorkspaceManagementChanges } from './workspaceManagement'
import { normalizeWorkspaceConfig } from './workspaceConfig'
import type { AgentProvider, Workspace } from './types'

const defaultConfig = normalizeWorkspaceConfig({})
if (defaultConfig.agentProviders.claude.enabled !== true) {
  throw new Error('Claude must be enabled by default')
}
if (defaultConfig.agentProviders.codex.enabled !== true) {
  throw new Error('Codex must be enabled by default')
}
if (defaultConfig.agentProviders.claude.args.length !== 0 || defaultConfig.agentProviders.codex.args.length !== 0) {
  throw new Error('default agent provider arguments must be empty')
}

const legacy = normalizeWorkspaceConfig({
  type: 'canvas',
  rootFolderPath: '/repo',
})
if (legacy.agentProviders.claude.args.length !== 0 || legacy.agentProviders.codex.args.length !== 0) {
  throw new Error('legacy workspace config must migrate to empty provider arguments')
}

const normalized = normalizeWorkspaceConfig({
  agentProviders: {
    claude: { enabled: false, args: [' --model', 'sonnet ', '', '--danger\n'] },
    codex: { enabled: false, args: [' --profile', 'work '] },
  },
})
if (normalized.agentProviders.claude.enabled !== false) throw new Error('Claude enabled setting must be preserved')
if (normalized.agentProviders.claude.args.join('|') !== '--model|sonnet') {
  throw new Error('Claude arguments must be trimmed and empty/unsafe values removed')
}
if (normalized.agentProviders.codex.args.join('|') !== '--profile|work') {
  throw new Error('Codex arguments must be trimmed')
}

function workspace(id: string, agentProviders?: Workspace['config']['agentProviders']): Workspace {
  return {
    id,
    name: id,
    path: `/tmp/yira/workspaces/${id}`,
    config: normalizeWorkspaceConfig({ agentProviders }),
  }
}

const existing = workspace('existing', {
  claude: { enabled: false, args: ['--model', 'haiku'] },
  codex: { enabled: true, args: ['--profile', 'work'] },
})
const managed = applyWorkspaceManagementChanges({
  existingWorkspaces: [existing],
  activeWorkspaceId: existing.id,
  desiredWorkspaces: [
    {
      id: existing.id,
      name: 'Renamed',
      agentProviders: {
        claude: { enabled: true, args: ['--model', 'opus'] },
        codex: { enabled: false, args: [] },
      },
    },
    { name: 'New workspace' },
  ],
  nextWorkspaceId: () => 'new',
  internalWorkspacePath: (id) => `/tmp/yira/workspaces/${id}`,
})
if (managed.workspaces[0].config.agentProviders.claude.args.join('|') !== '--model|opus') {
  throw new Error('workspace management must persist provider arguments')
}
if (managed.workspaces[0].config.agentProviders.codex.enabled !== false) {
  throw new Error('workspace management must persist provider enabled state')
}
if (managed.workspaces[1].config.agentProviders.claude.enabled !== true || managed.workspaces[1].config.agentProviders.codex.enabled !== true) {
  throw new Error('new workspaces must receive enabled provider defaults')
}

const partialManaged = applyWorkspaceManagementChanges({
  existingWorkspaces: [existing],
  activeWorkspaceId: existing.id,
  desiredWorkspaces: [{ id: existing.id, name: existing.name, agentProviders: { claude: { enabled: true } } }],
  nextWorkspaceId: () => 'unused',
  internalWorkspacePath: (id) => `/tmp/yira/workspaces/${id}`,
})
if (partialManaged.workspaces[0].config.agentProviders.codex.args.join('|') !== '--profile|work') {
  throw new Error('partial provider edits must preserve the other provider configuration')
}

const providers: AgentProvider[] = ['claude', 'codex']
if (providers.length !== 2) throw new Error('both supported providers must be represented')
