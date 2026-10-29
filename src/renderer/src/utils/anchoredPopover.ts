export interface AnchoredPopoverPosition {
  /** Set when the popover opens below the trigger. */
  top?: number
  /** Set when the popover opens above the trigger, measured from the viewport bottom. */
  bottom?: number
  left: number
  width: number
  maxHeight: number
}

export interface AnchoredPopoverSize {
  /** Preferred width. The popover never gets wider than the viewport minus the margins. */
  width: number
  /** Grow to the trigger width when the trigger is wider than `width`. */
  matchTriggerWidth?: boolean
  maxHeight: number
  /** Opens above the trigger when less than this fits below and there is more room above. */
  minHeightBelow: number
}

interface TriggerRect {
  top: number
  bottom: number
  left: number
  right: number
  width: number
}

const VIEWPORT_MARGIN = 8
const TRIGGER_GAP = 4
const MIN_HEIGHT = 120

export function getAnchoredPopoverPosition(
  rect: TriggerRect,
  viewportWidth: number,
  viewportHeight: number,
  size: AnchoredPopoverSize,
): AnchoredPopoverPosition {
  const preferredWidth = size.matchTriggerWidth ? Math.max(size.width, rect.width) : size.width
  const width = Math.max(0, Math.min(preferredWidth, viewportWidth - VIEWPORT_MARGIN * 2))
  // Keep the trigger's left edge when the popover fits, otherwise align to its right edge.
  const preferredLeft = rect.left + width <= viewportWidth - VIEWPORT_MARGIN ? rect.left : rect.right - width
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, viewportWidth - width - VIEWPORT_MARGIN))

  const spaceBelow = viewportHeight - rect.bottom - TRIGGER_GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - TRIGGER_GAP - VIEWPORT_MARGIN
  if (spaceBelow < size.minHeightBelow && spaceAbove > spaceBelow) {
    return {
      bottom: viewportHeight - rect.top + TRIGGER_GAP,
      left,
      width,
      maxHeight: Math.min(size.maxHeight, spaceAbove),
    }
  }
  return {
    top: rect.bottom + TRIGGER_GAP,
    left,
    width,
    maxHeight: Math.min(size.maxHeight, Math.max(MIN_HEIGHT, spaceBelow)),
  }
}
