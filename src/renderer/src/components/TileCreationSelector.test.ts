import { getTileCreationActions } from './TileCreationSelector'

let notePickerOpened = 0

const actions = getTileCreationActions({
  canCreateNote: true,
  canCreateBrowser: true,
  canCreateTimer: false,
  boardEnabled: false,
  onCreateNote: () => { notePickerOpened += 1 },
})

if (actions.map(({ id }) => id).join(',') !== 'terminal,note,browser,board') {
  throw new Error('the selector must expose the same available tile actions')
}

const note = actions.find(({ id }) => id === 'note')
if (note && 'submenu' in note) {
  throw new Error('the selector Note action must open the shared creation picker instead of rendering its own menu')
}

note?.onClick()
if (notePickerOpened !== 1) {
  throw new Error('the selector must open the shared note creation picker')
}

let openedBoard = 0
let createdTask = 0
const hiddenBoard = getTileCreationActions({
  canCreateNote: false,
  canCreateBrowser: false,
  canCreateTimer: false,
  boardEnabled: true,
  boardVisible: false,
  onOpenBoard: () => { openedBoard += 1 },
  onCreateBoard: () => { createdTask += 1 },
}, (key, fallback) => key === 'board.open' ? 'Open board' : fallback)
const board = hiddenBoard.find(({ id }) => id === 'board')
board?.onClick()
if (openedBoard !== 1 || createdTask !== 0) {
  throw new Error('a hidden enabled board action must reopen the board without creating a task')
}
if (board?.title !== 'Open board') {
  throw new Error('a hidden enabled board action must use the translated open-board title')
}
