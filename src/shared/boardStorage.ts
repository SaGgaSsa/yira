import { promises as fs } from 'fs'
import { join } from 'path'
import { enableBoard, normalizeBoardState } from './board'
import type { BoardState } from './types'

function assertSafeId(id: string): void {
  if (/[\/\\]|\.\./.test(id)) throw new Error(`Unsafe ID: ${id}`)
}

export function boardDataPath(yiraHome: string, workspaceId: string): string {
  assertSafeId(workspaceId)
  return join(yiraHome, 'workspaces', workspaceId, '.yira', 'board', 'board.json')
}

export async function loadBoardFile(yiraHome: string, workspaceId: string): Promise<BoardState> {
  const path = boardDataPath(yiraHome, workspaceId)
  try {
    const raw = await fs.readFile(path, 'utf8')
    return normalizeBoardState(JSON.parse(raw))
  } catch {
    return normalizeBoardState(null)
  }
}

export async function saveBoardFile(yiraHome: string, workspaceId: string, state: BoardState): Promise<void> {
  const path = boardDataPath(yiraHome, workspaceId)
  await fs.mkdir(join(yiraHome, 'workspaces', workspaceId, '.yira', 'board'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(normalizeBoardState(state), null, 2))
}

export async function enableBoardFile(yiraHome: string, workspaceId: string): Promise<BoardState> {
  const board = enableBoard(await loadBoardFile(yiraHome, workspaceId))
  await saveBoardFile(yiraHome, workspaceId, board)
  return board
}
