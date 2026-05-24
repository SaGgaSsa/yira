import type { SplitOrientation } from '@shared/types'

export const DEFAULT_SPLIT_ORIENTATION: SplitOrientation = 'vertical'

export function normalizeSplitOrientation(value: unknown): SplitOrientation {
  return value === 'horizontal' || value === 'vertical'
    ? value
    : DEFAULT_SPLIT_ORIENTATION
}

export function toggleSplitOrientation(orientation: SplitOrientation): SplitOrientation {
  return orientation === 'vertical' ? 'horizontal' : 'vertical'
}
