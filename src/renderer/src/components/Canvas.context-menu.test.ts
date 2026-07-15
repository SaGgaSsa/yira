import { getCanvasCreationMenuItems } from './canvasCreationMenu'

let richNotesCreated = 0
let markdownNotesCreated = 0

const menuItems = getCanvasCreationMenuItems({
  profiles: [
    { id: 'bash', label: 'Bash', available: true },
    { id: 'fish', label: 'Fish', available: false },
  ],
  onCreateTerminal: () => {},
  onCreateRichNote: () => { richNotesCreated += 1 },
  onCreateMarkdownNote: () => { markdownNotesCreated += 1 },
  onCreateBrowser: () => {},
  onCreateTimer: () => {},
  canCreateNote: true,
  canCreateBrowser: true,
  canCreateTimer: true,
})

const terminal = menuItems.find(({ label }) => label === 'New Terminal')

if (!terminal?.submenu || terminal.submenu.length !== 2 || terminal.submenu[1]?.disabled !== true) {
  throw new Error('Canvas New Terminal must preserve its available-profile submenu')
}

const note = menuItems.find(({ label }) => label === 'New Note')
if (note?.submenu?.map(({ label }) => label).join(',') !== 'Rich Note,Markdown Note') {
  throw new Error('Canvas New Note must offer rich and Markdown note variants')
}

note?.submenu?.forEach(({ action }) => action?.())
if (richNotesCreated !== 1 || markdownNotesCreated !== 1) {
  throw new Error('Canvas New Note actions must create their corresponding variants')
}

if (menuItems.some(({ label }) => label === 'Board')) {
  throw new Error('Canvas context menu must not include Board')
}
