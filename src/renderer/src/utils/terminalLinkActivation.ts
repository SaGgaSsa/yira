export function shouldOpenTerminalLink(button: number): boolean {
  return button === 0
}

export function shouldInterceptTerminalLinkClick(input: {
  button: number
  ctrlKey: boolean
  metaKey: boolean
  mouseTrackingMode: string
  hasHoveredLink: boolean
  platform: string
}): boolean {
  const modifierPressed = /Mac|iPhone|iPad/i.test(input.platform) ? input.metaKey : input.ctrlKey
  return input.button === 0 && modifierPressed && input.mouseTrackingMode !== 'none' && input.hasHoveredLink
}
