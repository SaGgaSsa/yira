import { strict as assert } from 'node:assert'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UpdateDiagnostics, getSafeUpdateErrorData, getSafeUpdaterLogData, waitForUpdateDiagnosticTask } from './updateDiagnostics'

async function run(): Promise<void> {
  if (!await waitForUpdateDiagnosticTask(Promise.resolve(), 100)) {
    throw new Error('completed diagnostic work must be reported as completed')
  }

  if (await waitForUpdateDiagnosticTask(new Promise<void>(() => undefined), 1)) {
    throw new Error('stalled diagnostic work must time out')
  }

  if (await waitForUpdateDiagnosticTask(Promise.reject(new Error('write failed')), 100)) {
    throw new Error('failed diagnostic work must not delay the updater')
  }

  const tempRoot = await mkdtemp(join(tmpdir(), 'yira-update-diagnostics-'))

  try {
    const disabled = new UpdateDiagnostics({ homeDir: tempRoot, getVersion: () => '1.2.3' })
    await disabled.record({ event: 'check-requested', data: { source: 'startup' } })
    await assert.rejects(stat(join(tempRoot, 'logs', 'updater.log')), { code: 'ENOENT' })

    const enabled = new UpdateDiagnostics({ homeDir: tempRoot, getVersion: () => '1.2.3' })
    enabled.setEnabled(true)
    await enabled.record({ event: 'check-requested', data: { source: 'manual', attempts: 1, accepted: true } })

    const [record] = (await readFile(join(tempRoot, 'logs', 'updater.log'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    if (record.event !== 'check-requested') throw new Error('enabled diagnostics must write the event name')
    if (record.version !== '1.2.3') throw new Error('enabled diagnostics must write the application version')
    if (record.data.source !== 'manual' || record.data.attempts !== 1 || record.data.accepted !== true) {
      throw new Error('enabled diagnostics must write safe primitive event data')
    }
    if (typeof record.timestamp !== 'string') throw new Error('enabled diagnostics must write an ISO timestamp')

    await enabled.record({
      event: 'sanitized-event',
      data: {
        safe: 'value',
        nested: { secret: 'not allowed' },
        list: ['not allowed'],
        infinite: Infinity,
      } as unknown as Record<string, string>,
    })
    const sanitized = JSON.parse((await readFile(join(tempRoot, 'logs', 'updater.log'), 'utf8')).trim().split('\n')[1])
    if (sanitized.data.safe !== 'value') throw new Error('safe primitive data must be retained')
    if ('nested' in sanitized.data || 'list' in sanitized.data || 'infinite' in sanitized.data) {
      throw new Error('non-primitive event data must be omitted')
    }

    const privilegeCommand = getSafeUpdaterLogData("Executing: pkexec with args: --disable-internal-agent,/bin/bash,-c,'dpkg -i /home/alice/.cache/yira-updater/pending/Yira.deb'")
    if (JSON.stringify(privilegeCommand) !== JSON.stringify({ category: 'privilege-command-started' })) {
      throw new Error('privilege command logging must retain only its safe category')
    }

    const privilegeLoggerFailure = getSafeUpdaterLogData('Command pkexec exited with code 126')
    if (JSON.stringify(privilegeLoggerFailure) !== JSON.stringify({ category: 'privilege-command-failed', exitCode: 126 })) {
      throw new Error('privilege logger failures must retain only their safe category and exit code')
    }

    const unknownUpdaterMessage = getSafeUpdaterLogData('A future updater message with private details')
    if (JSON.stringify(unknownUpdaterMessage) !== JSON.stringify({ category: 'updater-message' })) {
      throw new Error('unknown updater messages must not be persisted verbatim')
    }

    const networkError = getSafeUpdateErrorData(Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' }))
    if (JSON.stringify(networkError) !== JSON.stringify({ category: 'network' })) {
      throw new Error('network errors must retain only their safe category')
    }

    const privilegeFailure = getSafeUpdateErrorData(new Error('Command pkexec exited with code 126'))
    if (JSON.stringify(privilegeFailure) !== JSON.stringify({ category: 'privilege-command-failed', exitCode: 126 })) {
      throw new Error('privilege command failures must retain only their safe category and exit code')
    }

    const rotationRoot = await mkdtemp(join(tmpdir(), 'yira-update-diagnostics-rotation-'))
    try {
      const rotating = new UpdateDiagnostics({ homeDir: rotationRoot, getVersion: () => '1.2.3', maxBytes: 1 })
      rotating.setEnabled(true)
      await rotating.record({ event: 'first' })
      await rotating.record({ event: 'second' })
      await stat(join(rotationRoot, 'logs', 'updater.log'))
      await stat(join(rotationRoot, 'logs', 'updater.previous.log'))
    } finally {
      await rm(rotationRoot, { recursive: true, force: true })
    }

    const blockedPath = join(tempRoot, 'blocked-home')
    await writeFile(blockedPath, 'not a directory')
    const blocked = new UpdateDiagnostics({ homeDir: blockedPath, getVersion: () => '1.2.3', onError: () => undefined })
    blocked.setEnabled(true)
    await blocked.record({ event: 'write-failure' })

    const throwingErrorHandler = new UpdateDiagnostics({
      homeDir: blockedPath,
      getVersion: () => '1.2.3',
      onError: () => {
        throw new Error('console failure')
      },
    })
    throwingErrorHandler.setEnabled(true)
    await throwingErrorHandler.record({ event: 'write-failure-with-throwing-handler' })
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

void run()
