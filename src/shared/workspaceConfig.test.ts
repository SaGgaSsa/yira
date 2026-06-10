import { normalizeWorkspaceConfig } from './workspaceConfig'

const defaults = normalizeWorkspaceConfig({})
if (defaults.terminalHistoryEnabled !== true) throw new Error('terminal history must default on')

const missing = normalizeWorkspaceConfig({ rootFolderPath: ' /repo ', initialCommand: ' npm test ' })
if (missing.rootFolderPath !== '/repo') throw new Error('root folder must be trimmed')
if (missing.initialCommand !== 'npm test') throw new Error('initial command must be trimmed')
if (missing.terminalHistoryEnabled !== true) throw new Error('missing terminal history setting must normalize to true')

const disabled = normalizeWorkspaceConfig({ terminalHistoryEnabled: false })
if (disabled.terminalHistoryEnabled !== false) throw new Error('explicit disabled terminal history must be preserved')

const enabled = normalizeWorkspaceConfig({ terminalHistoryEnabled: true })
if (enabled.terminalHistoryEnabled !== true) throw new Error('explicit enabled terminal history must be preserved')
