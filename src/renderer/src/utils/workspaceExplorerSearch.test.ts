import type { FileSearchResult } from '@shared/types'
import {
  createWorkspaceSearchState,
  executeWorkspaceFileSearch,
  getWorkspaceSearchView,
  getWorkspaceSearchKeyAction,
  isWorkspaceSearchRequestCurrent,
  resetWorkspaceSearchState,
  startWorkspaceSearch,
} from './workspaceExplorerSearch'

const initial = createWorkspaceSearchState()
if (getWorkspaceSearchView(initial) !== 'prompt') {
  throw new Error('a blank workspace search must render a prompt state')
}

const loading = startWorkspaceSearch(initial, 'README')
if (loading.status !== 'loading' || getWorkspaceSearchView(loading) !== 'loading') {
  throw new Error('a valid workspace search must enter its loading state')
}

const bridgeArguments: string[] = []
const ready = await executeWorkspaceFileSearch('/workspace', 'README', async (rootPath, query): Promise<FileSearchResult> => {
  bridgeArguments.push(rootPath, query)
  return { entries: [{ name: 'README.md', relativePath: 'docs/README.md' }] }
})
if (ready.status !== 'ready' || getWorkspaceSearchView(ready) !== 'results' || ready.entries[0]?.relativePath !== 'docs/README.md') {
  throw new Error('a successful workspace search must expose its file results')
}
if (bridgeArguments.join('|') !== '/workspace|README') {
  throw new Error('a valid workspace search must call the bridge with its current root and query')
}

const noResults = await executeWorkspaceFileSearch('/workspace', 'missing', async (): Promise<FileSearchResult> => ({ entries: [] }))
if (noResults.status !== 'ready' || getWorkspaceSearchView(noResults) !== 'no-results') {
  throw new Error('a successful empty workspace search must render a no-results state')
}

let bridgeCalls = 0
const blank = await executeWorkspaceFileSearch('/workspace', '   ', async (): Promise<FileSearchResult> => {
  bridgeCalls += 1
  return { entries: [] }
})
if (bridgeCalls !== 0 || blank.status !== 'idle' || getWorkspaceSearchView(blank) !== 'prompt') {
  throw new Error('a blank workspace search must not call the file-search bridge')
}

const invalid = await executeWorkspaceFileSearch('/workspace', '.*(', async (): Promise<FileSearchResult> => {
  bridgeCalls += 1
  return { entries: [] }
})
if (bridgeCalls !== 0 || invalid.status !== 'error' || !invalid.error || getWorkspaceSearchView(invalid) !== 'error') {
  throw new Error('an invalid regular-expression search must fail locally without calling the bridge')
}

const failed = await executeWorkspaceFileSearch('/workspace', 'README', async (): Promise<FileSearchResult> => {
  throw new Error('Search unavailable')
})
if (failed.status !== 'error' || failed.error !== 'Search unavailable') {
  throw new Error('a file-search bridge failure must render its error')
}

const reset = resetWorkspaceSearchState()
if (reset.query !== '' || reset.status !== 'idle' || reset.entries.length !== 0 || reset.error !== null) {
  throw new Error('closing workspace search must clear query, results, and errors')
}

if (getWorkspaceSearchKeyAction('Escape') !== 'close' || getWorkspaceSearchKeyAction('Enter') !== 'ignore') {
  throw new Error('Escape must close workspace search while other keys leave it open')
}

const currentRequest = { id: 4, rootPath: '/workspace', query: 'README' }
if (!isWorkspaceSearchRequestCurrent(currentRequest, currentRequest)) {
  throw new Error('a response matching its request id, root, and query must be accepted')
}
for (const staleRequest of [
  { id: 3, rootPath: '/workspace', query: 'README' },
  { id: 4, rootPath: '/other-workspace', query: 'README' },
  { id: 4, rootPath: '/workspace', query: 'package' },
]) {
  if (isWorkspaceSearchRequestCurrent(staleRequest, currentRequest)) {
    throw new Error('a stale workspace search response must be rejected when its id, root, or query differs')
  }
}
