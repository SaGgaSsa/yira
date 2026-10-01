import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { initializeI18n } from '@/i18n'
import { TerminalActivityIcon } from './TerminalActivityIcon'
import type { TerminalActivityStatus, TerminalActivitySummary } from '@/utils/terminalActivity'

await initializeI18n('es')

test('renders every state with an accessible description and no fabricated progress percentage', () => {
  const labels: Record<TerminalActivityStatus, string> = {
    'needs-input': 'Requiere intervención',
    working: 'Trabajando',
    unread: 'Actividad sin revisar',
    output: 'Terminales activas',
    background: 'En segundo plano',
    done: 'Actividad finalizada',
    idle: 'Sin actividad detectada',
  }
  for (const [status, label] of Object.entries(labels)) {
    const activity: TerminalActivitySummary = {
      status: status as TerminalActivityStatus,
      working: 2,
      needsInput: 1,
      done: 3,
      unread: 4,
      recentOutput: 5,
      background: 6,
    }
    const markup = renderToStaticMarkup(<TerminalActivityIcon activity={activity} />)
    assert.ok(markup.includes(`data-terminal-activity="${status}"`))
    assert.ok(markup.includes(`aria-label="${label}. 2 trabajando; 1 requieren intervención; 3 finalizados; 4 eventos de salida sin revisar; 5 terminales con salida reciente; 6 en segundo plano"`))
    assert.match(markup, /role="img"/)
    assert.doesNotMatch(markup, /%/)
    assert.equal(markup.includes('motion-safe:animate-spin'), status === 'working' || status === 'output')
  }
})
