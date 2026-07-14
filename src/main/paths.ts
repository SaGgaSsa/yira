import { homedir } from 'os'
import { join, resolve } from 'path'

export const APP_NAME = 'Yira'
export const DEV_APP_NAME = 'yira-debug'
export const APP_ID = 'com.yira.app'
const configuredYiraHome = process.env.YIRA_HOME?.trim()

export const YIRA_HOME = configuredYiraHome ? resolve(configuredYiraHome) : join(homedir(), '.yira')
export const CONFIG_PATH = join(YIRA_HOME, 'config.json')
export const WORKSPACES_DIR = join(YIRA_HOME, 'workspaces')
