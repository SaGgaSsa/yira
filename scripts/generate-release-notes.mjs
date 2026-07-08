#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CATEGORY_ORDER = [
  ['Features', new Set(['feat'])],
  ['Fixes', new Set(['fix'])],
  ['Improvements', new Set(['perf', 'refactor'])],
  ['Maintenance', new Set(['build', 'ci', 'chore', 'docs'])],
]

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
  }).trim()
}

function tryGit(args) {
  try {
    return git(args)
  } catch {
    return ''
  }
}

function getPreviousTag(currentTag) {
  const currentCommit = git(['rev-list', '-n', '1', currentTag])
  return tryGit(['describe', '--tags', '--abbrev=0', `${currentCommit}^`])
}

function getCommitSubjects(currentTag, previousTag) {
  const range = previousTag ? `${previousTag}..${currentTag}` : currentTag
  return git(['log', '--reverse', '--format=%s', range])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parseConventionalSubject(subject) {
  if (/^(release|merge):/i.test(subject)) return null

  const match = subject.match(/^([a-z]+)(?:\([^)]+\))?!?:\s+(.+)$/)
  if (!match) return null

  const [, type, description] = match
  for (const [category, types] of CATEGORY_ORDER) {
    if (types.has(type)) {
      return {
        category,
        description: sanitizeDescription(description),
      }
    }
  }

  return null
}

function sanitizeDescription(description) {
  return sentenceCase(
    description
      .replace(/\b(?:https?:\/\/)?github\.com\/SaGgaSsa\/yira(?:\/\S*)?/gi, '')
      .replace(/\bSaGgaSsa\/yira(?:#\d+)?\b/gi, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\b[0-9a-f]{7,40}\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

function sentenceCase(text) {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function buildSections(subjects) {
  const sections = new Map(CATEGORY_ORDER.map(([category]) => [category, []]))

  for (const subject of subjects) {
    const parsed = parseConventionalSubject(subject)
    if (!parsed?.description) continue
    sections.get(parsed.category)?.push(parsed.description)
  }

  return sections
}

function renderMarkdown(currentTag, sections) {
  const lines = [`## ${currentTag}`, '']
  let hasPublicChanges = false

  for (const [category] of CATEGORY_ORDER) {
    const entries = sections.get(category) ?? []
    if (entries.length === 0) continue

    hasPublicChanges = true
    lines.push(`### ${category}`, '')
    for (const entry of entries) {
      lines.push(`- ${entry}`)
    }
    lines.push('')
  }

  if (!hasPublicChanges) {
    lines.push('Maintenance release with internal updates and packaging work.', '')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

export function generateReleaseNotes(currentTag) {
  if (!currentTag) {
    throw new Error('Usage: node scripts/generate-release-notes.mjs <tag>')
  }

  const previousTag = getPreviousTag(currentTag)
  const subjects = getCommitSubjects(currentTag, previousTag)
  const sections = buildSections(subjects)
  return renderMarkdown(currentTag, sections)
}

function main() {
  const tag = process.argv[2]
  process.stdout.write(generateReleaseNotes(tag))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
