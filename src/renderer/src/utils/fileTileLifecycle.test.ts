import {
  deriveFileTileTitle,
  isCleanReusableFilePreview,
  pinFileTileForDetach,
  pinFileTileForDraft,
  pinFileTileForRename,
  planFileTileOpen,
  createFileTileOpenRequestTracker,
} from './fileTileLifecycle'
import type { TileState } from '@shared/types'

function fileTile(id: string, overrides: Partial<TileState> = {}): TileState {
  return {
    id,
    type: 'files',
    x: 100,
    y: 200,
    width: 1200,
    height: 800,
    zIndex: 4,
    filePath: 'src/old.ts',
    filePreview: true,
    ...overrides,
  }
}

const proposed = fileTile('new-file', {
  x: 900,
  y: 800,
  zIndex: 20,
  filePath: 'src/new.ts',
  fileVersion: 'new-sha',
  fileChangeToken: 'new-token',
})

const existing = fileTile('existing', {
  filePath: 'src/new.ts',
  filePreview: false,
  fileMarkdownView: 'live',
  fileDraft: 'unsaved source',
})
const deduplicated = planFileTileOpen([existing], proposed)
if (deduplicated.kind !== 'focus-existing' || deduplicated.tileId !== 'existing') {
  throw new Error('opening a path already present must focus that tile instead of creating a duplicate')
}
const diffTile = fileTile('existing-diff', {
  filePath: 'src/new.ts',
  fileDiff: { repositoryPath: '.', path: 'src/new.ts', staged: true },
})
const normalDoesNotFocusDiff = planFileTileOpen([diffTile], proposed)
if (normalDoesNotFocusDiff.kind !== 'create') throw new Error('a normal file tile must not focus an existing diff tile')
const matchingDiff = planFileTileOpen([diffTile], fileTile('another-diff', {
  filePath: 'src/new.ts',
  fileDiff: { repositoryPath: '.', path: 'src/new.ts', staged: true },
}))
if (matchingDiff.kind !== 'focus-existing' || matchingDiff.tileId !== 'existing-diff') {
  throw new Error('matching diffs must focus by workspace path and staged state')
}
const differentStage = planFileTileOpen([diffTile], fileTile('unstaged-diff', {
  filePath: 'src/new.ts',
  fileDiff: { repositoryPath: '.', path: 'src/new.ts', staged: false },
}))
if (differentStage.kind === 'focus-existing') throw new Error('staged and working tree diffs must be distinct tiles')
const reusableDiff = fileTile('reusable-diff', {
  fileDiff: { repositoryPath: '.', path: 'src/old.ts', staged: true },
})
const reusedDiff = planFileTileOpen([reusableDiff], fileTile('next-diff', {
  filePath: 'src/new.ts',
  label: 'new.ts (Working Tree)',
  fileDiff: { repositoryPath: '.', path: 'src/new.ts', staged: false },
}))
if (reusedDiff.kind !== 'reuse-preview' || reusedDiff.tile.fileDiff?.staged !== false) {
  throw new Error('a clean diff preview must be reusable for another diff preview')
}
if (existing.fileMarkdownView !== 'live') {
  throw new Error('focusing an existing file tile must preserve its selected Markdown view')
}

const requestedPreview = fileTile('requested-preview', {
  filePath: 'docs/guide.md',
  fileMarkdownView: 'preview',
})
const createdWithPreview = planFileTileOpen([], requestedPreview)
if (createdWithPreview.kind !== 'create' || createdWithPreview.tile.fileMarkdownView !== 'preview') {
  throw new Error('a new Markdown file tile must retain its requested preview view')
}

const reusable = fileTile('preview', { x: 10, y: 20, zIndex: 1, fileMarkdownView: 'preview' })
if (!isCleanReusableFilePreview(reusable)) {
  throw new Error('a preview without a draft or structural state must be reusable')
}
const reused = planFileTileOpen([reusable], proposed)
if (reused.kind !== 'reuse-preview' || reused.tile.id !== 'preview') {
  throw new Error('opening a new path must reuse the sole clean preview')
}
if (
  reused.tile.filePath !== 'src/new.ts' ||
  reused.tile.filePreview !== true ||
  reused.tile.fileDraft !== undefined ||
  reused.tile.fileVersion !== 'new-sha' ||
  reused.tile.fileChangeToken !== 'new-token' ||
  reused.tile.fileMarkdownView !== 'preview' ||
  reused.tile.label !== 'new.ts' ||
  reused.tile.x !== 10 ||
  reused.tile.y !== 20 ||
  reused.tile.zIndex !== 1
) {
  throw new Error('preview reuse must retain tile placement and Markdown view while replacing path metadata and title')
}

for (const structuralPreview of [
  fileTile('draft', { fileDraft: 'edited' }),
  fileTile('detached', { floating: { detached: true } }),
]) {
  if (isCleanReusableFilePreview(structuralPreview)) {
    throw new Error('draft and detached previews must not be reusable')
  }
}
const created = planFileTileOpen([
  fileTile('draft', { fileDraft: 'edited' }),
  fileTile('detached', { floating: { detached: true } }),
], proposed)
if (created.kind !== 'create' || created.tile.id !== 'new-file' || created.tile.label !== 'new.ts') {
  throw new Error('opening without a clean preview must create a titled file tile')
}

const multiplePreviews = planFileTileOpen([
  fileTile('preview-one'),
  fileTile('preview-two'),
], proposed)
if (multiplePreviews.kind !== 'create') {
  throw new Error('opening with multiple clean previews must create a new file tile instead of choosing one arbitrarily')
}

if (deriveFileTileTitle('C:\\work\\nested\\file.test.ts') !== 'file.test.ts' || deriveFileTileTitle('/work/nested/README.md') !== 'README.md') {
  throw new Error('file titles must derive from either Windows or POSIX path basenames')
}

const preview = fileTile('preview')
if (pinFileTileForDraft(preview, 'edited').filePreview !== false || pinFileTileForDraft(preview, 'edited').fileDraft !== 'edited') {
  throw new Error('editing a preview must pin it and retain the draft')
}
if (pinFileTileForRename(preview, 'Renamed').filePreview !== false || pinFileTileForRename(preview, 'Renamed').label !== 'Renamed') {
  throw new Error('renaming a preview must pin it and retain the title')
}
if (pinFileTileForDetach(preview).filePreview !== false) {
  throw new Error('detaching a preview must pin it')
}

const requestTracker = createFileTileOpenRequestTracker()
const firstRequest = requestTracker.begin('workspace-one', '/work/one')
const secondRequest = requestTracker.begin('workspace-one', '/work/one')
if (requestTracker.isCurrent(firstRequest, 'workspace-one', '/work/one')) {
  throw new Error('an earlier file-open read must not win after a newer Explorer click')
}
if (!requestTracker.isCurrent(secondRequest, 'workspace-one', '/work/one')) {
  throw new Error('the latest file-open read must remain valid in its originating workspace')
}
if (
  requestTracker.isCurrent(secondRequest, 'workspace-two', '/work/two') ||
  requestTracker.isCurrent(secondRequest, 'workspace-one', '/work/renamed')
) {
  throw new Error('a file-open read must not mutate a different workspace or root after navigation')
}
