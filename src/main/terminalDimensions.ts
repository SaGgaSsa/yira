export interface TerminalDimensions {
  cols: number
  rows: number
}

export function resizeTerminalDimensions(
  current: TerminalDimensions,
  resize: (cols: number, rows: number) => void,
  cols: number,
  rows: number,
): TerminalDimensions {
  const nextCols = Math.floor(cols)
  const nextRows = Math.floor(rows)
  if (!Number.isFinite(nextCols) || !Number.isFinite(nextRows) || nextCols <= 0 || nextRows <= 0) {
    return current
  }

  resize(nextCols, nextRows)
  return { cols: nextCols, rows: nextRows }
}
