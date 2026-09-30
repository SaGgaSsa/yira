import { shouldInterceptTerminalLinkClick, shouldOpenTerminalLink } from './terminalLinkActivation'

if (!shouldOpenTerminalLink(0)) {
  throw new Error('the primary mouse button must open terminal links')
}

const interception = (patch: Partial<Parameters<typeof shouldInterceptTerminalLinkClick>[0]> = {}) => shouldInterceptTerminalLinkClick({
  button: 0, ctrlKey: true, metaKey: false, mouseTrackingMode: 'x10', hasHoveredLink: true, platform: 'Win32', ...patch,
})
if (!interception() || interception({ mouseTrackingMode: 'none' }) || interception({ hasHoveredLink: false }) || interception({ button: 2 })) {
  throw new Error('modifier clicks on hovered links must only be intercepted during mouse tracking')
}
if (!interception({ platform: 'MacIntel', ctrlKey: false, metaKey: true })) {
  throw new Error('macOS link interception must use the Command modifier')
}

if (shouldOpenTerminalLink(2)) {
  throw new Error('the secondary mouse button must not open terminal links')
}
