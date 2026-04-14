#!/usr/bin/env node

const { spawn, execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')

const APP_NAME = 'codesurf'
const APP_DIR = path.join(__dirname, '..')
const CACHE_DIR = path.join(os.homedir(), '.codesurf')
const LEGACY_CACHE_DIR = path.join(os.homedir(), '.contex')
const ELECTRON_CACHE = path.join(CACHE_DIR, 'electron')
const UPDATE_CHECK_FILE = path.join(CACHE_DIR, 'last-update-check')
const PID_FILE = path.join(CACHE_DIR, 'codesurf.pid')
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000
const DEFAULT_MAX_OLD_SPACE_SIZE_MB = 8192

function getMaxOldSpaceSizeMb() {
  const raw = process.env.CODESURF_MAX_OLD_SPACE_SIZE_MB
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_OLD_SPACE_SIZE_MB
}

// ---------------------------------------------------------------------------
// Legacy migration
// ---------------------------------------------------------------------------

function migrateLegacyData() {
  if (!fs.existsSync(LEGACY_CACHE_DIR)) return

  const filesToMigrate = ['workspaces']
  filesToMigrate.forEach(file => {
    const legacyPath = path.join(LEGACY_CACHE_DIR, file)
    const newPath = path.join(CACHE_DIR, file)
    if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
      // Copy directories recursively
      if (fs.statSync(legacyPath).isDirectory()) {
        fs.cpSync(legacyPath, newPath, { recursive: true })
      } else {
        fs.copyFileSync(legacyPath, newPath)
      }
      console.log(`Migrated ${file} from ~/.contex to ~/.codesurf`)
    }
  })
}

// ---------------------------------------------------------------------------
// Cache directory
// ---------------------------------------------------------------------------

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
  migrateLegacyData()
  if (!fs.existsSync(ELECTRON_CACHE)) {
    fs.mkdirSync(ELECTRON_CACHE, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Electron binary management
// ---------------------------------------------------------------------------

function getElectronPath() {
  const platform = os.platform()
  const electronBin = platform === 'win32' ? 'electron.cmd' : 'electron'
  return path.join(ELECTRON_CACHE, 'node_modules', '.bin', electronBin)
}

function getNpmCommand() {
  return os.platform() === 'win32' ? 'npm.cmd' : 'npm'
}

async function ensureElectron() {
  ensureCacheDir()

  const electronPath = getElectronPath()

  // Check if electron is already cached
  if (fs.existsSync(electronPath)) {
    return electronPath
  }

  console.log('Installing Electron (first run only)...')
  console.log(`  Cache location: ${ELECTRON_CACHE}`)

  try {
    // Create a minimal package.json for electron installation
    const pkgPath = path.join(ELECTRON_CACHE, 'package.json')
    fs.writeFileSync(pkgPath, JSON.stringify({
      name: 'codesurf-electron-cache',
      version: '1.0.0',
      private: true
    }))

    // Install electron to cache directory
    const npm = getNpmCommand()
    execFileSync(npm, ['install', 'electron@latest', '--no-save', '--no-audit', '--no-fund'], {
      cwd: ELECTRON_CACHE,
      stdio: 'inherit'
    })

    console.log('Electron installed successfully!\n')
    return electronPath
  } catch (error) {
    console.error('Failed to install Electron:', error.message)
    console.error('\nTry installing manually:')
    console.error(`  cd ${ELECTRON_CACHE} && npm install electron`)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Native module rebuilding
// ---------------------------------------------------------------------------

async function ensureNativeModules(electronPath) {
  const rebuildMarker = path.join(CACHE_DIR, '.natives-rebuilt')
  const appNodeModules = path.join(APP_DIR, 'node_modules')

  // Skip if already rebuilt or no node_modules
  if (fs.existsSync(rebuildMarker) || !fs.existsSync(appNodeModules)) return

  console.log('Rebuilding native modules for Electron (first run only)...')

  try {
    const npm = getNpmCommand()
    execFileSync(npm, ['rebuild', 'node-pty', 'better-sqlite3'], {
      cwd: APP_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_runtime: 'electron',
        npm_config_target: getElectronVersion(),
        npm_config_disturl: 'https://electronjs.org/headers'
      }
    })
    fs.writeFileSync(rebuildMarker, Date.now().toString())
  } catch (err) {
    console.error('Native module rebuild warning:', err.message)
    // Non-fatal — app may still work without pty/sqlite
  }
}

function getElectronVersion() {
  try {
    const electronPkg = path.join(ELECTRON_CACHE, 'node_modules', 'electron', 'package.json')
    if (fs.existsSync(electronPkg)) {
      return JSON.parse(fs.readFileSync(electronPkg, 'utf8')).version
    }
  } catch {}
  return 'latest'
}

// ---------------------------------------------------------------------------
// Version management
// ---------------------------------------------------------------------------

function getCurrentVersion() {
  try {
    const pkgPath = path.join(APP_DIR, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return pkg.version
  } catch {
    return null
  }
}

function fetchLatestVersion() {
  return new Promise((resolve) => {
    const req = https.get(`https://registry.npmjs.org/${APP_NAME}/latest`, {
      headers: { 'Accept': 'application/json' },
      timeout: 5000
    }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        return
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data)
          resolve(pkg.version)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

function shouldCheckForUpdates() {
  try {
    if (!fs.existsSync(UPDATE_CHECK_FILE)) return true
    const lastCheck = parseInt(fs.readFileSync(UPDATE_CHECK_FILE, 'utf8'), 10)
    return Date.now() - lastCheck > UPDATE_CHECK_INTERVAL
  } catch {
    return true
  }
}

function recordUpdateCheck() {
  try {
    ensureCacheDir()
    fs.writeFileSync(UPDATE_CHECK_FILE, Date.now().toString())
  } catch {}
}

function compareVersions(current, latest) {
  if (!current || !latest) return 0
  const c = current.split('.').map(Number)
  const l = latest.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return 1
    if ((l[i] || 0) < (c[i] || 0)) return -1
  }
  return 0
}

async function checkForUpdates() {
  if (!shouldCheckForUpdates()) return

  const current = getCurrentVersion()
  const latest = await fetchLatestVersion()
  recordUpdateCheck()

  if (compareVersions(current, latest) > 0) {
    console.log(`\nUpdate available: v${current} -> v${latest}`)
    console.log(`   Run: npx codesurf@latest`)
    console.log(`   Or:  npm install -g codesurf@latest\n`)
  }
}

async function performUpdate() {
  const current = getCurrentVersion()
  const latest = await fetchLatestVersion()

  if (!latest) {
    console.log('Could not check for updates (network error)')
    return false
  }

  if (compareVersions(current, latest) <= 0) {
    console.log(`Already on latest version (v${current})`)
    return false
  }

  console.log(`\nUpdating codesurf: v${current} -> v${latest}...\n`)

  try {
    const npm = getNpmCommand()
    execFileSync(npm, ['install', '-g', `codesurf@${latest}`], { stdio: 'inherit' })
    console.log(`\nUpdated to v${latest}`)
    console.log('  Run codesurf again to use the new version.\n')
    return true
  } catch (error) {
    console.error('Update failed:', error.message)
    console.error(`  Try manually: npm install -g codesurf@latest`)
    return false
  }
}

// ---------------------------------------------------------------------------
// Build check
// ---------------------------------------------------------------------------

function checkBuilt() {
  const indexHtml = path.join(APP_DIR, 'dist-electron', 'renderer', 'index.html')
  const mainJs = path.join(APP_DIR, 'dist-electron', 'main', 'index.js')

  if (!fs.existsSync(indexHtml) || !fs.existsSync(mainJs)) {
    console.error('App not built. dist-electron/ not found.')
    console.error('\nIf you cloned from source, run:')
    console.error('  npm install && npm run build')
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// PID management (single instance)
// ---------------------------------------------------------------------------

function writePidFile(pid) {
  try {
    ensureCacheDir()
    fs.writeFileSync(PID_FILE, pid.toString())
  } catch {}
}

function readPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10)
    }
  } catch {}
  return null
}

function clearPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE)
    }
  } catch {}
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function stopRunningInstance() {
  const pid = readPidFile()
  if (pid && isProcessRunning(pid)) {
    console.log(`Stopping existing instance (PID: ${pid})...`)
    try {
      process.kill(pid, 'SIGTERM')
      clearPidFile()
      return true
    } catch {}
  }
  clearPidFile()
  return false
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

async function launch() {
  try {
    console.log(`\nStarting CodeSurf...\n`)

    checkForUpdates()
    checkBuilt()
    const electronPath = await ensureElectron()
    const jsFlags = `--expose-gc --max-old-space-size=${getMaxOldSpaceSizeMb()}`

    // Launch Electron with the app
    const child = spawn(electronPath, [`--js-flags=${jsFlags}`, APP_DIR], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
      }
    })

    writePidFile(child.pid)

    child.on('exit', (code) => {
      clearPidFile()
      process.exit(code || 0)
    })

    child.on('error', (err) => {
      console.error('Failed to start Electron:', err.message)
      clearPidFile()
      process.exit(1)
    })

    // Handle signals
    process.on('SIGINT', () => {
      child.kill('SIGINT')
      clearPidFile()
    })
    process.on('SIGTERM', () => {
      child.kill('SIGTERM')
      clearPidFile()
    })

  } catch (error) {
    console.error('Failed to launch CodeSurf:', error.message)
    clearPidFile()
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  const version = getCurrentVersion() || 'unknown'
  console.log(`
CodeSurf v${version} - Infinite canvas workspace for AI agents

Usage:
  npx codesurf            Launch the app
  npx codesurf --update   Check for and install updates
  npx codesurf --version  Show current version
  npx codesurf --clean    Clear cached Electron installation
  npx codesurf --help     Show this help message

Cache location: ${CACHE_DIR}
`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  const version = getCurrentVersion() || 'unknown'
  console.log(`codesurf v${version}`)
  process.exit(0)
}

if (args.includes('--update') || args.includes('-u')) {
  performUpdate().then(updated => {
    process.exit(updated ? 0 : 1)
  })
} else if (args.includes('--clean')) {
  console.log('Cleaning Electron cache...')
  if (fs.existsSync(ELECTRON_CACHE)) {
    fs.rmSync(ELECTRON_CACHE, { recursive: true })
    console.log('Cache cleared')
  } else {
    console.log('Cache already empty')
  }
  process.exit(0)
} else {
  launch()
}
