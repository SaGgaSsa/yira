import { getTerminalContainerBackground, getXtermTheme } from './terminalTheme'

if (getTerminalContainerBackground('light') !== '#f7f7f2') {
  throw new Error('terminal container background must follow the selected theme')
}

if (getXtermTheme('high-contrast').foreground !== '#ffffff') {
  throw new Error('xterm theme foreground must come from the selected terminal preset')
}

if (getXtermTheme('unknown').background !== '#111111') {
  throw new Error('invalid terminal theme ids must resolve to the default xterm theme')
}
