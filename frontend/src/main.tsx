import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './plugins/appearance/theme-bridge.css'
import './plugins/appearance/builtin/obsidian.css'
import { App } from './App.tsx'
import { tokenFromPath } from './public-share/publicVault'

const root = createRoot(document.getElementById('root')!)
const shareToken = tokenFromPath(window.location.pathname)

if (shareToken === null) {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} else {
  // A public share link (/s/<token>) is a standalone page: no app shell, no session, no providers.
  // Loaded on demand so the page's code stays out of the app's entry chunk and vice versa.
  void import('./public-share/PublicSharePage').then(({ PublicSharePage }) => {
    root.render(
      <StrictMode>
        <PublicSharePage token={shareToken} />
      </StrictMode>,
    )
  })
}
