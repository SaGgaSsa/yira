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
import { useNoteDocument, type NoteDocumentData } from '@/hooks/useNoteDocument'
import { createMarkdownComponents } from './MarkdownImage'
import { MarkdownPreviewPane } from './MarkdownPreviewPane'

interface NoteTileProps {
  tile: TileState
  autoFocus?: boolean
  onUpdate: (patch: Partial<TileState>) => void
  workspaceRootPath?: string
}

interface RichNoteFields {
  title: string
  blocks: NoteBlocks | null
  summary: string
}

interface MarkdownNoteFields {
  title: string
  markdown: string
  viewMode: MarkdownViewMode
}

type NoteData = NoteDocumentData & {
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function relativeTime(updatedAt: number | undefined, language: string, now: number): string | undefined {
  if (updatedAt == null) return undefined

  const seconds = Math.round((updatedAt - now) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
    ['second', 1],
  ]
  const [unit, size] = units.find(([, unitSize]) => Math.abs(seconds) >= unitSize) ?? units[units.length - 1]

  return new Intl.RelativeTimeFormat(language || 'en', { numeric: 'auto' }).format(Math.round(seconds / size), unit)
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
      onChange={() => onChange(editor.document as NoteBlocks, blocksToSummary(editor))}
    />
  )
}

function NotePageHeader({
  title,
  accent,
  updatedAt,
  wordCount,
  rightSlot,
  onTitleChange,
  onTitleBlur,
}: {
  title: string
  accent: string
  updatedAt?: number
  wordCount: number
  rightSlot?: React.ReactNode
  onTitleChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onTitleBlur: () => void
}): React.ReactElement {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const time = relativeTime(updatedAt, i18n.language, now)

  return (
    <header className="mx-auto w-full px-6 pt-10 sm:px-10">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-[10px] w-[10px] shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
        />
        <input
          className={
            'note-title-text min-w-0 flex-1 bg-transparent font-body font-semibold leading-tight text-text-display outline-none placeholder:text-text-disabled'
          }
          value={title}
          onChange={onTitleChange}
          onBlur={onTitleBlur}
          placeholder={t('ui.noteUntitled')}
          spellCheck={false}
        />
      </div>

      <div
        className="mt-2 flex min-h-6 items-center justify-between gap-3 text-text-secondary"
        style={{ fontSize: 'var(--font-caption)' }}
      >
        <span className="truncate">
          {time ? <>{t('ui.noteEdited', { time })} · </> : null}
          {t('ui.noteWordCount', { count: wordCount })}
        </span>
        {rightSlot}
      </div>
    </header>
  )
}

function RichNoteTile({ tile, autoFocus, onUpdate }: NoteTileProps): React.ReactElement {
  const { t } = useTranslation()

  const applyLoaded = useCallback((raw: NoteDocumentData | null, currentTile: TileState) => {
    const data = raw as NoteData | null
    const title = data && Object.prototype.hasOwnProperty.call(data, 'title')
      ? data.title ?? ''
      : currentTile.label ?? ''
    const blocks = isBlockArray(data?.blocks)
      ? data.blocks
      : legacyContentToBlocks(data?.content ?? currentTile.noteContent)
    const summary = data?.content ?? currentTile.noteContent ?? ''
    const patch: Partial<TileState> = {}

    if (data?.color) patch.noteColor = data.color as NoteColor
    if (data?.font) patch.noteFont = data.font as NoteFont
    if (summary !== currentTile.noteContent) patch.noteContent = summary
    if (labelFromTitle(title) !== currentTile.label) patch.label = labelFromTitle(title)

    const migration = data && !data.blocks && data.content != null
      ? { ...data, title, blocks: blocks as NoteBlocks, content: summary }
      : undefined

    return {
      fields: { title, blocks, summary },
      patch,
      updatedAt: data?.updatedAt,
      migration,
    }
  }, [])

  const note = useNoteDocument<RichNoteFields>({
    tile,
    onUpdate,
    initialFields: {
      title: tile.label ?? '',
      blocks: null,
      summary: tile.noteContent ?? '',
    },
    buildPayload: useCallback((fields: RichNoteFields, updatedAt: number) => ({
      title: fields.title,
      blocks: fields.blocks ?? legacyContentToBlocks(fields.summary) as NoteBlocks,
      content: fields.summary,
      color: tile.noteColor ?? 'white',
      font: tile.noteFont ?? 'sans',
      updatedAt,
    }), [tile.noteColor, tile.noteFont]),
    applyLoaded,
  })

  const accent = tile.noteColor ? NOTE_COLORS[tile.noteColor]?.accent : undefined

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    note.updateField('title', event.target.value, { label: labelFromTitle(event.target.value) })
  }

  const handleBlocksChange = (nextBlocks: NoteBlocks, summary: string) => {
    note.scheduleSave({ blocks: nextBlocks, summary })
    onUpdate({ noteContent: summary })
  }

  return (
    <div
      className="h-full w-full overflow-auto bg-bg-elevated"
      style={{ '--note-accent': accent ?? 'var(--text-secondary)' } as React.CSSProperties}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
        <NotePageHeader
          title={note.fields.title}
          accent="var(--note-accent)"
          updatedAt={note.updatedAt}
          wordCount={countWords(note.fields.summary)}
          onTitleChange={handleTitleChange}
          onTitleBlur={() => note.saveNow()}
        />

        <div className="min-h-0 flex-1 px-6 py-8 sm:px-10">
          {note.fields.blocks ? (
            <RichNoteEditor
              key={tile.id}
              initialBlocks={note.fields.blocks}
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

function MarkdownNoteTile({
  tile,
  autoFocus = false,
  onUpdate,
  workspaceRootPath = '',
}: NoteTileProps): React.ReactElement {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const markdownViewOptions: Array<{ mode: MarkdownViewMode; label: string }> = [
    { mode: 'edit', label: t('ui.noteEditMode') },
    { mode: 'preview', label: t('ui.notePreviewMode') },
    { mode: 'live', label: t('ui.noteSplitMode') },
  ]

  const applyLoaded = useCallback((raw: NoteDocumentData | null, currentTile: TileState) => {
    const data = raw as NoteData | null
    const title = data && Object.prototype.hasOwnProperty.call(data, 'title')
      ? data.title ?? ''
      : currentTile.label ?? ''
    const markdown = typeof data?.markdown === 'string' ? data.markdown : currentTile.markdown ?? ''
    const viewMode = normalizeMarkdownViewMode(data?.markdownView ?? currentTile.markdownView)
    const patch: Partial<TileState> = {
      noteKind: 'markdown',
      markdown,
      markdownView: viewMode,
    }

    if (data?.color) patch.noteColor = data.color as NoteColor
    if (data?.font) patch.noteFont = data.font as NoteFont
    if (labelFromTitle(title) !== currentTile.label) patch.label = labelFromTitle(title)

    return {
      fields: { title, markdown, viewMode },
      patch,
      updatedAt: data?.updatedAt,
    }
  }, [])

  const note = useNoteDocument<MarkdownNoteFields>({
    tile,
    onUpdate,
    initialFields: {
      title: tile.label ?? '',
      markdown: tile.markdown ?? '',
      viewMode: normalizeMarkdownViewMode(tile.markdownView),
    },
    buildPayload: useCallback((fields: MarkdownNoteFields, updatedAt: number) => ({
      title: fields.title,
      noteKind: 'markdown',
      markdown: fields.markdown,
      markdownView: fields.viewMode,
      color: tile.noteColor ?? 'white',
      font: tile.noteFont ?? 'sans',
      updatedAt,
    }), [tile.noteColor, tile.noteFont]),
    applyLoaded,
  })

  const accent = tile.noteColor ? NOTE_COLORS[tile.noteColor]?.accent : undefined
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
    if (autoFocus) editorRef.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  }, [autoFocus])

  const handleTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    note.updateField('title', event.target.value, { label: labelFromTitle(event.target.value) })
  }

  const handleMarkdownChange = (markdown: string) => {
    note.updateField('markdown', markdown, { markdown })
  }

  const handleViewModeChange = (viewMode: MarkdownViewMode) => {
    note.updateField('viewMode', viewMode, { markdownView: viewMode })
  }

  const modeButtons = (
    <div className="flex shrink-0 items-center gap-1">
      {markdownViewOptions.map(({ mode, label }) => (
        <button
          key={mode}
          className={`rounded-md px-2 py-1 text-xs transition-colors ${
            note.fields.viewMode === mode
              ? 'bg-hover-bg text-text-display'
              : 'text-text-secondary hover:text-text-display'
          }`}
          onClick={() => handleViewModeChange(mode)}
          type="button"
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div
      className="h-full w-full overflow-auto bg-bg-elevated"
      style={{ '--note-accent': accent ?? 'var(--text-secondary)' } as React.CSSProperties}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col">
        <NotePageHeader
          title={note.fields.title}
          accent="var(--note-accent)"
          updatedAt={note.updatedAt}
          wordCount={countWords(note.fields.markdown)}
          rightSlot={modeButtons}
          onTitleChange={handleTitleChange}
          onTitleBlur={() => note.saveNow()}
        />

        <div ref={editorRef} className="yira-markdown-editor min-h-[480px] flex-1 px-6 py-8 sm:px-10">
          {note.fields.viewMode === 'preview' ? (
            <MarkdownPreviewPane
              source={note.fields.markdown}
              colorMode={document.documentElement.classList.contains('light') ? 'light' : 'dark'}
              rootPath={workspaceRootPath}
              imageSourcePath={MARKDOWN_NOTE_SOURCE_PATH}
            />
          ) : (
            <MDEditor
              key={getMarkdownEditorKey(tile.id, note.fields.viewMode)}
              value={note.fields.markdown}
              onChange={(value) => handleMarkdownChange(value ?? '')}
              preview={note.fields.viewMode}
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

export function NoteTile({
  tile,
  autoFocus = false,
  onUpdate,
  workspaceRootPath = '',
}: NoteTileProps): React.ReactElement {
  return tile.noteKind === 'markdown'
    ? (
      <MarkdownNoteTile
        tile={tile}
        autoFocus={autoFocus}
        onUpdate={onUpdate}
        workspaceRootPath={workspaceRootPath}
      />
    )
    : (
      <RichNoteTile
        tile={tile}
        autoFocus={autoFocus}
        onUpdate={onUpdate}
      />
    )
}
