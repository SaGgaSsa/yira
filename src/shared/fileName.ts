import type { FileNameError } from './types'

const MAX_SEGMENT_LENGTH = 255
const INVALID_CHARACTERS = /[<>:"|?*\\\u0000-\u001f\u007f]/
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function validateSegment(segment: string): FileNameError | null {
  if (segment === '' || segment === '.' || segment === '..') return 'invalid-segment'
  if (INVALID_CHARACTERS.test(segment)) return 'invalid-character'
  if (segment.endsWith('.') || segment.endsWith(' ')) return 'trailing-dot-or-space'
  if (RESERVED_NAMES.test(segment.split('.')[0].trimEnd())) return 'reserved-name'
  if (segment.length > MAX_SEGMENT_LENGTH) return 'too-long'
  return null
}

// Validates a file or folder name typed by the user. A single trailing '/' is
// accepted when nesting is allowed (it means "create a folder").
export function validateEntryName(name: string, options: { allowNested: boolean }): FileNameError | null {
  if (name === '') return 'empty'
  if (name.startsWith('/')) return 'absolute-path'

  const withoutTrailingSlash = options.allowNested && name.endsWith('/') ? name.slice(0, -1) : name
  const segments = withoutTrailingSlash.split('/')
  if (!options.allowNested && segments.length > 1) return 'invalid-character'

  for (const segment of segments) {
    const error = validateSegment(segment)
    if (error) return error
  }
  return null
}
