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
import { useTranslation } from '../i18n'

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
  const { t } = useTranslation()
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

  const title = result?.status === 'ok' ? result.view.title : t('publicShare.sharedNote')
  useEffect(() => {
    document.title = title
  }, [title])

  return (
    <main className="public-share">
      {result === null && <p role="status" className="public-share-status">{t('publicShare.loading')}</p>}
      {result?.status === 'ok' && <SharedNote token={token} view={result.view} />}
      {result?.status === 'password' && <PasswordForm token={token} onUnlocked={reload} />}
      {result?.status === 'notfound' && (
        <div className="public-share-message" role="alert">
          <h1>{t('publicShare.notFoundTitle')}</h1>
          <p>{t('publicShare.notFoundText')}</p>
        </div>
      )}
      {result?.status === 'limited' && (
        <div className="public-share-message" role="alert">
          <h1>{t('publicShare.limitedTitle')}</h1>
          <p>{t('publicShare.limitedText')}</p>
          <button type="button" onClick={reload}>{t('publicShare.retry')}</button>
        </div>
      )}
      {result?.status === 'error' && (
        <div className="public-share-message" role="alert">
          <h1>{t('publicShare.errorTitle')}</h1>
          <p>{t('publicShare.errorText')}</p>
          <button type="button" onClick={reload}>{t('publicShare.retry')}</button>
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
  const { t } = useTranslation()
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
      outcome === 'wrong' ? t('publicShare.wrongPassword')
        : outcome === 'limited' ? t('publicShare.tooManyAttempts')
          : outcome === 'notfound' ? t('publicShare.linkGone')
            : t('publicShare.passwordCheckFailed'),
    )
  }

  return (
    <form className="public-share-message" onSubmit={(e) => { void submit(e) }}>
      <h1>{t('publicShare.passwordTitle')}</h1>
      <p>{t('publicShare.passwordText')}</p>
      <label htmlFor={inputId}>{t('publicShare.password')}</label>
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
      <button type="submit" disabled={busy || password === ''}>{t('publicShare.open')}</button>
    </form>
  )
}
