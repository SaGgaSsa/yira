import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Palette, Type } from 'lucide-react'
import type { TileState, NoteColor, NoteFont } from '@shared/types'
import { NOTE_COLORS, NOTE_FONTS } from '@shared/types'

interface NoteTileProps {
  tile: TileState
  onUpdate: (patch: Partial<TileState>) => void
}

const COLOR_PALETTE: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'white', 'dark']
const FONT_LIST: { value: NoteFont; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'serif', label: 'Serif' },
  { value: 'marker', label: 'Marker' },
  { value: 'handwritten', label: 'Handwritten' },
]

export function NoteTile({ tile, onUpdate }: NoteTileProps): React.ReactElement {
  const color = tile.noteColor ?? 'yellow'
  const font = tile.noteFont ?? 'sans'
  const content = tile.noteContent ?? ''
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showFontPicker, setShowFontPicker] = useState(false)

  // Load saved note data on mount
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
  }, [tile.id])

  // Auto-save with debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleSave = useCallback(
    (c: string, col: NoteColor, f: NoteFont) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        window.electron.note.save(tile.id, { color: col, font: f, content: c })
      }, 400)
    },
    [tile.id],
  )

  const handleColorChange = useCallback(
    (c: NoteColor) => {
      onUpdate({ noteColor: c })
      scheduleSave(content, c, font)
      setShowColorPicker(false)
    },
    [content, font, onUpdate, scheduleSave],
  )

  const handleFontChange = useCallback(
    (f: NoteFont) => {
      onUpdate({ noteFont: f })
      scheduleSave(content, color, f)
      setShowFontPicker(false)
    },
    [content, color, onUpdate, scheduleSave],
  )

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      onUpdate({ noteContent: text })
      scheduleSave(text, color, font)
    },
    [color, font, onUpdate, scheduleSave],
  )

  const colors = NOTE_COLORS
  const theme = colors[color] || colors.yellow

  return (
    <div className="w-full h-full flex flex-col p-2" style={{ color: theme.text }}>
      {/* Toolbar: color + font pickers */}
      <div className="flex items-center gap-1.5 mb-2">
        {/* Color picker */}
        <div className="relative">
          <button
            className="flex items-center justify-center w-6 h-6 rounded-full border transition-colors hover:opacity-80"
            style={{ background: theme.bg, borderColor: theme.text }}
            onClick={() => { setShowColorPicker(!showColorPicker); setShowFontPicker(false) }}
            title="Change color"
          >
            <Palette size={12} />
          </button>
          {showColorPicker && (
            <div
              className="absolute top-8 left-0 z-50 flex gap-1 p-1.5 rounded-lg shadow-lg"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: colors[c].bg,
                    borderColor: c === color ? 'var(--accent)' : 'transparent',
                  }}
                  onClick={() => handleColorChange(c)}
                  title={c}
                />
              ))}
            </div>
          )}
        </div>

        {/* Font picker */}
        <div className="relative">
          <button
            className="flex items-center justify-center w-6 h-6 rounded border text-xs transition-colors hover:opacity-80"
            style={{
              background: theme.bg,
              borderColor: theme.text,
              color: theme.text,
              fontFamily: NOTE_FONTS[font],
            }}
            onClick={() => { setShowFontPicker(!showFontPicker); setShowColorPicker(false) }}
            title="Change font"
          >
            <Type size={12} />
          </button>
          {showFontPicker && (
            <div
              className="absolute top-8 left-0 z-50 flex flex-col gap-0.5 p-1 rounded-lg shadow-lg min-w-[120px]"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}
            >
              {FONT_LIST.map((f) => (
                <button
                  key={f.value}
                  className="w-full text-left px-2 py-1 rounded text-xs transition-colors hover:bg-hover-bg"
                  style={{ fontFamily: NOTE_FONTS[f.value], color: theme.text }}
                  onClick={() => handleFontChange(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        className="flex-1 w-full resize-none outline-none text-sm leading-relaxed"
        style={{
          background: 'transparent',
          color: theme.text,
          fontFamily: NOTE_FONTS[font],
          caretColor: theme.text,
        }}
        placeholder="Write a note..."
        value={content}
        onChange={handleContentChange}
        spellCheck={false}
      />
    </div>
  )
}
