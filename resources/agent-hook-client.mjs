#!/usr/bin/env node

// Yira hook relay: deliberately projects hook input down to provider/event/tileId.
const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...rest] = value.replace(/^--/, '').split('=')
  return [key, rest.join('=')]
}))
const provider = args['yira-managed-agent-hook']
let event = args['yira-normalized-event']

async function readHookEvent() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  try {
    const value = JSON.parse(text)
    return typeof value?.hook_event_name === 'string' ? value.hook_event_name : ''
  } catch {
    return ''
  }
}

async function main() {
  if ((provider !== 'codex' && provider !== 'claude') || !event) return
  const sourceEvent = await readHookEvent()
  if (event === 'intervention') event = sourceEvent === 'permission_prompt' ? 'permission' : 'input'
  if (!['completed', 'permission', 'input'].includes(event)) return
  const url = process.env.YIRA_AGENT_BRIDGE_URL
  const token = process.env.YIRA_AGENT_BRIDGE_TOKEN
  const tileId = process.env.YIRA_AGENT_TILE_ID
  if (!url || !token || !tileId) return
  await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ provider, event, tileId }),
  }).catch(() => undefined)
}

void main()
