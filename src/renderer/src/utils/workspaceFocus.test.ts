import type { TileState } from '@shared/types'
import { resolveWorkspaceFocusTarget } from './workspaceFocus'

function tile(id: string, floating?: TileState['floating']): TileState {
  return {
    id,
    type: 'terminal',
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    zIndex: 1,
    floating,
  }
}

if (resolveWorkspaceFocusTarget([tile('remembered')], 'remembered') !== 'remembered') {
  throw new Error('a remembered attached tile must resolve as the focus target')
}

if (resolveWorkspaceFocusTarget([tile('other')], 'missing') !== null) {
  throw new Error('a missing remembered tile must not resolve as a focus target')
}

if (resolveWorkspaceFocusTarget([tile('detached', { detached: true })], 'detached') !== null) {
  throw new Error('a detached remembered tile must not resolve as a focus target')
}

if (resolveWorkspaceFocusTarget([], 'remembered') !== null) {
  throw new Error('an empty workspace must not resolve a focus target')
}
