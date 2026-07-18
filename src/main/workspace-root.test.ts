import type { WorkspaceMetadata } from '@shared/types'
import {
  buildUnknownWorkspaceFolderResult,
  findWorkspaceByRootFolder,
  resolveTerminalWorkspaceRoot,
} from './workspace-root'

function workspace(id: string, name: string, rootFolderPath?: string): WorkspaceMetadata {
  return {
    id,
    name,
    path: `/internal/${id}`,
    config: {
      type: 'canvas',
      rootFolderPath,
      workspacePanelOpen: true,
      sourceControlViewMode: 'list',
      terminalHistoryEnabled: true,
    },
  }
}

const alpha = workspace('ws-alpha', 'Alpha', '/repo/alpha')
const beta = workspace('ws-beta', 'Beta', 'D:\\Projects\\Beta')

if (findWorkspaceByRootFolder([alpha], '/repo/alpha/')?.id !== 'ws-alpha') {
  throw new Error('workspace root matching must ignore trailing slashes')
}

if (findWorkspaceByRootFolder([beta], 'd:/projects/beta')?.id !== 'ws-beta') {
  throw new Error('workspace root matching must normalize Windows casing and separators')
}

const unknown = buildUnknownWorkspaceFolderResult('/repo/new-project')
if (unknown.workspace !== null || unknown.canceled !== false || unknown.selectedRootFolderPath !== '/repo/new-project') {
  throw new Error('unknown folder result must include the selected root folder path')
}
if (unknown.suggestedName !== 'new-project') {
  throw new Error('unknown folder result must include a basename suggested name')
}
if (unknown.error) {
  throw new Error('unknown folder result must not report an error')
}

const noRoot = resolveTerminalWorkspaceRoot({
  shellProfileId: 'bash',
  workspaceRootFolderPath: undefined,
  platform: 'linux',
})
if (noRoot.cwd !== process.cwd() || noRoot.spawnArgs.length !== 0) {
  throw new Error('terminal without workspace root must fall back to process cwd')
}

const wslNoRoot = resolveTerminalWorkspaceRoot({
  shellProfileId: 'wsl',
  workspaceRootFolderPath: undefined,
  platform: 'win32',
  wslStartInHome: true,
})
if (wslNoRoot.cwd !== process.cwd() || wslNoRoot.spawnArgs.join(' ') !== '--cd ~') {
  throw new Error('WSL terminal without workspace root must start in home when requested')
}

const linuxRoot = resolveTerminalWorkspaceRoot({
  shellProfileId: 'bash',
  workspaceRootFolderPath: '/repo/alpha',
  platform: 'linux',
})
if (linuxRoot.cwd !== '/repo/alpha' || linuxRoot.spawnArgs.length !== 0) {
  throw new Error('non-WSL terminal must use workspace root as cwd')
}

const wslWindowsRoot = resolveTerminalWorkspaceRoot({
  shellProfileId: 'wsl',
  workspaceRootFolderPath: 'D:\\Projects\\Beta',
  platform: 'win32',
})
if (wslWindowsRoot.cwd !== process.cwd() || wslWindowsRoot.spawnArgs.join(' ') !== '--cd /mnt/d/Projects/Beta') {
  throw new Error('WSL terminal must translate Windows drive roots into --cd paths')
}

const wslUncRoot = resolveTerminalWorkspaceRoot({
  shellProfileId: 'wsl',
  workspaceRootFolderPath: '\\\\wsl$\\Ubuntu\\home\\dev\\repo',
  platform: 'win32',
})
if (wslUncRoot.cwd !== process.cwd() || wslUncRoot.spawnArgs.join(' ') !== '--cd /home/dev/repo') {
  throw new Error('WSL terminal must translate WSL UNC roots into Linux paths')
}

const wslUnknownRoot = resolveTerminalWorkspaceRoot({
  shellProfileId: 'wsl',
  workspaceRootFolderPath: '\\\\server\\share\\repo',
  platform: 'win32',
})
if (wslUnknownRoot.cwd !== '\\\\server\\share\\repo' || wslUnknownRoot.spawnArgs.length !== 0) {
  throw new Error('untranslatable WSL roots must fall back to normal cwd handling')
}
