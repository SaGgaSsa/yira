import { compileFileSearchQuery } from '@shared/fileSearch'
import type { FileSearchEntry, FileSearchResult } from '@shared/types'

export type WorkspaceSearchStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface WorkspaceSearchState {
  query: string
  status: WorkspaceSearchStatus
  entries: FileSearchEntry[]
  error: string | null
}

export type WorkspaceSearchView = 'prompt' | 'loading' | 'results' | 'no-results' | 'error'

export function createWorkspaceSearchState(): WorkspaceSearchState {
  return {
    query: '',
    status: 'idle',
    entries: [],
    error: null,
  }
}

export function resetWorkspaceSearchState(): WorkspaceSearchState {
  return createWorkspaceSearchState()
}

export function startWorkspaceSearch(_current: WorkspaceSearchState, query: string): WorkspaceSearchState {
  if (!query.trim()) {
    return {
      query,
      status: 'idle',
      entries: [],
      error: null,
    }
  }

  const compiled = compileFileSearchQuery(query)
  if (!compiled.ok) {
    return {
      query,
      status: 'error',
      entries: [],
      error: compiled.error,
    }
  }

  return {
    query,
    status: 'loading',
    entries: [],
    error: null,
  }
}

export function getWorkspaceSearchView(state: WorkspaceSearchState): WorkspaceSearchView {
  if (state.status === 'idle') return 'prompt'
  if (state.status === 'loading') return 'loading'
  if (state.status === 'error') return 'error'
  return state.entries.length > 0 ? 'results' : 'no-results'
}

function searchErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to search files'
}

export async function executeWorkspaceFileSearch(
  rootPath: string,
  query: string,
  search: (rootPath: string, query: string) => Promise<FileSearchResult>,
): Promise<WorkspaceSearchState> {
  const prepared = startWorkspaceSearch(createWorkspaceSearchState(), query)
  if (prepared.status !== 'loading') return prepared

  try {
    const result = await search(rootPath, query)
    return {
      ...prepared,
      status: 'ready',
      entries: result.entries,
    }
  } catch (error) {
    return {
      ...prepared,
      status: 'error',
      error: searchErrorMessage(error),
    }
  }
}
