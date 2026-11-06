import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UPDATE_INFO_FILES = ['latest.yml', 'latest-linux.yml']

export function expectedReleaseAssets(version) {
  return [
    ...UPDATE_INFO_FILES,
    'yira-windows-setup.exe',
    'yira-windows-setup.exe.blockmap',
    'yira-linux.AppImage',
    `Yira-${version}-amd64.deb`,
  ]
}

async function isNonEmptyFile(path) {
  try {
    const stats = await stat(path)
    return stats.isFile() && stats.size > 0
  } catch {
    return false
  }
}

/**
 * Lists what would make the release incomplete or wrong. An empty list means
 * every platform's files are present and describe this version.
 */
export async function findReleaseAssetProblems(directory, version, tag) {
  const problems = []
  if (tag && tag !== `v${version}`) problems.push(`Tag ${tag} does not match package version ${version}`)

  for (const name of expectedReleaseAssets(version)) {
    if (!await isNonEmptyFile(join(directory, name))) problems.push(`Missing or empty asset: ${name}`)
  }

  for (const name of UPDATE_INFO_FILES) {
    const contents = await readFile(join(directory, name), 'utf8').catch(() => '')
    if (!contents) continue
    const reported = /^version:\s*(\S+)/m.exec(contents)?.[1]
    if (reported !== version) problems.push(`${name} reports version ${reported ?? 'none'}, expected ${version}`)
  }

  return problems
}

async function main() {
  const directory = process.argv[2]
  if (!directory) throw new Error('Usage: node scripts/verify-release-assets.mjs <directory>')

  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined
  const problems = await findReleaseAssetProblems(directory, version, tag)

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem)
    process.exitCode = 1
    return
  }
  console.log(`Release assets for ${version} are complete`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
