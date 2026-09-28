import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const scriptPath = resolve(__dirname, 'generate-release-notes.mjs')

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function commit(cwd, subject, fileName, body = '') {
  execFileSync('git', ['add', '.'], { cwd })
  execFileSync('git', ['commit', '-m', subject, ...(body ? ['-m', body] : [])], { cwd, stdio: 'pipe' })
}

function runGenerator(cwd, tag) {
  return execFileSync(process.execPath, [scriptPath, tag], { cwd, encoding: 'utf8' })
}

async function withRepo(run) {
  const cwd = await mkdtemp(resolve(tmpdir(), 'yira-release-notes-'))
  try {
    git(cwd, ['init', '-q'])
    git(cwd, ['config', 'user.email', 'test@example.com'])
    git(cwd, ['config', 'user.name', 'Test User'])
    await run(cwd)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

async function writesCategorizedPublicNotes() {
  await withRepo(async (cwd) => {
    execFileSync('node', ['-e', "require('node:fs').writeFileSync('app.txt', 'initial\\n')"], { cwd })
    commit(cwd, 'feat: initial private setup', 'app.txt')
    git(cwd, ['tag', 'v0.1.0'])

    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'feature\\n')"], { cwd })
    commit(cwd, 'feat: add public patch notes')
    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'fix\\n')"], { cwd })
    commit(cwd, 'fix: keep release body populated')
    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'private-link\\n')"], { cwd })
    commit(cwd, 'fix: hide github.com/SaGgaSsa/yira/issues/123 and deadbeef details')
    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'refactor\\n')"], { cwd })
    commit(cwd, 'refactor: simplify release publish step')
    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'docs\\n')"], { cwd })
    commit(cwd, 'docs: document patch note subjects')
    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'release\\n')"], { cwd })
    commit(cwd, 'release: v0.1.1')
    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'merge\\n')"], { cwd })
    commit(cwd, 'merge: release notes branch')
    git(cwd, ['tag', 'v0.1.1'])

    const notes = runGenerator(cwd, 'v0.1.1')

    assert.match(notes, /^## v0\.1\.1/m)
    assert.match(notes, /### Features\n\n- Add public patch notes/)
    assert.match(notes, /### Fixes\n\n- Keep release body populated\n- Hide and details/)
    assert.match(notes, /### Improvements\n\n- Simplify release publish step/)
    assert.match(notes, /### Maintenance\n\n- Document patch note subjects/)
    assert.doesNotMatch(notes, /release: v0\.1\.1/)
    assert.doesNotMatch(notes, /merge: release notes branch/)
    assert.doesNotMatch(notes, /\b[0-9a-f]{7,40}\b/)
    assert.doesNotMatch(notes, /github\.com\/SaGgaSsa\/yira\/(?!issues\s|releases\/download\/v)/)
  })
}

async function writesMaintenanceFallbackWhenOnlyInternalCommitsExist() {
  await withRepo(async (cwd) => {
    execFileSync('node', ['-e', "require('node:fs').writeFileSync('app.txt', 'initial\\n')"], { cwd })
    commit(cwd, 'feat: initial setup')
    git(cwd, ['tag', 'v0.1.0'])

    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'release\\n')"], { cwd })
    commit(cwd, 'release: v0.1.1')
    git(cwd, ['tag', 'v0.1.1'])

    const notes = runGenerator(cwd, 'v0.1.1')

    assert.match(notes, /^## v0\.1\.1/m)
    assert.match(notes, /Maintenance release with internal updates and packaging work\./)
    assert.doesNotMatch(notes, /\b[0-9a-f]{7,40}\b/)
    assert.doesNotMatch(notes, /github\.com\/SaGgaSsa\/yira\/(?!issues\s|releases\/download\/v)/)
  })
}

async function linksVersionedLegalAssetsAndPublicIssues() {
  await withRepo(async (cwd) => {
    execFileSync('node', ['-e', "require('node:fs').writeFileSync('app.txt', 'initial\\n')"], { cwd })
    commit(cwd, 'feat: initial setup')
    git(cwd, ['tag', 'v0.2.0'])

    execFileSync('node', ['-e', "require('node:fs').appendFileSync('app.txt', 'feature\\n')"], { cwd })
    commit(cwd, 'feat: add public change')
    git(cwd, ['tag', 'v0.2.1'])

    const notes = runGenerator(cwd, 'v0.2.1')

    assert.match(notes, /^## v0\.2\.1/m)
    assert.match(notes, /github\.com\/SaGgaSsa\/yira\/releases\/download\/v0\.2\.1\/PRIVACY\.md/)
    assert.match(notes, /github\.com\/SaGgaSsa\/yira\/releases\/download\/v0\.2\.1\/TERMS\.md/)
    assert.match(notes, /github\.com\/SaGgaSsa\/yira\/issues/)
    assert.doesNotMatch(notes, /github\.com\/SaGgaSsa\/yira\/(?!issues\s|releases\/download\/v)/)
  })
}

await writesCategorizedPublicNotes()
await writesMaintenanceFallbackWhenOnlyInternalCommitsExist()
await linksVersionedLegalAssetsAndPublicIssues()
