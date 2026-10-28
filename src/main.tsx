import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initWidget } from './lib/widget'
import './styles.css'

initWidget()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
