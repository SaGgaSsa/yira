import assert from 'node:assert/strict'
import test from 'node:test'

import { buildTerminalStartupCommand } from './terminalLaunch'

test('does not prepend workspace startup commands to an agent terminal', () => {
  assert.equal(buildTerminalStartupCommand({
    type: 'terminal',
    shellProfileId: 'bash',
    startupCommand: 'echo tile',
    agent: { provider: 'codex' },
  }, {
    type: 'canvas',
    workspacePanelOpen: true,
    sourceControlViewMode: 'list',
    sourceControlRepositoryPaths: [],
    initialCommand: 'echo workspace',
    agentProviders: {
      claude: { enabled: true, args: [] },
      codex: { enabled: true, args: [] },
    },
  }), undefined)
})

test('keeps ordinary terminal startup command composition unchanged', () => {
  assert.equal(buildTerminalStartupCommand({
    type: 'terminal',
    shellProfileId: 'bash',
    startupCommand: 'echo tile',
  }, {
    type: 'canvas',
    workspacePanelOpen: true,
    sourceControlViewMode: 'list',
    sourceControlRepositoryPaths: [],
    initialCommand: 'echo workspace',
    agentProviders: {
      claude: { enabled: true, args: [] },
      codex: { enabled: true, args: [] },
    },
  }), 'echo workspace\recho tile')
})
