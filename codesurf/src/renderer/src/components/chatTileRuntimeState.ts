const chatTileRuntimeState = new Map<string, unknown>()
const disposedChatTileIds = new Set<string>()

export function getChatTileRuntimeState<T>(tileId: string): T | null {
  if (disposedChatTileIds.has(tileId)) return null
  return (chatTileRuntimeState.get(tileId) as T | undefined) ?? null
}

export function setChatTileRuntimeState<T>(tileId: string, state: T): void {
  if (disposedChatTileIds.has(tileId)) return
  chatTileRuntimeState.set(tileId, state)
}

export function disposeChatTileRuntimeState(tileId: string): void {
  disposedChatTileIds.add(tileId)
  chatTileRuntimeState.delete(tileId)
}

export function reviveChatTileRuntimeState(tileId: string): void {
  disposedChatTileIds.delete(tileId)
}

export function isChatTileRuntimeStateDisposed(tileId: string): boolean {
  return disposedChatTileIds.has(tileId)
}
