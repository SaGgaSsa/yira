import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, GripVertical, Palette, Plus, X } from 'lucide-react'
import { useCanvasStore } from '@/store/canvasStore'
import type { KanbanBoardState, KanbanCard, KanbanCardColor, KanbanColumnId, TileState } from '@shared/types'
import { KANBAN_CARD_COLORS, KANBAN_COLUMNS } from '@shared/types'

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
    <div className="flex h-full min-h-0 flex-col bg-bg-primary">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <div className="text-sm font-medium text-text-primary">Board</div>
          <div className="text-xs text-text-muted">{totalCards} cards</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 py-3">
        {KANBAN_COLUMNS.map((column) => {
          const cards = boardState.columns[column.id]
          const isColumnDropTarget = dropTarget?.columnId === column.id && dropTarget.beforeCardId === null

          return (
            <div
              key={column.id}
              className="flex h-full min-h-0 w-[280px] shrink-0 flex-col rounded-xl border border-border bg-bg-secondary"
              onDragOver={(event) => {
                event.preventDefault()
                if (dragging) setDropTarget({ columnId: column.id, beforeCardId: null })
              }}
              onDrop={(event) => {
                event.preventDefault()
                handleDrop(column.id, null)
              }}
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-text-primary">{column.label}</div>
                  <div className="text-xs text-text-muted">{cards.length} cards</div>
                </div>
                <button
                  className="flex h-7 w-7 items-center justify-center rounded text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
                  onClick={() => addCard(column.id)}
                  title={`Add card to ${column.label}`}
                >
                  <Plus size={14} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <div className={`min-h-full space-y-2 rounded-lg ${isColumnDropTarget ? 'bg-hover-bg/40' : ''}`}>
                  {cards.map((card) => {
                    const palette = KANBAN_CARD_COLORS[card.color]
                    const isExpanded = expandedCards[card.id] || card.description.length > 0
                    const isDropBefore = dropTarget?.columnId === column.id && dropTarget.beforeCardId === card.id

                    return (
                      <React.Fragment key={card.id}>
                        {isDropBefore && <div className="h-1.5 rounded-full bg-accent" />}
                        <div
                          className="rounded-lg border p-2 shadow-sm"
                          style={{
                            background: palette.bg,
                            borderColor: palette.border,
                            color: palette.text,
                          }}
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
                          <div className="mb-2 flex items-center gap-1">
                            <GripVertical size={14} className="shrink-0 opacity-60" />
                            <input
                              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-current/40"
                              value={card.title}
                              onChange={(event) => updateCard(column.id, card.id, { title: event.target.value })}
                              placeholder="Untitled card"
                            />
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-black/10"
                              onClick={() => setExpandedCards((prev) => ({ ...prev, [card.id]: !isExpanded }))}
                              title="Toggle description"
                            >
                              <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-black/10"
                              onClick={() => deleteCard(column.id, card.id)}
                              title="Delete card"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          {isExpanded && (
                            <textarea
                              className="mb-2 min-h-[72px] w-full resize-none rounded-md border border-black/10 bg-black/5 px-2 py-1.5 text-xs outline-none placeholder:text-current/40"
                              style={{ color: palette.text }}
                              value={card.description}
                              onChange={(event) => updateCard(column.id, card.id, { description: event.target.value })}
                              placeholder="Description"
                            />
                          )}

                          <div className="flex items-center gap-1">
                            <Palette size={12} className="opacity-60" />
                            {Object.entries(KANBAN_CARD_COLORS).map(([colorId, colors]) => (
                              <button
                                key={colorId}
                                className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${
                                  card.color === colorId ? 'ring-2 ring-white/70' : ''
                                }`}
                                style={{
                                  background: colors.border,
                                  borderColor: colors.text,
                                }}
                                onClick={() => updateCard(column.id, card.id, { color: colorId as KanbanCardColor })}
                                title={colorId}
                              />
                            ))}
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })}

                  {cards.length === 0 && (
                    <button
                      className="flex w-full items-center justify-center rounded-lg border border-dashed border-border-subtle px-3 py-4 text-sm text-text-muted transition-colors hover:border-border hover:bg-hover-bg"
                      onClick={() => addCard(column.id)}
                    >
                      Add card
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
