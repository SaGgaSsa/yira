import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppErrorBoundary, AppErrorFallback, formatAppErrorDetail } from './AppErrorBoundary'
import { i18n, initializeI18n } from '../i18n'

await initializeI18n()

test('turns a thrown value into boundary error state', () => {
  const fromError = AppErrorBoundary.getDerivedStateFromError(new TypeError('boom'))
  assert.equal(fromError.error?.message, 'boom')

  const fromString = AppErrorBoundary.getDerivedStateFromError('plain failure')
  assert.ok(fromString.error instanceof Error)
  assert.equal(fromString.error?.message, 'plain failure')
})

test('formats copyable detail with message, stack and component stack', () => {
  const error = new Error('render failed')
  error.stack = 'Error: render failed\n    at Broken (Broken.tsx:1:1)'
  const detail = formatAppErrorDetail(error, '\n    in Broken\n    in App\n')

  assert.match(detail, /^Error: render failed/)
  assert.match(detail, /at Broken \(Broken\.tsx:1:1\)/)
  assert.match(detail, /Component stack:\nin Broken\n {4}in App$/)
})

test('renders the recovery screen instead of the children after an error', () => {
  const markup = renderToStaticMarkup(
    <AppErrorFallback error={new Error('render failed')} componentStack={null} onReload={() => undefined} />,
  )

  assert.match(markup, /role="alert"/)
  assert.match(markup, /Something went wrong/)
  assert.match(markup, /render failed/)
  assert.match(markup, /Reload window/)
  assert.match(markup, /Copy details/)
})

test('renders children while there is no error', () => {
  const markup = renderToStaticMarkup(
    <AppErrorBoundary><span>workspace</span></AppErrorBoundary>,
  )
  assert.equal(markup, '<span>workspace</span>')
})

test('uses Spanish copy when the language is Spanish', async () => {
  await i18n.changeLanguage('es')
  try {
    const markup = renderToStaticMarkup(
      <AppErrorFallback error={new Error('x')} componentStack={null} onReload={() => undefined} />,
    )
    assert.match(markup, /Algo salió mal/)
    assert.match(markup, /Recargar ventana/)
  } finally {
    await i18n.changeLanguage('en')
  }
})
