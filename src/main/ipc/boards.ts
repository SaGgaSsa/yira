import { ipcMain } from 'electron'
import {
  addBoardNote,
  approveReviewTask,
  createUserBoardTask,
  deleteBacklogTask,
  rejectReviewTask,
  updateUserBoardTask,
} from '@shared/board'
import type { BoardState } from '@shared/types'
import { enableBoardFile, loadBoardFile, saveBoardFile } from '@shared/boardStorage'
import { YIRA_HOME } from '../paths'

async function mutateBoard(workspaceId: string, update: (state: BoardState) => BoardState): Promise<BoardState> {
  const board = update(await loadBoardFile(YIRA_HOME, workspaceId))
  await saveBoardFile(YIRA_HOME, workspaceId, board)
  return board
}

export function registerBoardsIPC(): void {
  ipcMain.handle('board:load', async (_, workspaceId: string): Promise<BoardState> => {
    return loadBoardFile(YIRA_HOME, workspaceId)
  })

  ipcMain.handle('board:enable', async (_, workspaceId: string): Promise<BoardState> => {
    return enableBoardFile(YIRA_HOME, workspaceId)
  })

  ipcMain.handle('board:createUserTask', async (_, workspaceId: string, input: { title: string; task: string }): Promise<BoardState> => {
    return mutateBoard(workspaceId, (board) => createUserBoardTask(board, input))
  })

  ipcMain.handle('board:updateUserTask', async (_, workspaceId: string, input: { taskId: string; title?: string; task?: string }): Promise<BoardState> => {
    return mutateBoard(workspaceId, (board) => updateUserBoardTask(board, input))
  })

  ipcMain.handle('board:addUserNote', async (_, workspaceId: string, input: { taskId: string; note: string }): Promise<BoardState> => {
    return mutateBoard(workspaceId, (board) => addBoardNote(board, input, undefined, 'human'))
  })

  ipcMain.handle('board:deleteBacklogTask', async (_, workspaceId: string, taskId: string): Promise<BoardState> => {
    return mutateBoard(workspaceId, (board) => deleteBacklogTask(board, taskId))
  })

  ipcMain.handle('board:approveReviewTask', async (_, workspaceId: string, taskId: string): Promise<BoardState> => {
    return mutateBoard(workspaceId, (board) => approveReviewTask(board, { taskId }))
  })

  ipcMain.handle('board:rejectReviewTask', async (_, workspaceId: string, input: { taskId: string; note: string }): Promise<BoardState> => {
    return mutateBoard(workspaceId, (board) => rejectReviewTask(board, input))
  })
}
