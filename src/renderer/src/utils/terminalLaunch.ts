import type { TileGroup, TileState } from '@shared/types'

function normalizeCommand(command?: string): string | undefined {
  const nextCommand = command?.trim()

  return nextCommand || undefined
}

export function buildTerminalStartupCommand(
  tile: Pick<TileState, 'type' | 'shellProfileId' | 'startupCommand' | 'groupId'>,
  groups: TileGroup[],
): string | undefined {
  if (tile.type !== 'terminal') return undefined

  const commands: string[] = []

  if (tile.shellProfileId === 'wsl' && tile.groupId) {
    const group = groups.find((entry) => entry.id === tile.groupId)
    const groupCommand = normalizeCommand(group?.terminal?.wslStartupCommand)

    if (groupCommand) commands.push(groupCommand)
  }

  const tileCommand = normalizeCommand(tile.startupCommand)
  if (tileCommand) commands.push(tileCommand)

  return commands.length > 0 ? commands.join('\r') : undefined
}
