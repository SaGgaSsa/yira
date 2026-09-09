import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const testFilePattern = /\.test\.(?:mjs|ts|tsx)$/
const testRoots = ['scripts', 'src']

function compareNames(left, right) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function discoverTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => (
    compareNames(left.name, right.name)
  ))
  const files = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...discoverTestFiles(entryPath))
      continue
    }
    if (entry.isFile() && testFilePattern.test(entry.name)) files.push(entryPath)
  }

  return files
}

const testFiles = testRoots
  .flatMap((root) => discoverTestFiles(join(repositoryRoot, root)))
  .map((filePath) => relative(repositoryRoot, filePath).split(sep).join('/'))
  .sort(compareNames)

if (testFiles.length === 0) {
  console.error('No test files found under scripts or src')
  process.exitCode = 1
} else {
  const nodeTests = testFiles.filter((filePath) => filePath.endsWith('.test.mjs'))
  const typeScriptTests = testFiles.filter((filePath) => (
    filePath.endsWith('.test.ts') || filePath.endsWith('.test.tsx')
  ))
  const require = createRequire(import.meta.url)
  const tsxCli = require.resolve('tsx/cli')

  function runTests(testRunnerArgs, files) {
    if (files.length === 0) return 0

    const result = spawnSync(
      process.execPath,
      [...testRunnerArgs, '--test', ...files.map((filePath) => join(repositoryRoot, filePath))],
      { cwd: repositoryRoot, stdio: 'inherit' },
    )
    if (result.error) {
      console.error(`Unable to start test runner: ${result.error.message}`)
      return 1
    }
    if (typeof result.status === 'number') return result.status
    return 1
  }

  const nodeStatus = runTests([], nodeTests)
  if (nodeStatus !== 0) {
    process.exitCode = nodeStatus
  } else {
    const typeScriptStatus = runTests([tsxCli], typeScriptTests)
    process.exitCode = typeScriptStatus
  }
}
