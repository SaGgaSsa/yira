import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import { discoverWorkspaceScripts, workspaceScriptTileId } from './workspaceScripts'

async function writePackage(
  directory: string,
  manifest: Record<string, unknown>,
  lockfiles: string[] = [],
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest), 'utf8')
  await Promise.all(lockfiles.map((lockfile) => writeFile(join(directory, lockfile), '', 'utf8')))
}

test('discovers package scripts in workspace order with package manager selection', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'yira-workspace-scripts-'))
  const outside = await mkdtemp(join(tmpdir(), 'yira-workspace-scripts-outside-'))
  context.after(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ])
  })

  await writePackage(root, {
    packageManager: 'npm@10.0.0',
    scripts: {
      dev: 'vite',
      'dev server': 'vite --host',
      'bad"name': 'ignored',
      empty: '  ',
      start: 'node index.js',
    },
  }, ['pnpm-lock.yaml'])

  const repositoryPaths = [
    'packages/pnpm',
    'packages/yarn',
    'packages/bun-binary',
    'packages/bun-text',
    'packages/npm',
    'packages/inherit',
    'packages/field-npm',
    'packages/field-pnpm',
    'packages/field-yarn',
    'packages/field-bun',
    'packages/invalid',
    'packages/oversized',
    relative(root, outside),
    './packages/pnpm/../pnpm',
    '.',
  ]

  await writePackage(join(root, 'packages/pnpm'), { scripts: { build: 'vite build' } }, ['pnpm-lock.yaml'])
  await writePackage(join(root, 'packages/yarn'), { scripts: { test: 'vitest' } }, ['yarn.lock'])
  await writePackage(join(root, 'packages/bun-binary'), { scripts: { dev: 'bun run dev' } }, ['bun.lockb'])
  await writePackage(join(root, 'packages/bun-text'), { scripts: { check: 'tsc' } }, ['bun.lock'])
  await writePackage(join(root, 'packages/npm'), { scripts: { lint: 'eslint .' } }, ['package-lock.json'])
  await writePackage(join(root, 'packages/inherit'), { scripts: { start: 'node app.js' } })
  await writePackage(join(root, 'packages/field-npm'), {
    packageManager: 'npm@11.0.0',
    scripts: { run: 'node app.js' },
  }, ['pnpm-lock.yaml'])
  await writePackage(join(root, 'packages/field-pnpm'), {
    packageManager: 'pnpm@9.0.0',
    scripts: { run: 'node app.js' },
  }, ['package-lock.json'])
  await writePackage(join(root, 'packages/field-yarn'), {
    packageManager: 'yarn@4.0.0',
    scripts: { run: 'node app.js' },
  }, ['package-lock.json'])
  await writePackage(join(root, 'packages/field-bun'), {
    packageManager: 'bun@1.0.0',
    scripts: { run: 'node app.js' },
  }, ['package-lock.json'])
  await mkdir(join(root, 'packages/invalid'), { recursive: true })
  await writeFile(join(root, 'packages/invalid/package.json'), '{ invalid json', 'utf8')
  await mkdir(join(root, 'packages/oversized'), { recursive: true })
  await writeFile(join(root, 'packages/oversized/package.json'), `${' '.repeat(1024 * 1024 + 1)}{}`, 'utf8')
  await writePackage(outside, { scripts: { escape: 'echo outside' } })

  const scripts = await discoverWorkspaceScripts({
    rootFolderPath: root,
    sourceControlRepositoryPaths: repositoryPaths,
    customScripts: [{ id: 'local', name: 'Local tool', command: 'echo local' }],
  })

  assert.deepEqual(scripts.map((script) => script.id), [
    'package:.:dev',
    'package:.:dev server',
    'package:.:start',
    'package:packages/pnpm:build',
    'package:packages/yarn:test',
    'package:packages/bun-binary:dev',
    'package:packages/bun-text:check',
    'package:packages/npm:lint',
    'package:packages/inherit:start',
    'package:packages/field-npm:run',
    'package:packages/field-pnpm:run',
    'package:packages/field-yarn:run',
    'package:packages/field-bun:run',
    'custom:local',
  ])

  assert.deepEqual(scripts.slice(0, 13).map((script) => script.command), [
    'npm run dev',
    'npm run "dev server"',
    'npm run start',
    'pnpm run build',
    'yarn run test',
    'bun run dev',
    'bun run check',
    'npm run lint',
    'pnpm run start',
    'npm run run',
    'pnpm run run',
    'yarn run run',
    'bun run run',
  ])
  assert.deepEqual(scripts[0], {
    id: 'package:.:dev',
    name: 'dev',
    command: 'npm run dev',
    source: 'package',
    cwd: root,
    packageDirectory: '.',
  })
  assert.deepEqual(scripts.at(-1), {
    id: 'custom:local',
    name: 'Local tool',
    command: 'echo local',
    source: 'custom',
    cwd: root,
  })

  const defaultRoot = join(root, 'default-manager')
  await writePackage(defaultRoot, { scripts: { test: 'node test.js' } })
  const defaultScripts = await discoverWorkspaceScripts({ rootFolderPath: defaultRoot })
  assert.equal(defaultScripts[0]?.command, 'npm run test')
})

test('returns custom scripts from home without a root and creates stable tile ids', async () => {
  const script = { id: 'standalone', name: 'Standalone', command: 'echo ready' }
  const scripts = await discoverWorkspaceScripts({ customScripts: [script] })

  assert.deepEqual(scripts, [{
    id: 'custom:standalone',
    name: 'Standalone',
    command: 'echo ready',
    source: 'custom',
    cwd: homedir(),
  }])

  const firstTileId = workspaceScriptTileId('package:.:dev')
  assert.equal(firstTileId, workspaceScriptTileId('package:.:dev'))
  assert.match(firstTileId, /^script-[0-9a-f]{24}$/)
  assert.equal(firstTileId.length, 31)
})
