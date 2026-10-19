import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { initializeI18n } from './i18n'
import { useSettingsStore } from './store/settingsStore'
import './index.css'

async function bootstrap(): Promise<void> {
  await useSettingsStore.getState().loadSettings()
  await initializeI18n(useSettingsStore.getState().language)

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>,
  )
}

void bootstrap()
