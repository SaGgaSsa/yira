export interface CanvasRect {
  x: number
  y: number
  width: number
  height: number
}

export interface FindFreeCanvasPositionOptions {
  occupied: readonly CanvasRect[]
  width: number
  height: number
  preferred: { x: number; y: number }
  gap: number
}

/** True when two rects overlap once `gap` is kept around them. */
export function rectsOverlap(a: CanvasRect, b: CanvasRect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap
    && b.x < a.x + a.width + gap
    && a.y < b.y + b.height + gap
    && b.y < a.y + a.height + gap
  )
}

function overlapsAny(
  position: { x: number; y: number },
  width: number,
  height: number,
  occupied: readonly CanvasRect[],
  gap: number,
): boolean {
  return occupied.some((rect) => rectsOverlap(
    { x: position.x, y: position.y, width, height },
    rect,
    gap,
  ))
}

/**
 * Returns `preferred` when the rect fits there, otherwise the free spot closest to it,
 * trying the right side and the bottom side of every occupied rect.
 */
export function findFreeCanvasPosition({
  occupied,
  width,
  height,
  preferred,
  gap,
}: FindFreeCanvasPositionOptions): { x: number; y: number } {
  if (!overlapsAny(preferred, width, height, occupied, gap)) return preferred

  let best: { x: number; y: number } | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const rect of occupied) {
    const candidates = [
      { x: rect.x + rect.width + gap, y: rect.y },
      { x: rect.x, y: rect.y + rect.height + gap },
    ]

    for (const candidate of candidates) {
      if (overlapsAny(candidate, width, height, occupied, gap)) continue

      const distance = Math.hypot(candidate.x - preferred.x, candidate.y - preferred.y)
      // Strict comparison keeps the first candidate on ties, so the result is deterministic
      if (distance < bestDistance) {
        best = candidate
        bestDistance = distance
      }
    }
  }

  if (best) return best

  let minX = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const rect of occupied) {
    minX = Math.min(minX, rect.x)
    maxY = Math.max(maxY, rect.y + rect.height)
  }

  return { x: minX, y: maxY + gap }
}
