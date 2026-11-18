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

// Safety net next to `overflow: clip` (index.css): the app shell never scrolls the document, so
// reset it if a browser still moves it (focus()/scrollIntoView() on a partly hidden element).
if (shareToken === null) {
  document.addEventListener('scroll', () => {
    const el = document.scrollingElement
    if (el && (el.scrollTop !== 0 || el.scrollLeft !== 0)) el.scrollTo(0, 0)
  })
}

// Offline fallback only (public/sw.js): the worker answers a failed page navigation with
// /offline.html and touches nothing else, so no signed-in content is ever cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Not installable here (e.g. plain HTTP): the app works the same without it. */
    })
  })
}
