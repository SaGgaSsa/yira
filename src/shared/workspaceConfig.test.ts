import { normalizeWorkspaceConfig } from './workspaceConfig'

type SourceControlConfigInput = Parameters<typeof normalizeWorkspaceConfig>[0] & {
  sourceControlRepositoryPaths?: unknown
}

type SourceControlConfig = ReturnType<typeof normalizeWorkspaceConfig> & {
  sourceControlRepositoryPaths: string[]
}

function sourceControlPaths(config: ReturnType<typeof normalizeWorkspaceConfig>): string[] {
  return (config as SourceControlConfig).sourceControlRepositoryPaths
}

const defaults = normalizeWorkspaceConfig({})
if (defaults.terminalHistoryEnabled !== true) throw new Error('terminal history must default on')
if (defaults.type !== 'canvas') throw new Error('workspace type must default to canvas')
if (defaults.workspacePanelOpen !== true) throw new Error('workspace panel must default open')
if (defaults.sourceControlViewMode !== 'list') throw new Error('source control view mode must default to list')
if (sourceControlPaths(defaults).length !== 0) throw new Error('source control repository paths must default to empty')

const sourceControlPathsWithNormalization = normalizeWorkspaceConfig({
  sourceControlRepositoryPaths: [
    '.',
    './',
    './packages//web/',
    'packages/./web',
    'services/api',
    ' services/api ',
    '',
    '   ',
    '/absolute/repository',
    '../outside',
    'packages/../../outside',
    'C:/absolute/repository',
    'C:\\absolute\\repository',
    'services\\api',
    'unsafe\u0000path',
  ],
} as SourceControlConfigInput)
if (sourceControlPaths(sourceControlPathsWithNormalization).join('|') !== '.|packages/web|services/api') {
  throw new Error('source control repository paths must normalize, reject unsafe paths, and deduplicate')
}

const rootRepositoryPath = normalizeWorkspaceConfig({
  sourceControlRepositoryPaths: ['./.'],
} as SourceControlConfigInput)
if (sourceControlPaths(rootRepositoryPath).join('|') !== '.') throw new Error('source control root repository path must normalize to dot')

const missing = normalizeWorkspaceConfig({ rootFolderPath: ' /repo ', initialCommand: ' npm test ' })
if (missing.rootFolderPath !== '/repo') throw new Error('root folder must be trimmed')
if (missing.initialCommand !== 'npm test') throw new Error('initial command must be trimmed')
if (missing.terminalHistoryEnabled !== true) throw new Error('missing terminal history setting must normalize to true')
if (missing.type !== 'canvas') throw new Error('missing workspace type must normalize to canvas')
if (missing.workspacePanelOpen !== true) throw new Error('missing workspace panel setting must normalize to open')

const closedPanel = normalizeWorkspaceConfig({ workspacePanelOpen: false })
if (closedPanel.workspacePanelOpen !== false) throw new Error('explicit closed workspace panel must be preserved')

const disabled = normalizeWorkspaceConfig({ terminalHistoryEnabled: false })
if (disabled.terminalHistoryEnabled !== false) throw new Error('explicit disabled terminal history must be preserved')

const enabled = normalizeWorkspaceConfig({ terminalHistoryEnabled: true })
if (enabled.terminalHistoryEnabled !== true) throw new Error('explicit enabled terminal history must be preserved')

const grid = normalizeWorkspaceConfig({ type: 'grid' })
if (grid.type !== 'grid') throw new Error('grid workspace type must be preserved')
if (grid.sourceControlViewMode !== 'list') throw new Error('grid workspaces must default source control view mode to list')

const sourceControlTree = normalizeWorkspaceConfig({ sourceControlViewMode: 'tree' })
if (sourceControlTree.sourceControlViewMode !== 'tree') throw new Error('tree source control view mode must be preserved')

const invalidSourceControlMode = normalizeWorkspaceConfig({ sourceControlViewMode: 'invalid' as 'tree' })
if (invalidSourceControlMode.sourceControlViewMode !== 'list') throw new Error('invalid source control view modes must normalize to list')

const remote = normalizeWorkspaceConfig({
  remoteTerminal: {
    host: ' notebook.tailnet.ts.net ',
    user: ' dev ',
    port: 2202,
  },
})
if (remote.remoteTerminal?.host !== 'notebook.tailnet.ts.net') throw new Error('remote host must be trimmed')
if (remote.remoteTerminal?.user !== 'dev') throw new Error('remote user must be trimmed')
if (remote.remoteTerminal?.port !== 2202) throw new Error('remote port must be preserved')

const invalidRemote = normalizeWorkspaceConfig({
  remoteTerminal: {
    host: '   ',
    user: 'dev',
  },
})
if (invalidRemote.remoteTerminal !== undefined) throw new Error('incomplete remote terminal config must be removed')

const unsafeRemote = normalizeWorkspaceConfig({
  remoteTerminal: {
    host: '-oProxyCommand=malicious',
    user: 'dev user',
  },
})
if (unsafeRemote.remoteTerminal !== undefined) throw new Error('unsafe SSH target tokens must be removed')

const malformedRemote = normalizeWorkspaceConfig({
  remoteTerminal: { host: 42, user: 'dev' } as unknown as NonNullable<typeof remote.remoteTerminal>,
})
if (malformedRemote.remoteTerminal !== undefined) throw new Error('malformed remote terminal config must be removed')

const legacy = normalizeWorkspaceConfig({ type: 'legacy' as 'grid' })
if (legacy.type !== 'canvas') throw new Error('legacy workspace type must normalize to canvas')
