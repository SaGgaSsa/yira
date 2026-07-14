import { getTileCreationActions } from './TileCreationSelector'

let notePickerOpened = 0

const actions = getTileCreationActions({
  canCreateNote: true,
  canCreateBrowser: true,
  canCreateTimer: false,
  canShowFilesCreation: true,
  canCreateFiles: false,
  boardEnabled: false,
  onCreateNote: () => { notePickerOpened += 1 },
})

if (actions.map(({ id }) => id).join(',') !== 'terminal,note,browser,files,board') {
  throw new Error('the selector must expose the same available tile actions')
}

if (!actions.find(({ id }) => id === 'files')?.disabled) {
  throw new Error('files must remain disabled without a root folder')
}

const note = actions.find(({ id }) => id === 'note')
if (note && 'submenu' in note) {
  throw new Error('the selector Note action must open the shared creation picker instead of rendering its own menu')
}

note?.onClick()
if (notePickerOpened !== 1) {
  throw new Error('the selector must open the shared note creation picker')
}
