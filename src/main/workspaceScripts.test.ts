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

async function collapseReasons(scripts: Record<string, string>): Promise<Record<string, string | undefined>> {
  const root = await mkdtemp(join(tmpdir(), 'yira-workspace-collapse-'))
  try {
    await writePackage(root, { scripts })
    const discovered = await discoverWorkspaceScripts({ rootFolderPath: root })
    return Object.fromEntries(discovered.map((script) => [script.name, script.collapseReason]))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('collapses npm lifecycle hooks and pre/post hooks of existing scripts', async () => {
  const reasons = await collapseReasons({
    prepare: 'husky',
    postinstall: 'node setup.js',
    prepublishOnly: 'npm run build',
    test: 'vitest',
    pretest: 'echo before',
    posttest: 'echo after',
    prebuild: 'echo no build script here',
    preview: 'vite preview',
    postcss: 'postcss src',
    dev: 'vite',
  })

  assert.equal(reasons.prepare, 'lifecycle')
  assert.equal(reasons.postinstall, 'lifecycle')
  assert.equal(reasons.prepublishOnly, 'lifecycle')
  assert.equal(reasons.pretest, 'lifecycle')
  assert.equal(reasons.posttest, 'lifecycle')
  assert.equal(reasons.prebuild, undefined)
  assert.equal(reasons.preview, undefined)
  assert.equal(reasons.postcss, undefined)
  assert.equal(reasons.test, undefined)
  assert.equal(reasons.dev, undefined)
})

test('collapses scripts that publish, directly or through another script', async () => {
  const reasons = await collapseReasons({
    build: 'vite build',
    'release:win': 'npm run build && electron-builder --win --publish always',
    'dist:win': 'npm run build && electron-builder --win --publish never',
    ship: 'pnpm publish --access public',
    semantic: 'semantic-release',
    chained: 'npm run "release:win"',
    deeper: 'yarn run chained',
    loopA: 'npm run loopB',
    loopB: 'npm run loopA',
    prepublish: 'npm publish',
  })

  assert.equal(reasons['release:win'], 'publish')
  assert.equal(reasons.ship, 'publish')
  assert.equal(reasons.semantic, 'publish')
  assert.equal(reasons.chained, 'publish')
  assert.equal(reasons.deeper, 'publish')
  assert.equal(reasons['dist:win'], undefined)
  assert.equal(reasons.build, undefined)
  assert.equal(reasons.loopA, undefined)
  assert.equal(reasons.loopB, undefined)
  assert.equal(reasons.prepublish, 'lifecycle')
})

test('omits collapseReason for scripts that need no collapsing', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'yira-workspace-collapse-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await writePackage(root, { scripts: { dev: 'vite' } })

  const [script] = await discoverWorkspaceScripts({ rootFolderPath: root })

  assert.equal('collapseReason' in script, false)
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
