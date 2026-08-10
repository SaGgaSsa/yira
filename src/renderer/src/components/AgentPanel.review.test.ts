import { readFileSync } from 'node:fs'

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('./SettingsPanel.tsx', import.meta.url), 'utf8')

if (!appSource.includes('const focusAgentTile = useCallback')) throw new Error('App must expose a fullview agent focus callback')
if (!appSource.includes('focusTileInFullview(tile)')) throw new Error('agent focus must use the existing fullview visibility flow')
if (!appSource.includes('onFocusTile={focusAgentTile}')) throw new Error('WorkspacePanel must receive the fullview agent focus callback')
if (!appSource.includes('const openActiveWorkspaceEditor = useCallback')) throw new Error('agent onboarding must expose the active workspace editor callback')
if (!appSource.includes('onOpenWorkspaceSettings={openActiveWorkspaceEditor}')) throw new Error('Agents must open workspace settings from the panel action')
if (appSource.includes("openSettings('advanced')")) throw new Error('agent onboarding must not route to global Advanced settings')
if (!appSource.includes('initialSection={settingsSection}')) throw new Error('App must pass the requested settings section into SettingsPanel')
if (!settingsSource.includes('initialSection')) throw new Error('SettingsPanel must accept a requested initial section')
if (!settingsSource.includes('setActiveSection(initialSection)')) throw new Error('SettingsPanel must open the requested section')
