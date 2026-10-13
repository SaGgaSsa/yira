const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
  'build',
  'release',
  'coverage',
  '.next',
  '.vite',
])

/** Whether the file listing hides an entry unless hidden files are requested. */
export function shouldHideEntry(name: string): boolean {
  return name.startsWith('.') || IGNORED_NAMES.has(name.toLowerCase())
}

/** Whether any segment of a relative path would be hidden by the file listing. */
export function isHiddenRelativePath(relativePath: string): boolean {
  return relativePath.split('/').some((segment) => segment !== '' && shouldHideEntry(segment))
}
