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
