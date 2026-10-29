import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { MiniBubble } from './components/MiniBubble'
import { initAutostart } from './lib/autostart'
import { applyFontSize } from './lib/fontSize'
import { applyTheme } from './lib/theme'
import { initUpdate } from './lib/update'
import { initWidget, win } from './lib/widget'
import './styles.css'

initWidget()
applyTheme()
applyFontSize()
initUpdate()
initAutostart()

// 휴대폰: iOS Safari는 user-scalable=no를 무시하고 두 손가락으로 확대한다. 그 몸짓을 막는다.
if (!win) {
  document.addEventListener('gesturestart', (e) => e.preventDefault())
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), { passive: false })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MiniBubble />
  </StrictMode>,
)
