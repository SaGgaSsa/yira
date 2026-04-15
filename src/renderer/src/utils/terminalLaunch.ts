const pendingInitialCommands = new Map<string, string>()

export function primeTerminalInitialCommand(tileId: string, command?: string): void {
  const nextCommand = command?.trim()

  if (!nextCommand) {
    pendingInitialCommands.delete(tileId)
    return
  }

  pendingInitialCommands.set(tileId, nextCommand)
}

export function consumeTerminalInitialCommand(tileId: string): string | undefined {
  const command = pendingInitialCommands.get(tileId)
  pendingInitialCommands.delete(tileId)
  return command
}
