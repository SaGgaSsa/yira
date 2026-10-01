import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { createInterface, type Interface } from 'node:readline'
import { promisify } from 'node:util'

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  args: string
}

const WINDOWS_PROCESS_SENTINEL = '__YIRA_END__'
const WINDOWS_PROCESS_READY = '__YIRA_READY__'
const execFileAsync = promisify(execFile)
const WINDOWS_PROCESS_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class YiraProcessSnapshot {
  private const uint TH32CS_SNAPPROCESS = 0x00000002;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PROCESSENTRY32W {
    public uint dwSize;
    public uint cntUsage;
    public int th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID;
    public uint cntThreads;
    public int th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szExeFile;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32W entry);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32W entry);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);

  public static List<PROCESSENTRY32W> Enumerate() {
    var snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception();
    try {
      var entries = new List<PROCESSENTRY32W>();
      var entry = new PROCESSENTRY32W();
      entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
      if (!Process32FirstW(snapshot, ref entry)) return entries;
      do {
        entries.Add(entry);
        entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
      } while (Process32NextW(snapshot, ref entry));
      return entries;
    } finally {
      CloseHandle(snapshot);
    }
  }
}
'@

[Console]::Out.WriteLine('__YIRA_READY__')
[Console]::Out.Flush()
$filter = "Name='claude.exe' OR Name='codex.exe' OR Name='opencode.exe' OR Name='node.exe' OR Name='bun.exe' OR Name LIKE 'codex-%'"
while ($null -ne ($request = [Console]::In.ReadLine())) {
  if ($request -eq 'exit') { break }
  if ($request -ne 'list') { continue }

  $commandLines = @{}
  try {
    Get-CimInstance Win32_Process -Filter $filter | ForEach-Object {
      $commandLines[[int]$_.ProcessId] = [string]$_.CommandLine
    }
  } catch {
    $commandLines = @{}
  }

  foreach ($entry in [YiraProcessSnapshot]::Enumerate()) {
    $commandLine = [string]$commandLines[[int]$entry.th32ProcessID]
    if ($null -eq $commandLine) { $commandLine = '' }
    $commandLine = $commandLine -replace '[\t\r\n]', ' '
    $fields = @($entry.th32ProcessID, $entry.th32ParentProcessID, $entry.szExeFile, $commandLine)
    [Console]::Out.WriteLine($fields -join [char]9)
  }
  [Console]::Out.WriteLine('__YIRA_END__')
  [Console]::Out.Flush()
}
`

interface WindowsProcessRequest {
  lines: string[]
  resolve: (processes: ProcessInfo[]) => void
  timeout: NodeJS.Timeout
}

interface WindowsProcessLister {
  child: ChildProcessWithoutNullStreams
  output: Interface
  request: WindowsProcessRequest | null
  ready: boolean
}

let windowsProcessLister: WindowsProcessLister | null = null
let windowsRequestQueue: Promise<void> = Promise.resolve()

export function parseWindowsProcessList(text: string): ProcessInfo[] {
  const processes: ProcessInfo[] = []

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === WINDOWS_PROCESS_SENTINEL) continue
    const fields = line.split('\t')
    if (fields.length < 4) continue
    const pid = Number(fields[0])
    const ppid = Number(fields[1])
    const name = fields[2].trim().split(/[\\/]/).pop()?.toLowerCase() ?? ''
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !name) continue
    processes.push({ pid, ppid, name, args: fields.slice(3).join('\t').trim() })
  }

  return processes
}

function finishWindowsRequest(lister: WindowsProcessLister, processes: ProcessInfo[]): void {
  const request = lister.request
  if (!request) return
  lister.request = null
  clearTimeout(request.timeout)
  request.resolve(processes)
}

function stopWindowsProcessLister(lister: WindowsProcessLister): void {
  if (windowsProcessLister === lister) windowsProcessLister = null
  finishWindowsRequest(lister, [])
  lister.output.close()
  if (!lister.child.killed) lister.child.kill()
}

function createWindowsProcessLister(): WindowsProcessLister {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROCESS_SCRIPT], {
    windowsHide: true,
    stdio: 'pipe',
  })
  const output = createInterface({ input: child.stdout })
  const lister: WindowsProcessLister = { child, output, request: null, ready: false }
  windowsProcessLister = lister

  output.on('line', (line) => {
    if (line.trim() === WINDOWS_PROCESS_READY) {
      lister.ready = true
      if (lister.request) lister.child.stdin.write('list\n')
      return
    }
    if (line.trim() !== WINDOWS_PROCESS_SENTINEL || !lister.request) {
      if (lister.request) lister.request.lines.push(line)
      return
    }
    finishWindowsRequest(lister, parseWindowsProcessList(lister.request.lines.join('\n')))
  })
  child.stderr.resume()
  child.once('error', () => stopWindowsProcessLister(lister))
  child.once('exit', () => stopWindowsProcessLister(lister))
  child.stdin.on('error', () => stopWindowsProcessLister(lister))
  return lister
}

function requestWindowsProcessList(): Promise<ProcessInfo[]> {
  return new Promise((resolve) => {
    const lister = windowsProcessLister ?? createWindowsProcessLister()
    if (lister.request) {
      resolve([])
      return
    }

    const request: WindowsProcessRequest = {
      lines: [],
      resolve,
      timeout: setTimeout(() => stopWindowsProcessLister(lister), 10_000),
    }
    lister.request = request
    if (lister.ready) {
      lister.child.stdin.write('list\n', (error) => {
        if (error) stopWindowsProcessLister(lister)
      })
    }
  })
}

function listWindowsProcesses(): Promise<ProcessInfo[]> {
  const result = windowsRequestQueue.then(requestWindowsProcessList)
  windowsRequestQueue = result.then(() => undefined, () => undefined)
  return result
}

export function disposeProcessLister(): void {
  const lister = windowsProcessLister
  if (!lister) return
  windowsProcessLister = null
  finishWindowsRequest(lister, [])
  lister.output.close()
  lister.child.stdin.end('exit\n')
  const killTimer = setTimeout(() => {
    if (!lister.child.killed) lister.child.kill()
  }, 250)
  killTimer.unref?.()
}

export function parseProcStat(stat: string): { pid: number; ppid: number; name: string } | null {
  const openParen = stat.indexOf(' (')
  const closeParen = stat.lastIndexOf(')')
  if (openParen < 1 || closeParen <= openParen) return null

  const pid = Number(stat.slice(0, openParen).trim())
  const name = stat.slice(openParen + 2, closeParen)
  const fieldsAfterName = stat.slice(closeParen + 1).trim().split(/\s+/)
  const ppid = Number(fieldsAfterName[1])
  if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !name) return null
  return { pid, ppid, name: name.toLowerCase() }
}

export function parsePsOutput(text: string): ProcessInfo[] {
  const processes: ProcessInfo[] = []

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s*(.*)$/)
    if (!match) continue
    const pid = Number(match[1])
    const ppid = Number(match[2])
    const args = match[3].trim()
    const executable = args.match(/^(?:"([^"]+)"|'([^']+)'|(\S+))/)
    const name = (executable?.[1] ?? executable?.[2] ?? executable?.[3] ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? ''
    if (!name) continue
    processes.push({ pid, ppid, name, args })
  }

  return processes
}

async function listLinuxProcesses(): Promise<ProcessInfo[]> {
  const entries = await readdir('/proc', { withFileTypes: true })
  const pids = entries.filter((entry) => /^\d+$/.test(entry.name)).map((entry) => entry.name)
  const results = await Promise.all(pids.map(async (pidText) => {
    try {
      const [stat, cmdline] = await Promise.all([
        readFile(`/proc/${pidText}/stat`, 'utf8'),
        readFile(`/proc/${pidText}/cmdline`, 'utf8'),
      ])
      const parsed = parseProcStat(stat)
      if (!parsed) return null
      return {
        pid: parsed.pid,
        ppid: parsed.ppid,
        name: parsed.name,
        args: cmdline.replace(/\0/g, ' ').trim(),
      }
    } catch {
      return null
    }
  }))
  return results.filter((process): process is ProcessInfo => process !== null)
}

export async function listProcesses(platform = process.platform): Promise<ProcessInfo[]> {
  try {
    if (platform === 'linux') return await listLinuxProcesses()

    if (platform === 'win32') return await listWindowsProcesses()

    if (platform === 'darwin') {
      const result = await execFileAsync('ps', ['-axo', 'pid=,ppid=,command='], {
        timeout: 15_000,
        maxBuffer: 16 * 1024 * 1024,
      })
      return parsePsOutput(result.stdout)
    }
  } catch {
    return []
  }

  return []
}
