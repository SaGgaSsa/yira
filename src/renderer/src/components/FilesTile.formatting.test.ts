import { formatModifiedAt } from './FilesTile'

const formatted = formatModifiedAt('2026-07-14T15:30:00.000Z', 'es-AR')

if (!formatted) {
  throw new Error('a valid file modification date must produce localized text')
}
