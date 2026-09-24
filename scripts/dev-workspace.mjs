import { spawn } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEV_DATA_DIRECTORY_NAME = '.yira-dev'

function createCanvasState(tiles, focusedTileId) {
  return {
    tiles,
    groups: [],
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
    ], 'dev-terminal'),
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

export async function createDevDataDirectory(env) {
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

export async function seedDevDataDirectory(dataDirectory) {
  const configPath = join(dataDirectory, 'config.json')
  if (await fileExists(configPath)) return false

  const workspacesDirectory = join(dataDirectory, 'workspaces')
  const workspaces = DEV_WORKSPACE_SEEDS.map(({ id, name, config }) => ({
    id,
    name,
    path: join(workspacesDirectory, id),
    config,
  }))

  await Promise.all(DEV_WORKSPACE_SEEDS.map(async ({ id, stateFilename, state }) => {
    const stateDirectory = join(workspacesDirectory, id, '.yira')
    await mkdir(stateDirectory, { recursive: true })
    await writeFile(join(stateDirectory, stateFilename), JSON.stringify(state, null, 2))
  }))
  await writeFile(configPath, JSON.stringify({
    workspaces,
    activeWorkspaceId: DEV_WORKSPACE_SEEDS[0].id,
    settings: {},
  }, null, 2))

  return true
}

async function runDevServer() {
  const workspace = await createDevDataDirectory(process.env)
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

  child.once('close', (code) => {
    process.exitCode = code ?? 1
  })

  console.log(`[dev] Using isolated data directory: ${workspace.dataDirectory}`)
  if (seeded) console.log('[dev] Created example workspaces for the development profile.')
}

const scriptPath = process.argv[1] && resolve(process.argv[1])
if (scriptPath === fileURLToPath(import.meta.url)) {
  void runDevServer()
}
