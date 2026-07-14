import { shouldAutoFocusTile } from './focusView'

if (!shouldAutoFocusTile('fullview', 'active', 'active', true)) {
  throw new Error('visible active Focus View tile must request autofocus')
}

if (shouldAutoFocusTile('canvas', 'active', 'active', true)) {
  throw new Error('canvas tiles must not request autofocus')
}

if (shouldAutoFocusTile('fullview', 'hidden', 'active', false)) {
  throw new Error('hidden Focus View tiles must not request autofocus')
}
