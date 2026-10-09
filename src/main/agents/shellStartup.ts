import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const bashStartup = [
  'if [ -r /etc/profile ]; then',
  '  . /etc/profile',
  'fi',
  'for yira_profile in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do',
  '  if [ -r "$yira_profile" ]; then',
  '    . "$yira_profile"',
  '    break',
  '  fi',
  'done',
  '',
  'if [ -n "${YIRA_AGENT_COMMAND-}" ]; then',
  '  yira_agent_command=$YIRA_AGENT_COMMAND',
  '  unset YIRA_AGENT_COMMAND',
  '',
  '  yira_agent_check_jobs() {',
  '    local yira_prompt_status=$?',
  '    if [ -z "$(jobs -p)" ]; then',
  '      exit "$yira_prompt_status"',
  '    fi',
  '    return "$yira_prompt_status"',
  '  }',
  '',
  // Installed before the agent runs: an agent killed by a signal aborts the
  // rest of this file, and the first prompt must still close the shell.
  '  case "$(declare -p PROMPT_COMMAND 2>/dev/null)" in',
  '    "declare -a"*) PROMPT_COMMAND=(yira_agent_check_jobs "${PROMPT_COMMAND[@]}") ;;',
  '    *) PROMPT_COMMAND="yira_agent_check_jobs${PROMPT_COMMAND:+; $PROMPT_COMMAND}" ;;',
  '  esac',
  '',
  // Bash enables job control only after its startup files; Ctrl+Z needs it now.
  '  set -m',
  '  eval "$yira_agent_command"',
  '  yira_agent_check_jobs',
  'fi',
  '',
].join('\n')

function zshSourceOriginalFile(fileName: string): string {
  return [
    '_yira_agent_source_original_file() {',
    '  local yira_file=$1',
    '  local yira_original_zdotdir=${YIRA_ORIGINAL_ZDOTDIR:-$HOME}',
    '  local ZDOTDIR=$yira_original_zdotdir',
    '  if [[ -r "$yira_original_zdotdir/$yira_file" ]]; then',
    '    source "$yira_original_zdotdir/$yira_file"',
    '  fi',
    // A user .zshenv may move ZDOTDIR; the remaining files must come from there.
    '  YIRA_ORIGINAL_ZDOTDIR=$ZDOTDIR',
    '}',
    `_yira_agent_source_original_file ${fileName}`,
    '',
  ].join('\n')
}

const zshLogin = [
  zshSourceOriginalFile('.zlogin'),
  'unfunction _yira_agent_source_original_file',
  'ZDOTDIR=${YIRA_ORIGINAL_ZDOTDIR:-$HOME}',
  'unset YIRA_ORIGINAL_ZDOTDIR',
  '',
  // jobstates reads the job table directly; jobs inside $(...) runs in a subshell.
  'zmodload zsh/parameter',
  'if [[ -n ${YIRA_AGENT_COMMAND-} ]]; then',
  '  yira_agent_command=$YIRA_AGENT_COMMAND',
  '  unset YIRA_AGENT_COMMAND',
  '',
  '  yira_agent_check_jobs() {',
  '    local yira_prompt_status=$?',
  '    if (( ${#jobstates} == 0 )); then',
  '      exit $yira_prompt_status',
  '    fi',
  '    return $yira_prompt_status',
  '  }',
  // Installed before the agent runs, in case a signal aborts this file.
  '  autoload -Uz add-zsh-hook',
  '  add-zsh-hook precmd yira_agent_check_jobs',
  '',
  '  setopt monitor',
  '  eval "$yira_agent_command"',
  '  yira_agent_check_jobs',
  'fi',
  '',
].join('\n')

const fishStartup = [
  'set -g yira_agent_status 0',
  '',
  'function yira_agent_capture_status --on-event fish_postexec',
  '  set -g yira_agent_status $status',
  'end',
  '',
  'function yira_agent_exit_when_done --on-event fish_prompt',
  '  if set -q yira_agent_active',
  '    if not jobs -q',
  '      exit $yira_agent_status',
  '    end',
  '  end',
  'end',
  '',
  'if set -q YIRA_AGENT_COMMAND',
  '  set -g yira_agent_active 1',
  '  set -l yira_agent_command $YIRA_AGENT_COMMAND',
  '  set -e YIRA_AGENT_COMMAND',
  // Ctrl+Z needs job control while the init command runs.
  '  status job-control full',
  '  eval "$yira_agent_command"',
  '  set -g yira_agent_status $status',
  '  status job-control interactive',
  '  if not jobs -q',
  '    exit $yira_agent_status',
  '  end',
  'end',
  '',
].join('\n')

export async function ensureAgentShellStartupFiles(directory: string): Promise<void> {
  const zshDirectory = join(directory, 'zsh')
  await mkdir(zshDirectory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
  await chmod(zshDirectory, 0o700)

  const files: Array<[string, string]> = [
    [join(directory, 'bashrc'), bashStartup],
    [join(directory, 'agent.fish'), fishStartup],
    [join(zshDirectory, '.zshenv'), zshSourceOriginalFile('.zshenv')],
    [join(zshDirectory, '.zprofile'), zshSourceOriginalFile('.zprofile')],
    [join(zshDirectory, '.zshrc'), zshSourceOriginalFile('.zshrc')],
    [join(zshDirectory, '.zlogin'), zshLogin],
  ]

  await Promise.all(files.map(async ([filePath, contents]) => {
    await writeFile(filePath, contents, { mode: 0o600 })
    await chmod(filePath, 0o600)
  }))
}
