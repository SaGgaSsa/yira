export interface AgentsViewGrid {
  columns: number
  rows: number
}

const TERMINAL_ASPECT_RATIO = 1.65

/** Pick a compact grid whose cells stay close to a comfortable terminal shape. */
export function computeAgentsViewGrid(count: number, width: number, height: number): AgentsViewGrid {
  const sessionCount = Math.max(0, Math.floor(count))
  if (sessionCount === 0) return { columns: 0, rows: 0 }
  if (sessionCount === 1) return { columns: 1, rows: 1 }

  const containerIsLandscape = width >= height
  if (sessionCount === 2) {
    return containerIsLandscape ? { columns: 2, rows: 1 } : { columns: 1, rows: 2 }
  }
  if (sessionCount === 4) return { columns: 2, rows: 2 }

  const containerAspect = width > 0 && height > 0 ? width / height : 16 / 9
  let bestGrid = { columns: sessionCount, rows: 1 }
  let bestScore = Number.POSITIVE_INFINITY

  for (let columns = 1; columns <= sessionCount; columns += 1) {
    const rows = Math.ceil(sessionCount / columns)

    // These bounds keep both the last column and last row occupied.
    if ((columns - 1) * rows >= sessionCount) continue
    if ((rows - 1) * columns >= sessionCount) continue

    const cellAspect = containerAspect * rows / columns
    const score = Math.abs(Math.log(cellAspect / TERMINAL_ASPECT_RATIO))
    if (score < bestScore) {
      bestGrid = { columns, rows }
      bestScore = score
    }
  }

  return bestGrid
}
