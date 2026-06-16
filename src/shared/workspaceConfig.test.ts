import { normalizeWorkspaceConfig } from './workspaceConfig'

const defaults = normalizeWorkspaceConfig({})
if (defaults.terminalHistoryEnabled !== true) throw new Error('terminal history must default on')
if (defaults.type !== 'canvas') throw new Error('workspace type must default to canvas')

const missing = normalizeWorkspaceConfig({ rootFolderPath: ' /repo ', initialCommand: ' npm test ' })
if (missing.rootFolderPath !== '/repo') throw new Error('root folder must be trimmed')
if (missing.initialCommand !== 'npm test') throw new Error('initial command must be trimmed')
if (missing.terminalHistoryEnabled !== true) throw new Error('missing terminal history setting must normalize to true')
if (missing.type !== 'canvas') throw new Error('missing workspace type must normalize to canvas')

const disabled = normalizeWorkspaceConfig({ terminalHistoryEnabled: false })
if (disabled.terminalHistoryEnabled !== false) throw new Error('explicit disabled terminal history must be preserved')

const enabled = normalizeWorkspaceConfig({ terminalHistoryEnabled: true })
if (enabled.terminalHistoryEnabled !== true) throw new Error('explicit enabled terminal history must be preserved')

const grid = normalizeWorkspaceConfig({ type: 'grid' })
if (grid.type !== 'grid') throw new Error('grid workspace type must be preserved')

const legacy = normalizeWorkspaceConfig({ type: 'legacy' as 'grid' })
if (legacy.type !== 'canvas') throw new Error('legacy workspace type must normalize to canvas')
