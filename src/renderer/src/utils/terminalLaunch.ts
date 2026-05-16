import type { TileState, WorkspaceConfig } from '@shared/types'

function normalizeCommand(command?: string): string | undefined {
  const nextCommand = command?.trim()

  return nextCommand || undefined
}

export function buildTerminalStartupCommand(
  tile: Pick<TileState, 'type' | 'shellProfileId' | 'startupCommand'>,
  workspaceConfig?: WorkspaceConfig,
): string | undefined {
  if (tile.type !== 'terminal') return undefined

  const commands: string[] = []
  const workspaceCommand = normalizeCommand(workspaceConfig?.initialCommand)
  if (workspaceCommand) commands.push(workspaceCommand)

  const tileCommand = normalizeCommand(tile.startupCommand)
  if (tileCommand) commands.push(tileCommand)

  return commands.length > 0 ? commands.join('\r') : undefined
}
