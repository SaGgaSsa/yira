import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

let configured = false

export function ensureMonacoConfigured(): void {
  if (configured) return
  loader.config({ monaco })
  configured = true
}
