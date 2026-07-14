import { shouldOpenTerminalLink } from './terminalLinkActivation'

if (!shouldOpenTerminalLink(0)) {
  throw new Error('the primary mouse button must open terminal links')
}

if (shouldOpenTerminalLink(2)) {
  throw new Error('the secondary mouse button must not open terminal links')
}
