export interface AgentsViewTilePlacement {
  /** 1-based grid column line. */
  column: number
  /** 1-based grid row line. */
  rowStart: number
  rowSpan: number
}

export interface AgentsViewLayout {
  columns: number
  /** Row tracks shared by every column, so stacks of different sizes line up. */
  rows: number
  /** Sessions per column, left to right. */
  stacks: number[]
  /** One placement per session, in session order. */
  placements: AgentsViewTilePlacement[]
}

export const AGENTS_VIEW_MAX_COLUMNS = 4
/** Past this many sessions the view keeps a minimum tile height and scrolls. */
export const AGENTS_VIEW_SCROLL_THRESHOLD = 16

/** One column per session up to three, three columns for four or five, then four. */
export function computeAgentsViewColumnCount(count: number): number {
  const sessionCount = Math.max(0, Math.floor(count))
  if (sessionCount <= 3) return sessionCount
  if (sessionCount <= 5) return 3
  return AGENTS_VIEW_MAX_COLUMNS
}

/** Balanced stacks per column; the extra rows go to the rightmost columns. */
export function computeAgentsViewStacks(count: number): number[] {
  const sessionCount = Math.max(0, Math.floor(count))
  const columns = computeAgentsViewColumnCount(sessionCount)
  if (columns === 0) return []

  const base = Math.floor(sessionCount / columns)
  const extra = sessionCount % columns
  return Array.from({ length: columns }, (_, index) => (index >= columns - extra ? base + 1 : base))
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

/** Fill columns top to bottom, left to right, so the newest session ends bottom right. */
export function computeAgentsViewLayout(count: number): AgentsViewLayout {
  const stacks = computeAgentsViewStacks(count)
  if (stacks.length === 0) return { columns: 0, rows: 0, stacks, placements: [] }

  const rows = stacks.reduce((total, stack) => total * stack / greatestCommonDivisor(total, stack), 1)
  const placements: AgentsViewTilePlacement[] = []
  stacks.forEach((stack, columnIndex) => {
    const rowSpan = rows / stack
    for (let index = 0; index < stack; index += 1) {
      placements.push({ column: columnIndex + 1, rowStart: index * rowSpan + 1, rowSpan })
    }
  })

  return { columns: stacks.length, rows, stacks, placements }
}
