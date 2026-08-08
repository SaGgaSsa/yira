import type {
  FileReadResult,
  FileRevision,
  FileStatResult,
  FileWriteResult,
  TileState,
} from '@shared/types'

export type FileEditorState =
  | {
      status: 'loading'
      filePath: string
      persistedDraft?: string
      persistedVersion?: string
      persistedChangeToken?: string
    }
  | {
      status: 'ready'
      filePath: string
      diskContent: string
      draft: string
      revision: FileRevision
      baseVersion: string
      dirty: boolean
      conflict: boolean
      diskMissing: boolean
    }
  | { status: 'missing'; filePath: string }
  | { status: 'unsupported'; filePath: string; reason: string }
  | { status: 'error'; filePath: string; message: string }

export interface FileEditorTransition<State extends FileEditorState = FileEditorState> {
  state: State
  patch: Partial<TileState>
}

type ReadyFileEditorState = Extract<FileEditorState, { status: 'ready' }>

export interface FileEditorPollTransition extends FileEditorTransition<ReadyFileEditorState> {
  action: 'none' | 'reload'
}

function revisionsDiffer(first: FileRevision, second: FileRevision): boolean {
  return first.sha256 !== second.sha256 || first.metadataToken !== second.metadataToken
}

export function createFileEditorState(tile: TileState): FileEditorState {
  return {
    status: 'loading',
    filePath: tile.filePath?.trim() ?? '',
    persistedDraft: tile.fileDraft,
    persistedVersion: tile.fileVersion,
    persistedChangeToken: tile.fileChangeToken,
  }
}

export function applyFileRead(state: FileEditorState, result: FileReadResult): FileEditorTransition {
  if (result.status === 'missing') {
    return { state: { status: 'missing', filePath: state.filePath }, patch: {} }
  }

  if (result.status === 'unsupported') {
    return {
      state: { status: 'unsupported', filePath: state.filePath, reason: result.reason },
      patch: {},
    }
  }

  const persistedDraft = state.status === 'loading' ? state.persistedDraft : undefined
  const persistedVersion = state.status === 'loading' ? state.persistedVersion : undefined
  const persistedChangeToken = state.status === 'loading' ? state.persistedChangeToken : undefined
  const dirty = persistedDraft !== undefined && persistedDraft !== result.content
  const conflict = dirty && (
    !persistedVersion ||
    persistedVersion !== result.revision.sha256 ||
    (Boolean(persistedChangeToken) && persistedChangeToken !== result.revision.metadataToken)
  )
  const baseVersion = dirty && persistedVersion ? persistedVersion : result.revision.sha256
  const draft = dirty ? persistedDraft : result.content

  return {
    state: {
      status: 'ready',
      filePath: state.filePath,
      diskContent: result.content,
      draft,
      revision: result.revision,
      baseVersion,
      dirty,
      conflict,
      diskMissing: false,
    },
    patch: {
      fileDraft: dirty ? draft : undefined,
      fileVersion: baseVersion,
      fileChangeToken: result.revision.metadataToken,
    },
  }
}

export function beginFileEdit(
  state: ReadyFileEditorState,
  draft: string,
): FileEditorTransition<ReadyFileEditorState> {
  const dirty = state.conflict || draft !== state.diskContent
  return {
    state: {
      ...state,
      draft,
      dirty,
      conflict: dirty && state.conflict,
      diskMissing: dirty && state.diskMissing,
    },
    patch: {
      fileDraft: dirty ? draft : undefined,
    },
  }
}

export function applyExternalStat(
  state: ReadyFileEditorState,
  result: FileStatResult,
): FileEditorPollTransition {
  if (result.status === 'missing') {
    if (!state.dirty) return { state, patch: {}, action: 'reload' }
    return {
      state: { ...state, conflict: true, diskMissing: true },
      patch: { fileDraft: state.draft },
      action: 'none',
    }
  }

  if (!revisionsDiffer(state.revision, result.revision)) {
    return { state, patch: {}, action: 'none' }
  }

  if (!state.dirty) return { state, patch: {}, action: 'reload' }

  return {
    state: {
      ...state,
      revision: result.revision,
      conflict: true,
      diskMissing: false,
    },
    patch: {
      fileDraft: state.draft,
      fileChangeToken: result.revision.metadataToken,
    },
    action: 'none',
  }
}

export function applyFileWrite(
  state: ReadyFileEditorState,
  result: FileWriteResult,
  latestState: ReadyFileEditorState = state,
): FileEditorTransition<ReadyFileEditorState> {
  if (result.status === 'saved') {
    const hasNewerDraft = latestState.draft !== state.draft
    return {
      state: {
        ...latestState,
        diskContent: state.draft,
        draft: latestState.draft,
        revision: result.revision,
        baseVersion: result.revision.sha256,
        dirty: hasNewerDraft,
        conflict: false,
        diskMissing: false,
      },
      patch: {
        fileDraft: hasNewerDraft ? latestState.draft : undefined,
        fileVersion: result.revision.sha256,
        fileChangeToken: result.revision.metadataToken,
      },
    }
  }

  if (result.status === 'conflict') {
    return {
      state: {
        ...latestState,
        revision: result.revision,
        conflict: true,
        diskMissing: false,
      },
      patch: {
        fileDraft: latestState.draft,
        fileChangeToken: result.revision.metadataToken,
      },
    }
  }

  return {
    state: { ...latestState, conflict: true, diskMissing: true },
    patch: { fileDraft: latestState.draft },
  }
}

export function fileLanguage(filePath: string): string {
  const extension = filePath.split('.').at(-1)?.toLowerCase()
  const languages: Record<string, string> = {
    css: 'css',
    html: 'html',
    htm: 'html',
    js: 'javascript',
    cjs: 'javascript',
    mjs: 'javascript',
    json: 'json',
    jsonc: 'json',
    jsx: 'javascript',
    md: 'markdown',
    markdown: 'markdown',
    py: 'python',
    sh: 'shell',
    bash: 'shell',
    ts: 'typescript',
    tsx: 'typescript',
    txt: 'plaintext',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  }
  return extension ? languages[extension] ?? 'plaintext' : 'plaintext'
}
