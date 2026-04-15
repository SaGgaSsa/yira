import React, { useCallback, useEffect, useRef } from 'react'
import type { TileState, NoteColor, NoteFont } from '@shared/types'

interface NoteTileProps {
  tile: TileState
  onUpdate: (patch: Partial<TileState>) => void
}

export function NoteTile({ tile, onUpdate }: NoteTileProps): React.ReactElement {
  const content = tile.noteContent ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    window.electron.note.load(tile.id).then((data) => {
      if (data) {
        const patch: Partial<TileState> = {}
        if (data.color) patch.noteColor = data.color as NoteColor
        if (data.font) patch.noteFont = data.font as NoteFont
        if (data.content != null) patch.noteContent = data.content
        if (Object.keys(patch).length > 0) onUpdate(patch)
      }
    })
  }, [tile.id, onUpdate])

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(
    (nextContent: string) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        window.electron.note.save(tile.id, {
          color: tile.noteColor ?? 'white',
          font: tile.noteFont ?? 'sans',
          content: nextContent,
        })
      }, 400)
    },
    [tile.id, tile.noteColor, tile.noteFont],
  )

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      onUpdate({ noteContent: text })
      scheduleSave(text)
    },
    [onUpdate, scheduleSave],
  )

  return (
    <div className="flex h-full w-full flex-col bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="nd-label text-text-secondary">Text Surface</span>
        <span className="nd-caption text-text-secondary">{content.length} CHARS</span>
      </div>

      <div className="flex-1 px-5 py-5">
        <textarea
          ref={textareaRef}
          className="h-full w-full resize-none bg-transparent font-body text-[1rem] leading-7 text-text-primary outline-none placeholder:text-text-disabled"
          style={{
            fontFamily: 'var(--font-body)',
          }}
          placeholder="Write directly. Keep it sparse."
          value={content}
          onChange={handleContentChange}
          spellCheck={false}
        />
      </div>
    </div>
  )
}
