import { useCallback, useEffect, useRef, useState } from 'react'
import type { TileState } from '@shared/types'

export interface NoteDocumentData {
  title?: string
  updatedAt?: number
  [key: string]: unknown
}

interface LoadedDocument<TFields> {
  fields: TFields
  patch: Partial<TileState>
  updatedAt?: number
  migration?: Record<string, unknown>
}

interface UseNoteDocumentOptions<TFields extends { title: string }> {
  tile: TileState
  onUpdate: (patch: Partial<TileState>) => void
  initialFields: TFields
  buildPayload: (
    fields: TFields,
    updatedAt: number,
  ) => Record<string, unknown>
  applyLoaded: (
    data: NoteDocumentData | null,
    tile: TileState,
  ) => LoadedDocument<TFields>
}

export interface NoteDocument<TFields> {
  fields: TFields
  updatedAt?: number
  updateField: <K extends keyof TFields>(key: K, value: TFields[K], patch?: Partial<TileState>) => void
  scheduleSave: (nextFields?: Partial<TFields>) => void
  saveNow: (nextFields?: Partial<TFields>) => void
}

export function useNoteDocument<TFields extends { title: string }>({
  tile,
  onUpdate,
  initialFields,
  buildPayload,
  applyLoaded,
}: UseNoteDocumentOptions<TFields>): NoteDocument<TFields> {
  const [fields, setFields] = useState(initialFields)
  const [updatedAt, setUpdatedAt] = useState<number | undefined>()
  const fieldsRef = useRef(fields)
  const onUpdateRef = useRef(onUpdate)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasUnsavedChangesRef = useRef(false)
  const hasEditedSinceLoadRef = useRef(false)
  const loadRequestIdRef = useRef(0)

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  const saveNow = useCallback((nextFields?: Partial<TFields>) => {
    if (!hasUnsavedChangesRef.current && !nextFields) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const savedFields = { ...fieldsRef.current, ...nextFields }
    const savedAt = Date.now()
    fieldsRef.current = savedFields
    setUpdatedAt(savedAt)
    setFields(savedFields)
    hasUnsavedChangesRef.current = false
    const payload = buildPayload(savedFields, savedAt)
    void window.electron.note.save(
      tile.id,
      payload as Parameters<typeof window.electron.note.save>[1],
    )
  }, [buildPayload, tile.id])

  const scheduleSave = useCallback((nextFields?: Partial<TFields>) => {
    hasEditedSinceLoadRef.current = true
    fieldsRef.current = { ...fieldsRef.current, ...nextFields }
    if (nextFields) setFields(fieldsRef.current)
    hasUnsavedChangesRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveNow(), 500)
  }, [saveNow])

  const updateField = useCallback(
    <K extends keyof TFields>(key: K, value: TFields[K], patch?: Partial<TileState>) => {
      hasEditedSinceLoadRef.current = true
      const nextFields: Partial<TFields> = {}
      nextFields[key] = value
      scheduleSave(nextFields)
      if (patch) onUpdateRef.current(patch)
    },
    [scheduleSave],
  )

  useEffect(() => {
    const loadRequestId = ++loadRequestIdRef.current
    hasEditedSinceLoadRef.current = false
    fieldsRef.current = initialFields
    setFields(initialFields)
    setUpdatedAt(undefined)
    window.electron.note.load(tile.id).then((rawData) => {
      if (loadRequestIdRef.current !== loadRequestId || hasEditedSinceLoadRef.current) return
      const data = rawData as NoteDocumentData | null
      const loaded = applyLoaded(data, tile)
      fieldsRef.current = loaded.fields
      setFields(loaded.fields)
      const loadedUpdatedAt = loaded.migration
        ? loaded.updatedAt ?? Date.now()
        : loaded.updatedAt
      const migration = loaded.migration
        ? { ...loaded.migration, updatedAt: loadedUpdatedAt }
        : undefined
      setUpdatedAt(loadedUpdatedAt)
      if (Object.keys(loaded.patch).length) onUpdateRef.current(loaded.patch)
      if (migration) {
        void window.electron.note.save(
          tile.id,
          migration as Parameters<typeof window.electron.note.save>[1],
        )
      }
    })
  }, [applyLoaded, tile.id])

  useEffect(() => {
    const nextTitle = tile.label ?? ''
    if (nextTitle !== fieldsRef.current.title) {
      fieldsRef.current = { ...fieldsRef.current, title: nextTitle }
      setFields(fieldsRef.current)
    }
  }, [tile.label])

  useEffect(() => {
    return () => {
      if (hasUnsavedChangesRef.current) saveNow()
    }
  }, [saveNow])

  return { fields, updatedAt, updateField, scheduleSave, saveNow }
}
