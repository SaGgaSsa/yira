import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { expectedReleaseAssets, findReleaseAssetProblems } from './verify-release-assets.mjs'

const VERSION = '1.2.3'

async function withAssets(run, version = VERSION) {
  const directory = await mkdtemp(join(tmpdir(), 'yira-release-assets-'))
  try {
    for (const name of expectedReleaseAssets(VERSION)) {
      await writeFile(join(directory, name), name.endsWith('.yml') ? `version: ${version}\r\nfiles: []\r\n` : 'content')
    }
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('accepts a complete set of assets for the tagged version', async () => {
  await withAssets(async (directory) => {
    assert.deepEqual(await findReleaseAssetProblems(directory, VERSION, 'v1.2.3'), [])
  })
})

test('accepts a run without a tag', async () => {
  await withAssets(async (directory) => {
    assert.deepEqual(await findReleaseAssetProblems(directory, VERSION, undefined), [])
  })
})

test('reports a missing platform file', async () => {
  await withAssets(async (directory) => {
    await rm(join(directory, 'yira-linux.AppImage'))
    assert.deepEqual(await findReleaseAssetProblems(directory, VERSION, 'v1.2.3'), [
      'Missing or empty asset: yira-linux.AppImage',
    ])
  })
})

test('reports an empty file', async () => {
  await withAssets(async (directory) => {
    await writeFile(join(directory, 'yira-windows-setup.exe'), '')
    assert.deepEqual(await findReleaseAssetProblems(directory, VERSION, undefined), [
      'Missing or empty asset: yira-windows-setup.exe',
    ])
  })
})

test('reports update files built for another version', async () => {
  await withAssets(async (directory) => {
    assert.deepEqual(await findReleaseAssetProblems(directory, VERSION, undefined), [
      'latest.yml reports version 1.2.2, expected 1.2.3',
      'latest-linux.yml reports version 1.2.2, expected 1.2.3',
    ])
  }, '1.2.2')
})

test('reports a tag that does not match the package version', async () => {
  await withAssets(async (directory) => {
    assert.deepEqual(await findReleaseAssetProblems(directory, VERSION, 'v9.9.9'), [
      'Tag v9.9.9 does not match package version 1.2.3',
    ])
  })
})

test('the workflow publishes only after every build and the asset check', async () => {
  const workflow = await readFile(new URL('../.github/workflows/windows-release.yml', import.meta.url), 'utf8')
  const buildJobs = workflow.slice(0, workflow.indexOf('\n  publish:'))
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'))

  assert.doesNotMatch(buildJobs, /contents: write|GH_TOKEN|gh release/)
  assert.match(publishJob, /needs: \[windows, linux\]/)

  const steps = ['actions/download-artifact', 'scripts/verify-release-assets.mjs', 'gh release create', 'Delete older releases']
    .map((step) => publishJob.indexOf(step))
  assert.ok(steps.every((position) => position >= 0), `missing publish step: ${steps}`)
  assert.deepEqual(steps, [...steps].sort((left, right) => left - right))
})

test('no script can publish installers from a single platform', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  for (const [name, command] of Object.entries(scripts)) {
    assert.doesNotMatch(command, /--publish (always|onTag|onTagOrDraft)/, name)
  }
})
