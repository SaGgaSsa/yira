import ReactDOM from 'react-dom/client'
import App from './App'
import { initializeI18n } from './i18n'
import { useSettingsStore } from './store/settingsStore'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import './monaco'
import './index.css'

async function bootstrap(): Promise<void> {
  await useSettingsStore.getState().loadSettings()
  await initializeI18n(useSettingsStore.getState().language)

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <App />,
  )
}

void bootstrap()
