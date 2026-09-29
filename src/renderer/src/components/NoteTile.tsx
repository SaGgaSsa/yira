import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BlockNoteSchema, defaultBlockSpecs, selectedFragmentToHTML, type PartialBlock } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import MDEditor, { commands } from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'
import '@uiw/react-markdown-preview/markdown.css'
import type { MarkdownViewMode, NoteBlocks, NoteColor, NoteFont, TileState } from '@shared/types'
import { normalizeMarkdownViewMode, NOTE_COLORS } from '@shared/types'
import { createElectronClipboardPayload } from '@/utils/noteClipboard'
import { getMarkdownEditorKey } from '@/utils/markdownEditor'
import { MARKDOWN_NOTE_SOURCE_PATH } from '@/utils/markdownImage'
import { safeMarkdownPreviewOptions } from '@/utils/markdownPlugins'
import { safeMarkdownUrl } from '@/utils/markdownPreview'
import { createMarkdownComponents } from './MarkdownImage'
import { MarkdownPreviewPane } from './MarkdownPreviewPane'

interface NoteTileProps {
  tile: TileState
  autoFocus?: boolean
  onUpdate: (patch: Partial<TileState>) => void
  workspaceRootPath?: string
}

type NoteData = {
  title?: string
  blocks?: NoteBlocks
  content?: string
  color?: string
  font?: string
  noteKind?: 'rich' | 'markdown'
  markdown?: string
  markdownView?: MarkdownViewMode
}

const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    quote: defaultBlockSpecs.quote,
    codeBlock: defaultBlockSpecs.codeBlock,
    table: defaultBlockSpecs.table,
  },
})

function isBlockArray(value: unknown): value is NoteBlocks {
  return Array.isArray(value)
}

function legacyContentToBlocks(content: string | undefined): PartialBlock[] {
  const text = content?.trimEnd() ?? ''
  if (!text) return [{ type: 'paragraph' }]

  return text.split(/\n{2,}/).map((paragraph) => ({
    type: 'paragraph',
    content: paragraph.replace(/\n/g, ' '),
  }))
}

function titleFromTile(tile: TileState): string {
  return tile.label ?? ''
}

function titleFromData(data: NoteData | null, tile: TileState): string {
  if (data && Object.prototype.hasOwnProperty.call(data, 'title')) {
    return data.title ?? ''
  }

  return titleFromTile(tile)
}

function labelFromTitle(title: string): string | undefined {
  return title.trim() || undefined
}

function blocksToSummary(editor: ReturnType<typeof useCreateBlockNote>): string {
  try {
    return editor.blocksToMarkdownLossy(editor.document).trim()
  } catch {
    return ''
  }
}

function RichNoteEditor({
  initialBlocks,
  autoFocus = false,
  onChange,
}: {
  initialBlocks: PartialBlock[]
  autoFocus?: boolean
  onChange: (blocks: NoteBlocks, summary: string) => void
}): React.ReactElement {
  const editor = useCreateBlockNote({
    schema: noteSchema,
    initialContent: initialBlocks,
    tables: {
      splitCells: false,
      cellBackgroundColor: false,
      cellTextColor: false,
      headers: true,
    },
  })
  const handleCopy = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const view = editor.prosemirrorView
    if (view.state.selection.empty) return

    try {
      const payload = createElectronClipboardPayload(selectedFragmentToHTML(view, editor))
      if (!payload) return

      event.preventDefault()
      event.clipboardData.setData('text/html', payload.html)
      event.clipboardData.setData('text/plain', payload.text)
      void window.electron.clipboard.writeRich(payload)
    } catch (error) {
      console.warn('[notes] Failed to write rich clipboard data', error)
    }
  }, [editor])

  useEffect(() => {
    if (autoFocus) editor.prosemirrorView.focus()
  }, [autoFocus, editor])

  return (
    <BlockNoteView
      className="yira-note-editor"
      editor={editor}
      theme="dark"
      onCopy={handleCopy}
      onChange={() => {
        onChange(editor.document as NoteBlocks, blocksToSummary(editor))
      }}
    />
  )
}

function RichNoteTile({ tile, autoFocus, onUpdate }: NoteTileProps): React.ReactElement {
  const { t } = useTranslation()
  const [title, setTitle] = useState(titleFromTile(tile))
  const [blocks, setBlocks] = useState<PartialBlock[] | null>(null)
  const [revision, setRevision] = useState(0)
  const onUpdateRef = useRef(onUpdate)
  const latestTitleRef = useRef(title)
  const latestBlocksRef = useRef<NoteBlocks>(legacyContentToBlocks(tile.noteContent) as NoteBlocks)
  const latestSummaryRef = useRef(tile.noteContent ?? '')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasUnsavedChangesRef = useRef(false)
  const hasEditedSinceLoadRef = useRef(false)
  const loadRequestIdRef = useRef(0)

  const accentColor = useMemo(() => {
    if (!tile.noteColor) return 'var(--border-visible)'
    return NOTE_COLORS[tile.noteColor]?.bg || 'var(--border-visible)'
  }, [tile.noteColor])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    latestTitleRef.current = title
  }, [title])

  useEffect(() => {
    const nextTitle = titleFromTile(tile)
    if (nextTitle === latestTitleRef.current) return
    latestTitleRef.current = nextTitle
    setTitle(nextTitle)
  }, [tile.label])

  const saveNow = useCallback((data?: { title?: string; blocks?: NoteBlocks; summary?: string }) => {
    if (!hasUnsavedChangesRef.current && !data) return

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const titleToSave = data?.title ?? latestTitleRef.current
    const blocksToSave = data?.blocks ?? latestBlocksRef.current
    const summary = data?.summary ?? latestSummaryRef.current
    hasUnsavedChangesRef.current = false
    latestTitleRef.current = titleToSave
    latestBlocksRef.current = blocksToSave
    latestSummaryRef.current = summary

    void window.electron.note.save(tile.id, {
      title: titleToSave,
      blocks: blocksToSave,
      content: summary,
      color: tile.noteColor ?? 'white',
      font: tile.noteFont ?? 'sans',
    })
  }, [tile.id, tile.noteColor, tile.noteFont])

  const scheduleSave = useCallback((data?: { title?: string; blocks?: NoteBlocks; summary?: string }) => {
    hasUnsavedChangesRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveNow(data)
    }, 500)
  }, [saveNow])

  useEffect(() => {
    const loadRequestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = loadRequestId
    hasEditedSinceLoadRef.current = false
    setBlocks(null)

    window.electron.note.load(tile.id).then((data: NoteData | null) => {
      if (loadRequestIdRef.current !== loadRequestId) return
      if (hasEditedSinceLoadRef.current) return

      const loadedTitle = titleFromData(data, tile)
      const loadedLabel = labelFromTitle(loadedTitle)
      const loadedBlocks = isBlockArray(data?.blocks)
        ? data.blocks
        : legacyContentToBlocks(data?.content ?? tile.noteContent)
      const summary = data?.content ?? tile.noteContent ?? ''
      const patch: Partial<TileState> = {}

      if (data?.color) patch.noteColor = data.color as NoteColor
      if (data?.font) patch.noteFont = data.font as NoteFont
      if (summary !== tile.noteContent) patch.noteContent = summary
      if (loadedLabel !== tile.label) patch.label = loadedLabel

      latestTitleRef.current = loadedTitle
      latestBlocksRef.current = loadedBlocks as NoteBlocks
      latestSummaryRef.current = summary
      setTitle(loadedTitle)
      setBlocks(loadedBlocks)
      setRevision((value) => value + 1)

      if (Object.keys(patch).length > 0) onUpdateRef.current(patch)

      if (data && !data.blocks && data.content != null) {
        void window.electron.note.save(tile.id, {
          ...data,
          title: loadedTitle,
          blocks: loadedBlocks as NoteBlocks,
          content: summary,
        })
      }
    })
  }, [tile.id])

  useEffect(() => {
    return () => {
      saveNow()
    }
  }, [saveNow])

  const handleTitleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.target.value
    const nextLabel = labelFromTitle(nextTitle)
    hasEditedSinceLoadRef.current = true
    latestTitleRef.current = nextTitle
    setTitle(nextTitle)
    onUpdate({ label: nextLabel })
    scheduleSave({ title: nextTitle })
  }, [onUpdate, scheduleSave])

  const handleBlocksChange = useCallback((nextBlocks: NoteBlocks, summary: string) => {
    hasEditedSinceLoadRef.current = true
    latestBlocksRef.current = nextBlocks
    latestSummaryRef.current = summary
    onUpdate({ noteContent: summary })
    scheduleSave({ blocks: nextBlocks, summary })
  }, [onUpdate, scheduleSave])

  return (
    <div className="h-full w-full overflow-auto bg-bg-secondary">
      <div
        className="mx-auto flex min-h-full w-full max-w-[760px] flex-col border border-border-visible bg-bg-secondary shadow-[0_18px_60px_rgba(0,0,0,0.26)]"
        style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
      >
        <div className="border-b border-border px-10 pb-5 pt-8">
          <input
            className="note-title-text w-full bg-transparent font-display leading-tight text-text-display outline-none placeholder:text-text-disabled"
            value={title}
            onChange={handleTitleChange}
            onBlur={() => saveNow()}
            placeholder=""
            spellCheck={false}
          />
        </div>

        <div className="min-h-0 flex-1 px-6 py-6">
          {blocks ? (
            <RichNoteEditor
              key={`${tile.id}:${revision}`}
              initialBlocks={blocks}
              autoFocus={autoFocus}
              onChange={handleBlocksChange}
            />
          ) : (
            <div className="px-4 py-3 text-sm text-text-secondary">{t('ui.loadingNote')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

const MARKDOWN_COMMANDS = [
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.title1,
  commands.title2,
  commands.divider,
  commands.link,
  commands.image,
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.unorderedListCommand,
  commands.orderedListCommand,
]

function MarkdownNoteTile({ tile, autoFocus = false, onUpdate, workspaceRootPath = '' }: NoteTileProps): React.ReactElement {
  const { t } = useTranslation()
  const markdownViewOptions: Array<{ mode: MarkdownViewMode; label: string }> = [
    { mode: 'edit', label: t('ui.noteEditMode') },
    { mode: 'preview', label: t('ui.notePreviewMode') },
    { mode: 'live', label: t('ui.noteSplitMode') },
  ]
  const [title, setTitle] = useState(titleFromTile(tile))
  const [markdown, setMarkdown] = useState(tile.markdown ?? '')
  const [viewMode, setViewMode] = useState<MarkdownViewMode>(normalizeMarkdownViewMode(tile.markdownView))
  const onUpdateRef = useRef(onUpdate)
  const latestTitleRef = useRef(title)
  const latestMarkdownRef = useRef(markdown)
  const latestViewModeRef = useRef(viewMode)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasUnsavedChangesRef = useRef(false)
  const hasEditedSinceLoadRef = useRef(false)
  const loadRequestIdRef = useRef(0)
  const editorRef = useRef<HTMLDivElement>(null)

  const accentColor = useMemo(() => {
    if (!tile.noteColor) return 'var(--border-visible)'
    return NOTE_COLORS[tile.noteColor]?.bg || 'var(--border-visible)'
  }, [tile.noteColor])

  const markdownComponents = useMemo(() => createMarkdownComponents({
    sourcePath: MARKDOWN_NOTE_SOURCE_PATH,
    rootPath: workspaceRootPath,
  }), [workspaceRootPath])

  const markdownPreviewOptions = useMemo(() => ({
    ...safeMarkdownPreviewOptions,
    urlTransform: safeMarkdownUrl,
    components: markdownComponents,
  }), [markdownComponents])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  useEffect(() => {
    latestTitleRef.current = title
  }, [title])

  useEffect(() => {
    const nextTitle = titleFromTile(tile)
    if (nextTitle === latestTitleRef.current) return
    latestTitleRef.current = nextTitle
    setTitle(nextTitle)
  }, [tile.label])

  useEffect(() => {
    if (!autoFocus) return
    editorRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  }, [autoFocus])

  const saveNow = useCallback((data?: {
    title?: string
    markdown?: string
    markdownView?: MarkdownViewMode
  }) => {
    if (!hasUnsavedChangesRef.current && !data) return

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const titleToSave = data?.title ?? latestTitleRef.current
    const markdownToSave = data?.markdown ?? latestMarkdownRef.current
    const markdownViewToSave = data?.markdownView ?? latestViewModeRef.current
    hasUnsavedChangesRef.current = false
    latestTitleRef.current = titleToSave
    latestMarkdownRef.current = markdownToSave
    latestViewModeRef.current = markdownViewToSave

    void window.electron.note.save(tile.id, {
      title: titleToSave,
      noteKind: 'markdown',
      markdown: markdownToSave,
      markdownView: markdownViewToSave,
      color: tile.noteColor ?? 'white',
      font: tile.noteFont ?? 'sans',
    })
  }, [tile.id, tile.noteColor, tile.noteFont])

  const scheduleSave = useCallback((data?: {
    title?: string
    markdown?: string
    markdownView?: MarkdownViewMode
  }) => {
    hasUnsavedChangesRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveNow(data)
    }, 500)
  }, [saveNow])

  useEffect(() => {
    const loadRequestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = loadRequestId
    hasEditedSinceLoadRef.current = false

    window.electron.note.load(tile.id).then((data: NoteData | null) => {
      if (loadRequestIdRef.current !== loadRequestId || hasEditedSinceLoadRef.current) return

      const loadedTitle = titleFromData(data, tile)
      const loadedLabel = labelFromTitle(loadedTitle)
      const loadedMarkdown = typeof data?.markdown === 'string' ? data.markdown : tile.markdown ?? ''
      const loadedViewMode = normalizeMarkdownViewMode(data?.markdownView ?? tile.markdownView)
      const patch: Partial<TileState> = {
        noteKind: 'markdown',
        markdown: loadedMarkdown,
        markdownView: loadedViewMode,
      }

      if (data?.color) patch.noteColor = data.color as NoteColor
      if (data?.font) patch.noteFont = data.font as NoteFont
      if (loadedLabel !== tile.label) patch.label = loadedLabel

      latestTitleRef.current = loadedTitle
      latestMarkdownRef.current = loadedMarkdown
      latestViewModeRef.current = loadedViewMode
      setTitle(loadedTitle)
      setMarkdown(loadedMarkdown)
      setViewMode(loadedViewMode)
      onUpdateRef.current(patch)
    })
  }, [tile.id])

  useEffect(() => () => {
    saveNow()
  }, [saveNow])

  const handleTitleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.target.value
    hasEditedSinceLoadRef.current = true
    latestTitleRef.current = nextTitle
    setTitle(nextTitle)
    onUpdate({ label: labelFromTitle(nextTitle) })
    scheduleSave({ title: nextTitle })
  }, [onUpdate, scheduleSave])

  const handleMarkdownChange = useCallback((nextMarkdown: string) => {
    hasEditedSinceLoadRef.current = true
    latestMarkdownRef.current = nextMarkdown
    setMarkdown(nextMarkdown)
    onUpdate({ markdown: nextMarkdown })
    scheduleSave({ markdown: nextMarkdown })
  }, [onUpdate, scheduleSave])

  const handleViewModeChange = useCallback((nextViewMode: MarkdownViewMode) => {
    hasEditedSinceLoadRef.current = true
    latestViewModeRef.current = nextViewMode
    setViewMode(nextViewMode)
    onUpdate({ markdownView: nextViewMode })
    scheduleSave({ markdownView: nextViewMode })
  }, [onUpdate, scheduleSave])

  return (
    <div className="h-full w-full overflow-auto bg-bg-secondary">
      <div
        className="mx-auto flex min-h-full w-full max-w-[960px] flex-col border border-border-visible bg-bg-secondary shadow-[0_18px_60px_rgba(0,0,0,0.26)]"
        style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
      >
        <div className="border-b border-border px-10 pb-5 pt-8">
          <input
            className="note-title-text w-full bg-transparent font-display leading-tight text-text-display outline-none placeholder:text-text-disabled"
            value={title}
            onChange={handleTitleChange}
            onBlur={() => saveNow()}
            placeholder=""
            spellCheck={false}
          />
        </div>

        <div className="flex items-center justify-end gap-1 border-b border-border px-6 py-2">
          {markdownViewOptions.map(({ mode, label }) => (
            <button
              key={mode}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${viewMode === mode ? 'bg-hover-bg text-text-display' : 'text-text-secondary hover:text-text-display'}`}
              onClick={() => handleViewModeChange(mode)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div ref={editorRef} className="yira-markdown-editor min-h-[480px] flex-1 px-6 py-5">
          {viewMode === 'preview' ? (
            <MarkdownPreviewPane
              source={markdown}
              colorMode={document.documentElement.classList.contains('light') ? 'light' : 'dark'}
              rootPath={workspaceRootPath}
              imageSourcePath={MARKDOWN_NOTE_SOURCE_PATH}
            />
          ) : (
            <MDEditor
              key={getMarkdownEditorKey(tile.id, viewMode)}
              value={markdown}
              onChange={(value) => handleMarkdownChange(value ?? '')}
              preview={viewMode}
              commands={MARKDOWN_COMMANDS}
              extraCommands={[]}
              visibleDragbar={false}
              height="100%"
              data-color-mode="dark"
              previewOptions={markdownPreviewOptions}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export function NoteTile({ tile, autoFocus = false, onUpdate, workspaceRootPath = '' }: NoteTileProps): React.ReactElement {
  return tile.noteKind === 'markdown'
    ? <MarkdownNoteTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} workspaceRootPath={workspaceRootPath} />
    : <RichNoteTile tile={tile} autoFocus={autoFocus} onUpdate={onUpdate} />
}
