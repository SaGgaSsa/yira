import type { ShellProfileId, CanvasState, Workspace, UserSettings, KanbanBoardState, TerminalCreateOptions } from '@shared/types'

interface ElectronWorld {
  workspace: {
    list: () => Promise<Workspace[]>
    create: (name: string) => Promise<Workspace>
    delete: (id: string) => Promise<void>
    setActive: (id: string) => Promise<void>
    getActive: () => Promise<Workspace | null>
    openFolder: () => Promise<Workspace | null>
  }
  settings: {
    load: () => Promise<UserSettings | null>
    save: (settings: UserSettings) => Promise<void>
  }
  note: {
    save: (tileId: string, data: { color?: string; font?: string; content?: string }) => Promise<void>
    load: (tileId: string) => Promise<{ color?: string; font?: string; content?: string } | null>
    delete: (tileId: string) => Promise<void>
  }
  board: {
    save: (workspaceId: string, tileId: string, state: KanbanBoardState) => Promise<void>
    load: (workspaceId: string, tileId: string) => Promise<KanbanBoardState | null>
    delete: (workspaceId: string, tileId: string) => Promise<void>
  }
  canvas: {
    load: (workspaceId: string) => Promise<CanvasState | null>
    save: (workspaceId: string, state: unknown) => Promise<void>
  }
  terminal: {
    create: (tileId: string, options: TerminalCreateOptions) => Promise<{ cols: number; rows: number; buffer: string }>
    write: (tileId: string, data: string) => Promise<void>
    resize: (tileId: string, cols: number, rows: number) => Promise<void>
    destroy: (tileId: string) => Promise<void>
    detach: (tileId: string) => Promise<void>
    onData: (tileId: string, callback: (data: string) => void) => () => void
  }
  shellProfiles: {
    list: () => Promise<Array<{ id: ShellProfileId; label: string; available: boolean }>>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  clipboard: {
    readText: () => Promise<string>
    writeText: (text: string) => Promise<void>
  }
}

declare global {
  interface Window {
    electron: ElectronWorld
  }
}

export {}
