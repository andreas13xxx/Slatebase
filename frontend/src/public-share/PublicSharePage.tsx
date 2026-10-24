import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import '../App.css'
import './PublicSharePage.css'
import { ViewMode } from '../components/ViewMode'
import { buildPublicTree } from './buildPublicTree'
import { PublicEmbedContext } from './PublicEmbedContext'
import { loadPublicNote, unlockPublicNote } from './publicShareApi'
import type { PublicLoadResult } from './publicShareApi'
import { toPublicVaultId } from './publicVault'

/** Sets a `<meta name>` tag for the lifetime of the page. */
function useMeta(name: string, content: string): void {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = name
    meta.content = content
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [name, content])
}

interface PublicSharePageProps {
  token: string
}

/**
 * Read-only page for a public share link (`/s/<token>`). Standalone: no app shell, no session
 * and no providers — the link is the credential. Renders the note with the same reading view
 * as the app, with embeds resolved by the server.
 */
export function PublicSharePage({ token }: PublicSharePageProps) {
  const [result, setResult] = useState<PublicLoadResult | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useMeta('referrer', 'no-referrer')
  useMeta('robots', 'noindex, nofollow')

  useEffect(() => {
    let cancelled = false
    void loadPublicNote(token).then((next) => {
      if (!cancelled) setResult(next)
    })
    return () => { cancelled = true }
  }, [token, reloadKey])

  const reload = useCallback(() => {
    setResult(null)
    setReloadKey((n) => n + 1)
  }, [])

  const title = result?.status === 'ok' ? result.view.title : 'Geteilte Notiz'
  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <main className="public-share">
      {result === null && <p role="status" className="public-share-status">Wird geladen…</p>}
      {result?.status === 'ok' && <SharedNote token={token} view={result.view} />}
      {result?.status === 'password' && <PasswordForm token={token} onUnlocked={reload} />}
      {result?.status === 'notfound' && (
        <div className="public-share-message" role="alert">
          <h1>Link nicht verfügbar</h1>
          <p>Dieser Link existiert nicht (mehr) oder ist abgelaufen.</p>
        </div>
      )}
      {result?.status === 'limited' && (
        <div className="public-share-message" role="alert">
          <h1>Zu viele Anfragen</h1>
          <p>Bitte warte einen Moment und versuche es dann erneut.</p>
          <button type="button" onClick={reload}>Erneut versuchen</button>
        </div>
      )}
      {result?.status === 'error' && (
        <div className="public-share-message" role="alert">
          <h1>Die Notiz konnte nicht geladen werden</h1>
          <p>Prüfe deine Verbindung und versuche es erneut.</p>
          <button type="button" onClick={reload}>Erneut versuchen</button>
        </div>
      )}
    </main>
  )
}

function SharedNote({ token, view }: { token: string; view: NonNullable<Extract<PublicLoadResult, { status: 'ok' }>['view']> }) {
  const tree = useMemo(() => buildPublicTree(view.embeds), [view.embeds])
  const vaultId = useMemo(() => toPublicVaultId(token), [token])
  return (
    <article className="public-share-note">
      <h1 className="public-share-title">{view.title}</h1>
      <PublicEmbedContext.Provider value={view.embeds}>
        <ViewMode content={view.markdown} vaultId={vaultId} directoryTree={tree} />
      </PublicEmbedContext.Provider>
    </article>
  )
}

function PasswordForm({ token, onUnlocked }: { token: string; onUnlocked: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputId = useId()
  const errorId = useId()

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (password === '' || busy) return
    setBusy(true)
    setError(null)
    const outcome = await unlockPublicNote(token, password)
    setBusy(false)
    if (outcome === 'ok') {
      onUnlocked()
      return
    }
    setError(
      outcome === 'wrong' ? 'Das Passwort ist falsch.'
        : outcome === 'limited' ? 'Zu viele Versuche. Bitte warte einige Minuten.'
          : outcome === 'notfound' ? 'Dieser Link ist nicht mehr verfügbar.'
            : 'Das Passwort konnte nicht geprüft werden. Bitte versuche es erneut.',
    )
  }

  return (
    <form className="public-share-message" onSubmit={(e) => { void submit(e) }}>
      <h1>Geschützte Notiz</h1>
      <p>Für diese Notiz ist ein Passwort nötig.</p>
      <label htmlFor={inputId}>Passwort</label>
      <input
        id={inputId}
        type="password"
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={error !== null}
        aria-describedby={error !== null ? errorId : undefined}
      />
      {error !== null && <p id={errorId} role="alert" className="public-share-error">{error}</p>}
      <button type="submit" disabled={busy || password === ''}>Öffnen</button>
    </form>
  )
}
