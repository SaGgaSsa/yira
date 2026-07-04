#!/usr/bin/env node
import { createInterface } from 'readline'
import { dispatchBoardMcpTool } from './boardMcp'
import { loadBoardFile, saveBoardFile } from '@shared/boardStorage'

interface RpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: unknown
}

function parseArgs(argv: string[]): { yiraHome: string; workspaceId: string } {
  const args = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key.startsWith('--')) continue
    if (!value || value.startsWith('--')) continue
    args.set(key.slice(2), value)
    index += 1
  }

  const yiraHome = args.get('yira-home')
  const workspaceId = args.get('workspace-id')
  if (!yiraHome) throw new Error('--yira-home is required')
  if (!workspaceId) throw new Error('--workspace-id is required')
  return { yiraHome, workspaceId }
}

function writeResponse(id: RpcRequest['id'], result: unknown): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function writeError(id: RpcRequest['id'], error: unknown): void {
  process.stdout.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: error instanceof Error ? error.message : String(error),
    },
  })}\n`)
}

async function handleRequest(config: { yiraHome: string; workspaceId: string }, request: RpcRequest): Promise<void> {
  if (request.method === 'initialize') {
    writeResponse(request.id, {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'yira-board-mcp', version: '0.1.0' },
      capabilities: { tools: {} },
    })
    return
  }

  if (request.method === 'tools/list') {
    writeResponse(request.id, {
      tools: [
        { name: 'read_task', description: 'Read one task by id.' },
        { name: 'list_tasks', description: 'List tasks in the configured workspace.' },
        { name: 'enrich_metadata', description: 'Add or update MCP-visible task metadata.' },
        { name: 'propose_work_session', description: 'Pick a ready task without mutating state.' },
        { name: 'start_work_session', description: 'Move a ready task into work.' },
        { name: 'add_note', description: 'Append an MCP note to a task.' },
        { name: 'move_task_to_review', description: 'Move an in-progress task to review.' },
        { name: 'read_history', description: 'Read completed task history.' },
      ],
    })
    return
  }

  if (request.method === 'tools/call') {
    const params = request.params && typeof request.params === 'object'
      ? request.params as { name?: unknown; arguments?: unknown }
      : {}
    if (typeof params.name !== 'string') throw new Error('tools/call requires a tool name')

    const result = await dispatchBoardMcpTool({
      workspaceId: config.workspaceId,
      load: () => loadBoardFile(config.yiraHome, config.workspaceId),
      save: (state) => saveBoardFile(config.yiraHome, config.workspaceId, state),
    }, params.name, params.arguments)

    writeResponse(request.id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    })
    return
  }

  writeError(request.id, new Error(`Unsupported method: ${request.method ?? 'unknown'}`))
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2))
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

  for await (const line of lines) {
    if (!line.trim()) continue
    let request: RpcRequest
    try {
      request = JSON.parse(line) as RpcRequest
      await handleRequest(config, request)
    } catch (error) {
      writeError((typeof request! === 'object' ? request!.id : null) ?? null, error)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
