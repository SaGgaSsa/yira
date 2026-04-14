import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, GripVertical, Palette, Plus, X } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'
import type { KanbanBoardState, KanbanCard, KanbanCardColor, KanbanColumnId, TileState } from '@shared/types'
import { KANBAN_COLUMNS } from '@shared/types'

interface KanbanTileProps {
  tile: TileState
}

interface DragState {
  cardId: string
  fromColumnId: KanbanColumnId
}

function createEmptyBoardState(): KanbanBoardState {
  return {
    columns: {
      backlog: [],
      in_development: [],
      review: [],
      done: [],
    },
  }
}

function normalizeBoardState(raw: KanbanBoardState | null): KanbanBoardState {
  return {
    columns: {
      backlog: raw?.columns?.backlog ?? [],
      in_development: raw?.columns?.in_development ?? [],
      review: raw?.columns?.review ?? [],
      done: raw?.columns?.done ?? [],
    },
  }
}

function createCard(): KanbanCard {
  return {
    id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    description: '',
    color: 'slate',
  }
}

function cloneColumns(columns: KanbanBoardState['columns']): KanbanBoardState['columns'] {
  return {
    backlog: [...columns.backlog],
    in_development: [...columns.in_development],
    review: [...columns.review],
    done: [...columns.done],
  }
}

function accentForColor(color: KanbanCardColor): string {
  switch (color) {
    case 'green':
      return 'var(--success)'
    case 'amber':
      return 'var(--warning)'
    case 'rose':
      return 'var(--accent)'
    case 'blue':
      return 'var(--interactive)'
    default:
      return 'var(--text-secondary)'
  }
}

export function KanbanTile({ tile }: KanbanTileProps): React.ReactElement {
  const activeWorkspaceId = useCanvasStore((s) => s.activeWorkspaceId)
  const [boardState, setBoardState] = useState<KanbanBoardState>(createEmptyBoardState)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<{ columnId: KanbanColumnId; beforeCardId: string | null } | null>(null)
  const loadedRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadedRef.current = false
    setBoardState(createEmptyBoardState())
    setExpandedCards({})

    if (!activeWorkspaceId) return

    window.electron.board.load(activeWorkspaceId, tile.id).then((state) => {
      setBoardState(normalizeBoardState(state))
      loadedRef.current = true
    }).catch(() => {
      setBoardState(createEmptyBoardState())
      loadedRef.current = true
    })
  }, [activeWorkspaceId, tile.id])

  useEffect(() => {
    if (!activeWorkspaceId || !loadedRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      window.electron.board.save(activeWorkspaceId, tile.id, boardState)
    }, 400)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [activeWorkspaceId, tile.id, boardState])

  const updateCard = useCallback((columnId: KanbanColumnId, cardId: string, patch: Partial<KanbanCard>) => {
    setBoardState((prev) => ({
      columns: {
        ...prev.columns,
        [columnId]: prev.columns[columnId].map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
      },
    }))
  }, [])

  const addCard = useCallback((columnId: KanbanColumnId) => {
    const card = createCard()
    setBoardState((prev) => ({
      columns: {
        ...prev.columns,
        [columnId]: [...prev.columns[columnId], card],
      },
    }))
    setExpandedCards((prev) => ({ ...prev, [card.id]: true }))
  }, [])

  const deleteCard = useCallback((columnId: KanbanColumnId, cardId: string) => {
    setBoardState((prev) => ({
      columns: {
        ...prev.columns,
        [columnId]: prev.columns[columnId].filter((card) => card.id !== cardId),
      },
    }))
    setExpandedCards((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
  }, [])

  const moveCard = useCallback((cardId: string, fromColumnId: KanbanColumnId, targetColumnId: KanbanColumnId, beforeCardId: string | null) => {
    setBoardState((prev) => {
      const columns = cloneColumns(prev.columns)
      const sourceCards = columns[fromColumnId]
      const sourceIndex = sourceCards.findIndex((card) => card.id === cardId)
      if (sourceIndex === -1) return prev

      const [card] = sourceCards.splice(sourceIndex, 1)
      const targetCards = columns[targetColumnId]
      const targetIndex = beforeCardId ? targetCards.findIndex((item) => item.id === beforeCardId) : -1
      const insertAt = targetIndex >= 0 ? targetIndex : targetCards.length
      targetCards.splice(insertAt, 0, card)

      return { columns }
    })
  }, [])

  const handleDrop = useCallback((columnId: KanbanColumnId, beforeCardId: string | null) => {
    if (!dragging) return
    moveCard(dragging.cardId, dragging.fromColumnId, columnId, beforeCardId)
    setDragging(null)
    setDropTarget(null)
  }, [dragging, moveCard])

  const totalCards = useMemo(
    () => KANBAN_COLUMNS.reduce((sum, column) => sum + boardState.columns[column.id].length, 0),
    [boardState],
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="nd-label text-text-secondary">Board Surface</div>
          <div className="mt-1 text-base text-text-display">Flow overview</div>
        </div>
        <div className="font-mono text-sm text-text-display">{totalCards}</div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-4 py-4">
        {KANBAN_COLUMNS.map((column) => {
          const cards = boardState.columns[column.id]
          const isColumnDropTarget = dropTarget?.columnId === column.id && dropTarget.beforeCardId === null

          return (
            <div
              key={column.id}
              className="flex h-full min-h-0 w-[280px] shrink-0 flex-col rounded-[20px] border border-border bg-bg-tertiary"
              onDragOver={(event) => {
                event.preventDefault()
                if (dragging) setDropTarget({ columnId: column.id, beforeCardId: null })
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDrop(column.id, null)
              }}
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <div className="nd-label text-text-secondary">{column.label}</div>
                  <div className="mt-1 text-sm text-text-display">{cards.length} cards</div>
                </div>
                <button
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border-visible text-text-secondary transition-colors hover:text-text-display"
                  onClick={() => addCard(column.id)}
                  title={`Add card to ${column.label}`}
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className={`min-h-full space-y-3 rounded-[16px] ${isColumnDropTarget ? 'bg-hover-bg' : ''}`}>
                  {cards.map((card) => {
                    const isExpanded = expandedCards[card.id] || card.description.length > 0
                    const isDropBefore = dropTarget?.columnId === column.id && dropTarget.beforeCardId === card.id
                    const accentColor = accentForColor(card.color)

                    return (
                      <React.Fragment key={card.id}>
                        {isDropBefore && <div className="h-1 rounded-full bg-accent" />}
                        <div
                          className="rounded-[18px] border bg-bg-secondary p-3"
                          style={{ borderColor: 'var(--border-visible)' }}
                          draggable
                          onDragStart={() => {
                            setDragging({ cardId: card.id, fromColumnId: column.id })
                          }}
                          onDragEnd={() => {
                            setDragging(null)
                            setDropTarget(null)
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            if (dragging) setDropTarget({ columnId: column.id, beforeCardId: card.id })
                          }}
                          onDrop={(event) => {
                            event.preventDefault()
                            handleDrop(column.id, card.id)
                          }}
                        >
                          <div className="mb-3 flex items-start gap-2">
                            <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-border-visible text-text-secondary">
                              <GripVertical size={12} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="nd-label text-text-secondary">Task</div>
                              <input
                                className="mt-2 min-w-0 w-full bg-transparent text-sm text-text-display outline-none placeholder:text-text-disabled"
                                value={card.title}
                                onChange={(event) => updateCard(column.id, card.id, { title: event.target.value })}
                                placeholder="Untitled card"
                              />
                            </div>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-display"
                              onClick={() => setExpandedCards((prev) => ({ ...prev, [card.id]: !isExpanded }))}
                              title="Toggle description"
                            >
                              <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-hover-bg hover:text-danger"
                              onClick={() => deleteCard(column.id, card.id)}
                              title="Delete card"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {isExpanded && (
                            <textarea
                              className="mb-3 min-h-[88px] w-full resize-none rounded-[14px] border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-disabled"
                              value={card.description}
                              onChange={(event) => updateCard(column.id, card.id, { description: event.target.value })}
                              placeholder="Description"
                            />
                          )}

                          <div className="flex items-center justify-between">
                            <div className="nd-caption text-text-secondary">STATE</div>
                            <div className="flex items-center gap-1">
                              <Palette size={12} className="text-text-secondary" />
                              {(['slate', 'blue', 'green', 'amber', 'rose'] as KanbanCardColor[]).map((colorId) => (
                                <button
                                  key={colorId}
                                  className="h-4 w-4 rounded-full border"
                                  style={{
                                    background: accentForColor(colorId),
                                    borderColor: card.color === colorId ? 'var(--text-display)' : 'transparent',
                                  }}
                                  onClick={() => updateCard(column.id, card.id, { color: colorId })}
                                  title={colorId}
                                />
                              ))}
                            </div>
                          </div>

                          <div className="mt-3 h-1 rounded-full bg-border">
                            <div
                              className="h-full rounded-full"
                              style={{ width: '26%', background: accentColor }}
                            />
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })}

                  {cards.length === 0 && (
                    <button
                      className="flex w-full items-center justify-center rounded-[18px] border border-dashed border-border-visible px-3 py-6 text-sm text-text-secondary transition-colors hover:border-text-secondary hover:text-text-display"
                      onClick={() => addCard(column.id)}
                    >
                      <span className="nd-label">Add card</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
