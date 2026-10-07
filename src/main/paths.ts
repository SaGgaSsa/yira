import { homedir } from 'os'
import { join, resolve } from 'path'

export const APP_NAME = 'Yira'
export const DEV_APP_NAME = 'yira-debug'
export const APP_ID = 'com.yira.app'
// Windows resolves a toast click through the Start Menu shortcut that owns the
// AppUserModelID. Dev runs need their own ID and activator, or a click on an
// installed-app toast launches the bare electron.exe.
export const DEV_APP_ID = 'com.yira.app.dev'
export const TOAST_ACTIVATOR_CLSID = '{7CCDA716-2DAB-4C1F-8D2D-3D9D763EA8DF}'
export const DEV_TOAST_ACTIVATOR_CLSID = '{B71E5C8F-2CA9-4409-B558-2D86038755C3}'
const configuredYiraHome = process.env.YIRA_HOME?.trim()

export const YIRA_HOME = configuredYiraHome ? resolve(configuredYiraHome) : join(homedir(), '.yira')
export const CONFIG_PATH = join(YIRA_HOME, 'config.json')
export const WORKSPACES_DIR = join(YIRA_HOME, 'workspaces')
