import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { MiniBubble } from './components/MiniBubble'
import { initAutostart } from './lib/autostart'
import { applyFontSize } from './lib/fontSize'
import { applyTheme } from './lib/theme'
import { initUpdate } from './lib/update'
import { initWidget } from './lib/widget'
import './styles.css'

initWidget()
applyTheme()
applyFontSize()
initUpdate()
initAutostart()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MiniBubble />
  </StrictMode>,
)
