import { homedir } from 'os'
import { join } from 'path'

export const APP_NAME = 'Yira'
export const APP_ID = 'com.yira.app'
export const YIRA_HOME = join(homedir(), '.yira')
export const CONFIG_PATH = join(YIRA_HOME, 'config.json')
export const WORKSPACES_DIR = join(YIRA_HOME, 'workspaces')
