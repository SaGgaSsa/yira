import assert from 'node:assert/strict'
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import {
  WORKSPACE_LINKS_MANIFEST,
  hasWorkspaceLinks,
  linkWorkspaceEntries,
  removeWorkspaceLinks,
} from './workspaceLinks'

async function makeTempDirectory(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'yira-workspace-links-')))
}

async function writeFileAt(root: string, relativePath: string, contents: string): Promise<void> {
  const path = join(root, relativePath)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

interface TestManifest {
  version: number
  links: string[]
  directories: string[]
}

async function readTestManifest(root: string): Promise<TestManifest> {
  return JSON.parse(await readFile(join(root, WORKSPACE_LINKS_MANIFEST), 'utf8'))
}

test('links files, hidden folders, and modules that are not worktrees', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')

  await writeFileAt(workspaceRoot, 'CLAUDE.md', 'project instructions\n')
  await writeFileAt(workspaceRoot, '.claude/settings.json', '{"hooks":{}}\n')
  await writeFileAt(workspaceRoot, '.mcp.json', '{"mcpServers":{}}\n')
  await writeFileAt(workspaceRoot, 'modules/acc/index.ts', 'export const acc = 1\n')
  await writeFileAt(workspaceRoot, '.git/config', '[core]\n')

  await linkWorkspaceEntries({ workspaceRoot, targetRoot })

  assert.equal(await readFile(join(targetRoot, 'CLAUDE.md'), 'utf8'), 'project instructions\n')
  assert.equal(await readFile(join(targetRoot, '.claude/settings.json'), 'utf8'), '{"hooks":{}}\n')
  assert.equal(await readFile(join(targetRoot, '.mcp.json'), 'utf8'), '{"mcpServers":{}}\n')
  assert.equal(await readFile(join(targetRoot, 'modules/acc/index.ts'), 'utf8'), 'export const acc = 1\n')
  assert.equal(await exists(join(targetRoot, '.git')), false)

  const manifest = await readTestManifest(targetRoot)
  assert.equal(manifest.version, 1)
  assert.ok(manifest.links.includes('CLAUDE.md'))
  assert.ok(manifest.links.includes('.claude'))
  assert.ok(manifest.links.includes('modules'))
  assert.deepEqual(manifest.directories, [])
})

test('skips .git, excluded paths, and worktrees while keeping a real worktree intact', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')

  await writeFileAt(workspaceRoot, '.git/config', '[core]\n')
  await writeFileAt(workspaceRoot, 'excluded/secret.txt', 'secret\n')
  await writeFileAt(workspaceRoot, 'alpha/README.md', 'original alpha\n')
  await writeFileAt(workspaceRoot, 'notes.txt', 'notes\n')
  await writeFileAt(targetRoot, 'alpha/agent.txt', 'worktree change\n')

  await linkWorkspaceEntries({
    workspaceRoot,
    targetRoot,
    worktreePaths: ['alpha'],
    excludedPaths: ['excluded'],
  })

  assert.equal(await exists(join(targetRoot, '.git')), false)
  assert.equal(await exists(join(targetRoot, 'excluded')), false)
  assert.equal(await readFile(join(targetRoot, 'alpha/agent.txt'), 'utf8'), 'worktree change\n')
  assert.equal(await readFile(join(targetRoot, 'notes.txt'), 'utf8'), 'notes\n')
  assert.equal(await exists(join(targetRoot, 'alpha/README.md')), false)

  const alphaStats = await lstat(join(targetRoot, 'alpha'))
  assert.equal(alphaStats.isDirectory(), true)
  assert.equal(alphaStats.isSymbolicLink(), false)

  const manifest = await readTestManifest(targetRoot)
  assert.deepEqual(manifest.links, ['notes.txt'])
})

test('links modules with worktrees elsewhere to that worktree instead of the checkout', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')
  const worktreePath = join(temporaryDirectory, 'worktrees', 'acc')

  await writeFileAt(workspaceRoot, 'Acc/README.md', 'original checkout\n')
  await writeFileAt(worktreePath, 'feature.ts', 'export const feature = true\n')

  await linkWorkspaceEntries({
    workspaceRoot,
    targetRoot,
    linkedWorktrees: [{ relativePath: 'Acc', path: worktreePath }],
  })

  assert.equal(await readFile(join(targetRoot, 'Acc/feature.ts'), 'utf8'), 'export const feature = true\n')
  assert.equal(await exists(join(targetRoot, 'Acc/README.md')), false)
  assert.ok((await readTestManifest(targetRoot)).links.includes('Acc'))
})

test('keeps a nested worktree real and links its sibling entries', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')

  await writeFileAt(workspaceRoot, 'Azure/Azure/README.md', 'original nested repository\n')
  await writeFileAt(workspaceRoot, 'Azure/notes.txt', 'shared notes\n')
  await writeFileAt(workspaceRoot, 'Azure/shared/config.json', '{"shared":true}\n')
  await writeFileAt(targetRoot, 'Azure/Azure/worktree.txt', 'nested worktree\n')

  await linkWorkspaceEntries({ workspaceRoot, targetRoot, worktreePaths: ['Azure/Azure'] })

  const azureStats = await lstat(join(targetRoot, 'Azure'))
  assert.equal(azureStats.isDirectory(), true)
  assert.equal(azureStats.isSymbolicLink(), false)
  assert.equal(await readFile(join(targetRoot, 'Azure/Azure/worktree.txt'), 'utf8'), 'nested worktree\n')
  assert.equal(await exists(join(targetRoot, 'Azure/Azure/README.md')), false)
  assert.equal(await readFile(join(targetRoot, 'Azure/notes.txt'), 'utf8'), 'shared notes\n')
  assert.equal(await readFile(join(targetRoot, 'Azure/shared/config.json'), 'utf8'), '{"shared":true}\n')

  const manifest = await readTestManifest(targetRoot)
  assert.deepEqual(manifest.directories, ['Azure'])
  assert.ok(manifest.links.includes('Azure/notes.txt'))
  assert.ok(!manifest.links.includes('Azure'))
})

test('does not overwrite files that already exist in the destination', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')

  await writeFileAt(workspaceRoot, 'README.md', 'workspace version\n')
  await writeFileAt(workspaceRoot, 'notes.txt', 'notes\n')
  await writeFileAt(targetRoot, 'README.md', 'agent version\n')

  await linkWorkspaceEntries({ workspaceRoot, targetRoot })

  assert.equal(await readFile(join(targetRoot, 'README.md'), 'utf8'), 'agent version\n')
  assert.equal(await readFile(join(targetRoot, 'notes.txt'), 'utf8'), 'notes\n')
  const manifest = await readTestManifest(targetRoot)
  assert.ok(!manifest.links.includes('README.md'))
  assert.ok(manifest.links.includes('notes.txt'))
})

test('removes only the links and leaves real worktrees and the original container intact', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')

  await writeFileAt(workspaceRoot, 'CLAUDE.md', 'root instructions\n')
  await writeFileAt(workspaceRoot, '.claude/settings.json', '{"permissions":{}}\n')
  await writeFileAt(workspaceRoot, 'module/src/main.ts', 'original module code\n')
  await writeFileAt(workspaceRoot, 'other/nested/file.txt', 'nested file\n')
  await writeFileAt(targetRoot, 'module/feature.ts', 'worktree feature\n')

  await linkWorkspaceEntries({ workspaceRoot, targetRoot, worktreePaths: ['module'] })
  assert.equal(await readFile(join(targetRoot, '.claude/settings.json'), 'utf8'), '{"permissions":{}}\n')

  await removeWorkspaceLinks(targetRoot)

  assert.deepEqual(await readdir(targetRoot), ['module'])
  assert.equal(await readFile(join(targetRoot, 'module/feature.ts'), 'utf8'), 'worktree feature\n')
  assert.equal(await exists(join(targetRoot, 'module/src/main.ts')), false)
  assert.equal(await exists(join(targetRoot, 'CLAUDE.md')), false)
  assert.equal(await exists(join(targetRoot, '.claude')), false)
  assert.equal(await exists(join(targetRoot, WORKSPACE_LINKS_MANIFEST)), false)

  assert.equal(await readFile(join(workspaceRoot, 'CLAUDE.md'), 'utf8'), 'root instructions\n')
  assert.equal(await readFile(join(workspaceRoot, '.claude/settings.json'), 'utf8'), '{"permissions":{}}\n')
  assert.equal(await readFile(join(workspaceRoot, 'module/src/main.ts'), 'utf8'), 'original module code\n')
  assert.equal(await readFile(join(workspaceRoot, 'other/nested/file.txt'), 'utf8'), 'nested file\n')
})

test('keeps files created by the agent when removing links', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')

  await writeFileAt(workspaceRoot, 'CLAUDE.md', 'root instructions\n')
  await writeFileAt(workspaceRoot, 'Azure/Azure/README.md', 'original nested repository\n')
  await writeFileAt(workspaceRoot, 'Azure/notes.txt', 'shared notes\n')

  await linkWorkspaceEntries({ workspaceRoot, targetRoot, worktreePaths: ['Azure/Azure'] })
  await writeFile(join(targetRoot, 'agent-note.txt'), 'agent note\n')
  await writeFile(join(targetRoot, 'Azure/agent-inside.txt'), 'agent file inside a real folder\n')

  await removeWorkspaceLinks(targetRoot)

  assert.equal(await readFile(join(targetRoot, 'agent-note.txt'), 'utf8'), 'agent note\n')
  assert.equal(await readFile(join(targetRoot, 'Azure/agent-inside.txt'), 'utf8'), 'agent file inside a real folder\n')
  assert.equal(await exists(join(targetRoot, 'Azure/notes.txt')), false)
  assert.equal(await exists(join(targetRoot, 'CLAUDE.md')), false)
  assert.equal(await exists(join(targetRoot, WORKSPACE_LINKS_MANIFEST)), false)
})

test('does nothing without a manifest and ignores unsafe manifest entries', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const targetRoot = join(temporaryDirectory, 'session')
  const outsidePath = join(temporaryDirectory, 'outside.txt')
  const absolutePath = join(temporaryDirectory, 'absolute.txt')
  await writeFileAt(targetRoot, 'keep.txt', 'keep\n')
  await writeFile(outsidePath, 'outside\n')
  await writeFile(absolutePath, 'absolute\n')

  await removeWorkspaceLinks(targetRoot)
  assert.equal(await readFile(join(targetRoot, 'keep.txt'), 'utf8'), 'keep\n')

  await writeFile(join(targetRoot, WORKSPACE_LINKS_MANIFEST), JSON.stringify({
    version: 1,
    links: ['../outside.txt', absolutePath],
    directories: ['../'],
  }))
  await removeWorkspaceLinks(targetRoot)

  assert.equal(await readFile(outsidePath, 'utf8'), 'outside\n')
  assert.equal(await readFile(absolutePath, 'utf8'), 'absolute\n')
  assert.equal(await exists(join(targetRoot, WORKSPACE_LINKS_MANIFEST)), false)

  await writeFile(join(targetRoot, WORKSPACE_LINKS_MANIFEST), JSON.stringify({
    version: 1,
    links: ['keep.txt'],
    directories: 'not-an-array',
  }))
  await removeWorkspaceLinks(targetRoot)

  assert.equal(await readFile(join(targetRoot, 'keep.txt'), 'utf8'), 'keep\n')
  assert.equal(await exists(join(targetRoot, WORKSPACE_LINKS_MANIFEST)), true)
})

test('does not reach original files through a linked folder named in a tampered manifest', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'container')
  const targetRoot = join(temporaryDirectory, 'replica')
  await writeFileAt(workspaceRoot, 'tools/run.sh', 'original\n')
  await linkWorkspaceEntries({ workspaceRoot, targetRoot })

  await writeFile(join(targetRoot, WORKSPACE_LINKS_MANIFEST), JSON.stringify({
    version: 1,
    links: ['tools/run.sh', 'tools'],
    directories: [],
  }))
  await removeWorkspaceLinks(targetRoot)

  assert.equal(await readFile(join(workspaceRoot, 'tools/run.sh'), 'utf8'), 'original\n')
  assert.equal(await exists(join(targetRoot, 'tools')), false)
})

test('continues when the container holds a broken symlink', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')
  const removedDirectory = join(workspaceRoot, 'removed')

  await writeFileAt(workspaceRoot, 'healthy.txt', 'healthy\n')
  await mkdir(removedDirectory, { recursive: true })
  await symlink(
    removedDirectory,
    join(workspaceRoot, 'broken'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await rm(removedDirectory, { recursive: true, force: true })

  await linkWorkspaceEntries({ workspaceRoot, targetRoot })

  assert.equal(await readFile(join(targetRoot, 'healthy.txt'), 'utf8'), 'healthy\n')
  assert.equal(await exists(join(targetRoot, 'broken')), false)
  assert.ok(!(await readTestManifest(targetRoot)).links.includes('broken'))
})

test('reports the manifest before and after linking', async (t) => {
  const temporaryDirectory = await makeTempDirectory()
  t.after(() => rm(temporaryDirectory, { recursive: true, force: true }))
  const workspaceRoot = join(temporaryDirectory, 'workspace')
  const targetRoot = join(temporaryDirectory, 'session')
  await writeFileAt(workspaceRoot, 'CLAUDE.md', 'instructions\n')

  assert.equal(await hasWorkspaceLinks(targetRoot), false)
  await linkWorkspaceEntries({ workspaceRoot, targetRoot })
  assert.equal(await hasWorkspaceLinks(targetRoot), true)
  await removeWorkspaceLinks(targetRoot)
  assert.equal(await hasWorkspaceLinks(targetRoot), false)
})
