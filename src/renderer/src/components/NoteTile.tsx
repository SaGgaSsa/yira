import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, type PartialBlock } from '@blocknote/core'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import type { NoteBlocks, NoteColor, NoteFont, TileState } from '@shared/types'
import { NOTE_COLORS } from '@shared/types'

interface NoteTileProps {
  tile: TileState
  onUpdate: (patch: Partial<TileState>) => void
}

type NoteData = {
  title?: string
  blocks?: NoteBlocks
  content?: string
  color?: string
  font?: string
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
  onChange,
}: {
  initialBlocks: PartialBlock[]
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

  return (
    <BlockNoteView
      className="yira-note-editor"
      editor={editor}
      theme="dark"
      onChange={() => {
        onChange(editor.document as NoteBlocks, blocksToSummary(editor))
      }}
    />
  )
}

export function NoteTile({ tile, onUpdate }: NoteTileProps): React.ReactElement {
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
    <div className="h-full w-full overflow-auto bg-bg-primary px-8 py-8">
      <div
        className="mx-auto flex min-h-full w-full max-w-[760px] flex-col border border-border-visible bg-bg-secondary shadow-[0_18px_60px_rgba(0,0,0,0.26)]"
        style={{ borderTopColor: accentColor, borderTopWidth: 4 }}
      >
        <div className="border-b border-border px-10 pb-5 pt-8">
          <input
            className="w-full bg-transparent font-display text-[2.1rem] leading-tight text-text-display outline-none placeholder:text-text-disabled"
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
              onChange={handleBlocksChange}
            />
          ) : (
            <div className="px-4 py-3 text-sm text-text-secondary">Loading note...</div>
          )}
        </div>
      </div>
    </div>
  )
}
