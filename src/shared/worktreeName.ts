export const MAX_WORKTREE_NAME_LENGTH = 100

const WORKTREE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i

/** Trims the name and turns inner whitespace into hyphens, as a branch name needs. */
export function normalizeWorktreeName(value: string): string {
  return value.trim().replace(/\s+/g, '-')
}

/** The folder has no slashes, so one name maps to one folder directly under the base. */
export function worktreeFolderName(name: string): string {
  return name.replaceAll('/', '-')
}

function hasInvalidSegment(name: string): boolean {
  return name.split('/').some((segment) => segment.endsWith('.lock') || segment.endsWith('.'))
}

export function isValidWorktreeName(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > MAX_WORKTREE_NAME_LENGTH) return false
  if (!WORKTREE_NAME_PATTERN.test(value)) return false
  if (value.includes('..') || value.includes('//') || value.includes('/.') || value.includes('/-')) return false
  if (value.endsWith('/') || hasInvalidSegment(value)) return false
  if (value.toLowerCase() === 'head') return false
  return !WINDOWS_RESERVED_NAME_PATTERN.test(worktreeFolderName(value))
}
