import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './plugins/appearance/theme-bridge.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
