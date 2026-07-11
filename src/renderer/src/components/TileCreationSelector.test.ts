import { getTileCreationActions } from './TileCreationSelector'

const actions = getTileCreationActions({
  canCreateNote: true,
  canCreateBrowser: true,
  canCreateTimer: false,
  canShowFilesCreation: true,
  canCreateFiles: false,
  boardEnabled: false,
})

if (actions.map(({ id }) => id).join(',') !== 'terminal,note,browser,files,board') {
  throw new Error('the selector must expose the same available tile actions')
}

if (!actions.find(({ id }) => id === 'files')?.disabled) {
  throw new Error('files must remain disabled without a root folder')
}
