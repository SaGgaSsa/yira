import { getCanvasCreationMenuItems } from './Canvas'

const menuItems = getCanvasCreationMenuItems({
  profiles: [
    { id: 'bash', label: 'Bash', available: true },
    { id: 'fish', label: 'Fish', available: false },
  ],
  onCreateTerminal: () => {},
  onCreateNote: () => {},
  onCreateBrowser: () => {},
  onCreateTimer: () => {},
  onCreateFiles: () => {},
  canCreateNote: true,
  canCreateBrowser: true,
  canCreateTimer: true,
  canShowFilesCreation: true,
  canCreateFiles: true,
})

const terminal = menuItems.find(({ label }) => label === 'New Terminal')

if (!terminal?.submenu || terminal.submenu.length !== 2 || terminal.submenu[1]?.disabled !== true) {
  throw new Error('Canvas New Terminal must preserve its available-profile submenu')
}

if (menuItems.some(({ label }) => label === 'Board')) {
  throw new Error('Canvas context menu must not include Board')
}
