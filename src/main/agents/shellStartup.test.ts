import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ensureAgentShellStartupFiles } from './shellStartup'

test('creates reusable private startup files for bash, zsh, and fish', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yira-agent-shell-'))
  try {
    await ensureAgentShellStartupFiles(directory)
    await ensureAgentShellStartupFiles(directory)

    const bashrc = await readFile(join(directory, 'bashrc'), 'utf8')
    assert.match(bashrc, /source|\. \/etc\/profile/)
    assert.match(bashrc, /\.bash_profile.*\.bash_login.*\.profile/s)
    assert.match(bashrc, /unset YIRA_AGENT_COMMAND/)
    assert.match(bashrc, /eval "\$yira_agent_command"/)
    assert.match(bashrc, /jobs -p/)
    assert.match(bashrc, /PROMPT_COMMAND/)
    assert.match(bashrc, /set -m\n {2}eval/)
    assert.match(await readFile(join(directory, 'zsh', '.zlogin'), 'utf8'), /setopt monitor\n {2}eval/)
    assert.match(await readFile(join(directory, 'agent.fish'), 'utf8'), /status job-control full\n {2}eval/)

    for (const fileName of ['.zshenv', '.zprofile', '.zshrc', '.zlogin']) {
      const content = await readFile(join(directory, 'zsh', fileName), 'utf8')
      assert.ok(content.includes(`_yira_agent_source_original_file ${fileName}`))
    }
    const zshLogin = await readFile(join(directory, 'zsh', '.zlogin'), 'utf8')
    assert.match(zshLogin, /ZDOTDIR=\$\{YIRA_ORIGINAL_ZDOTDIR:-\$HOME\}/)
    assert.match(zshLogin, /unset YIRA_AGENT_COMMAND/)
    assert.match(zshLogin, /eval "\$yira_agent_command"/)
    assert.match(zshLogin, /add-zsh-hook precmd/)
    assert.match(zshLogin, /\$\{#jobstates\} == 0/)

    const fish = await readFile(join(directory, 'agent.fish'), 'utf8')
    assert.match(fish, /--on-event fish_prompt/)
    assert.match(fish, /--on-event fish_postexec/)
    assert.match(fish, /set -e YIRA_AGENT_COMMAND/)
    assert.match(fish, /eval "\$yira_agent_command"/)
    assert.match(fish, /jobs -q/)

    if (process.platform !== 'win32') {
      assert.equal((await stat(directory)).mode & 0o777, 0o700)
      assert.equal((await stat(join(directory, 'zsh'))).mode & 0o777, 0o700)
      for (const filePath of [
        join(directory, 'bashrc'),
        join(directory, 'agent.fish'),
        join(directory, 'zsh', '.zshenv'),
        join(directory, 'zsh', '.zprofile'),
        join(directory, 'zsh', '.zshrc'),
        join(directory, 'zsh', '.zlogin'),
      ]) {
        assert.equal((await stat(filePath)).mode & 0o777, 0o600)
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
