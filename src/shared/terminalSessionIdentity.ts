export interface TerminalSessionTarget {
  workspaceId: string
  tileId: string
}

export interface TerminalSessionIdentity extends TerminalSessionTarget {
  generation: number
}

export function terminalSessionLookupKey({ workspaceId, tileId }: TerminalSessionTarget): string {
  return JSON.stringify([workspaceId, tileId])
}

export function sameTerminalSessionIdentity(
  first: TerminalSessionIdentity,
  second: TerminalSessionIdentity,
): boolean {
  return first.workspaceId === second.workspaceId
    && first.tileId === second.tileId
    && first.generation === second.generation
}

export function terminalSessionDataChannel({ workspaceId, tileId, generation }: TerminalSessionIdentity): string {
  return `terminal:data:${encodeURIComponent(workspaceId)}:${encodeURIComponent(tileId)}:${generation}`
}

export function terminalSessionExitChannel({ workspaceId, tileId, generation }: TerminalSessionIdentity): string {
  return `terminal:exit:${encodeURIComponent(workspaceId)}:${encodeURIComponent(tileId)}:${generation}`
}
