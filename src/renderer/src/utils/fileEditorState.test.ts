import type { FileRevision, TileState } from '@shared/types'
import {
  applyExternalStat,
  applyFileRead,
  applyFileWrite,
  beginFileEdit,
  createFileEditorState,
  fileLanguage,
  type FileEditorState,
} from './fileEditorState'

const firstRevision: FileRevision = {
  size: 12,
  modifiedAt: '2026-08-04T10:00:00.000Z',
  metadataToken: 'token-1',
  sha256: 'sha-1',
}

if (fileLanguage('docs/guide.markdown') !== 'markdown') {
  throw new Error('.markdown files must use Monaco Markdown syntax highlighting')
}

const secondRevision: FileRevision = {
  size: 18,
  modifiedAt: '2026-08-04T10:01:00.000Z',
  metadataToken: 'token-2',
  sha256: 'sha-2',
}

function fileTile(overrides: Partial<TileState> = {}): TileState {
  return {
    id: 'file-tile',
    type: 'files',
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
    zIndex: 1,
    filePath: 'src/example.ts',
    filePreview: true,
    ...overrides,
  }
}

function assertReady(state: FileEditorState): asserts state is Extract<FileEditorState, { status: 'ready' }> {
  if (state.status !== 'ready') throw new Error(`expected ready state, received ${state.status}`)
}

const loaded = applyFileRead(createFileEditorState(fileTile()), {
  status: 'ready',
  content: 'const a = 1\n',
  revision: firstRevision,
})
assertReady(loaded.state)
if (loaded.state.draft !== 'const a = 1\n' || loaded.state.dirty || loaded.state.conflict) {
  throw new Error('a successful initial read must produce clean, conflict-free editor content')
}
if (loaded.patch.fileVersion !== 'sha-1' || loaded.patch.fileChangeToken !== 'token-1') {
  throw new Error('a successful initial read must persist the current file revision')
}

const restoredDraft = applyFileRead(createFileEditorState(fileTile({
  fileDraft: 'const a = 2\n',
  fileVersion: 'sha-1',
  fileChangeToken: 'token-1',
})), {
  status: 'ready',
  content: 'const a = 1\n',
  revision: firstRevision,
})
assertReady(restoredDraft.state)
if (restoredDraft.state.draft !== 'const a = 2\n' || !restoredDraft.state.dirty || restoredDraft.state.conflict) {
  throw new Error('a persisted draft must be restored as dirty without inventing a conflict')
}

const restoredConflict = applyFileRead(createFileEditorState(fileTile({
  fileDraft: 'const local = true\n',
  fileVersion: 'sha-1',
  fileChangeToken: 'token-1',
})), {
  status: 'ready',
  content: 'const external = true\n',
  revision: secondRevision,
})
assertReady(restoredConflict.state)
if (restoredConflict.state.draft !== 'const local = true\n' || !restoredConflict.state.conflict) {
  throw new Error('opening a changed file with a persisted draft must preserve the draft and surface a conflict')
}

const cleanExternalChange = applyExternalStat(loaded.state, { status: 'available', revision: secondRevision })
if (cleanExternalChange.action !== 'reload') {
  throw new Error('a changed clean file must request an automatic reload')
}

const edited = beginFileEdit(loaded.state, 'const local = true\n')
const dirtyExternalChange = applyExternalStat(edited.state, { status: 'available', revision: secondRevision })
if (dirtyExternalChange.action !== 'none' || dirtyExternalChange.state.draft !== 'const local = true\n' || !dirtyExternalChange.state.conflict) {
  throw new Error('a changed dirty file must retain its draft and enter conflict state')
}

const editedConflict = beginFileEdit(dirtyExternalChange.state, loaded.state.diskContent)
if (!editedConflict.state.dirty || !editedConflict.state.conflict) {
  throw new Error('editing a conflicted draft back to the stale base text must still require explicit conflict resolution')
}

const missingExternalFile = applyExternalStat(edited.state, { status: 'missing' })
if (missingExternalFile.state.draft !== 'const local = true\n' || !missingExternalFile.state.conflict || !missingExternalFile.state.diskMissing) {
  throw new Error('a dirty file removed externally must retain its draft and report a missing-file conflict')
}

const saved = applyFileWrite(edited.state, { status: 'saved', revision: secondRevision })
assertReady(saved.state)
if (saved.state.dirty || saved.state.conflict || saved.state.baseVersion !== 'sha-2' || saved.patch.fileDraft !== undefined) {
  throw new Error('a successful save must clear dirty/conflict state and persist the new revision')
}

const editDuringSave = beginFileEdit(edited.state, 'const typedDuringSave = true\n')
const savedWithNewerDraft = applyFileWrite(edited.state, { status: 'saved', revision: secondRevision }, editDuringSave.state)
if (!savedWithNewerDraft.state.dirty || savedWithNewerDraft.state.draft !== 'const typedDuringSave = true\n' || savedWithNewerDraft.patch.fileDraft !== 'const typedDuringSave = true\n') {
  throw new Error('a successful in-flight save must not discard edits made after that save began')
}

const saveConflict = applyFileWrite(edited.state, { status: 'conflict', revision: secondRevision })
assertReady(saveConflict.state)
if (saveConflict.state.draft !== 'const local = true\n' || !saveConflict.state.conflict || saveConflict.patch.fileDraft !== 'const local = true\n') {
  throw new Error('a conflicting save must preserve and persist the local draft')
}

for (const result of [
  { status: 'missing' as const },
  { status: 'unsupported' as const, reason: 'Binary file' },
]) {
  const next = applyFileRead(createFileEditorState(fileTile()), result)
  if (next.state.status !== result.status) {
    throw new Error(`a ${result.status} read must expose a typed ${result.status} editor state`)
  }
}
