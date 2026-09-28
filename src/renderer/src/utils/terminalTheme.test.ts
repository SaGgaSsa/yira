import { getTerminalContainerBackground, getXtermTheme, resolveTerminalThemeId } from './terminalTheme'

if (getTerminalContainerBackground('light') !== '#f7f7f2') {
  throw new Error('terminal container background must follow the selected theme')
}

if (getXtermTheme('high-contrast').foreground !== '#ffffff') {
  throw new Error('xterm theme foreground must come from the selected terminal preset')
}

if (getXtermTheme('unknown').background !== '#111111') {
  throw new Error('invalid terminal theme ids must resolve to the default xterm theme')
}

if (getXtermTheme('unknown', true).background !== 'rgba(17, 17, 17, 0)') {
  throw new Error('translucent xterm theme must keep its palette RGB with a transparent background')
}
if (getTerminalContainerBackground('light', true) !== 'rgba(247, 247, 242, 0.56)') {
  throw new Error('translucent terminal container must keep its palette with an alpha background')
}

// Switching the global palette changes default terminals without changing explicit overrides.
for (const id of ['dracula', 'nord', 'tokyo-night', 'catppuccin-mocha', 'gruvbox-dark'] as const) {
  if (resolveTerminalThemeId('yira-default', id) !== id) throw new Error('default terminals must follow the application')
  if (resolveTerminalThemeId('high-contrast', id) !== 'high-contrast') throw new Error('explicit overrides must be preserved')
}
if (resolveTerminalThemeId('yira-default', 'default') !== 'yira-default') throw new Error('returning to Default must restore the original palette')
