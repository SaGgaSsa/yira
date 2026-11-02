import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBotLaunchArgs, buildBotMcpConfigJson } from './botLaunch'

test('claude bot adds the model and the role file', () => {
  assert.deepEqual(
    buildBotLaunchArgs({ provider: 'claude', model: 'sonnet', role: 'Be brief', roleFilePath: 'C:/roles/bot.md' }),
    ['--model', 'sonnet', '--append-system-prompt-file', 'C:/roles/bot.md'],
  )
})

test('claude bot without a role does not need a file path', () => {
  assert.deepEqual(buildBotLaunchArgs({ provider: 'claude', model: 'opus', role: '  ' }), ['--model', 'opus'])
})

test('claude bot with a role and no file path throws', () => {
  assert.throws(() => buildBotLaunchArgs({ provider: 'claude', model: '', role: 'Be brief' }), Error)
})

test('codex bot flattens the role to one line', () => {
  assert.deepEqual(
    buildBotLaunchArgs({ provider: 'codex', model: 'gpt-5', role: 'línea 1\r\nlínea "2" 50%' }),
    ['-m', 'gpt-5', '-c', "developer_instructions=línea 1 línea '2' 50％"],
  )
})

test('codex bot without model or role adds no flags', () => {
  assert.deepEqual(buildBotLaunchArgs({ provider: 'codex', model: '', role: '' }), [])
})

const mcp = { scriptPath: 'C:/app/yira-bot-mcp.mjs', bridgeFile: 'C:/home/bot-bridge.json', token: 'tok.en' }

test('claude bot with MCP adds the config path and auto-approved tools', () => {
  assert.deepEqual(
    buildBotLaunchArgs({
      provider: 'claude',
      model: 'sonnet',
      role: '',
      mcp: { ...mcp, claudeConfigPath: 'C:/home/tile.mcp.json', autoApprovedTools: ['sessions_search', 'bots_list'] },
    }),
    [
      '--model', 'sonnet',
      '--mcp-config=C:/home/tile.mcp.json',
      '--allowedTools=mcp__yira__sessions_search,mcp__yira__bots_list',
    ],
  )
})

test('claude bot with MCP and no approved tools skips allowedTools', () => {
  assert.deepEqual(
    buildBotLaunchArgs({ provider: 'claude', model: '', role: '', mcp: { ...mcp, claudeConfigPath: 'C:/x.json', autoApprovedTools: [] } }),
    ['--mcp-config=C:/x.json'],
  )
})

test('claude bot with MCP and no config path throws', () => {
  assert.throws(() => buildBotLaunchArgs({ provider: 'claude', model: '', role: '', mcp }), Error)
})

test('codex bot with MCP passes the server command and args', () => {
  assert.deepEqual(
    buildBotLaunchArgs({ provider: 'codex', model: 'gpt-5', role: '', mcp }),
    [
      '-m', 'gpt-5',
      '-c', 'mcp_servers.yira.command=node',
      '-c', "mcp_servers.yira.args=['C:/app/yira-bot-mcp.mjs','--bridge-file','C:/home/bot-bridge.json','--token','tok.en']",
    ],
  )
})

test('codex bot with a single quote in an MCP value throws', () => {
  assert.throws(
    () => buildBotLaunchArgs({ provider: 'codex', model: '', role: '', mcp: { ...mcp, scriptPath: "C:/o'brien/s.mjs" } }),
    Error,
  )
})

test('buildBotMcpConfigJson returns the Claude stdio server config', () => {
  assert.deepEqual(JSON.parse(buildBotMcpConfigJson(mcp)), {
    mcpServers: {
      yira: {
        type: 'stdio',
        command: 'node',
        args: ['C:/app/yira-bot-mcp.mjs', '--bridge-file', 'C:/home/bot-bridge.json', '--token', 'tok.en'],
      },
    },
  })
})
