import { execFile, spawn } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEV_DATA_DIRECTORY_NAME = '.yira-dev'

function createCanvasState(tiles, focusedTileId) {
  return {
    tiles,
    viewport: { tx: 0, ty: 0, zoom: 0.8 },
    nextZIndex: tiles.length + 1,
    focusedTileId,
    viewMode: 'canvas',
    fullviewActiveTileId: focusedTileId,
    splitViewState: {
      leftTileIds: focusedTileId ? [focusedTileId] : [],
      rightTileIds: tiles.filter((tile) => tile.id !== focusedTileId).map((tile) => tile.id),
      activeLeftTileId: focusedTileId,
      activeRightTileId: tiles.find((tile) => tile.id !== focusedTileId)?.id ?? null,
      focusedPanel: 'left',
      orientation: 'vertical',
    },
  }
}

// Long lines, tables and code blocks exercise wrapping and preview layout in the file editor.
const DEV_MARKDOWN_FILE = `# Archivo de prueba

Este archivo existe para probar el tile de archivos con Markdown. Esta primera línea es deliberadamente larga para comprobar que el editor la corta en el ancho del tile y que ninguna barra ni regla vertical se superpone al texto mientras se escribe.

## Listas

- Un elemento corto
- Un elemento muy largo que sigue y sigue para ver cómo se comporta el ajuste de línea dentro de una lista con viñetas en el editor y en la vista previa
  - Un subelemento con \`código en línea\` y un [enlace](https://example.com)
1. Primer paso
2. Segundo paso con **negrita**, *cursiva* y ~~tachado~~

- [ ] Tarea pendiente
- [x] Tarea hecha

## Tabla

| Columna | Descripción | Estado |
| --- | --- | --- |
| Editor | Una descripción larga que debería ajustarse dentro de la celda de la tabla en la vista previa | OK |
| Vista previa | Corta | Pendiente |

## Código

\`\`\`ts
export function sumar(a: number, b: number): number {
  return a + b // una línea de código muy larga para ver el scroll horizontal dentro del bloque de código en la vista previa
}
\`\`\`

> Una cita larga para verificar el ajuste de línea en bloques de cita, tanto en el editor de texto como en la vista previa renderizada del archivo.

---

Fin del archivo.
`

const DEV_WORKSPACE_SEEDS = [
  {
    id: 'dev-development',
    name: 'Desarrollo',
    config: { type: 'canvas' },
    stateFilename: 'canvas-state.json',
    state: createCanvasState([
      {
        id: 'dev-terminal',
        type: 'terminal',
        x: 0,
        y: 0,
        width: 900,
        height: 400,
        zIndex: 1,
        label: 'Terminal',
      },
      {
        id: 'dev-notes',
        type: 'note',
        x: 940,
        y: 0,
        width: 700,
        height: 420,
        zIndex: 2,
        label: 'Notas de desarrollo',
        noteKind: 'markdown',
        markdown: '# Desarrollo\n\nUsá este espacio para probar terminales, notas y la disposición del canvas.',
        markdownView: 'live',
      },
      {
        id: 'dev-markdown-file',
        type: 'files',
        x: 0,
        y: 440,
        width: 900,
        height: 520,
        zIndex: 3,
        label: 'PRUEBA.md',
        filePath: 'PRUEBA.md',
        fileMarkdownView: 'edit',
      },
    ], 'dev-terminal'),
    // Files are written under the workspace folder, which becomes its root folder.
    files: {
      'PRUEBA.md': DEV_MARKDOWN_FILE,
    },
  },
  {
    id: 'dev-quick-tasks',
    name: 'Tareas rápidas',
    config: { type: 'grid' },
    stateFilename: 'grid-state.json',
    state: {
      tiles: [
        {
          id: 'quick-terminal',
          type: 'terminal',
          x: 0,
          y: 0,
          width: 900,
          height: 400,
          zIndex: 1,
          label: 'Terminal',
        },
        {
          id: 'quick-note',
          type: 'note',
          x: 0,
          y: 0,
          width: 700,
          height: 420,
          zIndex: 2,
          label: 'Pendientes',
          noteKind: 'markdown',
          markdown: '# Pendientes\n\n- Probar la grilla\n- Reordenar los paneles\n- Cambiar de vista',
          markdownView: 'live',
        },
        {
          id: 'quick-timer',
          type: 'timer',
          x: 0,
          y: 0,
          width: 900,
          height: 400,
          zIndex: 3,
          label: 'Pomodoro',
          timerDurationMs: 25 * 60 * 1000,
          timerRemainingMs: 25 * 60 * 1000,
          timerStatus: 'idle',
        },
      ],
      nextZIndex: 4,
      focusedTileId: 'quick-terminal',
      fullviewActiveTileId: 'quick-terminal',
      viewMode: 'gridview',
      gridViewState: {
        rootNode: {
          id: 'quick-root',
          type: 'split',
          direction: 'row',
          sizes: [12, 12, 12],
          children: [
            { id: 'quick-terminal-leaf', type: 'leaf', tileId: 'quick-terminal' },
            { id: 'quick-note-leaf', type: 'leaf', tileId: 'quick-note' },
            { id: 'quick-timer-leaf', type: 'leaf', tileId: 'quick-timer' },
          ],
        },
      },
    },
  },
  {
    id: 'dev-research',
    name: 'Investigación',
    config: { type: 'canvas' },
    stateFilename: 'canvas-state.json',
    state: createCanvasState([
      {
        id: 'research-browser',
        type: 'browser',
        x: 0,
        y: 0,
        width: 1100,
        height: 700,
        zIndex: 1,
        label: 'Navegador',
        browserUrl: 'https://developer.mozilla.org/',
      },
      {
        id: 'research-notes',
        type: 'note',
        x: 1140,
        y: 0,
        width: 700,
        height: 700,
        zIndex: 2,
        label: 'Notas de investigación',
        noteKind: 'markdown',
        markdown: '# Investigación\n\nAnotá hallazgos y enlaces mientras navegás.',
        markdownView: 'live',
      },
    ], 'research-browser'),
  },
]

export function getDefaultDevDataDirectory(homeDirectory = homedir()) {
  return join(homeDirectory, DEV_DATA_DIRECTORY_NAME)
}

export async function createDevDataDirectory(env, { temporary = false } = {}) {
  // Test runs get a throwaway profile so they never touch ~/.yira or ~/.yira-dev.
  if (temporary) {
    const dataDirectory = await mkdtemp(join(tmpdir(), 'yira-test-profile-'))
    return { dataDirectory, temporary: true }
  }
  const configuredDirectory = env.YIRA_DEV_DATA_DIR?.trim()
  const dataDirectory = configuredDirectory
    ? resolve(configuredDirectory)
    : getDefaultDevDataDirectory()

  await mkdir(dataDirectory, { recursive: true })
  return { dataDirectory, temporary: false }
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function getDevTerminalShellProfileId(platform = process.platform) {
  return platform === 'win32' ? 'powershell' : 'bash'
}

function withDevTerminalShell(state, shellProfileId) {
  if (!Array.isArray(state.tiles)) return state
  return {
    ...state,
    tiles: state.tiles.map((tile) => (
      tile.type === 'terminal' && !tile.shellProfileId
        ? { ...tile, shellProfileId }
        : tile
    )),
  }
}

export async function seedDevDataDirectory(dataDirectory, platform = process.platform) {
  const shellProfileId = getDevTerminalShellProfileId(platform)
  const configPath = join(dataDirectory, 'config.json')
  if (await fileExists(configPath)) return false

  const workspacesDirectory = join(dataDirectory, 'workspaces')
  const workspaces = DEV_WORKSPACE_SEEDS.map(({ id, name, config, files }) => {
    const path = join(workspacesDirectory, id)
    return {
      id,
      name,
      path,
      config: files ? { ...config, rootFolderPath: path } : config,
    }
  })

  await Promise.all(DEV_WORKSPACE_SEEDS.map(async ({ id, stateFilename, state, files = {} }) => {
    const workspaceDirectory = join(workspacesDirectory, id)
    const stateDirectory = join(workspaceDirectory, '.yira')
    await mkdir(stateDirectory, { recursive: true })
    await writeFile(join(stateDirectory, stateFilename), JSON.stringify(withDevTerminalShell(state, shellProfileId), null, 2))
    await Promise.all(Object.entries(files).map(([relativePath, content]) => (
      writeFile(join(workspaceDirectory, relativePath), content)
    )))
  }))
  await writeFile(configPath, JSON.stringify({
    workspaces,
    activeWorkspaceId: DEV_WORKSPACE_SEEDS[0].id,
    settings: {},
  }, null, 2))

  return true
}

function killProcessTree(pid, platform = process.platform) {
  if (platform !== 'win32') {
    process.kill(pid, 'SIGTERM')
    return Promise.resolve()
  }
  return new Promise((resolveKill) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolveKill())
  })
}

/**
 * The terminal daemon outlives the app by design. A temporary profile must
 * stop its daemon before deletion, or the daemon and its shells stay orphaned.
 */
export async function stopProfileTerminalDaemon(dataDirectory, { kill = killProcessTree } = {}) {
  let endpoint
  try {
    endpoint = JSON.parse(await readFile(join(dataDirectory, 'terminal-runtime', 'endpoint.json'), 'utf8'))
  } catch {
    return false
  }
  const pid = endpoint?.pid
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) return false

  try {
    await kill(pid)
  } catch {
    return false
  }
  return true
}

async function runDevServer() {
  const workspace = await createDevDataDirectory(process.env, { temporary: process.argv.includes('--temp') })
  const seeded = await seedDevDataDirectory(workspace.dataDirectory)
  // Windows .cmd shims need a shell with Node 22.
  const isWindows = process.platform === 'win32'
  const command = isWindows ? 'electron-vite.cmd' : 'electron-vite'
  const child = spawn(command, ['dev'], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, YIRA_HOME: workspace.dataDirectory },
    stdio: 'inherit',
    shell: isWindows,
  })
  const stopChild = (signal) => {
    if (!child.killed) child.kill(signal)
  }

  process.once('SIGINT', () => stopChild('SIGINT'))
  process.once('SIGTERM', () => stopChild('SIGTERM'))

  child.once('error', (error) => {
    throw error
  })

  child.once('close', async (code) => {
    process.exitCode = code ?? 1
    if (workspace.temporary && !process.env.YIRA_KEEP_TEST_PROFILE) {
      await stopProfileTerminalDaemon(workspace.dataDirectory)
      await rm(workspace.dataDirectory, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined)
    }
  })

  console.log(`[dev] Using ${workspace.temporary ? 'temporary test' : 'isolated'} data directory: ${workspace.dataDirectory}`)
  if (seeded) console.log('[dev] Created example workspaces for the development profile.')
}

const scriptPath = process.argv[1] && resolve(process.argv[1])
if (scriptPath === fileURLToPath(import.meta.url)) {
  void runDevServer()
}
