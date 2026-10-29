import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { WorkspaceScript, WorkspaceScriptRun } from '@shared/types'
import { createDefaultAgentProvidersConfig } from '@shared/workspaceConfig'
import {
  getDefaultWorkspaceScriptId,
  getOrphanWorkspaceScriptRuns,
  getWorkspaceScriptRunStatus,
  groupWorkspaceScripts,
  isSelectableWorkspaceScriptId,
  readWorkspaceScriptSelection,
  WorkspaceScriptsMenu,
  writeWorkspaceScriptSelection,
} from './WorkspaceRunControl'
import { normalizeValue } from './WorkspaceDialog'
import { initializeI18n } from '../i18n'

await initializeI18n()

function packageScript(id: string, name: string, packageDirectory = '.'): WorkspaceScript {
  return {
    id,
    name,
    command: `npm run ${name}`,
    source: 'package',
    cwd: `C:/workspace/${packageDirectory}`,
    packageDirectory,
  }
}

function customScript(id: string, name: string): WorkspaceScript {
  return {
    id,
    name,
    command: 'node tools/clean.mjs',
    source: 'custom',
    cwd: 'C:/workspace',
  }
}

function scriptRun(scriptId: string, tileId: string, state: 'running' | 'exited', exitCode?: number): WorkspaceScriptRun {
  return {
    scriptId,
    tileId,
    state,
    ...(exitCode === undefined ? {} : { exitCode }),
    startedAt: '2026-10-06T12:00:00.000Z',
  }
}

test('groups package scripts by directory and puts custom commands in their own group', () => {
  const groups = groupWorkspaceScripts([
    packageScript('package:.:dev', 'dev'),
    packageScript('package:apps/web:build', 'build', 'apps/web'),
    packageScript('package:.:test', 'test'),
    customScript('custom:clean', 'Clean'),
  ], 'yira', 'Custom commands')

  assert.deepEqual(groups.map((group) => ({
    label: group.label,
    names: group.scripts.map((script) => script.name),
  })), [
    { label: 'yira', names: ['dev', 'test'] },
    { label: 'apps/web', names: ['build'] },
    { label: 'Custom commands', names: ['Clean'] },
  ])
})

test('chooses the first running script by default, then falls back to the first script', () => {
  const scripts = [packageScript('package:.:dev', 'dev'), packageScript('package:.:test', 'test')]
  const runs = [scriptRun('package:.:test', 'script-test', 'running')]

  assert.equal(getDefaultWorkspaceScriptId(scripts, runs), 'package:.:test')
  assert.equal(getDefaultWorkspaceScriptId(scripts, []), 'package:.:dev')
  assert.equal(getDefaultWorkspaceScriptId([], runs), null)
})

test('treats saved scripts and one-off command runs as selectable', () => {
  const scripts = [packageScript('package:.:dev', 'dev')]
  const runs = [
    { ...scriptRun('adhoc:one-off', 'script-adhoc', 'running'), command: 'git pull' },
    scriptRun('custom:removed', 'script-orphan', 'running'),
  ]

  assert.equal(isSelectableWorkspaceScriptId(scripts, runs, 'package:.:dev'), true)
  assert.equal(isSelectableWorkspaceScriptId(scripts, runs, 'adhoc:one-off'), true)
  assert.equal(isSelectableWorkspaceScriptId(scripts, runs, 'custom:removed'), false)
  assert.equal(isSelectableWorkspaceScriptId(scripts, runs, null), false)
})

test('maps run state and exit codes to compact statuses', () => {
  assert.equal(getWorkspaceScriptRunStatus(undefined), 'idle')
  assert.equal(getWorkspaceScriptRunStatus(scriptRun('dev', 'script-dev', 'running')), 'running')
  assert.equal(getWorkspaceScriptRunStatus(scriptRun('test', 'script-test', 'exited', 0)), 'success')
  assert.equal(getWorkspaceScriptRunStatus(scriptRun('lint', 'script-lint', 'exited', 2)), 'error')
  assert.equal(getWorkspaceScriptRunStatus(scriptRun('old', 'script-old', 'exited')), 'exited')
})

test('shows only missing script runs with script-prefixed terminal ids as other processes', () => {
  const scripts = [packageScript('package:.:dev', 'dev')]
  const orphan = scriptRun('custom:removed', 'script-orphan', 'running')
  const unrelated = scriptRun('custom:legacy', 'terminal-legacy', 'running')
  const adhoc = { ...scriptRun('adhoc:one-off', 'script-adhoc', 'running'), command: 'git pull' }

  assert.deepEqual(getOrphanWorkspaceScriptRuns(scripts, [
    scriptRun('package:.:dev', 'script-dev', 'running'),
    orphan,
    unrelated,
    adhoc,
  ]), [orphan])
})

test('renders grouped rows, run states, and an empty menu with an add-command action', () => {
  const scripts = [packageScript('package:.:dev', 'dev'), customScript('custom:clean', 'Clean')]
  const runs = [
    scriptRun('package:.:dev', 'script-dev', 'running'),
    scriptRun('custom:clean', 'script-clean', 'exited', 4),
  ]
  const adhocRun = {
    ...scriptRun('adhoc:one-off', 'script-adhoc', 'exited', 0),
    command: 'git pull',
  }
  const markup = renderToStaticMarkup(
    <WorkspaceScriptsMenu
      groups={groupWorkspaceScripts(scripts, 'yira', 'Custom commands')}
      runsByScriptId={new Map(runs.map((run) => [run.scriptId, run]))}
      orphanRuns={[]}
      adhocRuns={[adhocRun]}
      selectedScriptId="package:.:dev"
      pendingScriptId={null}
      loading={false}
      error={null}
      onSelect={() => undefined}
      onRunOrStop={() => undefined}
      onStopOrphan={() => undefined}
      onRunCommand={() => undefined}
      onShowOutput={() => undefined}
      onRunOrStopAdhoc={() => undefined}
      onDismissAdhoc={() => undefined}
      onEditCommands={() => undefined}
    />,
  )

  assert.match(markup, /aria-label="yira"/)
  assert.match(markup, /aria-label="Run a one-off command in this workspace"/)
  assert.match(markup, /aria-label="Custom commands"/)
  assert.match(markup, /aria-label="Recent commands"/)
  assert.match(markup, /git pull/)
  assert.match(markup, /data-script-id="package:\.:dev"/)
  assert.match(markup, /data-script-id="custom:clean"/)
  assert.match(markup, /Running/)
  assert.match(markup, /Exited with code 4/)

  const emptyMarkup = renderToStaticMarkup(
    <WorkspaceScriptsMenu
      groups={[]}
      runsByScriptId={new Map()}
      orphanRuns={[]}
      adhocRuns={[]}
      selectedScriptId={null}
      pendingScriptId={null}
      loading={false}
      error={null}
      onSelect={() => undefined}
      onRunOrStop={() => undefined}
      onStopOrphan={() => undefined}
      onRunCommand={() => undefined}
      onShowOutput={() => undefined}
      onRunOrStopAdhoc={() => undefined}
      onDismissAdhoc={() => undefined}
      onEditCommands={() => undefined}
    />,
  )
  assert.match(emptyMarkup, /aria-label="Run a one-off command in this workspace"/)
  assert.match(emptyMarkup, /placeholder="Run a command, e\.g\. git pull"/)
  assert.match(emptyMarkup, /No package\.json scripts found/)
  assert.match(emptyMarkup, /Add command…/)
})

const NOW = Date.parse('2026-10-20T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function usedScript(
  id: string,
  name: string,
  runCount: number,
  daysAgo: number,
  extra: Partial<WorkspaceScript> = {},
): WorkspaceScript {
  return {
    ...packageScript(id, name),
    usage: { runCount, lastRunAt: new Date(NOW - daysAgo * DAY_MS).toISOString() },
    ...extra,
  }
}

function groupNames(scripts: WorkspaceScript[], runs: WorkspaceScriptRun[] = []) {
  return groupWorkspaceScripts(scripts, 'yira', 'Custom commands', runs, NOW).map((group) => ({
    label: group.label,
    names: group.scripts.map((script) => script.name),
    more: group.moreScripts.map((script) => script.name),
  }))
}

test('without history every package script is principal except lifecycle and publish ones', () => {
  assert.deepEqual(groupNames([
    packageScript('package:.:dev', 'dev'),
    { ...packageScript('package:.:prepare', 'prepare'), collapseReason: 'lifecycle' as const },
    packageScript('package:.:test', 'test'),
  ]), [
    { label: 'yira', names: ['dev', 'test'], more: ['prepare'] },
  ])
})

test('with history used scripts go first by last run and the rest move to more scripts', () => {
  assert.deepEqual(groupNames([
    packageScript('package:.:build', 'build'),
    usedScript('package:.:dev', 'dev', 3, 1),
    packageScript('package:.:lint', 'lint'),
    usedScript('package:.:test', 'test', 9, 5),
  ]), [
    { label: 'yira', names: ['dev', 'test'], more: ['build', 'lint'] },
  ])
})

test('ties on last run keep the original order', () => {
  assert.deepEqual(groupNames([
    usedScript('package:.:a', 'a', 9, 10),
    usedScript('package:.:b', 'b', 1, 2),
    usedScript('package:.:c', 'c', 5, 2),
  ]), [
    { label: 'yira', names: ['b', 'c', 'a'], more: [] },
  ])
})

test('usage older than 30 days does not count as history', () => {
  const old = usedScript('package:.:old', 'old', 50, 31)
  assert.deepEqual(groupNames([old, packageScript('package:.:dev', 'dev')]), [
    { label: 'yira', names: ['old', 'dev'], more: [] },
  ])

  assert.deepEqual(groupNames([
    old,
    usedScript('package:.:dev', 'dev', 1, 1),
    packageScript('package:.:test', 'test'),
  ]), [
    { label: 'yira', names: ['dev'], more: ['old', 'test'] },
  ])
})

test('history is workspace-wide, not per group', () => {
  const scripts = [
    usedScript('package:.:dev', 'dev', 4, 1),
    { ...packageScript('package:apps/web:build', 'build', 'apps/web') },
  ]
  assert.deepEqual(groupNames(scripts), [
    { label: 'yira', names: ['dev'], more: [] },
    { label: 'apps/web', names: [], more: ['build'] },
  ])
})

test('a script with a current run or recent usage stays principal even with a collapse reason', () => {
  const scripts = [
    usedScript('package:.:dev', 'dev', 5, 1),
    packageScript('package:.:build', 'build'),
    { ...packageScript('package:.:prepare', 'prepare'), collapseReason: 'lifecycle' as const },
    usedScript('package:.:release', 'release', 1, 2, { collapseReason: 'publish' }),
    packageScript('package:.:lint', 'lint'),
  ]
  const runs = [
    scriptRun('package:.:build', 'script-build', 'exited', 0),
    scriptRun('package:.:prepare', 'script-prepare', 'running'),
  ]

  assert.deepEqual(groupNames(scripts, runs), [
    { label: 'yira', names: ['dev', 'release', 'build', 'prepare'], more: ['lint'] },
  ])
})

test('custom commands are always principal and keep their order', () => {
  const groups = groupWorkspaceScripts([
    usedScript('package:.:dev', 'dev', 2, 1),
    customScript('custom:b', 'B'),
    customScript('custom:a', 'A'),
  ], 'yira', 'Custom commands', [], NOW)

  const custom = groups.find((group) => group.key === 'custom')
  assert.deepEqual(custom?.scripts.map((script) => script.name), ['B', 'A'])
  assert.deepEqual(custom?.moreScripts, [])
})

test('the default script is the last used one when nothing is running', () => {
  const scripts = [
    packageScript('package:.:dev', 'dev'),
    usedScript('package:.:test', 'test', 2, 3),
    usedScript('package:.:build', 'build', 7, 20),
    usedScript('package:.:old', 'old', 99, 40),
  ]

  assert.equal(getDefaultWorkspaceScriptId(scripts, [], NOW), 'package:.:test')
  assert.equal(
    getDefaultWorkspaceScriptId(scripts, [scriptRun('package:.:dev', 'script-dev', 'running')], NOW),
    'package:.:dev',
  )
  assert.equal(getDefaultWorkspaceScriptId([scripts[0], scripts[3]], [], NOW), 'package:.:dev')
})

function renderScriptsMenu(scripts: WorkspaceScript[], selectedScriptId: string | null): string {
  return renderToStaticMarkup(
    <WorkspaceScriptsMenu
      groups={groupWorkspaceScripts(scripts, 'yira', 'Custom commands', [], NOW)}
      runsByScriptId={new Map()}
      orphanRuns={[]}
      adhocRuns={[]}
      selectedScriptId={selectedScriptId}
      pendingScriptId={null}
      loading={false}
      error={null}
      onSelect={() => undefined}
      onRunOrStop={() => undefined}
      onStopOrphan={() => undefined}
      onRunCommand={() => undefined}
      onShowOutput={() => undefined}
      onRunOrStopAdhoc={() => undefined}
      onDismissAdhoc={() => undefined}
      onEditCommands={() => undefined}
    />,
  )
}

test('the menu collapses unused scripts under a toggle unless the selected script is inside', () => {
  const scripts = [
    usedScript('package:.:dev', 'dev', 3, 1),
    packageScript('package:.:build', 'build'),
    packageScript('package:.:lint', 'lint'),
  ]

  const collapsed = renderScriptsMenu(scripts, 'package:.:dev')
  assert.match(collapsed, /More scripts \(2\)/)
  assert.match(collapsed, /aria-expanded="false"/)
  assert.match(collapsed, /data-script-id="package:\.:dev"/)
  assert.doesNotMatch(collapsed, /data-script-id="package:\.:build"/)
  assert.doesNotMatch(collapsed, /data-script-id="package:\.:lint"/)

  const expanded = renderScriptsMenu(scripts, 'package:.:lint')
  assert.match(expanded, /More scripts \(2\)/)
  assert.match(expanded, /aria-expanded="true"/)
  assert.match(expanded, /data-script-id="package:\.:build"/)
  assert.match(expanded, /data-script-id="package:\.:lint"/)
})

test('localStorage failures do not break script selection', () => {
  const throwingStorage = {
    getItem: () => { throw new Error('storage blocked') },
    setItem: () => { throw new Error('storage blocked') },
  }

  assert.equal(readWorkspaceScriptSelection('workspace-a', throwingStorage), null)
  assert.doesNotThrow(() => writeWorkspaceScriptSelection('workspace-a', 'package:.:dev', throwingStorage))
})

test('normalizes custom commands before the workspace dialog saves them', () => {
  const value = normalizeValue({
    type: 'canvas',
    name: 'Workspace',
    rootFolderPath: '',
    initialCommand: '',
    customScripts: [
      { id: 'custom-one', name: '  Clean  ', command: '  node tools/clean.mjs  ' },
      { id: 'incomplete', name: 'Missing command', command: '  ' },
    ],
    terminalHistoryEnabled: true,
    remoteTerminal: { host: '', user: '' },
    agentProviders: createDefaultAgentProvidersConfig(),
    sourceControlRepositoryPaths: [],
  })

  assert.deepEqual(value.customScripts, [
    { id: 'custom-one', name: 'Clean', command: 'node tools/clean.mjs' },
  ])
})
